/**
 * Utility functions for handling sync/async mode toggle.
 * 
 * In async mode, all database operations return Promises.
 * In sync mode (default), operations return values directly for backward compatibility.
 */

/**
 * Conditionally wraps a value in a Promise based on async mode.
 * 
 * @param {boolean} isAsync - Whether async mode is enabled
 * @param {*} value - The value to potentially wrap
 * @returns {*|Promise<*>} The value directly (sync mode) or wrapped in Promise (async mode)
 */
export function maybeAsync(isAsync, value) {
  return isAsync ? Promise.resolve(value) : value;
}

/**
 * Conditionally applies a function that may return a Promise or direct value.
 * 
 * @param {boolean} isAsync - Whether async mode is enabled
 * @param {Function} fn - The function to execute
 * @returns {*|Promise<*>} The function result, potentially wrapped in Promise
 */
export function maybeAsyncApply(isAsync, fn) {
  const result = fn();
  return isAsync ? Promise.resolve(result) : result;
}

/**
 * Wraps an array operation that should return consistently in sync or async mode.
 * 
 * @param {boolean} isAsync - Whether async mode is enabled
 * @param {Array} array - The array to operate on
 * @param {Function} operation - The operation to perform (receives array)
 * @returns {*|Promise<*>} The operation result
 */
export function maybeAsyncArray(isAsync, array, operation) {
  const result = operation(array);
  return isAsync ? Promise.resolve(result) : result;
}

/**
 * Helper for conditional Promise.all in async mode
 * 
 * @param {boolean} isAsync - Whether async mode is enabled  
 * @param {Array} values - Array of values that might be Promises
 * @returns {Array|Promise<Array>} The values or Promise of values
 */
export function maybePromiseAll(isAsync, values) {
  if (!isAsync) {
    return values;
  }
  
  // Check if any values are Promises
  const hasPromises = values.some(v => v && typeof v.then === 'function');
  return hasPromises ? Promise.all(values) : Promise.resolve(values);
}
