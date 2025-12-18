# Codemod Test Findings - Atlas Error Patterns

## Summary

We've identified and created test cases for the specific patterns causing Mirage errors in the Atlas Ember tests. These tests have been added to `codemods/__tests__/async-migration.test.cjs`.

## Test Results

### ✅ Passing Tests (Codemod Handles These Correctly)

1. **`transforms afterCreate with unawaited server.create passed to model.update`**
   - Pattern: `const x = server.create(); model.update({ field: x })`
   - The codemod correctly adds `await` to both operations
   
2. **`transforms complex afterCreate with multiple unawaited operations`**
   - Pattern: Multiple `server.create()` calls followed by `model.update()`
   - The codemod correctly adds `await` to all operations
   
3. **`transforms trait afterCreate with unawaited creates`**
   - Pattern: Same as #1 but within a trait's afterCreate
   - The codemod correctly handles traits
   
4. **`transforms afterCreate creating records for HasMany relationships`**
   - Pattern: Creating related records and collecting their IDs
   - The codemod correctly awaits all operations

### ❌ Failing Test (Codemod Bug Found)

**`transforms afterCreate with server.create directly in update call`**

**Input Code (Causing Atlas Errors):**
```javascript
Factory.extend({
  afterCreate(policy, server) {
    policy.update({ 
      target: server.create('workspace'),
      owner: server.create('user')
    });
  }
});
```

**Expected Output:**
```javascript
Factory.extend({
  async afterCreate(policy, server) {
    await policy.update({ 
      target: await server.create('workspace'),
      owner: await server.create('user')
    });
    return policy;
  }
});
```

**Actual Output (Bug):**
```javascript
Factory.extend({
  async afterCreate(policy, server) {
    await policy.update({ 
      target: server.create('workspace'),  // ❌ Missing await!
      owner: server.create('user')          // ❌ Missing await!
    });
    return policy;
  }
});
```

## Root Cause Analysis

### The Problem

When `server.create()` is called **inline within an object literal** that's passed to `model.update()`, the codemod:
1. ✅ Makes the function `async`
2. ✅ Adds `await` before `model.update()`
3. ✅ Adds the `return` statement
4. ❌ **FAILS** to add `await` before the nested `server.create()` calls

This results in Promise objects being passed to BelongsTo relationships, which causes the Mirage error:
```
Mirage: Error: You're trying to create a [model] and you passed in 
"[object Promise]" under the [relationship] key, but that key is a 
BelongsTo relationship. You must pass in a Model or null.
```

### Atlas Error Mapping

From `mirage-errors-collection.md`:

1. **Error: data-retention-policy-dont-delete-v2**
   - Promise passed to `target` BelongsTo relationship
   - Likely caused by this pattern in Atlas factory code

2. **Error: organization-membership-v2** 
   - `undefined` passed to `user` BelongsTo relationship
   - May be related but different - the Promise never resolves, becomes undefined

## Codemod Fix Needed

The codemod needs to be enhanced to:

1. **Detect nested `server.create()` calls within object literals**
   - When visiting `ObjectExpression` nodes
   - Check if property values are `CallExpression` nodes
   - Check if those calls match async patterns (server.create, schema.create, etc.)

2. **Add `await` keywords to nested calls**
   - When the parent call is being awaited
   - Ensure nested calls in object properties are also awaited

## Next Steps

1. **Fix the codemod** to handle nested `server.create()` in object literals
2. **Run the failing test** to verify the fix
3. **Test on Atlas codebase** to ensure real-world patterns are fixed
4. **Document the pattern** in the codemod's README

## Related Files

- Error documentation: `mirage-errors-collection.md`
- Test file: `codemods/__tests__/async-migration.test.cjs` (lines ~1668-1780)
- Codemod: `codemods/async-migration.cjs`
- Runtime test showing the bug: `__tests__/internal/unit/server-test.js` (lines 823-920)
