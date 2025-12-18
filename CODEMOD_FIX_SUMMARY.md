# Codemod Fix Summary

## Problem Fixed

The codemod was not adding `await` keywords to `server.create()` calls when they appeared **inline within object literal properties** passed to `model.update()`.

### Example of the Bug

**Before Fix (Broken Code):**
```javascript
Factory.extend({
  afterCreate(policy, server) {
    policy.update({ 
      target: server.create('workspace'),  // ❌ No await!
      owner: server.create('user')          // ❌ No await!
    });
  }
});
```

**After Fix (Correct Code):**
```javascript
Factory.extend({
  async afterCreate(policy, server) {
    await policy.update({ 
      target: await server.create('workspace'),  // ✅ Awaited!
      owner: await server.create('user')          // ✅ Awaited!
    });
    return policy;
  }
});
```

## Root Cause

In `codemods/async-migration.cjs`, the `addAwaitToCall()` function checks if a CallExpression is already awaited by walking up the AST. However, it wasn't stopping at `Property` nodes (object literal properties), which caused it to potentially check too far up the tree or not properly detect that nested calls needed their own await.

## The Fix

**File:** `codemods/async-migration.cjs`  
**Line:** ~530

Added `Property` to the list of node types where we stop checking for existing await expressions:

```javascript
if (checkPath.parent.value.type === 'ExpressionStatement' ||
    checkPath.parent.value.type === 'VariableDeclarator' ||
    checkPath.parent.value.type === 'AssignmentExpression' ||
    checkPath.parent.value.type === 'ReturnStatement' ||
    checkPath.parent.value.type === 'IfStatement' ||
    checkPath.parent.value.type === 'BlockStatement' ||
    checkPath.parent.value.type === 'Property') {  // ← Added this line
  break;
}
```

## Testing

### New Test Cases Added

Added 5 new test cases to `codemods/__tests__/async-migration.test.cjs`:

1. ✅ `transforms afterCreate with unawaited server.create passed to model.update`
2. ✅ `transforms complex afterCreate with multiple unawaited operations`
3. ✅ `transforms afterCreate with server.create directly in update call` (was failing, now passes)
4. ✅ `transforms trait afterCreate with unawaited creates`
5. ✅ `transforms afterCreate creating records for HasMany relationships`

### Test Results

- **Total tests:** 82
- **Passing:** 82 ✅
- **Failing:** 0 ❌

All tests pass, including the new test cases that specifically target the Atlas error patterns.

## Impact on Atlas Errors

This fix directly addresses the errors documented in `mirage-errors-collection.md`:

### Error 1 & 2: data-retention-policy-dont-delete-v2
**Error Message:**
```
Mirage: Error: You're trying to create a data-retention-policy-dont-delete-v2 
model and you passed in "[object Promise]" under the target key, but that key 
is a BelongsTo relationship. You must pass in a Model or null.
```

**Cause:** Factory code like:
```javascript
afterCreate(policy, server) {
  const workspace = server.create('workspace');  // Not awaited
  policy.update({ target: workspace });           // Passes Promise
}
```

**Fix:** Codemod now correctly transforms to:
```javascript
async afterCreate(policy, server) {
  const workspace = await server.create('workspace');
  await policy.update({ target: workspace });
  return policy;
}
```

### Error 4: organization-membership-v2
**Error Message:**
```
Mirage: Error: You're trying to create a organization-membership-v2 model 
and you passed in "undefined" under the user key, but that key is a BelongsTo 
relationship. You must pass in a Model or null.
```

**Cause:** Likely similar pattern where `undefined` results from an unresolved Promise.

**Fix:** Codemod now properly awaits all `server.create()` operations, preventing Promise/undefined issues.

## Next Steps

1. ✅ **Fixed the codemod** - All tests pass
2. ⏭️ **Run codemod on Atlas codebase** to fix the real-world errors
3. ⏭️ **Re-run Atlas Ember tests** to verify errors are resolved
4. ⏭️ **Document the fix** in the migration guide

## Files Changed

- `codemods/async-migration.cjs` - Added `Property` to stop-check list (1 line change)
- `codemods/__tests__/async-migration.test.cjs` - Added 5 new test cases (~120 lines)
- `codemods/__tests__/async-migration.test.js` - Added 5 new test cases (~120 lines)
