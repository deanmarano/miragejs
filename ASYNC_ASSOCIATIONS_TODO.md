# Async Mode: Association Saving Issues

## Problem

The `_saveAssociations` methods in `lib/orm/model.js` are synchronous but access relationships and call database operations that return Promises in async mode. This causes several issues:

### Issue 1: Relationship getters return Promises

In `_associateWithNewInverses()` at line 1063:
```javascript
let modelOrCollection = this[association.name];
```

In async mode, `this[association.name]` calls the belongsTo getter (defined in `lib/orm/associations/belongs-to.js` lines 173-183), which calls:
```javascript
model = association.schema[...].find(foreignKeyId);
```

In async mode, `find()` returns a Promise, so `modelOrCollection` is a Promise. The subsequent checks:
```javascript
if (modelOrCollection instanceof Model) { ... }
```
fail, and the Promise is not handled.

### Issue 2: Direct database access without await

In `_associateModelWithInverse()` at line 1102:
```javascript
let currentIdsForInverse = inverseCollection.find(model.id)[inverse.getForeignKey()] || [];
```

This calls `find(model.id)` (which returns a Promise in async mode) and immediately tries to access a property on it. This will access a property on the Promise, not the record.

## Stack Trace Example

```
TypeError: Cannot read properties of undefined (reading 'toString')
    at DbCollection._findRecord (lib/db-collection.js:1260:13)
    at DbCollection.find (lib/db-collection.js:1040:25)
    at Schema.find (lib/orm/schema.js:5613:30)
    at Child.get (lib/orm/associations/belongs-to.js:825:100) // belongsTo getter
    at Child._associateWithNewInverses (lib/orm/model.js:3682:35)
    at Child._saveBelongsToAssociations (lib/orm/model.js:3522:12)
```

## Solution Needed

The entire `_saveAssociations` flow needs to be made async:

1. `_saveAssociations()` → `async _saveAssociationsAsync()`
2. `_saveBelongsToAssociations()` → `async _saveBelongsToAssociationsAsync()`
3. `_saveHasManyAssociations()` → `async _saveHasManyAssociationsAsync()`
4. `_associateWithNewInverses()` → `async _associateWithNewInversesAsync()`
5. `_associateModelWithInverse()` → `async _associateModelWithInverseAsync()`
6. All relationship getter accesses need `await`
7. All `find()` calls need `await`

### Changes Required

In `_associateWithNewInverses`:
```javascript
async _associateWithNewInversesAsync(association) {
  if (!this.__isSavingNewChildren) {
    let modelOrCollection = await this[association.name]; // await the Promise
    
    if (modelOrCollection instanceof Model) {
      await this._associateModelWithInverseAsync(modelOrCollection, association);
    } else if (
      modelOrCollection instanceof Collection ||
      modelOrCollection instanceof PolymorphicCollection
    ) {
      for (const model of modelOrCollection.models) {
        await this._associateModelWithInverseAsync(model, association);
      }
    }
    
    delete this._tempAssociations[association.name];
  }
}
```

In `_associateModelWithInverse`:
```javascript
async _associateModelWithInverseAsync(model, association) {
  if (model.hasInverseFor(association)) {
    let inverse = model.inverseFor(association);
    let inverseFk = inverse.getForeignKey();
    
    let ownerId = this.id;
    if (inverse instanceof BelongsTo) {
      // ... existing logic ...
      await this._schema.db[...].update(model.id, { [inverseFk]: newId });
    } else {
      let inverseCollection = this._schema.db[...];
      let record = await inverseCollection.find(model.id); // await find
      let currentIdsForInverse = record[inverse.getForeignKey()] || [];
      // ... rest of logic ...
      await inverseCollection.update(model.id, { [inverseFk]: newIdsForInverse });
    }
  }
}
```

## Workaround for Users

Until this is fixed, users can avoid this issue by:
1. Not using relationships in their factory definitions
2. Not using `afterCreate` hooks that set relationships
3. Manually creating associations after model creation

## Status

- **Detected**: Promise detection added to `_findRecord` provides better error messages (commit c2d4a13)
- **Not Fixed**: Association saving is still synchronous and will fail in async mode
- **Priority**: High - this affects any code that uses relationships with factories or afterCreate hooks
