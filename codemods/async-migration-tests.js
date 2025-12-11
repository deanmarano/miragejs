/**
 * Codemod to migrate MirageJS test code to async mode.
 * Adds await to this.server.create(), this.server.createList(), etc.
 */

const asyncSchemaMethods = new Set(['create', 'all', 'find', 'findBy', 'findOrCreateBy', 'where', 'first', 'new']);

module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasChanges = false;

  // Helper to check if a function needs to be async based on its content
  function shouldBeAsync(node) {
    let needsAsync = false;
    
    j(node).find(j.CallExpression).forEach(callPath => {
      const { callee } = callPath.value;
      
      // Check for this.server.create(), this.server.createList()
      if (callee.type === 'MemberExpression' &&
          callee.object.type === 'MemberExpression' &&
          callee.object.object.type === 'ThisExpression' &&
          callee.object.property.name === 'server') {
        if (callee.property.name === 'create' || callee.property.name === 'createList') {
          needsAsync = true;
        }
      }
      
      // Check for this.server.schema.modelName.method()
      if (callee.type === 'MemberExpression' &&
          callee.object.type === 'MemberExpression' &&
          callee.object.object.type === 'MemberExpression' &&
          callee.object.object.object.type === 'ThisExpression' &&
          callee.object.object.property.name === 'server' &&
          callee.object.property.name === 'schema') {
        if (asyncSchemaMethods.has(callee.property.name)) {
          needsAsync = true;
        }
      }
    });
    
    return needsAsync;
  }

  // Helper to add await to a call expression
  function addAwaitToCall(path) {
    const { callee } = path.value;
    
    // Check if already awaited
    if (path.parent.value.type === 'AwaitExpression') {
      return;
    }
    
    let shouldAwait = false;
    
    // Check for this.server.create(), this.server.createList()
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'MemberExpression' &&
        callee.object.object.type === 'ThisExpression' &&
        callee.object.property.name === 'server') {
      if (callee.property.name === 'create' || callee.property.name === 'createList') {
        shouldAwait = true;
      }
    }
    
    // Check for this.server.schema.modelName.method()
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'MemberExpression' &&
        callee.object.object.type === 'MemberExpression' &&
        callee.object.object.object.type === 'ThisExpression' &&
        callee.object.object.property.name === 'server' &&
        callee.object.property.name === 'schema') {
      if (asyncSchemaMethods.has(callee.property.name)) {
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

  // Find all FunctionExpressions (test functions, hooks, etc.)
  root.find(j.FunctionExpression).forEach(path => {
    const func = path.value;
    
    if (shouldBeAsync(func)) {
      if (!func.async) {
        func.async = true;
        hasChanges = true;
      }
      
      addAwaitToCallsInFunction(func);
    }
  });

  // Find all ArrowFunctionExpressions
  root.find(j.ArrowFunctionExpression).forEach(path => {
    const func = path.value;
    
    if (shouldBeAsync(func)) {
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
