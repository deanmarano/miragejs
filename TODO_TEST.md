# Test TODO for Async Migration Codemod

This document tracks test cases that should be added for each feature/fix commit in the async migration codemod.

## Test Coverage Status

### ✅ Already Tested
- Basic route handler transformation (schema.collection.method())
- DB method calls (schema.db.collection.method())
- createServer() vs new Server() syntax
- Non-async handlers (no transformation needed)
- Duplicate async: true prevention

---

## 🔴 Missing Tests by Commit

### Commit b870cd7: Support this.server patterns in test hooks
**Feature**: Transform test hooks (beforeEach/afterEach) that use `this.server`

**Test Cases Needed**:
1. **Test hook with this.server.create()**
   ```javascript
   // Input
   hooks.beforeEach(function () {
     this.user = this.server.create('user');
   });
   
   // Expected
   hooks.beforeEach(async function() {
     this.user = await this.server.create('user');
   });
   ```

2. **Test hook with this.server.schema.collection.method()**
   ```javascript
   // Input
   hooks.beforeEach(function () {
     this.server.schema.sessions.first().destroy();
   });
   
   // Expected
   hooks.beforeEach(async function() {
     await this.server.schema.sessions.first().destroy();
   });
   ```

3. **Test hook with this.server.createList()**
   ```javascript
   // Input
   hooks.beforeEach(function () {
     this.users = this.server.createList('user', 3);
   });
   
   // Expected
   hooks.beforeEach(async function() {
     this.users = await this.server.createList('user', 3);
   });
   ```

4. **Module callback should be made async but not QUnit module()**
   ```javascript
   // Input
   module('Acceptance | test', function(hooks) {
     hooks.beforeEach(function() {
       this.user = this.server.create('user');
     });
   });
   
   // Expected (module stays sync, beforeEach becomes async)
   module('Acceptance | test', async function(hooks) {
     hooks.beforeEach(async function() {
       this.user = await this.server.create('user');
     });
   });
   ```

5. **Function with no params but using this.server should still transform**
   ```javascript
   // Input (no params in function signature)
   function setupData() {
     this.server.create('user');
   }
   
   // Expected
   async function setupData() {
     await this.server.create('user');
   }
   ```

---

### Commit d9537c9 / 5a9843d: .models access patterns
**Feature**: Await .models when it's accessed further (.models.get(), .models[])

**Test Cases Needed**:
1. **Association .models with .get()**
   ```javascript
   // Input
   afterCreate(run, server) {
     const { createdAt } = run.runEvents.models.get('lastObject');
   }
   
   // Expected
   async afterCreate(run, server) {
     const { createdAt } = (await (await run.runEvents).models).get('lastObject');
   }
   ```

2. **Association .models with array index**
   ```javascript
   // Input
   afterCreate(project, server) {
     const first = project.runs.models[0];
   }
   
   // Expected
   async afterCreate(project, server) {
     const first = (await (await project.runs).models)[0];
   }
   ```

3. **Association .models with .firstObject**
   ```javascript
   // Input
   afterCreate(project, server) {
     const first = project.runs.models.firstObject;
   }
   
   // Expected
   async afterCreate(project, server) {
     const first = (await (await project.runs).models).firstObject;
   }
   ```

4. **Association .models with .forEach()**
   ```javascript
   // Input
   afterCreate(project, server) {
     project.runs.models.forEach(run => {
       console.log(run.id);
     });
   }
   
   // Expected
   async afterCreate(project, server) {
     (await (await project.runs).models).forEach(run => {
       console.log(run.id);
     });
   }
   ```

---

### Commit 3e016e3: Prevent double await on .models after awaited CallExpression
**Feature**: Skip .models transformation when association is already awaited

**Test Cases Needed**:
1. **Awaited where() with .models**
   ```javascript
   // Input
   const projects = server.schema.projects.where({ active: true }).models;
   
   // Expected (only where() awaited, not .models again)
   const projects = (await server.schema.projects.where({ active: true })).models;
   ```

2. **Chained method with .models.forEach()**
   ```javascript
   // Input
   server.schema.projects.where({ active: true }).models.forEach(p => {
     console.log(p.name);
   });
   
   // Expected
   (await server.schema.projects.where({ active: true })).models.forEach(p => {
     console.log(p.name);
   });
   ```

---

### Commit 395663e / a6f4d32 / d49b181: Optional chaining with .models
**Feature**: Skip transformation when optional chaining (?.) is present

**Test Cases Needed**:
1. **Optional chaining with .models**
   ```javascript
   // Input (should NOT be transformed)
   const projects = workspace.organization?.projects?.models;
   
   // Expected (unchanged)
   const projects = workspace.organization?.projects?.models;
   ```

2. **Optional chaining in middle of chain**
   ```javascript
   // Input (should NOT be transformed)
   const name = user?.organization?.name;
   
   // Expected (unchanged)
   const name = user?.organization?.name;
   ```

3. **Regular access should still transform**
   ```javascript
   // Input (no optional chaining)
   const projects = workspace.organization.projects.models;
   
   // Expected (transforms because no ?.)
   const projects = (await (await workspace.organization.projects).models);
   ```

---

### Commit 9f01518: Skip .models on CallExpression
**Feature**: Don't double-await when .models is on a CallExpression

**Test Cases Needed**:
1. **CallExpression with .models (where, findBy, etc.)**
   ```javascript
   // Input
   const users = schema.users.where({ active: true }).models;
   
   // Expected (where() gets await, not .models)
   const users = (await schema.users.where({ active: true })).models;
   ```

2. **.models on find() result**
   ```javascript
   // Input
   const items = schema.items.find([1, 2, 3]).models;
   
   // Expected
   const items = (await schema.items.find([1, 2, 3])).models;
   ```

---

### Commit c429e70: Basic .models access support
**Feature**: Transform association.models to (await association).models

**Test Cases Needed**:
1. **Simple .models access**
   ```javascript
   // Input
   const items = association.models;
   
   // Expected
   const items = (await association).models;
   ```

2. **.models in property assignment**
   ```javascript
   // Input
   afterCreate(project, server) {
     this.runs = project.runs.models;
   }
   
   // Expected
   async afterCreate(project, server) {
     this.runs = (await project.runs).models;
   }
   ```

---

### Commit 3957d51: Function parameter calls (route handler wrappers)
**Feature**: Add await to function parameter calls that look like route handlers

**Test Cases Needed**:
1. **Wrapper function calling route handler parameter**
   ```javascript
   // Input
   function paginate(handler) {
     return (schema, request) => {
       const result = handler(schema, request);
       return { data: result };
     };
   }
   
   // Expected
   function paginate(handler) {
     return async (schema, request) => {
       const result = await handler(schema, request);
       return { data: result };
     };
   }
   ```

2. **Nested wrapper functions**
   ```javascript
   // Input
   function validate(handler) {
     return (schema, request) => {
       if (!request.valid) return;
       return handler(schema, request);
     };
   }
   
   // Expected
   function validate(handler) {
     return async (schema, request) => {
       if (!request.valid) return;
       return await handler(schema, request);
     };
   }
   ```

---

### Commit 679d33d: Prevent double await
**Feature**: Walk AST tree to check for existing AwaitExpression

**Test Cases Needed**:
1. **Already awaited expression should not double-await**
   ```javascript
   // Input
   const user = await schema.users.create({ name: 'test' });
   
   // Expected (no change)
   const user = await schema.users.create({ name: 'test' });
   ```

2. **Parent statement has await but not direct parent**
   ```javascript
   // Input
   const obj = await {
     user: schema.users.create({ name: 'test' })
   };
   
   // Expected (create still needs await)
   const obj = await {
     user: await schema.users.create({ name: 'test' })
   };
   ```

---

### Commit b385e41: Exclude .models from async detection
**Feature**: .models is a plain array, not a Mirage collection

**Test Cases Needed**:
1. **Array methods on .models should not get await**
   ```javascript
   // Input
   const activeProjects = projects.models.find(p => p.active);
   
   // Expected (find is Array.find, not schema method)
   const activeProjects = (await projects).models.find(p => p.active);
   ```

2. **.models.filter() should not get await**
   ```javascript
   // Input
   const filtered = collection.models.filter(item => item.published);
   
   // Expected
   const filtered = (await collection).models.filter(item => item.published);
   ```

3. **.models.map() should not get await**
   ```javascript
   // Input
   const ids = collection.models.map(item => item.id);
   
   // Expected
   const ids = (await collection).models.map(item => item.id);
   ```

---

### Commit f286636: Exclude QUnit module() callbacks
**Feature**: QUnit module() callbacks cannot be async

**Test Cases Needed**:
1. **Module callback should not become async**
   ```javascript
   // Input
   module('My Module', function(hooks) {
     // ... hooks setup
   });
   
   // Expected (function stays sync)
   module('My Module', function(hooks) {
     // ... hooks setup
   });
   ```

2. **Nested module should not become async**
   ```javascript
   // Input
   module('Parent', function(hooks) {
     module('Child', function(childHooks) {
       childHooks.beforeEach(function() {
         this.server.create('user');
       });
     });
   });
   
   // Expected (modules stay sync, beforeEach becomes async)
   module('Parent', function(hooks) {
     module('Child', function(childHooks) {
       childHooks.beforeEach(async function() {
         await this.server.create('user');
       });
     });
   });
   ```

---

### Commit 7a4ebd4: Support 'schemas' parameter and generic patterns
**Feature**: Handle plural 'schemas' parameter name

**Test Cases Needed**:
1. **Route handler with 'schemas' parameter**
   ```javascript
   // Input
   this.get('/users', (schemas) => {
     return schemas.users.all();
   });
   
   // Expected
   this.get('/users', async (schemas) => {
     return await schemas.users.all();
   });
   ```

2. **Schemas parameter with db access**
   ```javascript
   // Input
   this.get('/users', (schemas) => {
     return schemas.db.users.find(1);
   });
   
   // Expected
   this.get('/users', async (schemas) => {
     return await schemas.db.users.find(1);
   });
   ```

---

### Commit 4a4b553: Comprehensive async codemod improvements
**Feature**: Multiple improvements including traits, model methods, chaining

**Test Cases Needed**:
1. **Factory trait with afterCreate**
   ```javascript
   // Input
   Factory.extend({
     withPosts: trait({
       afterCreate(user, server) {
         server.createList('post', 3, { user });
       }
     })
   });
   
   // Expected
   Factory.extend({
     withPosts: trait({
       async afterCreate(user, server) {
         await server.createList('post', 3, { user });
       }
     })
   });
   ```

2. **Model instance methods (save, update, destroy, reload)**
   ```javascript
   // Input
   afterCreate(user, server) {
     user.update({ verified: true });
     user.save();
   }
   
   // Expected
   async afterCreate(user, server) {
     await user.update({ verified: true });
     await user.save();
   }
   ```

3. **Chained member expressions**
   ```javascript
   // Input
   afterCreate(project, server) {
     project.latestRun.apply.update({ status: 'applied' });
   }
   
   // Expected
   async afterCreate(project, server) {
     await project.latestRun.apply.update({ status: 'applied' });
   }
   ```

4. **Scenario function with server parameter**
   ```javascript
   // Input
   scenarios: {
     default(server) {
       server.create('user');
       server.createList('post', 10);
     }
   }
   
   // Expected
   scenarios: {
     async default(server) {
       await server.create('user');
       await server.createList('post', 10);
     }
   }
   ```

5. **server.schema.collection.method()**
   ```javascript
   // Input
   function seed(server) {
     server.schema.users.create({ name: 'Admin' });
   }
   
   // Expected
   async function seed(server) {
     await server.schema.users.create({ name: 'Admin' });
   }
   ```

---

### Commit e13e7e6: this.server.db patterns
**Feature**: Support 4-level deep member expressions for db access

**Test Cases Needed**:
1. **this.server.db.collection.find()**
   ```javascript
   // Input
   hooks.beforeEach(function() {
     this.user = this.server.db.users.find(1);
   });
   
   // Expected
   hooks.beforeEach(async function() {
     this.user = await this.server.db.users.find(1);
   });
   ```

2. **this.server.db.collection.where()**
   ```javascript
   // Input
   hooks.beforeEach(function() {
     this.active = this.server.db.users.where({ active: true });
   });
   
   // Expected
   hooks.beforeEach(async function() {
     this.active = await this.server.db.users.where({ active: true });
   });
   ```

---

### Commit 6a3e3b4: Destructured collection parameters
**Feature**: Handle destructured parameters in route handlers

**Test Cases Needed**:
1. **Destructured collection parameter**
   ```javascript
   // Input
   function handler({ users }, request) {
     return users.find(request.params.id);
   }
   
   // Expected
   async function handler({ users }, request) {
     return await users.find(request.params.id);
   }
   ```

2. **Multiple destructured collections**
   ```javascript
   // Input
   function handler({ users, posts }, request) {
     const user = users.find(1);
     const userPosts = posts.where({ userId: 1 });
     return { user, posts: userPosts };
   }
   
   // Expected
   async function handler({ users, posts }, request) {
     const user = await users.find(1);
     const userPosts = await posts.where({ userId: 1 });
     return { user, posts: userPosts };
   }
   ```

3. **Wrapper function with destructured params**
   ```javascript
   // Input
   const paginate = (handler) => ({ users }, request) => {
     const result = handler({ users }, request);
     return { data: result };
   };
   
   // Expected
   const paginate = (handler) => async ({ users }, request) => {
     const result = await handler({ users }, request);
     return { data: result };
   };
   ```

---

### Commit 4c38ca6: Only await calls at current function level
**Feature**: Don't add await to calls in nested functions

**Test Cases Needed**:
1. **Nested function should be transformed separately**
   ```javascript
   // Input
   afterCreate(project, server) {
     const helper = () => {
       server.create('user');
     };
     helper();
   }
   
   // Expected (both functions made async)
   async afterCreate(project, server) {
     const helper = async () => {
       await server.create('user');
     };
     await helper();
   }
   ```

2. **Callback in forEach should not get parent's await**
   ```javascript
   // Input
   afterCreate(project, server) {
     [1, 2, 3].forEach(id => {
       server.create('user', { id });
     });
   }
   
   // Expected (callback made async independently)
   async afterCreate(project, server) {
     [1, 2, 3].forEach(async id => {
       await server.create('user', { id });
     });
   }
   ```

---

### Commit a85cf98: Handle FunctionExpressions and ArrowFunctionExpressions globally
**Feature**: Transform all function types consistently

**Test Cases Needed**:
1. **Arrow function route handler**
   ```javascript
   // Input
   this.get('/users', (schema) => schema.users.all());
   
   // Expected
   this.get('/users', async (schema) => await schema.users.all());
   ```

2. **Function expression in variable**
   ```javascript
   // Input
   const getUserHandler = function(schema) {
     return schema.users.all();
   };
   
   // Expected
   const getUserHandler = async function(schema) {
     return await schema.users.all();
   };
   ```

3. **Arrow function in const**
   ```javascript
   // Input
   const createUser = (schema, attrs) => schema.users.create(attrs);
   
   // Expected
   const createUser = async (schema, attrs) => await schema.users.create(attrs);
   ```

---

### Commit 4c9d1c8: Exported and regular function declarations
**Feature**: Transform both exported and standalone functions

**Test Cases Needed**:
1. **Exported function declaration**
   ```javascript
   // Input
   export function seedDatabase(server) {
     server.create('user', { name: 'Admin' });
   }
   
   // Expected
   export async function seedDatabase(server) {
     await server.create('user', { name: 'Admin' });
   }
   ```

2. **Regular function declaration**
   ```javascript
   // Input
   function afterCreate(model, server) {
     server.create('audit-log', { modelId: model.id });
   }
   
   // Expected
   async function afterCreate(model, server) {
     await server.create('audit-log', { modelId: model.id });
   }
   ```

---

## Test Organization Suggestions

### Priority 1 (Critical - User-facing features)
- this.server patterns in test hooks (commit b870cd7)
- .models access patterns (commits d9537c9, 5a9843d)
- Optional chaining support (commits 395663e, a6f4d32, d49b181)

### Priority 2 (Common patterns)
- Destructured parameters (commit 6a3e3b4)
- Model instance methods (commit 4a4b553)
- Factory traits (commit 4a4b553)
- 'schemas' parameter support (commit 7a4ebd4)

### Priority 3 (Edge cases)
- Prevent double await (commits 3e016e3, 679d33d)
- QUnit module() exclusion (commit f286636)
- Wrapper functions (commit 3957d51)
- Nested functions (commit 4c38ca6)

### Priority 4 (Advanced patterns)
- Chained member expressions (commit 4a4b553)
- this.server.db patterns (commit e13e7e6)
- All function types (commits a85cf98, 4c9d1c8)

---

## Running Tests

To add these tests, append them to `codemods/__tests__/async-migration.test.js`:

```javascript
test('test name', 'input code', 'expected code');
```

Run with:
```bash
node codemods/__tests__/async-migration.test.js
```

---

## Notes for Test Implementation

1. **Test isolation**: Each test should be independent and test one specific transformation
2. **Edge cases**: Include tests for boundary conditions (empty params, no body, etc.)
3. **Negative tests**: Verify that code that shouldn't transform stays unchanged
4. **Real-world patterns**: Use actual patterns from the atlas codebase when possible
5. **Combination tests**: Test combinations of features (e.g., destructured params + .models access)

## Coverage Metrics

- Total commits with features: 20+
- Existing tests: 7
- Missing test cases: ~50+
- Current test coverage: ~15%
- Target test coverage: 90%+

---

## 🔴 New Issues Discovered

### Issue: Wrapper functions without mirage parameters

**Problem**: Wrapper functions like `validateIncludeParam(route, allowedIncludes)` don't have `schema`, `db`, or `server` parameters, so the codemod doesn't detect them as needing async transformation. However, they call `route()` which IS async and needs to be awaited.

**Example from atlas**:
```javascript
// Input - NOT transformed by codemod
export default function validateIncludeParamWrapper(route, allowedIncludes) {
  return function validateIncludeParam(schema, request) {
    // ... validation logic ...
    return route.call(this, schema, request); // route is async but not awaited!
  };
}

// Should be:
export default function validateIncludeParamWrapper(route, allowedIncludes) {
  return async function validateIncludeParam(schema, request) {
    // ... validation logic ...
    return await route.call(this, schema, request);
  };
}
```

**Root cause**: The inner function DOES have `schema` parameter (line 2), so it should be detected. But it seems the codemod isn't checking calls to function parameters with `.call()` or `.apply()`.

**Test cases needed**:
1. **Wrapper with .call()**
   ```javascript
   // Input
   function wrapper(handler) {
     return function(schema, request) {
       return handler.call(this, schema, request);
     };
   }
   
   // Expected
   function wrapper(handler) {
     return async function(schema, request) {
       return await handler.call(this, schema, request);
     };
   }
   ```

2. **Wrapper with .apply()**
   ```javascript
   // Input
   function wrapper(handler) {
     return function(schema, request) {
       return handler.apply(this, arguments);
     };
   }
   
   // Expected
   function wrapper(handler) {
     return async function(schema, request) {
       return await handler.apply(this, arguments);
     };
   }
   ```

3. **Direct parameter call (already supported?)**
   ```javascript
   // Input
   function wrapper(handler) {
     return function(schema, request) {
       return handler(schema, request);
     };
   }
   
   // Expected - should already work from commit 3957d51
   function wrapper(handler) {
     return async function(schema, request) {
       return await handler(schema, request);
     };
   }
   ```

---

### Issue: Collection.filter() returns array, not Collection

**Problem**: When you call JavaScript's `.filter()` method on a Mirage Collection, it returns a plain JavaScript array, not a Collection. Code that then accesses `.models` on the result gets undefined.

**Example from atlas**:
```javascript
let memberships = await organizationMembershipV2s.where({ userId: currentUser.id });
if (queryParams['filter[memberships]']) {
  memberships = memberships.filter(
    membership => membership.status === queryParams['filter[memberships]']
  );
}
// memberships is now an array, not a Collection
let ids = memberships.models.map(m => m.id); // ERROR: undefined.map
```

**Note**: This is not really a codemod issue - it's a code bug. After calling `.filter()`, the code should not try to access `.models` since it's already an array.

**Possible codemod enhancement**: Detect `.filter()` calls on Collections and warn that subsequent `.models` access is wrong? Or automatically remove `.models` after `.filter()`? This seems complex and error-prone.

**Decision**: Document this as a known pattern to watch for manually. Add to codemod README as a "Common Pitfalls" section.

