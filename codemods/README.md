# MirageJS Async Migration Codemod

This codemod automatically migrates your MirageJS code to use the new async mode.

## What it does

1. Adds `async: true` to your Server configuration
2. Converts route handlers to async functions
3. Adds `await` to all database and schema method calls that return Promises in async mode

## Installation

First, install jscodeshift if you haven't already:

```bash
npm install -g jscodeshift
# or
yarn global add jscodeshift
```

## Usage

### Run the codemod

```bash
npx jscodeshift -t node_modules/miragejs/codemods/async-migration.js path/to/your/code
```

### Dry run (preview changes without modifying files)

```bash
npx jscodeshift -t node_modules/miragejs/codemods/async-migration.js --dry --print path/to/your/code
```

### Run on specific files

```bash
npx jscodeshift -t node_modules/miragejs/codemods/async-migration.js src/server.js
```

### Run on a directory

```bash
npx jscodeshift -t node_modules/miragejs/codemods/async-migration.js src/
```

### For Ember projects with separate route handler files

If your route handlers are imported from separate files (e.g., `app/mirage/routes/`), run the codemod on your entire mirage directory:

```bash
npx jscodeshift -t node_modules/miragejs/codemods/async-migration.js app/mirage/
```

This will process both your config file and all imported handler files.

## Patterns Handled

The codemod automatically detects and transforms the following patterns:

### Route Handlers
- Inline handlers: `this.get('/path', (schema) => { })`
- Function expressions: `this.post('/path', function(schema) { })`
- Exported functions: `export function index(schema) { }`
- Destructured parameters: `this.get('/path', ({ users }) => { })`

### Factory afterCreate Hooks
- Main factory hooks: `afterCreate(model, server) { }`
- Trait hooks: `trait({ afterCreate(model) { } })`

### Scenario Functions
- Default scenarios: `export default function(server) { }`
- Named scenarios: `export function myScenario(server) { }`

### Async Method Calls
- **Schema methods**: `create`, `all`, `find`, `findBy`, `findOrCreateBy`, `where`, `first`, `new`
  - `schema.users.create({ })`
  - `schema.users.find(id)`
  - `schemas.posts.all()` (supports plural 'schemas')
- **DB methods**: `insert`, `find`, `findBy`, `where`, `update`, `remove`, `firstOrCreate`, `all`
  - `db.users.insert({ })`
  - `db.users.where({ active: true })`
- **Model methods**: `save`, `update`, `destroy`, `reload`
  - `user.save()`
  - `post.update({ title: 'New' })`
  - `run.apply.update({ })` (chained relationships)
- **Server methods**: `create`, `createList`
  - `server.create('user')`
  - `server.createList('post', 5)`
- **Server schema methods**: `server.schema.users.create({ })`
- **Route handler function parameters**: Calls to function parameters with `(schema, request)` signature
  - `route(schema, request)` in wrapper functions like `paginate()`

## Example Transformations

### Before

```javascript
import { createServer, Model } from 'miragejs';

export function makeServer() {
  return createServer({
    models: {
      user: Model,
    },

    seeds(server) {
      server.create('user', { name: 'Alice' });
      server.create('user', { name: 'Bob' });
    },

    routes() {
      this.get('/users', (schema) => {
        return schema.users.all();
      });

      this.get('/users/:id', (schema, request) => {
        const id = request.params.id;
        return schema.users.find(id);
      });

      this.post('/users', (schema, request) => {
        const attrs = JSON.parse(request.requestBody);
        return schema.users.create(attrs);
      });

      this.delete('/users/:id', (schema, request) => {
        const id = request.params.id;
        const user = schema.users.find(id);
        user.destroy();
      });
    },
  });
}
```

### After

```javascript
import { createServer, Model } from 'miragejs';

export function makeServer() {
  return createServer({
    async: true,
    models: {
      user: Model,
    },

    seeds(server) {
      server.create('user', { name: 'Alice' });
      server.create('user', { name: 'Bob' });
    },

    routes() {
      this.get('/users', async (schema) => {
        return await schema.users.all();
      });

      this.get('/users/:id', async (schema, request) => {
        const id = request.params.id;
        return await schema.users.find(id);
      });

      this.post('/users', async (schema, request) => {
        const attrs = JSON.parse(request.requestBody);
        return await schema.users.create(attrs);
      });

      this.delete('/users/:id', async (schema, request) => {
        const id = request.params.id;
        const user = await schema.users.find(id);
        user.destroy();
      });
    },
  });
}
```

### Wrapper Functions

Route handler wrapper functions that call other route handlers are also transformed:

```javascript
// Before
export default function paginate(route) {
  return function(schema, request) {
    let records = route(schema, request);
    // ... pagination logic
  }
}

// After
export default function paginate(route) {
  return async function(schema, request) {
    let records = await route(schema, request);
    // ... pagination logic
  }
}
```

## What to review after running

After running the codemod, you should:

1. **Test your application** - Run your test suite to ensure everything works
2. **Review edge cases** - The codemod may not catch every case, especially:
   - Dynamic method calls
   - Destructured schema/db objects
   - Conditional async logic
3. **Check for duplicate awaits** - In rare cases, the codemod might add await to already-awaited calls
4. **Update any custom code** - If you have utility functions that call schema/db methods, you may need to make them async manually

## Troubleshooting

### Codemod doesn't detect my route handlers

Make sure your route handlers follow standard patterns:
- `this.get('/path', (schema) => { ... })`
- `this.post('/path', function(schema) { ... })`

### Not all awaits are added

The codemod uses static analysis and may miss:
- Calls stored in variables before being invoked
- Dynamically constructed method calls
- Calls within complex control flow

In these cases, you'll need to add `await` manually.

## Advanced Usage

### Custom extensions

You can modify the codemod to fit your specific needs. The file is located at:
`node_modules/miragejs/codemods/async-migration.js`

### Options

jscodeshift supports various options:

```bash
# Run in dry mode (no changes)
--dry

# Print output
--print

# Run in silent mode
--silent

# Specify parser (babel, babylon, flow, ts, tsx)
--parser=babel

# Run with multiple CPU cores
--cpus=4
```

## Migration Strategy

We recommend a phased approach:

1. **Run the codemod** on your codebase
2. **Review the changes** using git diff
3. **Test thoroughly** in a development environment
4. **Deploy to staging** and verify
5. **Deploy to production** once confident

## Need Help?

If you encounter issues:
- Check the [GitHub Issues](https://github.com/miragejs/miragejs/issues)
- Review the [Migration Guide](../docs/async-migration.md)
- Ask in the [Discord Community](https://discord.gg/miragejs)
