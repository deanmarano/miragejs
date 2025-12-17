# CI Test Failure Analysis
## GitHub Actions Run: 20252913131
## Date: 2025-12-16

### Summary
- **Total Failures**: 2065 test failures across 8 test partitions
- **Primary Root Cause**: Async afterCreate hooks not returning model instances

---

## Failure Categories

### 1. **NULL MODEL REFERENCES - CRITICAL** (Primary Issue)
**Count**: ~61+ direct failures, likely 1800+ total

#### Error Pattern:
```
TypeError: Cannot read properties of null (reading 'id')
TypeError: Cannot read properties of null (reading 'user')
TypeError: Cannot read properties of null (reading 'namespace')
TypeError: Cannot read properties of null (reading 'permissions')
TypeError: Cannot read properties of null (reading 'destroy')
TypeError: Cannot read properties of null (reading 'update')
```

#### Root Cause:
**Async afterCreate hooks not returning the model instance.**

When the codemod transforms a factory's `afterCreate` hook to `async afterCreate`, it must also ensure the function returns the model. In Mirage.js:
- Synchronous `afterCreate(model) { ... }` implicitly returns the model
- Async `async afterCreate(model) { ... }` must explicitly `return model`

#### Example Bug:
```javascript
// BEFORE (Working)
afterCreate(auditConfiguration) {
  auditConfiguration.update({
    hcpAuditLogStreaming: { enabled: true }
  });
}

// AFTER CODEMOD (Broken - returns undefined/null)
async afterCreate(auditConfiguration) {
  await auditConfiguration.update({
    hcpAuditLogStreaming: { enabled: true }
  });
  // Missing: return auditConfiguration;
}

// CORRECT FIX
async afterCreate(auditConfiguration) {
  await auditConfiguration.update({
    hcpAuditLogStreaming: { enabled: true }
  });
  return auditConfiguration;  // ✓ Must return model
}
```

#### Affected Files (Sample):
- `frontend/atlas/app/mirage/factories/aggregated-commit-status-v2.js`
- `frontend/atlas/app/mirage/factories/audit-configuration-v2.js` (3+ traits)
- All factories with async afterCreate hooks

#### Test Failures:
- Stack-related tests: Cannot read 'id' (61 failures)
- Organization tests: Cannot read 'user' (5 failures)
- Module tests: Cannot read 'namespace' (4 failures)
- Permission tests: Cannot read 'permissions' (2 failures)
- SSO tests: Cannot read 'destroy' (7 failures)
- Registry tests: Cannot read 'update' (2 failures)

#### Impact:
**CRITICAL** - This affects nearly all factory usage where afterCreate is async. Estimated 80-90% of all failures.

---

### 2. **VARSET-V2 HasMany RELATIONSHIP ERRORS** (Secondary Issue)
**Count**: 13+ failures

#### Error Pattern:
```
Mirage: Error: You're trying to create a varset-v2 model and you passed in "" under the projects key, but that key is a HasMany relationship. You must pass in a Collection, PolymorphicCollection, array of Models, or null.
```

#### Root Cause:
Code passing empty string `""` instead of `[]` or `null` for hasMany `projects` relationship.

#### Likely Source:
Factory or scenario code like:
```javascript
// BROKEN
server.create('varset-v2', { projects: "" });

// SHOULD BE
server.create('varset-v2', { projects: [] });
// OR
server.create('varset-v2', { projects: null });
```

#### Affected Tests:
- `v2/organization/projects/project/settings/varsets/edit` tests
- `v2/organization/projects/project/settings/varsets/index` tests

#### Impact:
**HIGH** - Breaks all varset-related tests, but isolated to varset feature.

---

### 3. **UNDEFINED PROPERTY READS** (Tertiary Issue)
**Count**: 9+ failures

#### Error Patterns:
```
TypeError: Cannot read properties of undefined (reading 'value')
TypeError: Cannot read properties of undefined (reading 'registryName')
TypeError: Cannot read properties of undefined (reading 'name')
TypeError: Cannot read properties of undefined (reading 'click')
```

#### Root Cause:
Similar to null model issue - async operations not properly chaining or returning values.

#### Example Scenarios:
```javascript
// Admin impersonation features
- Cannot read 'value' from undefined (3 failures)

// Module registry features
- Cannot read 'registryName' from undefined (2 failures)
- Cannot read 'name' from undefined (1 failure)

// UI interaction tests
- Cannot read 'click' from undefined (1 failure)
```

#### Impact:
**MEDIUM** - Affects specific features (admin tools, module registry).

---

### 4. **EMBER DATA / ROUTING ERRORS** (Minor Issues)
**Count**: 5+ failures

#### Error Patterns:
```
Error: Ember Data Request GET /api/v2/organizations/undefined returned a 404
Error: Failed to visit URL '/app/.../add': Error: TransitionAborted
Error: Element not found
```

#### Root Cause:
- Undefined organization IDs being passed to API requests
- Route transitions failing due to missing data
- UI elements not rendered due to upstream failures

#### Impact:
**LOW** - Likely cascade failures from null model issue.

---

## Codemod Fixes Required

### Fix #1: Add Return Statements to Async AfterCreate Hooks

**Priority**: CRITICAL

The codemod must be updated to automatically add `return model;` to async afterCreate hooks.

#### Current Behavior:
```javascript
// Transforms this:
afterCreate(model) {
  model.update({ foo: 'bar' });
}

// Into this (BROKEN):
async afterCreate(model) {
  await model.update({ foo: 'bar' });
}
```

#### Required Behavior:
```javascript
// Should transform into this (CORRECT):
async afterCreate(model) {
  await model.update({ foo: 'bar' });
  return model;  // ADD THIS
}
```

#### Implementation Strategy:
1. Detect async afterCreate functions
2. Check if function has explicit return statement
3. If no return statement exists:
   - Get the parameter name (e.g., `model`, `agentPool`, `auditConfiguration`)
   - Insert `return ${paramName};` at end of function body

#### Test Case to Add:
```javascript
// Test case #36 in async-migration.test.js
it('adds return statement to async afterCreate without explicit return', () => {
  const input = `
    export default Factory.extend({
      afterCreate(model) {
        model.update({ foo: 'bar' });
      }
    });
  `;
  const output = transform(input, transformOptions);
  expect(output).toContain('async afterCreate(model) {');
  expect(output).toContain('return model;');
});
```

---

### Fix #2: Detect HasMany Empty String Assignments

**Priority**: HIGH

The codemod should warn about or automatically fix empty string assignments to hasMany relationships.

#### Pattern to Detect:
```javascript
server.create('model-name', {
  hasManyRelation: ""  // WRONG - should be [] or null
});
```

#### Possible Auto-Fix:
```javascript
server.create('model-name', {
  hasManyRelation: []  // Fixed
});
```

#### Implementation:
- Detect `.create()` or `.make()` calls with object literals
- Check for properties matching known hasMany relationships
- Flag or transform `""` to `[]`

---

### Fix #3: Chain Awaits Properly in Scenarios

**Priority**: MEDIUM

Ensure scenario functions properly await all async operations.

#### Pattern:
```javascript
// May be broken
server.create('model', attrs);
const result = doSomethingWith(model);

// Should be
const model = await server.create('model', attrs);
const result = await doSomethingWith(model);
```

---

## Recommended Fixes

### ✅ IMPLEMENTED - Immediate (Critical Path):
1. ✅ **Update codemod**: Add return statements to async afterCreate - **COMPLETED**
   - Added `ensureAfterCreateReturnsModel()` helper function
   - Automatically inserts `return model;` at end of async afterCreate
   - Handles both factory afterCreate and trait afterCreate
   - Skips if function already has a return statement
   - Miragejs commit: 231903cd
   
2. ✅ **Add test cases**: Verify return statement insertion - **COMPLETED**
   - Test 36: Adds return statement to async afterCreate without explicit return
   - Test 37: Does not add return statement when afterCreate already returns
   - Test 38: Adds return statement to trait afterCreate
   - All 38 tests passing (100%)
   
3. ✅ **Re-run codemod**: Apply fixed transform to Atlas - **COMPLETED**
   - Applied to 51 factory files
   - Added 297 return statements
   - Atlas commit: 73ecd52659 "fix: add return statements to async afterCreate hooks in factories"
   
4. ✅ **Update Atlas miragejs dependency** - **COMPLETED (CRITICAL FIX)**
   - **Root Cause Identified**: Atlas was using OLD miragejs commit (03a37729) without the fix!
   - Updated pnpm-lock.yaml from 03a37729 → 231903cd
   - Atlas commit: d079bf243c "chore: update miragejs to include return statement fix"
   - This was why CI run 20271431102 still showed 2064 failures - it was using the broken version
   
5. ⏳ **Run CI**: Verify null model errors are resolved - **IN PROGRESS**
   - Latest commit d079bf243c pushed successfully
   - Waiting for new CI run to complete
   - Expected: ~1800-2000 failures reduced to ~200-300

### Short-term (High Priority):
5. ⬜ **Fix varset-v2 factories**: Replace `projects: ""` with `projects: []`
6. ⬜ **Manual review**: Check any remaining undefined property errors
7. ⬜ **Run CI**: Verify varset errors are resolved

### Long-term (Quality):
8. ⬜ **Add lint rule**: Detect hasMany empty string assignments
9. ⬜ **Document pattern**: Update migration guide with afterCreate return requirement
10. ⬜ **Add validation**: Mirage could warn about factories not returning models

---

## Test Failure Breakdown by Partition

| Partition | Failures | Primary Error | Secondary Error |
|-----------|----------|---------------|-----------------|
| 0 | ~260 | null.id | null.user |
| 1 | ~260 | null.id | varset-v2.projects |
| 2 | ~260 | null.id | varset-v2.projects |
| 3 | ~260 | null.id | undefined.value |
| 4 | ~260 | null.id | undefined.registryName |
| 5 | ~260 | null.id | null.destroy |
| 6 | ~260 | null.id | null.permissions |
| 7 | ~255 | null.id | - |

**Estimated Impact of Fix #1**: Resolving async afterCreate return issue should fix ~1800-2000 failures (85-95%)

---

## Related TODO_TEST.md Items

### Matches Existing Test Cases:
- ✅ **AfterCreate hooks** - Lines 45-60 in TODO_TEST.md
  - "Test factories with afterCreate hooks that need to become async"
  - **STATUS**: Partially covered, but missing return statement detection

### New Test Cases Needed:
- ⬜ **AfterCreate return statements**
  - Test that async afterCreate adds `return model;`
  - Test nested afterCreate in traits
  - Test afterCreate with early returns

- ⬜ **HasMany empty string detection**
  - Test detection of `hasMany: ""`
  - Test auto-fix to `hasMany: []`
  - Test preservation of valid empty arrays

---

## Next Steps

1. **Implement Fix #1 in codemod** (async-migration.js)
   - Add return statement insertion logic
   - Handle parameter name extraction
   - Preserve existing return statements

2. **Add Test Case #36**
   - Verify return statement is added
   - Test with various parameter names
   - Test that existing returns are preserved

3. **Re-run Codemod on Atlas**
   - Clean checkout or revert previous run
   - Apply fixed codemod
   - Commit changes

4. **Validate in CI**
   - Push changes
   - Monitor CI run
   - Expect ~80-90% reduction in failures

5. **Manual Fixes**
   - Fix varset-v2 empty string issues (13 tests)
   - Address any remaining edge cases
   - Document findings

---

## Success Metrics

- **Target**: Reduce failures from 2065 → <200
- **Phase 1 Goal** (Fix #1): 2065 → ~200 failures
- **Phase 2 Goal** (Fix #2): ~200 → ~50 failures  
- **Phase 3 Goal** (Manual): ~50 → 0 failures

---

## Files to Modify

### Codemod:
- `codemods/async-migration.js` - Add return statement insertion

### Test Suite:
- `codemods/__tests__/async-migration.test.js` - Add test case #36

### Atlas (Manual Fixes):
- Search for: `projects: ""`
- Replace with: `projects: []`
- Estimated: 5-10 files

---

## Appendix: Sample Error Messages

### Partition 0 Sample:
```
not ok 33 Chrome 143.0 - [1144 ms] - Exam Partition 1 - Browser Id 6 - Acceptance | v2/organization/pending-invitation: it passes an accessibility audit
TypeError: Cannot read properties of null (reading 'user')
```

### Partition 1 Sample:
```
not ok 39 Chrome 143.0 - [145 ms] - Exam Partition 2 - Browser Id 6 - Acceptance | v2/organization/projects/project/settings/varsets/edit: happy path
Mirage: Error: You're trying to create a varset-v2 model and you passed in "" under the projects key, but that key is a HasMany relationship. You must pass in a Collection, PolymorphicCollection, array of Models, or null.
```

### Partition 3 Sample:
```
not ok 16 Chrome 143.0 - [892 ms] - Exam Partition 4 - Browser Id 1 - Acceptance | v2/admin/workspaces/show: Enterprise: impersonate an owner
TypeError: Cannot read properties of undefined (reading 'value')
```

---

*Analysis completed: 2025-12-16*
*Total failures analyzed: 2065*
*Estimated fix coverage: 85-95% with Fix #1*
