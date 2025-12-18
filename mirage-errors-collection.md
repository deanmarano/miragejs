# Mirage Errors Collection from Ember Test Logs

This document contains all Mirage errors found in the ember-logs directories.

## Summary

Two main error patterns were found:

1. **BelongsTo Relationship Validation Errors** - Multiple instances where models are being created with invalid values for BelongsTo relationships
2. **Foreign Key Validation Errors** - Instances where HasMany relationships reference non-existent records

---

## ember-logs Directory Errors

### Error 1: data-retention-policy-dont-delete-v2 - Promise passed as BelongsTo

**Source:** `ember-logs/ember-tests___ember-tests__5_.log` (Lines 2470-2471)  
**Timestamp:** 2025-12-17T21:07:02.7163074Z  
**Test:** Acceptance | v2/organization/settings/profile: an owner can view and update the data retention policy

```
Mirage: Error: You're trying to create a data-retention-policy-dont-delete-v2 model and you passed in "[object Promise]" under the target key, but that key is a BelongsTo relationship. You must pass in a Model or null.
    at new MirageError (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:454:13)
    at assert (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:444:11)
    at Child._validateAttr (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:3406:11)
    at eval (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2904:12)
    at Array.forEach (<anonymous>)
    at new Model (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2902:24)
    at new Child (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2805:7)
    at new Child (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2805:7)
    at new Child (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2805:7)
    at Schema._instantiateModel (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:5861:12)
```

**Issue:** A Promise object was passed to the `target` key which expects a Model or null.

---

### Error 2: data-retention-policy-dont-delete-v2 - Promise passed as BelongsTo (Duplicate)

**Source:** `ember-logs/ember-tests___ember-tests__3_.log` (Lines 3505-3506)  
**Timestamp:** 2025-12-17T21:08:43.1400633Z  
**Test:** Acceptance | v2/organization/workspaces/workspace/settings/delete: an owner can view and update the data retention policy

```
Mirage: Error: You're trying to create a data-retention-policy-dont-delete-v2 model and you passed in "[object Promise]" under the target key, but that key is a BelongsTo relationship. You must pass in a Model or null.
    at new MirageError (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:454:13)
    at assert (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:444:11)
    at Child._validateAttr (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:3406:11)
    at eval (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2904:12)
    at Array.forEach (<anonymous>)
    at new Model (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2902:24)
    at new Child (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2805:7)
    at new Child (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2805:7)
    at new Child (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2805:7)
    at Schema._instantiateModel (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:5861:12)
```

**Issue:** Same as Error 1 - Promise object passed to `target` key instead of Model or null.

---

### Error 3: organization-v2 - Non-existent oauthClientIds

**Source:** `ember-logs/ember-tests___ember-tests__2_.log` (Lines 4485-4486)  
**Timestamp:** 2025-12-17T21:08:38.6923624Z  
**Test:** Integration | Component | vcs select: with no OAuth clients

```
Mirage: Error: You're instantiating a organization-v2 that has a oauthClientIds of oc-nZceGhnwskA5Cwts4,oc-nZceGhnwskA5Cwts4,oc-nZceGhnwskA5Cwts4,oc-nZceGhnwskA5Cwts4, but some of those records don't exist in the database.
    at new MirageError (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:454:13)
    at assert (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:444:11)
    at Child._validateForeignKeyExistsInDatabase (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:3458:7)
    at Child._setupRelationship (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:3381:14)
    at eval (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2906:12)
    at Array.forEach (<anonymous>)
    at new Model (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2902:24)
    at new Child (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2805:7)
    at new Child (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:2805:7)
    at Schema._instantiateModel (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+7a80538/node_modules/miragejs/dist/mirage.cjs?:5861:12)
```

**Issue:** The HasMany relationship `oauthClientIds` contains duplicate IDs that don't exist in the database.

---

## ember-test-logs-20252913131 Directory Errors

### Error 4: organization-membership-v2 - Undefined user (Multiple instances)

**Source:** `ember-test-logs-20252913131/ember-tests___ember-tests__6_.log` (Line 2480)  
**Timestamp:** 2025-12-16T01:12:05.6554493Z  
**Test:** Integration | Component | registry/module/search/card: it renders public module properties

```
Mirage: Error: You're trying to create a organization-membership-v2 model and you passed in "undefined" under the user key, but that key is a BelongsTo relationship. You must pass in a Model or null.
    at new MirageError (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+03a37729a84db27f2473c55c028187a6861efa4e/node_modules/miragejs/dist/mirage.cjs?:446:13)
    at assert (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+03a37729a84db27f2473c55c028187a6861efa4e/node_modules/miragejs/dist/mirage.cjs?:436:11)
    at Child._validateAttr (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+03a37729a84db27f2473c55c028187a6861efa4e/node_modules/miragejs/dist/mirage.cjs?:3298:11)
    at eval (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+03a37729a84db27f2473c55c028187a6861efa4e/node_modules/miragejs/dist/mirage.cjs?:2821:12)
    at Array.forEach (<anonymous>)
    at new Model (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+03a37729a84db27f2473c55c028187a6861efa4e/node_modules/miragejs/dist/mirage.cjs?:2819:24)
    at new Child (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+03a37729a84db27f2473c55c028187a6861efa4e/node_modules/miragejs/dist/mirage.cjs?:2722:7)
    at new Child (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+03a37729a84db27f2473c55c028187a6861efa4e/node_modules/miragejs/dist/mirage.cjs?:2722:7)
    at Schema._instantiateModel (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+03a37729a84db27f2473c55c028187a6861efa4e/node_modules/miragejs/dist/mirage.cjs?:5748:12)
    at Schema.new (webpack://__ember_auto_import__/../../node_modules/.pnpm/miragejs@https+++codeload.github.com+deanmarano+miragejs+tar.gz+03a37729a84db27f2473c55c028187a6861efa4e/node_modules/miragejs/dist/mirage.cjs?:5405:17)
```

**Issue:** `undefined` was passed to the `user` key which is a BelongsTo relationship that expects a Model or null.

**Affected Tests:**
- Integration | Component | v2-sidebar-menu-global: it renders (2025-12-16T01:12:12.5816237Z)
- Integration | Component | header-global: it renders the header global (2025-12-16T01:12:00.9489705Z)
- Integration | Component | header-global: it renders the logo (2025-12-16T01:12:01.2374998Z)
- Integration | Component | header-global: it renders the command bar trigger (2025-12-16T01:12:01.4999033Z)
- Integration | Component | header-global: the mobile menu close callback is triggered (2025-12-16T01:12:11.0456529Z)
- Integration | Component | header-global: command bar trigger is set to display none in the mobile menu (2025-12-16T01:12:11.7874863Z)
- Integration | Component | header-global: it renders the organization picker (2025-12-16T01:12:12.0913648Z)
- Integration | Component | header-global: it renders the user menu (2025-12-16T01:12:12.3624831Z)

---

## Analysis

### Root Causes

1. **Async/Await Issues**: The Promise being passed instead of a resolved Model suggests that async operations are not being properly awaited before creating relationships. This is likely related to the async migration work.

2. **Undefined Values**: Multiple instances of `undefined` being passed for BelongsTo relationships indicate that factory/fixture setup code may not be properly initializing required relationship fields.

3. **HasMany Validation**: The foreign key validation error shows that HasMany relationships are being set up with IDs that don't exist in the database yet, possibly due to incorrect setup order or missing fixtures.

### Affected Models

- `data-retention-policy-dont-delete-v2`
  - BelongsTo relationship: `target` 
  - Receiving: Promise objects

- `organization-v2`
  - HasMany relationship: `oauthClientIds`
  - Issue: Non-existent foreign keys

- `organization-membership-v2`
  - BelongsTo relationship: `user`
  - Receiving: `undefined`

### Recommendations

1. **For Promise Issues**: Ensure all async factory operations are properly awaited before setting up relationships. The `target` field should be resolved before being passed to the model constructor.

2. **For Undefined Issues**: Review factory definitions for `organization-membership-v2` to ensure the `user` relationship is always initialized with a valid Model or explicitly set to null.

3. **For Foreign Key Issues**: Ensure OAuth client records are created before being referenced in the `organization-v2` model's `oauthClientIds` array.

### Git Commit Information

- **ember-logs directory**: Using miragejs version from commit `7a80538`
- **ember-test-logs-20252913131 directory**: Using miragejs version from commit `03a37729a84db27f2473c55c028187a6861efa4e`

The differences in commit hashes suggest these tests were run at different points in development, which may explain why some errors appear in one set of logs but not the other.
