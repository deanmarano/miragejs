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

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

  // Helper to check if a function should be made async
  function shouldBeAsync(node) {
    let needsAsync = false;
    
    j(node).find(j.CallExpression).forEach(callPath => {
      const { callee } = callPath.value;
      
      // Check for schema.modelName.method() calls
      if (callee.type === 'MemberExpression' &&
          callee.object.type === 'MemberExpression' &&
          callee.object.object.name === 'schema') {
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
    });
    
    return needsAsync;
  }

  // Helper to wrap calls with await
  function addAwaitToCall(path) {
    const { callee } = path.value;
    
    // Check if already awaited
    if (path.parent.value.type === 'AwaitExpression') {
      return;
    }
    
    let shouldAwait = false;
    
    // Check for schema.modelName.method() calls
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'MemberExpression' &&
        callee.object.object.name === 'schema') {
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
    
    if (shouldAwait) {
      j(path).replaceWith(
        j.awaitExpression(path.value)
      );
      hasChanges = true;
    }
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
        j(handler).find(j.CallExpression).forEach(callPath => {
          addAwaitToCall(callPath);
        });
      }
    });
  });

  // Handle route handlers defined as variables/constants
  root.find(j.VariableDeclarator).forEach(path => {
    const init = path.value.init;
    
    if (init && (init.type === 'FunctionExpression' || 
                 init.type === 'ArrowFunctionExpression')) {
      
      // Check if it has schema or db parameters
      const params = init.params;
      const hasSchemaOrDb = params.some(param => 
        param.name === 'schema' || param.name === 'db'
      );
      
      if (hasSchemaOrDb && shouldBeAsync(init)) {
        if (!init.async) {
          init.async = true;
          hasChanges = true;
        }
        
        j(init).find(j.CallExpression).forEach(callPath => {
          addAwaitToCall(callPath);
        });
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
        
        j(handler).find(j.CallExpression).forEach(callPath => {
          addAwaitToCall(callPath);
        });
      }
    }
  });

  // Handle exported function declarations (e.g., export function create() {...})
  root.find(j.ExportNamedDeclaration).forEach(path => {
    const declaration = path.value.declaration;
    
    if (declaration && declaration.type === 'FunctionDeclaration') {
      const func = declaration;
      
      // Check if function has schema/db parameters
      const params = func.params;
      const hasSchemaOrDb = params.some(param => 
        param.type === 'Identifier' && (param.name === 'schema' || param.name === 'db')
      ) || params.some(param => {
        // Check for destructured parameters like { sessions, userV2s }
        if (param.type === 'ObjectPattern') {
          return true; // Assume destructured params might contain db collections
        }
        return false;
      });
      
      if (hasSchemaOrDb && shouldBeAsync(func)) {
        if (!func.async) {
          func.async = true;
          hasChanges = true;
        }
        
        j(func).find(j.CallExpression).forEach(callPath => {
          addAwaitToCall(callPath);
        });
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
    
    // Check if function has schema/db parameters
    const params = func.params;
    const hasSchemaOrDb = params.some(param => 
      param.type === 'Identifier' && (param.name === 'schema' || param.name === 'db')
    ) || params.some(param => {
      // Check for destructured parameters
      if (param.type === 'ObjectPattern') {
        return true;
      }
      return false;
    });
    
    if (hasSchemaOrDb && shouldBeAsync(func)) {
      if (!func.async) {
        func.async = true;
        hasChanges = true;
      }
      
      j(func).find(j.CallExpression).forEach(callPath => {
        addAwaitToCall(callPath);
      });
    }
  });

  return hasChanges ? root.toSource({ quote: 'single' }) : null;
};

module.exports.parser = 'babel';
