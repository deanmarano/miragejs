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

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

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
      if (callee.type === 'Identifier' && callPath.value.arguments.length === 2) {
        const args = callPath.value.arguments;
        // Check if arguments match (schema/schemas, request) pattern
        if (args[0].type === 'Identifier' && 
            (args[0].name === 'schema' || args[0].name === 'schemas') &&
            args[1].type === 'Identifier' && 
            args[1].name === 'request') {
          needsAsync = true;
        }
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

  // Helper to transform .models access patterns in async functions
  // Patterns: association.models.get(...) or association.models[index]
  // These need the association to be awaited first
  // BUT skip if the association is a CallExpression (schema.where() already returns awaited collection)
  function transformModelsAccess(funcNode) {
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
      
      // Skip if the association is an AwaitExpression wrapping a CallExpression
      // Pattern: (await server.schema.projects.where(...)).models
      // The await already returns the resolved collection, no need to wrap again
      if (association.type === 'AwaitExpression' && 
          association.argument && association.argument.type === 'CallExpression') {
        return;
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
        // Check if .models is being accessed further (e.g., .models.get() or .models[0])
        // If so, we need to await the entire .models expression, not just the association
        const parent = modelsPath.parent.value;
        const needsModelsAwait = parent && (
          parent.type === 'MemberExpression' ||  // .models.get() or .models.firstObject
          parent.type === 'CallExpression'       // Should not happen but check anyway
        );
        
        // Replace association.models with (await association).models
        // Handle both Identifier (runEvents) and MemberExpression (run.runEvents)
        const awaitedAssociation = association.type === 'Identifier' 
          ? j.awaitExpression(j.identifier(association.name))
          : j.awaitExpression(association);
          
        const newModelsExpr = j.memberExpression(
          awaitedAssociation,
          modelsExpr.property,
          false
        );
        
        // If .models is being accessed further, wrap it in await
        if (needsModelsAwait) {
          j(modelsPath).replaceWith(
            j.awaitExpression(newModelsExpr)
          );
        } else {
          j(modelsPath).replaceWith(newModelsExpr);
        }
        hasChanges = true;
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
      
      if (shouldBeAsync(handler)) {
        if (!handler.async) {
          handler.async = true;
          hasChanges = true;
        }
        
        addAwaitToCallsInFunction(handler);
        transformModelsAccess(handler);
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
            
            if (shouldBeAsync(handler)) {
              if (!handler.async) {
                handler.async = true;
                hasChanges = true;
              }
              
              addAwaitToCallsInFunction(handler);
              transformModelsAccess(handler);
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
    }
  });

  // Handle all ArrowFunctionExpressions
  root.find(j.ArrowFunctionExpression).forEach(path => {
    const func = path.value;
    
    // Check if function should be async
    if (shouldBeAsync(func, path)) {
      if (!func.async) {
        func.async = true;
        hasChanges = true;
      }
      
      addAwaitToCallsInFunction(func);
    }
  });

  return hasChanges ? root.toSource({ quote: 'single' }) : null;
};

module.exports.parser = 'babel';
