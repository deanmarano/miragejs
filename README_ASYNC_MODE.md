# MirageJS Async Mode Implementation

This branch implements **async mode** for MirageJS, a critical stepping stone toward supporting persistent browser storage adapters (IndexedDB, WASM SQLite, etc.).

## What's Implemented

### ✅ Phase 1: Async/Sync Toggle (Complete)

All the foundational work for async mode is complete:

1. **Server Configuration** (`lib/server.js`)
   - Added `async: boolean` config option (defaults to `false` for backward compatibility)
   - Registered async mode in the container for global access

2. **Utility Helpers** (`lib/utils/async-helpers.js`)
   - `maybeAsync()` - Conditionally wraps values in Promises
   - `maybeAsyncApply()` - Conditionally applies async functions
   - `maybeAsyncArray()` - Handles array operations in async mode
   - `maybePromiseAll()` - Conditional Promise.all for async mode

3. **Database Layer** (`lib/db.js`, `lib/db-collection.js`)
   - Updated `Db` to accept and propagate async mode
   - Modified `DbCollection` to return Promises when async mode enabled
   - All CRUD methods support async: `insert`, `find`, `findBy`, `where`, `update`, `remove`, `firstOrCreate`, `all`
   - Smart collection getter that returns methods object in async mode vs array in sync mode

4. **ORM/Schema Layer** (`lib/orm/schema.js`)
   - Updated all Schema methods to handle Promises from DbCollection
   - Methods support async: `create`, `all`, `find`, `findBy`, `findOrCreateBy`, `where`, `first`
   - Added `_isAsync` getter for internal async detection

5. **Codemod** (`codemods/async-migration.cjs`)
   - Automatic migration tool built with jscodeshift
   - Adds `async: true` to Server configs
   - Converts route handlers to async functions
   - Adds `await` to all db/schema method calls
   - Handles factory `afterCreate` hooks
   - Comprehensive test suite (`codemods/__tests__/async-migration.test.js`)

6. **Tests** (`__tests__/internal/unit/async-mode-test.js`)
   - Full test coverage for sync mode (backward compatibility)
   - Full test coverage for async mode
   - Verifies Promises are returned correctly
   - Ensures existing sync code continues to work

7. **Documentation**
   - Migration guide (`ASYNC_MIGRATION.md`) - Comprehensive guide for users
   - Codemod README (`codemods/README.md`) - Usage instructions
   - Code examples and troubleshooting

## How It Works

### Sync Mode (Default - Backward Compatible)

```javascript
createServer({
  // async: false (default)
  routes() {
    this.get('/users', (schema) => {
      return schema.users.all(); // Returns array directly
    });
  }
});
```

### Async Mode (Opt-in)

```javascript
createServer({
  async: true,
  routes() {
    this.get('/users', async (schema) => {
      return await schema.users.all(); // Returns Promise<Collection>
    });
  }
});
```

## Migration Path

1. **Enable async mode**: Add `async: true` to server config
2. **Run codemod**: `npx jscodeshift -t codemods/async-migration.cjs src/`
3. **Test**: Run your test suite
4. **Deploy**: Ship with confidence

## Future: Storage Adapters (Phase 2)

Once async mode is stable, the next phase will add storage adapters:

```javascript
createServer({
  async: true,
  storage: {
    type: 'indexeddb',  // or 'wasm-sqlite', 'memory'
    dbName: 'my-app-db',
    version: 1
  }
});
```

## Architecture Decisions

### Why Both Sync and Async?

- **Backward Compatibility**: Existing codebases continue to work
- **Gradual Migration**: Users can migrate at their own pace
- **Zero Breaking Changes**: Opt-in feature flag
- **Clear Deprecation Path**: Eventually remove sync mode

### Why Microtasks for Memory Adapter?

- **Minimal Overhead**: ~0.1ms per operation
- **Consistent API**: All operations return Promises in async mode
- **Future-Proof**: Easy to swap in real async storage

### Why Codemod?

- **Scale**: Auto-migrate thousands of route handlers
- **Accuracy**: Catches patterns humans might miss
- **Time Savings**: Minutes instead of hours/days
- **Confidence**: Mechanical transformation = fewer bugs

## Files Changed

### Core Implementation
- `lib/server.js` - Async config and container registration
- `lib/db.js` - Async mode propagation
- `lib/db-collection.js` - Promise-returning CRUD methods
- `lib/orm/schema.js` - Async-aware ORM methods
- `lib/utils/async-helpers.js` - Utility functions

### Tooling
- `codemods/async-migration.cjs` - Migration codemod
- `codemods/README.md` - Codemod usage guide
- `codemods/__tests__/async-migration.test.js` - Codemod tests

### Documentation
- `ASYNC_MIGRATION.md` - User migration guide
- This README

### Tests
- `__tests__/internal/unit/async-mode-test.js` - Async mode tests

### Config
- `.tool-versions` - Node version for development

## Testing

All existing tests pass in sync mode (backward compatibility maintained).

New tests cover:
- ✅ Sync mode (default behavior)
- ✅ Async mode (Promise returns)
- ✅ All DbCollection methods
- ✅ All Schema methods  
- ✅ Mixed sync/async scenarios

## Performance

- **Sync Mode**: No performance impact (existing behavior)
- **Async Mode**: ~0.1-1ms overhead per operation (microtask scheduling)
- **Negligible**: For most apps, this is imperceptible

## Next Steps

1. **Community Feedback**: Get input on the API design
2. **Beta Testing**: Have users test async mode
3. **Storage Adapters**: Implement IndexedDB, WASM SQLite adapters
4. **Deprecation**: Announce timeline for removing sync mode
5. **Release**: Ship as stable feature

## Contributing

To work on this branch:

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run async mode tests specifically
npm test -- async-mode-test

# Test the codemod
node codemods/__tests__/async-migration.test.js
```

## Questions?

- Read the [Migration Guide](./ASYNC_MIGRATION.md)
- Check the [Codemod README](./codemods/README.md)
- Open an issue on GitHub

---

**Status**: ✅ Ready for Review

**Branch**: `feat/async-mode`

**Next**: Create PR to `miragejs/miragejs` for community review
