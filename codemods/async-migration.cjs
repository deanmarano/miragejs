/**
 * Codemod to migrate MirageJS code to async mode
 * 
 * This codemod will:
 * 1. Add `async: true` to Server configuration if not present
 * 2. Make all route handlers async functions
 * 3. Add await to all db/schema method calls that need it
 * 
 * Usage:
 *   npx jscodeshift -t codemods/async-migration.js path/to/your/code
 * 
 * Or with options:
 *   npx jscodeshift -t codemods/async-migration.js --dry --print path/to/your/code
 */

const fs = require('fs');
const path = require('path');

const asyncDbMethods = new Set([
  'insert',
  'find',
  'findBy',
  'where',
  'update',
  'remove',
  'firstOrCreate',
  'all'
]);

const asyncSchemaMethods = new Set([
  'create',
  'all',
  'find',
  'findBy',
  'findOrCreateBy',
  'findWhere',
  'where',
  'first',
  'new'
]);

const asyncModelMethods = new Set([
  'save',
  'update',
  'destroy',
  'reload'
]);

// Cache for model relationships to avoid re-parsing
const modelRelationshipsCache = new Map();

/**
 * Parse a Mirage model file to extract relationship definitions
 * @param {string} modelFilePath - Path to the model file
 * @param {object} j - jscodeshift instance
 * @returns {Set<string>} - Set of relationship property names
 */
function parseModelRelationships(modelFilePath, j) {
  if (modelRelationshipsCache.has(modelFilePath)) {
    return modelRelationshipsCache.get(modelFilePath);
  }
  
  const relationships = new Set();
  
  try {
    if (!fs.existsSync(modelFilePath)) {
      modelRelationshipsCache.set(modelFilePath, relationships);
      return relationships;
    }
    
    const content = fs.readFileSync(modelFilePath, 'utf8');
    const ast = j(content);
    
    // Look for belongsTo and hasMany calls in Model.extend({ ... })
    ast.find(j.ObjectExpression).forEach(objPath => {
      objPath.value.properties.forEach(prop => {
        if (prop.type === 'Property' && prop.value.type === 'CallExpression') {
          const callee = prop.value.callee;
          if (callee.type === 'Identifier' && 
              (callee.name === 'belongsTo' || callee.name === 'hasMany')) {
            // This property is a relationship
            if (prop.key.type === 'Identifier') {
              relationships.add(prop.key.name);
            }
          }
        }
      });
    });
    
    modelRelationshipsCache.set(modelFilePath, relationships);
  } catch (error) {
    // If we can't parse the file, return empty set
    modelRelationshipsCache.set(modelFilePath, relationships);
  }
  
  return relationships;
}

/**
 * Discover all model files in the workspace and build a complete relationship map
 * @param {string} filePath - Current file being transformed
 * @param {object} j - jscodeshift instance
 * @returns {Map<string, Set<string>>} - Map of model name to relationship properties
 */
function discoverModelRelationships(filePath, j) {
  const relationshipMap = new Map();
  
  // Try to find the mirage/models directory relative to the current file
  let currentDir = path.dirname(filePath);
  let modelsDir = null;
  
  // Search up the directory tree for mirage/models
  for (let i = 0; i < 10; i++) {
    const testPath = path.join(currentDir, 'mirage', 'models');
    if (fs.existsSync(testPath)) {
      modelsDir = testPath;
      break;
    }
    const testPath2 = path.join(currentDir, 'app', 'mirage', 'models');
    if (fs.existsSync(testPath2)) {
      modelsDir = testPath2;
      break;
    }
    currentDir = path.dirname(currentDir);
  }
  
  if (!modelsDir) {
    return relationshipMap;
  }
  
  // Read all model files
  try {
    const files = fs.readdirSync(modelsDir);
    files.forEach(file => {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        const modelPath = path.join(modelsDir, file);
        const modelName = path.basename(file, path.extname(file));
        const relationships = parseModelRelationships(modelPath, j);
        relationshipMap.set(modelName, relationships);
      }
    });
  } catch (error) {
    // If we can't read the directory, return empty map
  }
  
  return relationshipMap;
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;
  
  // Discover all model relationships in the workspace
  // Use mock if provided (for testing), otherwise discover from filesystem
  const modelRelationshipMap = file._mockModelRelationships || discoverModelRelationships(file.path, j);

  // Helper to check if a function should be made async
  function shouldBeAsync(node, path) {
    // Skip QUnit module() callbacks - they cannot be async
    // Pattern: module('name', function(hooks) { ... })
    if (path && path.parent && path.parent.value.type === 'CallExpression') {
      const parentCall = path.parent.value;
      if (parentCall.callee.type === 'Identifier' && parentCall.callee.name === 'module') {
        return false;
      }
    }
    
    // Skip config methods like routes(), seeds(), scenarios() in createServer/new Server
    // These are just configuration functions, not route handlers
    if (path && path.parent && path.parent.value.type === 'Property') {
      const prop = path.parent.value;
      const configMethods = ['routes', 'seeds', 'scenarios', 'baseConfig', 'testConfig'];
      if (prop.key && prop.key.name && configMethods.includes(prop.key.name)) {
        // Check if this property is in a createServer or new Server config
        let ancestor = path.parent.parent;
        while (ancestor) {
          if (ancestor.value.type === 'CallExpression') {
            const callee = ancestor.value.callee;
            if ((callee.type === 'Identifier' && callee.name === 'createServer') ||
                (callee.type === 'MemberExpression' && callee.object.name === 'Server')) {
              return false;
            }
          }
          if (ancestor.value.type === 'NewExpression' && 
              ancestor.value.callee.name === 'Server') {
            return false;
          }
          ancestor = ancestor.parent;
        }
      }
    }
    
    let needsAsync = false;
    
    j(node).find(j.CallExpression).forEach(callPath => {
      const { callee } = callPath.value;
      
      // Skip calls that are inside nested functions - wrapper functions
      // that return handlers should not be made async
      let currentPath = callPath.parent;
      let isInNestedFunction = false;
      while (currentPath && currentPath.value !== node) {
        if ((currentPath.value.type === 'FunctionExpression' ||
             currentPath.value.type === 'ArrowFunctionExpression' ||
             currentPath.value.type === 'FunctionDeclaration') &&
            currentPath.value !== node) {
          isInNestedFunction = true;
          break;
        }
        currentPath = currentPath.parent;
      }
      
      // Skip this call if it's in a nested function
      if (isInNestedFunction) {
        return;
      }
      
      // Check for schema.modelName.method() or schemas.modelName.method() calls
      // Matches any identifier.collection.method() pattern where method is async
      // But excludes .models.method() which is an array, not a Mirage collection
      if (callee.type === 'MemberExpression' &&
          callee.object.type === 'MemberExpression' &&
          callee.object.object.type === 'Identifier' &&
          callee.object.property.name !== 'models') { // Exclude .models which is an array
        if (asyncSchemaMethods.has(callee.property.name)) {
          needsAsync = true;
        }
      }
      
      // Check for db.collectionName.method() calls
      if (callee.type === 'MemberExpression' &&
          callee.object.type === 'MemberExpression' &&
          (callee.object.object.name === 'db' ||
           (callee.object.object.type === 'MemberExpression' &&
            callee.object.object.property.name === 'db'))) {
        if (asyncDbMethods.has(callee.property.name)) {
          needsAsync = true;
        }
      }
      
      // Check for destructured collection calls: collectionName.method()
      // This handles cases like: ({ users }, req) => users.find(...)
      if (callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.property.type === 'Identifier') {
        if (asyncDbMethods.has(callee.property.name) || asyncSchemaMethods.has(callee.property.name)) {
          needsAsync = true;
        }
      }
      
      // Check for model instance methods: model.save(), model.update(), model.destroy()
      // This handles any call to these methods, e.g., user.save(), run.apply.update()
      if (callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier') {
        if (asyncModelMethods.has(callee.property.name)) {
          needsAsync = true;
        }
      }
      
      // Check for server.create() and server.createList() calls
      if (callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'server' &&
          callee.property.type === 'Identifier' &&
          (callee.property.name === 'create' || callee.property.name === 'createList')) {
        needsAsync = true;
      }
      
      // Check for server.schema.* calls (e.g., server.schema.users.create())
      if (callee.type === 'MemberExpression' &&
          callee.object.type === 'MemberExpression' &&
          callee.object.object.type === 'MemberExpression' &&
          callee.object.object.object.type === 'Identifier' &&
          callee.object.object.object.name === 'server' &&
          callee.object.object.property.name === 'schema') {
        if (asyncSchemaMethods.has(callee.property.name)) {
          needsAsync = true;
        }
      }
      
      // Check for this.server.schema.* calls (e.g., this.server.schema.sessions.first())
      if (callee.type === 'MemberExpression' &&
          callee.object.type === 'MemberExpression' &&
          callee.object.object.type === 'MemberExpression' &&
          callee.object.object.object.type === 'MemberExpression' &&
          callee.object.object.object.object.type === 'ThisExpression' &&
          callee.object.object.object.property.name === 'server' &&
          callee.object.object.property.name === 'schema') {
        if (asyncSchemaMethods.has(callee.property.name)) {
          needsAsync = true;
        }
      }
      
      // Check for this.server.create() and this.server.createList() calls
      if (callee.type === 'MemberExpression' &&
          callee.object.type === 'MemberExpression' &&
          callee.object.object.type === 'ThisExpression' &&
          callee.object.property.name === 'server' &&
          callee.property.type === 'Identifier' &&
          (callee.property.name === 'create' || callee.property.name === 'createList')) {
        needsAsync = true;
      }
      
      // Check for function parameter calls that look like route handlers
      // Pattern: paramName(schema, request) where paramName is a function parameter
      // Skip if call is inside a nested function (not in the immediate function body)
      if (callee.type === 'Identifier' && callPath.value.arguments.length === 2) {
        const args = callPath.value.arguments;
        // Check if arguments match (schema/schemas, request) pattern
        if (args[0].type === 'Identifier' && 
            (args[0].name === 'schema' || args[0].name === 'schemas') &&
            args[1].type === 'Identifier' && 
            args[1].name === 'request') {
          // Check if call is in immediate function body or inside a nested function
          let currentPath = callPath.parent;
          let isInNestedFunction = false;
          while (currentPath && currentPath.value !== node) {
            if ((currentPath.value.type === 'FunctionExpression' ||
                 currentPath.value.type === 'ArrowFunctionExpression' ||
                 currentPath.value.type === 'FunctionDeclaration') &&
                currentPath.value !== node) {
              isInNestedFunction = true;
              break;
            }
            currentPath = currentPath.parent;
          }
          // Only mark as needing async if not in nested function
          if (!isInNestedFunction) {
            needsAsync = true;
          }
        }
      }
      
      // Check for Collection methods (sort, filter, where) with async functions
      // Pattern: collection.sort(async (a,b) => ...) or collection.filter(async item => ...)
      if (callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          (callee.property.name === 'sort' || 
           callee.property.name === 'filter' || 
           callee.property.name === 'where')) {
        const firstArg = callPath.value.arguments[0];
        if (firstArg && 
            (firstArg.type === 'ArrowFunctionExpression' || 
             firstArg.type === 'FunctionExpression') &&
            firstArg.async === true) {
          // Check if call is in immediate function body or inside a nested function
          let currentPath = callPath.parent;
          let isInNestedFunction = false;
          while (currentPath && currentPath.value !== node) {
            if ((currentPath.value.type === 'FunctionExpression' ||
                 currentPath.value.type === 'ArrowFunctionExpression' ||
                 currentPath.value.type === 'FunctionDeclaration') &&
                currentPath.value !== node) {
              isInNestedFunction = true;
              break;
            }
            currentPath = currentPath.parent;
          }
          // Only mark as needing async if not in nested function
          if (!isInNestedFunction) {
            needsAsync = true;
          }
        }
      }
    });
    
    // Check for .models access on associations
    // Pattern: association.models.get() or association.models[0]
    // Skip if inside a nested function
    j(node).find(j.MemberExpression, {
      property: { name: 'models' }
    }).forEach(modelsPath => {
      const modelsExpr = modelsPath.value;
      const association = modelsExpr.object;
      
      // Skip if already has optional chaining
      if (modelsExpr.optional) {
        return;
      }
      
      // Skip if association is a CallExpression (already async)
      if (association.type === 'CallExpression') {
        return;
      }
      
      // Skip if association is an awaited CallExpression or MemberExpression
      if (association.type === 'AwaitExpression' && association.argument) {
        const argType = association.argument.type;
        if (argType === 'CallExpression' || argType === 'MemberExpression') {
          return;
        }
      }
      
      // Skip if accessing .models on a parameter in a non-Mirage function
      // Check if the function doesn't have server/schema parameters (utility function)
      // Pattern: run.runEvents.models where run is the function parameter
      const funcParams = node.params || [];
      const hasServerParam = funcParams.some(p => 
        p.type === 'Identifier' && (p.name === 'server' || p.name === 'schema' || p.name === 'schemas')
      );
      
      if (!hasServerParam) {
        // This function doesn't have server/schema params, likely a utility function
        // Skip transforming .models access on what looks like model parameters
        // or serializer parameters (response, request)
        let root = association;
        while (root.type === 'MemberExpression' && root.object) {
          root = root.object;
        }
        if (root.type === 'Identifier') {
          // Common model/serializer param names that shouldn't trigger async in utility functions
          const utilityParamPattern = /^(run|project|organization|workspace|model|user|team|entity|record|response|request)$/i;
          if (utilityParamPattern.test(root.name)) {
            return;
          }
        }
      }
      
      // Check if this .models access is in the immediate function body or inside a nested function
      let currentPath = modelsPath.parent;
      let isInNestedFunction = false;
      while (currentPath && currentPath.value !== node) {
        if ((currentPath.value.type === 'FunctionExpression' ||
             currentPath.value.type === 'ArrowFunctionExpression' ||
             currentPath.value.type === 'FunctionDeclaration') &&
            currentPath.value !== node) {
          isInNestedFunction = true;
          break;
        }
        currentPath = currentPath.parent;
      }
      
      // Only mark as needing async if not in nested function
      if (!isInNestedFunction) {
        needsAsync = true;
      }
    });
    
    return needsAsync;
  }

  // Helper to check if function has relevant parameters (schema, db, server, schemas, or destructured)
  function hasRelevantParams(params) {
    return params.some(param => {
      // Check for schema/schemas, db, or server parameters
      if (param.type === 'Identifier' && 
          (param.name === 'schema' || param.name === 'schemas' || 
           param.name === 'db' || param.name === 'server')) {
        return true;
      }
      // Check for destructured parameters like { sessions, userV2s }
      if (param.type === 'ObjectPattern') {
        return true;
      }
      return false;
    });
  }

  // Helper to ensure async afterCreate hooks return the model
  // When afterCreate becomes async, it must explicitly return the model instance
  // Otherwise the factory will return null/undefined instead of the created model
  function ensureAfterCreateReturnsModel(func) {
    if (!func.async || !func.body || func.body.type !== 'BlockStatement') {
      return;
    }

    // Get the parameter name (e.g., 'model', 'agentPool', 'auditConfiguration')
    if (!func.params || func.params.length === 0) {
      return;
    }

    const paramName = func.params[0].name;
    if (!paramName) {
      return;
    }

    const body = func.body.body;
    
    // Check if function already has a return statement
    function hasReturnStatement(statements) {
      return statements.some(stmt => {
        if (stmt.type === 'ReturnStatement') {
          return true;
        }
        // Check in if statements
        if (stmt.type === 'IfStatement') {
          const consequentHasReturn = stmt.consequent && 
            (stmt.consequent.type === 'ReturnStatement' ||
             (stmt.consequent.type === 'BlockStatement' && 
              hasReturnStatement(stmt.consequent.body)));
          const alternateHasReturn = stmt.alternate && 
            (stmt.alternate.type === 'ReturnStatement' ||
             (stmt.alternate.type === 'BlockStatement' && 
              hasReturnStatement(stmt.alternate.body)));
          return consequentHasReturn || alternateHasReturn;
        }
        return false;
      });
    }

    // If no return statement found, add one at the end
    if (!hasReturnStatement(body)) {
      body.push(
        j.returnStatement(
          j.identifier(paramName)
        )
      );
      hasChanges = true;
    }
  }

  // Helper to wrap calls with await
  function addAwaitToCall(path) {
    const { callee } = path.value;
    
    // Check if already awaited - need to check both direct parent and up the tree
    // because optional chaining can create intermediate nodes
    let checkPath = path;
    while (checkPath.parent) {
      if (checkPath.parent.value.type === 'AwaitExpression') {
        return;
      }
      // Stop checking after we leave the expression context
      if (checkPath.parent.value.type === 'ExpressionStatement' ||
          checkPath.parent.value.type === 'VariableDeclarator' ||
          checkPath.parent.value.type === 'AssignmentExpression' ||
          checkPath.parent.value.type === 'ReturnStatement' ||
          checkPath.parent.value.type === 'IfStatement' ||
          checkPath.parent.value.type === 'BlockStatement') {
        break;
      }
      checkPath = checkPath.parent;
    }
    
    let shouldAwait = false;
    
    // Check for schema.modelName.method() or schemas.modelName.method() calls
    // Matches any identifier.collection.method() pattern where method is async
    // But excludes .models.method() which is an array, not a Mirage collection
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'MemberExpression' &&
        callee.object.object.type === 'Identifier' &&
        callee.object.property.name !== 'models') { // Exclude .models which is an array
      if (asyncSchemaMethods.has(callee.property.name)) {
        shouldAwait = true;
      }
    }
    
    // Check for db.collectionName.method() calls
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'MemberExpression' &&
        (callee.object.object.name === 'db' ||
         (callee.object.object.type === 'MemberExpression' &&
          callee.object.object.property.name === 'db'))) {
      if (asyncDbMethods.has(callee.property.name)) {
        shouldAwait = true;
      }
    }
    
    // Check for destructured collection calls: collectionName.method()
    // This handles cases like: ({ users }, req) => users.find(...)
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.property.type === 'Identifier') {
      if (asyncDbMethods.has(callee.property.name) || asyncSchemaMethods.has(callee.property.name)) {
        shouldAwait = true;
      }
    }
    
    // Check for model instance methods: model.save(), model.update(), model.destroy()
    // This handles any call to these methods, e.g., user.save(), run.apply.update()
    // Also handles optional chaining: model?.save(), run.workspace?.update()
    if ((callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') &&
        callee.property.type === 'Identifier') {
      if (asyncModelMethods.has(callee.property.name)) {
        shouldAwait = true;
      }
    }
    
    // Check for server.create() and server.createList() calls
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'server' &&
        callee.property.type === 'Identifier' &&
        (callee.property.name === 'create' || callee.property.name === 'createList')) {
      shouldAwait = true;
    }
    
    // Check for server.schema.* calls (e.g., server.schema.users.create())
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'MemberExpression' &&
        callee.object.object.type === 'MemberExpression' &&
        callee.object.object.object.type === 'Identifier' &&
        callee.object.object.object.name === 'server' &&
        callee.object.object.property.name === 'schema') {
      if (asyncSchemaMethods.has(callee.property.name)) {
        shouldAwait = true;
      }
    }
    
    // Check for this.server.schema.* calls (e.g., this.server.schema.sessions.first())
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'MemberExpression' &&
        callee.object.object.type === 'MemberExpression' &&
        callee.object.object.object.type === 'MemberExpression' &&
        callee.object.object.object.object.type === 'ThisExpression' &&
        callee.object.object.object.property.name === 'server' &&
        callee.object.object.property.name === 'schema') {
      if (asyncSchemaMethods.has(callee.property.name)) {
        shouldAwait = true;
      }
    }
    
    // Check for this.server.create() and this.server.createList() calls
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'MemberExpression' &&
        callee.object.object.type === 'ThisExpression' &&
        callee.object.property.name === 'server' &&
        callee.property.type === 'Identifier' &&
        (callee.property.name === 'create' || callee.property.name === 'createList')) {
      shouldAwait = true;
    }
    
    // Check for function parameter calls that look like route handlers
    // Pattern: paramName(schema, request) where paramName is a function parameter
    if (callee.type === 'Identifier' && path.value.arguments.length === 2) {
      const args = path.value.arguments;
      // Check if arguments match (schema/schemas, request) pattern
      if (args[0].type === 'Identifier' && 
          (args[0].name === 'schema' || args[0].name === 'schemas') &&
          args[1].type === 'Identifier' && 
          args[1].name === 'request') {
        shouldAwait = true;
      }
    }
    
    // Check for Collection methods (sort, filter, where) with async functions
    // Pattern: collection.sort(async (a, b) => {...})
    // Pattern: collection.filter(async (item) => {...})
    // Pattern: collection.where(async (item) => {...})
    if (callee.type === 'MemberExpression' &&
        callee.property.type === 'Identifier' &&
        (callee.property.name === 'sort' || 
         callee.property.name === 'filter' || 
         callee.property.name === 'where')) {
      // Check if the first argument is an async function
      const firstArg = path.value.arguments[0];
      if (firstArg && 
          (firstArg.type === 'ArrowFunctionExpression' || 
           firstArg.type === 'FunctionExpression') &&
          firstArg.async === true) {
        shouldAwait = true;
      }
    }
    
    if (shouldAwait) {
      j(path).replaceWith(
        j.awaitExpression(path.value)
      );
      hasChanges = true;
    }
  }

  // Helper to add await to calls in a function, but NOT in nested functions
  function addAwaitToCallsInFunction(funcNode) {
    j(funcNode).find(j.CallExpression).forEach(callPath => {
      // Check if this call is inside a nested function
      // by walking up the tree until we hit a function or the root
      let currentPath = callPath.parent;
      let isInNestedFunction = false;
      
      while (currentPath && currentPath.value !== funcNode) {
        const nodeType = currentPath.value.type;
        if (nodeType === 'FunctionExpression' || 
            nodeType === 'ArrowFunctionExpression' ||
            nodeType === 'FunctionDeclaration') {
          isInNestedFunction = true;
          break;
        }
        currentPath = currentPath.parent;
      }
      
      // Only add await if not in a nested function
      if (!isInNestedFunction) {
        addAwaitToCall(callPath);
      }
    });
  }

  // Helper to recursively build awaited member expression chains
  // Breaks down workspace.organization.oauthClients into proper awaited steps
  function buildAwaitedMemberChain(expr, modelVariables, modelRelationshipMap, parameterModels = new Set()) {
    // Base case: identifier - if it's a model variable (but not a parameter), wrap in await
    if (expr.type === 'Identifier') {
      if (modelVariables.has(expr.name) && !parameterModels.has(expr.name)) {
        return j.awaitExpression(expr);
      }
      return expr;
    }
    
    // Base case: not a member expression
    if (expr.type !== 'MemberExpression') {
      return expr;
    }
    
    // First, determine the type of the object (what we're accessing the property on)
    let objectType = null;
    
    // If the object is an identifier, check if it's a tracked model variable
    if (expr.object.type === 'Identifier' && modelVariables.has(expr.object.name)) {
      objectType = modelVariables.get(expr.object.name);
    }
    // If the object is a member expression, we need to trace through the chain
    else if (expr.object.type === 'MemberExpression') {
      // Walk up the chain to find the root variable and trace through relationships
      const chain = [];
      let current = expr.object;
      while (current.type === 'MemberExpression') {
        chain.unshift(current.property.name);
        current = current.object;
      }
      if (current.type === 'Identifier' && modelVariables.has(current.name)) {
        // Now trace through the relationships to determine the final type
        objectType = modelVariables.get(current.name);
        for (const propName of chain) {
          if (objectType && modelRelationshipMap.has(objectType)) {
            const relationships = modelRelationshipMap.get(objectType);
            if (relationships.has(propName)) {
              // The relationship name becomes the new type (e.g., organization relationship -> organization type)
              // Try singular and plural forms
              objectType = propName;
              // If the plural form exists in the map, keep it; otherwise try to find singular
              if (!modelRelationshipMap.has(objectType)) {
                // Try to find in the map by checking both singular and plural
                const singularForm = propName.endsWith('s') ? propName.slice(0, -1) : propName;
                if (modelRelationshipMap.has(singularForm)) {
                  objectType = singularForm;
                }
              }
            } else {
              // Not a relationship, type unknown
              objectType = null;
              break;
            }
          } else {
            objectType = null;
            break;
          }
        }
      }
    }
    
    // Check if the current property access is a relationship
    const propertyName = expr.property.name;
    let isRelationship = false;
    
    if (objectType) {
      // Check both the objectType and its singular/plural forms
      if (modelRelationshipMap.has(objectType) && modelRelationshipMap.get(objectType).has(propertyName)) {
        isRelationship = true;
      } else {
        // Try singular form if current is plural
        const singularType = objectType.endsWith('s') ? objectType.slice(0, -1) : null;
        if (singularType && modelRelationshipMap.has(singularType) && modelRelationshipMap.get(singularType).has(propertyName)) {
          isRelationship = true;
        }
      }
    }
    
    // Recursively process the object part
    const processedObject = buildAwaitedMemberChain(expr.object, modelVariables, modelRelationshipMap, parameterModels);
    
    // Build the new member expression
    const newMember = j.memberExpression(processedObject, expr.property, expr.computed);
    
    // If this is a relationship access, wrap in await
    if (isRelationship) {
      return j.awaitExpression(newMember);
    }
    
    return newMember;
  }

  // Helper to transform .models access patterns in async functions
  // Patterns: association.models.get(...) or association.models[index]
  // These need the association to be awaited first
  // BUT skip if the association is a CallExpression (schema.where() already returns awaited collection)
  function transformModelsAccess(funcNode, modelRelationshipMap, factoryModelType = null) {
    // Run transformation iteratively until no more changes are made
    // This allows variables assigned from .models[0] to be tracked for subsequent accesses
    let madeChanges = true;
    let iterations = 0;
    const maxIterations = 10; // Prevent infinite loops
    
    while (madeChanges && iterations < maxIterations) {
      madeChanges = false;
      iterations++;
      
      // Build modelVariables map by tracking assignments from collection methods
      const modelVariables = new Map();
      const parameterModels = new Set(); // Track which variables are function parameters (already resolved)
      
      // Track function parameters for afterCreate, beforeCreate hooks
      // In afterCreate(model, server), the first parameter is the model instance
      if (factoryModelType && funcNode.params && funcNode.params.length > 0) {
        const firstParam = funcNode.params[0];
        if (firstParam.type === 'Identifier') {
          modelVariables.set(firstParam.name, factoryModelType);
          parameterModels.add(firstParam.name); // Mark as parameter
        }
      }
      
      j(funcNode).find(j.VariableDeclarator).forEach(varPath => {
        const init = varPath.value.init;
        if (!init) return;
        
        let call = null;
        
        if (init.type === 'AwaitExpression' && init.argument.type === 'CallExpression') {
          call = init.argument;
        } else if (init.type === 'CallExpression') {
          call = init;
        }
        
        if (call && call.callee.type === 'MemberExpression') {
          const methodName = call.callee.property.name;
          let objectName = call.callee.object.name;
          
          if (call.callee.object.type === 'MemberExpression') {
            objectName = call.callee.object.property.name;
          }
          
          if (methodName === 'find' || methodName === 'findBy' || methodName === 'first' || methodName === 'findWhere' ||
              methodName === 'all' || methodName === 'where' || methodName === 'filter' || methodName === 'sort') {
            modelVariables.set(varPath.value.id.name, objectName);
          }
        }
        
        // Track server.create calls
        if (init.type === 'AwaitExpression' && 
            init.argument.type === 'CallExpression' &&
            init.argument.callee.type === 'MemberExpression' &&
            init.argument.callee.property.name === 'create') {
          const args = init.argument.arguments;
          if (args.length > 0 && args[0].type === 'Literal') {
            modelVariables.set(varPath.value.id.name, args[0].value);
          }
        }
        
        // Track variables assigned from .models[0] or similar patterns
        // Pattern: let oauthClient = (await workspace.organization.oauthClients).models[0]
        // We need to infer the type from the relationship name
        if (init && init.type === 'MemberExpression' && init.computed) {
          // Check if this is .models[0]
          const obj = init.object;
          if (obj && obj.type === 'MemberExpression' && obj.property && obj.property.name === 'models') {
            // obj.object is the association, obj.property is 'models'
            // The association might be awaited, so unwrap AwaitExpression
            let association = obj.object;
            while (association && association.type === 'AwaitExpression') {
              association = association.argument;
            }
            
            // Try to determine the type from the property name
            // e.g., workspace.oauthClients -> type is 'oauthClient' (singular)
            if (association && association.type === 'MemberExpression') {
              const relationshipName = association.property.name;
              // Convert plural to singular (simple heuristic: remove trailing 's')
              const singularType = relationshipName.endsWith('s') ? relationshipName.slice(0, -1) : relationshipName;
              modelVariables.set(varPath.value.id.name, singularType);
            }
          }
        }
      });
    
    // Find all MemberExpression nodes where property is 'models'
    j(funcNode).find(j.MemberExpression, {
      property: { name: 'models' }
    }).forEach(modelsPath => {
      const modelsExpr = modelsPath.value;
      const association = modelsExpr.object;
      
      // Skip if the .models access itself uses optional chaining (?.models)
      // This is indicated by the optional property on the MemberExpression
      if (modelsExpr.optional) {
        return;
      }
      
      // Skip if the association itself is accessing .models (nested .models)
      if (association.type === 'MemberExpression' && association.property.name === 'models') {
        return;
      }
      
      // Skip if the association is a CallExpression - these are schema/db method calls
      // that already return awaited collections (e.g., schema.where(), db.find())
      if (association.type === 'CallExpression') {
        return;
      }
      
      // Skip if the association is an AwaitExpression wrapping a CallExpression or MemberExpression
      // Patterns: 
      // - (await server.schema.projects.where(...)).models
      // - (await run.runEvents).models
      // The await already returns the resolved collection, no need to wrap again
      if (association.type === 'AwaitExpression' && association.argument) {
        const argType = association.argument.type;
        if (argType === 'CallExpression' || argType === 'MemberExpression') {
          return;
        }
      }
      
      // Skip if the association contains optional chaining (OptionalMemberExpression)
      // Pattern: workspace.organization?.projects?.models
      // These need manual handling as wrapping with await breaks the optional chain
      function containsOptionalChaining(node) {
        if (!node) return false;
        if (node.type === 'OptionalMemberExpression' || node.type === 'OptionalCallExpression') {
          return true;
        }
        if (node.type === 'MemberExpression' && node.object) {
          return containsOptionalChaining(node.object);
        }
        return false;
      }
      
      if (association.type === 'OptionalMemberExpression' || containsOptionalChaining(association)) {
        return;
      }
      
      // Check if association is already awaited by checking parent
      let isAlreadyAwaited = false;
      let checkPath = modelsPath;
      while (checkPath.parent) {
        const parentNode = checkPath.parent.value;
        if (parentNode.type === 'AwaitExpression') {
          // Check if the await is wrapping our association or the .models access
          const awaitArg = parentNode.argument;
          if (awaitArg === association ||
              awaitArg === modelsExpr ||
              (awaitArg.type === 'Identifier' && association.type === 'Identifier' &&
               awaitArg.name === association.name) ||
              (awaitArg.type === 'MemberExpression' && association.type === 'MemberExpression' &&
               JSON.stringify(awaitArg) === JSON.stringify(association))) {
            isAlreadyAwaited = true;
            break;
          }
        }
        // Stop at statement boundaries
        if (parentNode.type === 'VariableDeclarator' ||
            parentNode.type === 'ExpressionStatement' ||
            parentNode.type === 'BlockStatement') {
          break;
        }
        checkPath = checkPath.parent;
      }
      
      if (!isAlreadyAwaited) {
        // .models itself is synchronous - it's just a property on the Collection that returns a plain array
        // Only the relationship access needs await, not .models
        // Transform: relationship.models -> (await relationship).models
        
        // Use buildAwaitedMemberChain to properly handle chained relationships
        // This will transform workspace.organization.oauthClients into (await (await workspace.organization).oauthClients)
        const awaitedAssociation = association.type === 'Identifier' 
          ? (parameterModels.has(association.name) ? j.identifier(association.name) : j.awaitExpression(j.identifier(association.name)))
          : buildAwaitedMemberChain(association, modelVariables, modelRelationshipMap, parameterModels);
          
        const newModelsExpr = j.memberExpression(
          awaitedAssociation,
          modelsExpr.property,
          false
        );
        
        // Never wrap .models itself in await - it's synchronous
        j(modelsPath).replaceWith(newModelsExpr);
        madeChanges = true;
        hasChanges = true;
      }
    });
    } // End of while loop
  }

  // Helper to add await to model relationship property access
  // Detects property access on variables that came from collection.find/findBy or server.create
  function transformRelationshipAccess(funcNode, modelRelationshipMap, factoryModelType = null) {
    // Track variables that hold model instances from find/findBy/server.create
    const modelVariables = new Map(); // variable name -> model type (if known)
    const arrowParameters = new Set(); // Track arrow function parameters (don't await these)
    
    // Track function parameters for afterCreate, beforeCreate hooks
    // In afterCreate(model, server), the first parameter is the model instance
    if (factoryModelType && funcNode.params && funcNode.params.length > 0) {
      const firstParam = funcNode.params[0];
      if (firstParam.type === 'Identifier') {
        modelVariables.set(firstParam.name, factoryModelType);
      }
    }
    
    // Find all variable assignments from collection methods or server.create
    j(funcNode).find(j.VariableDeclarator).forEach(varPath => {
      const init = varPath.value.init;
      if (!init) return;
      
      let call = null;
      
      // Check if assigned from awaited collection method call
      if (init.type === 'AwaitExpression' && init.argument.type === 'CallExpression') {
        call = init.argument;
      }
      // Also track non-awaited calls (they will be transformed later)
      else if (init.type === 'CallExpression') {
        call = init;
      }
      
      if (call && call.callee.type === 'MemberExpression') {
        const methodName = call.callee.property.name;
        let objectName = call.callee.object.name;
        
        // Handle schema.collection.method() pattern - need to get collection name from nested member expression
        // e.g., schema.runs.all(), schema.users.find(), schema.workspaces.where()
        if (call.callee.object.type === 'MemberExpression') {
          objectName = call.callee.object.property.name; // Extract 'runs' from 'schema.runs'
        }
        
        // Collection methods that return single models
        if (methodName === 'find' || methodName === 'findBy' || methodName === 'first' || methodName === 'findWhere') {
          modelVariables.set(varPath.value.id.name, objectName);
        }
        
        // Collection methods that return collections (still track as the collection type)
        if (methodName === 'all' || methodName === 'where' || methodName === 'filter' || methodName === 'sort') {
          modelVariables.set(varPath.value.id.name, objectName);
        }
        
        // Track server.create() and server.createList()
        if (methodName === 'create' || methodName === 'createList') {
          const isServerCall = objectName === 'server' || 
              (call.callee.object.type === 'MemberExpression' && 
               call.callee.object.property.name === 'server');
          if (isServerCall && call.arguments.length > 0) {
            // First argument to server.create is the model name
            const modelNameArg = call.arguments[0];
            if (modelNameArg.type === 'Literal' || modelNameArg.type === 'StringLiteral') {
              modelVariables.set(varPath.value.id.name, modelNameArg.value);
            }
          }
        }
      }
      
      // Track variables assigned from .models[0] or similar patterns
      // Pattern: let oauthClient = (await workspace.organization.oauthClients).models[0]
      // We need to infer the type from the relationship name
      if (init && init.type === 'MemberExpression' && init.computed) {
        // Check if this is .models[0]
        const obj = init.object;
        if (obj && obj.type === 'MemberExpression' && obj.property && obj.property.name === 'models') {
          // obj.object is the association, obj.property is 'models'
          // The association might be awaited, so unwrap AwaitExpression
          let association = obj.object;
          while (association && association.type === 'AwaitExpression') {
            association = association.argument;
          }
          
          // Try to determine the type from the property name
          // e.g., workspace.oauthClients -> type is 'oauthClient' (singular)
          if (association && association.type === 'MemberExpression') {
            const relationshipName = association.property.name;
            // Convert plural to singular (simple heuristic: remove trailing 's')
            const singularType = relationshipName.endsWith('s') ? relationshipName.slice(0, -1) : relationshipName;
            modelVariables.set(varPath.value.id.name, singularType);
          }
        }
      }
    });
    
    // Track variables assigned from collection methods or server.create in assignment expressions
    j(funcNode).find(j.AssignmentExpression).forEach(assignPath => {
      const left = assignPath.value.left;
      const right = assignPath.value.right;
      
      if (left.type === 'Identifier') {
        let arg = null;
        
        // Check awaited assignments
        if (right.type === 'AwaitExpression' && right.argument.type === 'CallExpression') {
          arg = right.argument;
        }
        // Also track non-awaited assignments (they will be transformed later)
        else if (right.type === 'CallExpression') {
          arg = right;
        }
        
        if (arg && arg.callee.type === 'MemberExpression') {
          const methodName = arg.callee.property.name;
          let objectName = arg.callee.object.name;
          
          // Handle schema.collection.method() pattern
          if (arg.callee.object.type === 'MemberExpression') {
            objectName = arg.callee.object.property.name;
          }
          
          // Collection methods that return single models
          if (methodName === 'find' || methodName === 'findBy' || methodName === 'first' || methodName === 'findWhere') {
            modelVariables.set(left.name, objectName);
          }
          
          // Collection methods that return collections
          if (methodName === 'all' || methodName === 'where' || methodName === 'filter' || methodName === 'sort') {
            modelVariables.set(left.name, objectName);
          }
          
          // Track server.create() and server.createList() in assignments
          if (methodName === 'create' || methodName === 'createList') {
            const isServerCall = objectName === 'server' || 
                (arg.callee.object.type === 'MemberExpression' && 
                 arg.callee.object.property.name === 'server');
            if (isServerCall && arg.arguments.length > 0) {
              const modelNameArg = arg.arguments[0];
              if (modelNameArg.type === 'Literal' || modelNameArg.type === 'StringLiteral') {
                modelVariables.set(left.name, modelNameArg.value);
              }
            }
          }
        }
      }
    });
    
    // Track arrow function parameters when they're callbacks on collection methods
    // e.g., `previousRuns.filter(run => ...)` - the `run` parameter should be type 'runs'
    // Find all arrow functions and check if they're used as callbacks
    j(funcNode).find(j.ArrowFunctionExpression).forEach(arrowPath => {
      const arrow = arrowPath.value;
      if (arrow.params.length === 0) return;
      
      // Check if this arrow function is an argument to a method call
      const parent = arrowPath.parent;
      if (parent && parent.value.type === 'CallExpression') {
        const call = parent.value;
        if (call.callee.type === 'MemberExpression') {
          const methodName = call.callee.property.name;
          const collectionMethods = ['filter', 'find', 'map', 'forEach', 'some', 'every', 'reduce', 'sort'];
          
          if (collectionMethods.includes(methodName)) {
            // Get the object the method is called on
            const obj = call.callee.object;
            let collectionType = null;
            
            // Direct variable reference: previousRuns.filter(...)
            if (obj.type === 'Identifier' && modelVariables.has(obj.name)) {
              collectionType = modelVariables.get(obj.name);
            }
            // Chained call: something.filter(...).map(...)
            // The result of filter/map/etc is still the same collection type
            else if (obj.type === 'CallExpression' && obj.callee.type === 'MemberExpression') {
              // Walk back through the chain to find the base collection
              let baseObj = obj;
              while (baseObj.type === 'CallExpression' && baseObj.callee.type === 'MemberExpression') {
                baseObj = baseObj.callee.object;
              }
              if (baseObj.type === 'Identifier' && modelVariables.has(baseObj.name)) {
                collectionType = modelVariables.get(baseObj.name);
              }
            }
            
            // If we found the collection type, track the arrow function parameter
            if (collectionType) {
              // For reduce, the second parameter is the item, first is accumulator
              let paramIndex = methodName === 'reduce' && arrow.params.length >= 2 ? 1 : 0;
              
              if (arrow.params[paramIndex] && arrow.params[paramIndex].type === 'Identifier') {
                const paramName = arrow.params[paramIndex].name;
                modelVariables.set(paramName, collectionType);
                arrowParameters.add(paramName); // Mark as arrow parameter (don't await)
              }
            }
          }
        }
      }
    });
    
    // Helper to recursively build awaited member expression chains
    // Breaks down workspace.organization.oauthClients into proper awaited steps
    function buildAwaitedMemberChain(expr, modelVariables, modelRelationshipMap) {
      // Base case: identifier
      if (expr.type === 'Identifier') {
        // Don't await arrow function parameters - they're passed directly to callbacks
        if (arrowParameters.has(expr.name)) {
          return expr;
        }
        return expr;
      }
      
      // Base case: not a member expression
      if (expr.type !== 'MemberExpression') {
        return expr;
      }
      
      // First, determine the type of the object (what we're accessing the property on)
      let objectType = null;
      
      // If the object is an identifier, check if it's a tracked model variable
      if (expr.object.type === 'Identifier' && modelVariables.has(expr.object.name)) {
        objectType = modelVariables.get(expr.object.name);
      }
      // If the object is a member expression, we need to trace through the chain
      else if (expr.object.type === 'MemberExpression') {
        // Walk up the chain to find the root variable and trace through relationships
        const chain = [];
        let current = expr.object;
        while (current.type === 'MemberExpression') {
          chain.unshift(current.property.name);
          current = current.object;
        }
        if (current.type === 'Identifier' && modelVariables.has(current.name)) {
          // Now trace through the relationships to determine the final type
          objectType = modelVariables.get(current.name);
          for (const propName of chain) {
            if (objectType && modelRelationshipMap.has(objectType)) {
              const relationships = modelRelationshipMap.get(objectType);
              if (relationships.has(propName)) {
                // The relationship name becomes the new type (e.g., organization relationship -> organization type)
                // Try singular and plural forms
                objectType = propName;
                // If the plural form exists in the map, keep it; otherwise try to find singular
                if (!modelRelationshipMap.has(objectType)) {
                  // Try to find in the map by checking both singular and plural
                  const singularForm = propName.endsWith('s') ? propName.slice(0, -1) : propName;
                  if (modelRelationshipMap.has(singularForm)) {
                    objectType = singularForm;
                  }
                }
              } else {
                // Not a relationship, type unknown
                objectType = null;
                break;
              }
            } else {
              objectType = null;
              break;
            }
          }
        }
      }
      
      // Check if the current property access is a relationship
      const propertyName = expr.property.name;
      let isRelationship = false;
      
      if (objectType) {
        // Check both the objectType and its singular/plural forms
        if (modelRelationshipMap.has(objectType) && modelRelationshipMap.get(objectType).has(propertyName)) {
          isRelationship = true;
        } else {
          // Try singular form if current is plural
          const singularType = objectType.endsWith('s') ? objectType.slice(0, -1) : null;
          if (singularType && modelRelationshipMap.has(singularType) && modelRelationshipMap.get(singularType).has(propertyName)) {
            isRelationship = true;
          }
        }
      }
      
      // Recursively process the object part
      const processedObject = buildAwaitedMemberChain(expr.object, modelVariables, modelRelationshipMap);
      
      // If this is a relationship access, wrap in await
      if (isRelationship) {
        const newMember = j.memberExpression(processedObject, expr.property, expr.computed);
        return j.awaitExpression(newMember);
      }
      
      // Not a relationship - only create new node if the object was actually transformed
      if (processedObject === expr.object) {
        return expr; // Nothing changed, return original
      }
      
      // Object was transformed (e.g., workspace.organization got awaited), rebuild member expression
      return j.memberExpression(processedObject, expr.property, expr.computed);
    }
    
    // Now find property accesses on these model variables
    j(funcNode).find(j.MemberExpression).forEach(memberPath => {
      const node = memberPath.value;
      
      // Skip if this node is part of a larger member expression (we'll process the root)
      // This prevents processing workspace.organization when we should process workspace.organization.oauthClients
      if (memberPath.parent.value.type === 'MemberExpression' && 
          memberPath.parent.value.object === node) {
        return;
      }
      
      // Skip if already awaited
      if (memberPath.parent.value.type === 'AwaitExpression') {
        return;
      }
      
      // Helper to check if a node chain starts with a model variable
      function startsWithModelVariable(expr) {
        if (expr.type === 'Identifier') {
          return modelVariables.has(expr.name) ? expr.name : null;
        }
        if (expr.type === 'MemberExpression') {
          return startsWithModelVariable(expr.object);
        }
        return null;
      }
      
      // Check if this expression starts with a model variable
      const modelVarName = startsWithModelVariable(node);
      if (!modelVarName) {
        return;
      }
      
      // Check if this is in a conditional, return statement, or object property
      let parent = memberPath.parent;
      let shouldTransform = false;
      
      // Check if used in if condition, return, assignment, or object property
      while (parent) {
        const pValue = parent.value;
        
        if (pValue.type === 'IfStatement') {
          shouldTransform = true;
          break;
        }
        if (pValue.type === 'LogicalExpression') {
          shouldTransform = true;
          break;
        }
        if (pValue.type === 'ReturnStatement') {
          shouldTransform = true;
          break;
        }
        if (pValue.type === 'VariableDeclarator') {
          shouldTransform = true;
          break;
        }
        if (pValue.type === 'AssignmentExpression') {
          // Only transform if this is the right-hand side (value being read),
          // not the left-hand side (assignment target)
          if (pValue.right === memberPath.value || j(pValue.right).find(j.MemberExpression).some(p => p.value === memberPath.value)) {
            shouldTransform = true;
          }
          break;
        }
        if (pValue.type === 'Property' && parent.parent.value.type === 'ObjectExpression') {
          // Inside an object literal property value
          shouldTransform = true;
          break;
        }
        if (pValue.type === 'ArrayExpression') {
          // Inside an array literal
          shouldTransform = true;
          break;
        }
        
        // Stop at statement boundaries
        if (pValue.type === 'BlockStatement' || pValue.type === 'Program') {
          break;
        }
        
        parent = parent.parent;
      }
      
      if (shouldTransform) {
        // Use the helper to properly chain awaits
        const transformed = buildAwaitedMemberChain(node, modelVariables, modelRelationshipMap);
        
        // Only replace if the transformation actually changed something
        if (transformed !== node) {
          j(memberPath).replaceWith(transformed);
          hasChanges = true;
          
          // Make the containing arrow function async if it isn't already
          let funcParent = memberPath.parent;
          while (funcParent) {
            if (funcParent.value.type === 'ArrowFunctionExpression' || 
                funcParent.value.type === 'FunctionExpression') {
              if (!funcParent.value.async) {
                funcParent.value.async = true;
              }
              break;
            }
            // Stop at function declaration or program
            if (funcParent.value.type === 'FunctionDeclaration' || 
                funcParent.value.type === 'Program') {
              break;
            }
            funcParent = funcParent.parent;
          }
        }
      }
    });
  }

  // 1. Update Server configuration to add async: true
  root.find(j.CallExpression, {
    callee: {
      name: 'createServer'
    }
  }).forEach(path => {
    const args = path.value.arguments;
    if (args.length > 0 && args[0].type === 'ObjectExpression') {
      const config = args[0];
      
      // Check if async property already exists
      const hasAsync = config.properties.some(
        prop => prop.key && prop.key.name === 'async'
      );
      
      if (!hasAsync) {
        config.properties.unshift(
          j.property(
            'init',
            j.identifier('async'),
            j.literal(true)
          )
        );
        hasChanges = true;
      }
    }
  });

  // Also handle new Server() calls
  root.find(j.NewExpression, {
    callee: {
      name: 'Server'
    }
  }).forEach(path => {
    const args = path.value.arguments;
    if (args.length > 0 && args[0].type === 'ObjectExpression') {
      const config = args[0];
      
      const hasAsync = config.properties.some(
        prop => prop.key && prop.key.name === 'async'
      );
      
      if (!hasAsync) {
        config.properties.unshift(
          j.property(
            'init',
            j.identifier('async'),
            j.literal(true)
          )
        );
        hasChanges = true;
      }
    }
  });

  // 2. Make route handlers async and add await to db/schema calls
  
  // Handle this.get, this.post, this.put, this.patch, this.delete, this.del
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'del', 'head'];
  
  httpMethods.forEach(method => {
    root.find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        object: {
          type: 'ThisExpression'
        },
        property: {
          name: method
        }
      }
    }).forEach(path => {
      const args = path.value.arguments;
      
      // Find the handler function (usually the last argument, but could be second if there's a shorthand)
      let handlerIndex = -1;
      for (let i = args.length - 1; i >= 0; i--) {
        if (args[i].type === 'FunctionExpression' || 
            args[i].type === 'ArrowFunctionExpression') {
          handlerIndex = i;
          break;
        }
      }
      
      if (handlerIndex === -1) return;
      
      const handler = args[handlerIndex];
      
      // Check if function needs to be async
      if (shouldBeAsync(handler)) {
        // Make function async if not already
        if (!handler.async) {
          handler.async = true;
          hasChanges = true;
        }
        
        // Add await to appropriate calls
        addAwaitToCallsInFunction(handler);
      }
    });
  });

  // Handle route handlers defined as variables/constants
  root.find(j.VariableDeclarator).forEach(path => {
    const init = path.value.init;
    
    if (init && (init.type === 'FunctionExpression' || 
                 init.type === 'ArrowFunctionExpression')) {
      
      // Check if it has relevant parameters
      if (hasRelevantParams(init.params) && shouldBeAsync(init)) {
        if (!init.async) {
          init.async = true;
          hasChanges = true;
        }
        
        addAwaitToCallsInFunction(init);
      }
    }
  });

  // Handle factory afterCreate hooks
  root.find(j.Property, {
    key: {
      name: 'afterCreate'
    }
  }).forEach(path => {
    const handler = path.value.value;
    
    if (handler && (handler.type === 'FunctionExpression' || 
                    handler.type === 'ArrowFunctionExpression')) {
      
      // Try to infer the model type from the filename
      // Factory files are typically named like 'workspace-v2.js' or 'user.js'
      let modelType = null;
      if (file.path) {
        const match = file.path.match(/factories\/([^\/]+)\.js$/);
        if (match) {
          modelType = match[1]; // e.g., 'workspace-v2', 'user'
        }
      }
      
      if (shouldBeAsync(handler)) {
        if (!handler.async) {
          handler.async = true;
          hasChanges = true;
        }
        
        addAwaitToCallsInFunction(handler);
        transformModelsAccess(handler, modelRelationshipMap, modelType);
        transformRelationshipAccess(handler, modelRelationshipMap, modelType);
        ensureAfterCreateReturnsModel(handler);
      }
    }
  });

  // Handle trait afterCreate hooks: trait({ afterCreate(model) { ... } })
  // Find all trait() calls and check for afterCreate properties
  root.find(j.CallExpression, {
    callee: {
      type: 'Identifier',
      name: 'trait'
    }
  }).forEach(path => {
    const args = path.value.arguments;
    if (args.length > 0 && args[0].type === 'ObjectExpression') {
      const traitObj = args[0];
      
      // Find afterCreate property in the trait object
      traitObj.properties.forEach(prop => {
        if (prop.type === 'ObjectProperty' && 
            prop.key && 
            prop.key.name === 'afterCreate') {
          
          const handler = prop.value;
          
          if (handler && (handler.type === 'FunctionExpression' || 
                          handler.type === 'ArrowFunctionExpression')) {
            
            // Try to infer the model type from the filename for traits too
            let modelType = null;
            if (file.path) {
              const match = file.path.match(/factories\/([^\/]+)\.js$/);
              if (match) {
                modelType = match[1];
              }
            }
            
            if (shouldBeAsync(handler)) {
              if (!handler.async) {
                handler.async = true;
                hasChanges = true;
              }
              
              addAwaitToCallsInFunction(handler);
              transformModelsAccess(handler, modelRelationshipMap, modelType);
              transformRelationshipAccess(handler, modelRelationshipMap, modelType);
              ensureAfterCreateReturnsModel(handler);
            }
          }
        }
      });
    }
  });

  // Handle exported function declarations (e.g., export function create() {...})
  root.find(j.ExportNamedDeclaration).forEach(path => {
    const declaration = path.value.declaration;
    
    if (declaration && declaration.type === 'FunctionDeclaration') {
      const func = declaration;
      
      // Check if function should be async
      if (shouldBeAsync(func, null)) {
        if (!func.async) {
          func.async = true;
          hasChanges = true;
        }
        
        addAwaitToCallsInFunction(func);
        transformRelationshipAccess(func, modelRelationshipMap);
      }
    }
  });

  // Handle regular function declarations (non-exported)
  root.find(j.FunctionDeclaration).forEach(path => {
    // Skip if already handled as part of export
    if (path.parent.value.type === 'ExportNamedDeclaration') {
      return;
    }
    
    const func = path.value;
    
    // Check if function should be async
    if (shouldBeAsync(func, null)) {
      if (!func.async) {
        func.async = true;
        hasChanges = true;
      }
      
      addAwaitToCallsInFunction(func);
      transformRelationshipAccess(func, modelRelationshipMap);
    }
  });

  // Handle all FunctionExpressions (including those passed as arguments to helpers)
  root.find(j.FunctionExpression).forEach(path => {
    const func = path.value;
    
    // Check if function should be async
    if (shouldBeAsync(func, path)) {
      if (!func.async) {
        func.async = true;
        hasChanges = true;
      }
      
      addAwaitToCallsInFunction(func);
      transformRelationshipAccess(func, modelRelationshipMap);
    }
  });

  // Handle all ArrowFunctionExpressions
  root.find(j.ArrowFunctionExpression).forEach(path => {
    const func = path.value;
    
    // Skip if already async (already processed by parent function)
    if (func.async) {
      return;
    }
    
    // Check if function should be async
    if (shouldBeAsync(func, path)) {
      func.async = true;
      hasChanges = true;
      
      addAwaitToCallsInFunction(func);
      transformRelationshipAccess(func, modelRelationshipMap);
    }
  });

  return hasChanges ? root.toSource({ quote: 'single' }) : null;
};

module.exports.parser = 'babel';
