# Async Mode Migration Guide

MirageJS now supports an **async mode** that allows all database operations to return Promises. This is a stepping stone toward supporting persistent browser storage (IndexedDB, WASM SQLite, etc.) in the future.

## Why Async Mode?

- **Future-proof**: Prepares your codebase for storage adapters that require async operations
- **Consistent API**: All database operations have the same Promise-based interface
- **Better testing**: Easier to test async scenarios and race conditions
- **Browser storage ready**: When storage adapters are released, you'll be ready to use them

## Migration Strategy

We recommend a **three-phase approach**:

### Phase 1: Enable Async Mode (Now)
- Add `async: true` to your server config
- Use the codemod to update route handlers
- Test thoroughly

### Phase 2: Deprecation Period (6-12 months)
- Sync mode continues to work
- Warnings for users still on sync mode
- Community support for migration issues

### Phase 3: Async Only (Future)
- Remove sync mode code
- Reduce bundle size
- Enable storage adapters

## Quick Start

### 1. Install the codemod tool

```bash
npm install -g jscodeshift
```

### 2. Run the codemod

```bash
npx jscodeshift -t node_modules/miragejs/codemods/async-migration.cjs src/
```

### 3. Review and test

```bash
git diff
npm test
```

### 4. Update your server config

If the codemod didn't catch it, manually add:

```javascript
createServer({
  async: true,  // Add this line
  // ... rest of config
})
```

## What Changes

### Before (Sync Mode - Current Default)

```javascript
import { createServer, Model } from 'miragejs';

export function makeServer() {
  return createServer({
    models: {
      user: Model,
      post: Model,
    },

    seeds(server) {
      server.create('user', { name: 'Alice' });
      server.create('user', { name: 'Bob' });
    },

    routes() {
      this.namespace = 'api';

      // GET /api/users
      this.get('/users', (schema) => {
        return schema.users.all();
      });

      // GET /api/users/:id
      this.get('/users/:id', (schema, request) => {
        const id = request.params.id;
        return schema.users.find(id);
      });

      // POST /api/users
      this.post('/users', (schema, request) => {
        const attrs = JSON.parse(request.requestBody);
        return schema.users.create(attrs);
      });

      // PUT /api/users/:id
      this.put('/users/:id', (schema, request) => {
        const id = request.params.id;
        const attrs = JSON.parse(request.requestBody);
        const user = schema.users.find(id);
        return user.update(attrs);
      });

      // DELETE /api/users/:id
      this.delete('/users/:id', (schema, request) => {
        const id = request.params.id;
        const user = schema.users.find(id);
        user.destroy();
      });

      // Complex query example
      this.get('/users/active', (schema) => {
        const activeUsers = schema.users.where({ isActive: true });
        const count = activeUsers.length;
        return { users: activeUsers, count };
      });
    },
  });
}
```

### After (Async Mode)

```javascript
import { createServer, Model } from 'miragejs';

export function makeServer() {
  return createServer({
    async: true,  // Enable async mode
    models: {
      user: Model,
      post: Model,
    },

    seeds(server) {
      server.create('user', { name: 'Alice' });
      server.create('user', { name: 'Bob' });
    },

    routes() {
      this.namespace = 'api';

      // GET /api/users
      this.get('/users', async (schema) => {
        return await schema.users.all();
      });

      // GET /api/users/:id
      this.get('/users/:id', async (schema, request) => {
        const id = request.params.id;
        return await schema.users.find(id);
      });

      // POST /api/users
      this.post('/users', async (schema, request) => {
        const attrs = JSON.parse(request.requestBody);
        return await schema.users.create(attrs);
      });

      // PUT /api/users/:id
      this.put('/users/:id', async (schema, request) => {
        const id = request.params.id;
        const attrs = JSON.parse(request.requestBody);
        const user = await schema.users.find(id);
        return user.update(attrs);
      });

      // DELETE /api/users/:id
      this.delete('/users/:id', async (schema, request) => {
        const id = request.params.id;
        const user = await schema.users.find(id);
        user.destroy();
      });

      // Complex query example
      this.get('/users/active', async (schema) => {
        const activeUsers = await schema.users.where({ isActive: true });
        const count = activeUsers.models.length;
        return { users: activeUsers, count };
      });
    },
  });
}
```

## What Needs Await

In async mode, these methods return Promises and need `await`:

### Schema Methods
- `schema.modelName.create(attrs)`
- `schema.modelName.all()`
- `schema.modelName.find(id)`
- `schema.modelName.findBy(query)`
- `schema.modelName.findOrCreateBy(query, attrs)`
- `schema.modelName.where(query)`
- `schema.modelName.first()`

### Database Methods
- `db.collectionName.insert(data)`
- `db.collectionName.find(ids)`
- `db.collectionName.findBy(query)`
- `db.collectionName.where(query)`
- `db.collectionName.update(target, attrs)`
- `db.collectionName.remove(target)`
- `db.collectionName.firstOrCreate(query, attrs)`
- `db.collectionName.all()`

### What Doesn't Need Await

- Model instance methods: `model.save()`, `model.update()`, `model.destroy()`, `model.reload()`
- Collection/Array operations on results
- Server helpers: `server.create()`, `server.createList()` (in seeds/tests)
- Non-database operations

## Common Patterns

### Pattern 1: Chaining Operations

**Before:**
```javascript
this.get('/users/:id/posts', (schema, request) => {
  const user = schema.users.find(request.params.id);
  return user.posts;
});
```

**After:**
```javascript
this.get('/users/:id/posts', async (schema, request) => {
  const user = await schema.users.find(request.params.id);
  return user.posts;  // No await - posts are already loaded
});
```

### Pattern 2: Multiple Queries

**Before:**
```javascript
this.get('/dashboard', (schema) => {
  const users = schema.users.all();
  const posts = schema.posts.where({ published: true });
  return { users, posts };
});
```

**After:**
```javascript
this.get('/dashboard', async (schema) => {
  const users = await schema.users.all();
  const posts = await schema.posts.where({ published: true });
  return { users, posts };
});
```

Or use `Promise.all` for parallel execution:
```javascript
this.get('/dashboard', async (schema) => {
  const [users, posts] = await Promise.all([
    schema.users.all(),
    schema.posts.where({ published: true })
  ]);
  return { users, posts };
});
```

### Pattern 3: Conditional Logic

**Before:**
```javascript
this.get('/users/:id', (schema, request) => {
  const user = schema.users.findBy({ id: request.params.id });
  if (!user) {
    return new Response(404, {}, { error: 'Not found' });
  }
  return user;
});
```

**After:**
```javascript
this.get('/users/:id', async (schema, request) => {
  const user = await schema.users.findBy({ id: request.params.id });
  if (!user) {
    return new Response(404, {}, { error: 'Not found' });
  }
  return user;
});
```

### Pattern 4: Factory Hooks

**Before:**
```javascript
Factory.extend({
  afterCreate(user, server) {
    server.create('profile', { user });
  }
});
```

**After:**
```javascript
Factory.extend({
  async afterCreate(user, server) {
    await server.create('profile', { user });
  }
});
```

## Testing

### Update Your Tests

**Before:**
```javascript
test('creates a user', function() {
  server.create('user', { name: 'Alice' });
  
  const users = server.schema.users.all();
  expect(users.length).toBe(1);
});
```

**After:**
```javascript
test('creates a user', async function() {
  await server.create('user', { name: 'Alice' });
  
  const users = await server.schema.users.all();
  expect(users.models.length).toBe(1);
});
```

### Seeds Don't Need Updates

Seeds run during server initialization, so they can remain synchronous:

```javascript
createServer({
  async: true,
  seeds(server) {
    // These don't need await - they run before async mode is active
    server.create('user', { name: 'Alice' });
    server.create('user', { name: 'Bob' });
  }
});
```

## Troubleshooting

### Error: "Cannot read property 'length' of undefined"

**Problem:** You're trying to access `.length` on a Promise.

**Solution:** Add `await` before the database call:

```javascript
// ❌ Wrong
const users = schema.users.all();
console.log(users.length); // undefined - users is a Promise

// ✅ Correct
const users = await schema.users.all();
console.log(users.models.length); // works
```

### Error: "schema.users.all() is not a function"

**Problem:** You're trying to call methods on a Promise.

**Solution:** Add `await`:

```javascript
// ❌ Wrong
const collection = schema.users.all();
const filtered = collection.filter(/* ... */); // Error

// ✅ Correct
const collection = await schema.users.all();
const filtered = collection.models.filter(/* ... */); // works
```

### Warning: Unhandled Promise Rejection

**Problem:** You forgot `await` and a database operation failed.

**Solution:** Make sure all async operations are awaited or have `.catch()` handlers:

```javascript
// ❌ Wrong - promise not handled
this.get('/users', async (schema) => {
  schema.users.all(); // Returns promise but not awaited
});

// ✅ Correct
this.get('/users', async (schema) => {
  return await schema.users.all();
});
```

### Tests Failing After Migration

**Checklist:**
1. Did you add `async: true` to test server config?
2. Are all test functions marked `async`?
3. Did you `await` all schema/db calls in tests?
4. Did you update `.length` to `.models.length` for collections?

## Performance Considerations

### Async Overhead

In memory mode (current default), async operations use microtasks which have minimal overhead (~0.1-1ms per operation). This is negligible for most applications.

### Parallel Queries

Take advantage of `Promise.all()` for independent queries:

```javascript
// Sequential (slower)
const users = await schema.users.all();
const posts = await schema.posts.all();

// Parallel (faster)
const [users, posts] = await Promise.all([
  schema.users.all(),
  schema.posts.all()
]);
```

## Getting Help

- **GitHub Issues**: [github.com/miragejs/miragejs/issues](https://github.com/miragejs/miragejs/issues)
- **Documentation**: [miragejs.com/docs](https://miragejs.com/docs)
- **Codemod Issues**: Run with `--dry --print` to see what would change

## Future: Storage Adapters

Once you've migrated to async mode, you'll be ready to use storage adapters when they're released:

```javascript
createServer({
  async: true,
  storage: {
    type: 'indexeddb',  // Coming soon!
    dbName: 'my-app-db',
    version: 1
  },
  // ... rest of config
});
```

This will enable:
- **Persistent data** across page reloads
- **Larger datasets** (50MB+ instead of memory limits)
- **Better performance** for complex queries
- **Offline support** for your mock server
