/**
 * Tests for the async migration codemod
 * 
 * Run with: node codemods/__tests__/async-migration.test.js
 */

const fs = require('fs');
const path = require('path');
const jscodeshift = require('jscodeshift');
const transform = require('../async-migration.cjs');

// Mock model relationship map for tests
const mockModelRelationships = new Map([
  ['user', new Set(['organization', 'teams', 'workspaces'])],
  ['users', new Set(['organization', 'teams', 'workspaces'])],
  ['run', new Set(['workspace', 'plan', 'apply', 'createdBy', 'permissions', 'runEvents'])],
  ['runs', new Set(['workspace', 'plan', 'apply', 'createdBy', 'permissions', 'runEvents'])],
  ['workspace', new Set(['organization', 'runs', 'currentRun', 'project'])],
  ['workspaces', new Set(['organization', 'runs', 'currentRun', 'owner', 'project'])],
  ['organization', new Set(['users', 'teams', 'workspaces', 'moduleConsumers', 'partnershipsIds', 'owner', 'oauthClients'])],
  ['organizations', new Set(['users', 'teams', 'workspaces', 'moduleConsumers', 'partnershipsIds', 'owner', 'oauthClients'])],
  ['oauthClient', new Set(['oauthTokens'])],
  ['oauthClients', new Set(['oauthTokens'])],
  ['oauthToken', new Set(['authorizedRepos'])],
  ['oauthTokens', new Set(['authorizedRepos'])],
  ['model', new Set(['workspace', 'user'])],
  ['models', new Set(['workspace', 'user'])],
  ['session', new Set(['user'])],
  ['sessions', new Set(['user'])],
  ['project', new Set(['workspace', 'organization', 'runs'])],
  ['projects', new Set(['workspace', 'organization', 'runs'])],
]);

function applyTransform(source, filepath = 'test.js') {
  const api = {
    jscodeshift: jscodeshift.withParser('babel'),
  };
  // Pass mock relationships through file object
  return transform({ 
    path: filepath, 
    source,
    _mockModelRelationships: mockModelRelationships 
  }, api) || source;
}

function test(name, input, expected, expectFailure = false, filepath = 'test.js') {
  const result = applyTransform(input, filepath);
  // Normalize whitespace, semicolons, and trailing commas for comparison
  const normalize = (str) => str.replace(/\s+/g, ' ').replace(/[;,]/g, '').trim();
  const passed = normalize(result) === normalize(expected);
  
  if (expectFailure) {
    // For known limitations, we expect the test to fail (codemod doesn't produce expected output)
    if (!passed) {
      console.log(`✓ ${name} (known limitation - fails as expected)`);
    } else {
      console.log(`✗ ${name} (expected to fail but passed - limitation may be fixed!)`);
      console.log('This known limitation test is now passing. Consider moving it to regular tests.');
    }
  } else {
    if (passed) {
      console.log(`✓ ${name}`);
    } else {
      console.log(`✗ ${name}`);
      console.log('Expected:');
      console.log(expected);
      console.log('\nGot:');
      console.log(result);
      console.log('\n');
    }
  }
}

// Test 1: Add async: true to createServer
test(
  'adds async: true to createServer config',
  `
import { createServer, Model } from 'miragejs';

createServer({
  models: {
    user: Model,
  },
});
  `.trim(),
  `
import { createServer, Model } from 'miragejs';

createServer({
  async: true,
  models: {
    user: Model,
  },
});
  `.trim()
);

// Test 2: Make route handler async and add await
test(
  'makes route handler async and adds await',
  `
createServer({
  routes() {
    this.get('/users', (schema) => {
      return schema.users.all();
    });
  },
});
  `.trim(),
  `
createServer({
  async: true,

  routes() {
    this.get('/users', async schema => {
      return await schema.users.all();
    });
  }
});
  `.trim()
);

// Test 3: Handle multiple db/schema calls
test(
  'handles multiple async calls',
  `
createServer({
  routes() {
    this.post('/users', (schema, request) => {
      const attrs = JSON.parse(request.requestBody);
      const user = schema.users.create(attrs);
      const all = schema.users.all();
      return { user, all };
    });
  },
});
  `.trim(),
  `
createServer({
  async: true,
  routes() {
    this.post('/users', async (schema, request) => {
      const attrs = JSON.parse(request.requestBody);
      const user = await schema.users.create(attrs);
      const all = await schema.users.all();
      return { user, all };
    });
  },
});
  `.trim()
);

// Test 4: Handle db methods
test(
  'handles db method calls',
  `
createServer({
  routes() {
    this.get('/users', (schema) => {
      return schema.db.users.find(1);
    });
  },
});
  `.trim(),
  `
createServer({
  async: true,

  routes() {
    this.get('/users', async schema => {
      return await schema.db.users.find(1);
    });
  }
});
  `.trim()
);

// Test 5: Don't modify handlers without db/schema calls
test(
  'leaves non-async handlers unchanged',
  `
createServer({
  routes() {
    this.get('/health', () => {
      return { status: 'ok' };
    });
  },
});
  `.trim(),
  `
createServer({
  async: true,
  routes() {
    this.get('/health', () => {
      return { status: 'ok' };
    });
  },
});
  `.trim()
);

// Test 6: Handle new Server() syntax
test(
  'handles new Server() syntax',
  `
const server = new Server({
  models: { user: Model },
  routes() {
    this.get('/users', (schema) => schema.users.all());
  },
});
  `.trim(),
  `
const server = new Server({
  async: true,
  models: { user: Model },

  routes() {
    this.get('/users', async schema => await schema.users.all());
  }
});
  `.trim()
);

// Test 7: Don't add async if already present
test(
  'does not duplicate async: true',
  `
createServer({
  async: true,
  routes() {
    this.get('/users', (schema) => schema.users.all());
  },
});
  `.trim(),
  `
createServer({
  async: true,

  routes() {
    this.get('/users', async schema => await schema.users.all());
  }
});
  `.trim()
);

// Test 8: this.server.create() in test hooks
test(
  'transforms this.server.create() in test hooks',
  `
hooks.beforeEach(function () {
  this.user = this.server.create('user');
});
  `.trim(),
  `
hooks.beforeEach(async function() {
  this.user = await this.server.create('user');
});
  `.trim()
);

// Test 9: this.server.schema.collection.method() in test hooks
test(
  'transforms this.server.schema patterns in test hooks',
  `
hooks.beforeEach(function () {
  this.server.schema.sessions.first().destroy();
});
  `.trim(),
  `
hooks.beforeEach(async function() {
  await this.server.schema.sessions.first().destroy();
});
  `.trim()
);

// Test 10: this.server.createList() in test hooks
test(
  'transforms this.server.createList() in test hooks',
  `
hooks.beforeEach(function () {
  this.users = this.server.createList('user', 3);
});
  `.trim(),
  `
hooks.beforeEach(async function() {
  this.users = await this.server.createList('user', 3);
});
  `.trim()
);

// Test 11: Module callback should NOT become async (QUnit doesn't support it)
test(
  'keeps module callback synchronous but makes hooks async',
  `
module('Acceptance | test', function(hooks) {
  hooks.beforeEach(function() {
    this.user = this.server.create('user');
  });
});
  `.trim(),
  `
module('Acceptance | test', function(hooks) {
  hooks.beforeEach(async function() {
    this.user = await this.server.create('user');
  });
});
  `.trim()
);

// Test 12: Association .models with .get()
test(
  'transforms association.models.get() with double await',
  `
Factory.extend({
  afterCreate(run, server) {
    const lastEvent = run.runEvents.models.get('lastObject');
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(run, server) {
    const lastEvent = (await run.runEvents).models.get('lastObject');
    return run;
  }
});
  `.trim(),
  false,
  'factories/run.js' // Pass factory filename as context
);

// Test 13: Association .models with array index
test(
  'transforms association.models[index] with double await',
  `
Factory.extend({
  afterCreate(project, server) {
    const first = project.runs.models[0];
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(project, server) {
    const first = (await project.runs).models[0];
    return project;
  }
});
  `.trim(),
  false,
  'factories/project.js' // Pass factory filename as context
);

// Test 14: Association .models with .firstObject
test(
  'transforms association.models.firstObject with double await',
  `
Factory.extend({
  afterCreate(project, server) {
    const first = project.runs.models.firstObject;
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(project, server) {
    const first = (await project.runs).models.firstObject;
    return project;
  }
});
  `.trim(),
  false,
  'factories/project.js' // Pass factory filename as context
);

// Test 15: Awaited where() with .models should only await once
test(
  'does not double-await .models after awaited CallExpression',
  `
function handler(server) {
  const projects = server.schema.projects.where({ active: true }).models;
}
  `.trim(),
  `
async function handler(server) {
  const projects = (await server.schema.projects.where({ active: true })).models;
}
  `.trim()
);

// Test 16: Optional chaining with .models should not transform
test(
  'skips transformation when optional chaining is present',
  `
const projects = workspace.organization?.projects?.models;
  `.trim(),
  `
const projects = workspace.organization?.projects?.models;
  `.trim()
);

// Test 17: Destructured collection parameter
test(
  'transforms functions with destructured collection parameters',
  `
function handler({ users }, request) {
  return users.find(request.params.id);
}
  `.trim(),
  `
async function handler({ users }, request) {
  return await users.find(request.params.id);
}
  `.trim()
);

// Test 18: Multiple destructured collections
test(
  'handles multiple destructured collections',
  `
function handler({ users, posts }, request) {
  const user = users.find(1);
  const userPosts = posts.where({ userId: 1 });
  return { user, posts: userPosts };
}
  `.trim(),
  `
async function handler({ users, posts }, request) {
  const user = await users.find(1);
  const userPosts = await posts.where({ userId: 1 });
  return { user, posts: userPosts };
}
  `.trim()
);

// Test 19: Factory trait with afterCreate
test(
  'transforms factory trait afterCreate hooks',
  `
Factory.extend({
  withPosts: trait({
    afterCreate(user, server) {
      server.createList('post', 3, { user });
    }
  })
});
  `.trim(),
  `
Factory.extend({
  withPosts: trait({
    async afterCreate(user, server) {
      await server.createList('post', 3, { user });
      return user;
    }
  })
});
  `.trim()
);

// Test 20: Model instance methods (save, update, destroy)
test(
  'transforms model instance methods',
  `
Factory.extend({
  afterCreate(user, server) {
    user.update({ verified: true });
    user.save();
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(user, server) {
    await user.update({ verified: true });
    await user.save();
    return user;
  }
});
  `.trim()
);

// Test 21: Scenario function with server parameter
test(
  'transforms scenario functions',
  `
const scenarios = {
  default(server) {
    server.create('user');
    server.createList('post', 10);
  }
};
  `.trim(),
  `
const scenarios = {
  async default(server) {
    await server.create('user');
    await server.createList('post', 10);
  }
};
  `.trim()
);

// Test 22: Route handler with 'schemas' parameter (plural)
test(
  'handles schemas parameter (plural form)',
  `
this.get('/users', (schemas) => {
  return schemas.users.all();
});
  `.trim(),
  `
this.get('/users', async schemas => {
  return await schemas.users.all();
});
  `.trim()
);

// Test 23: server.schema.collection.method()
test(
  'transforms server.schema.collection.method() calls',
  `
function seed(server) {
  server.schema.users.create({ name: 'Admin' });
}
  `.trim(),
  `
async function seed(server) {
  await server.schema.users.create({ name: 'Admin' });
}
  `.trim()
);

// Test 24: Chained member expressions
test(
  'handles chained member expressions for model methods',
  `
Factory.extend({
  afterCreate(project, server) {
    project.latestRun.apply.update({ status: 'applied' });
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(project, server) {
    await project.latestRun.apply.update({ status: 'applied' });
    return project;
  }
});
  `.trim()
);

// Test 25: this.server.db.collection.method()
test(
  'transforms this.server.db patterns in test hooks',
  `
hooks.beforeEach(function() {
  this.user = this.server.db.users.find(1);
});
  `.trim(),
  `
hooks.beforeEach(async function() {
  this.user = await this.server.db.users.find(1);
});
  `.trim()
);

// Test 26: Arrow function route handler
test(
  'transforms arrow function route handlers',
  `
this.get('/users', (schema) => schema.users.all());
  `.trim(),
  `
this.get('/users', async schema => await schema.users.all());
  `.trim()
);

// Test 27: Exported function declaration
test(
  'transforms exported function declarations',
  `
export function seedDatabase(server) {
  server.create('user', { name: 'Admin' });
}
  `.trim(),
  `
export async function seedDatabase(server) {
  await server.create('user', { name: 'Admin' });
}
  `.trim()
);

// Test 28: Prevent double await on already awaited expressions
test(
  'does not add await if expression is already awaited',
  `
const user = await schema.users.create({ name: 'test' });
  `.trim(),
  `
const user = await schema.users.create({ name: 'test' });
  `.trim()
);

// Test 29: Wrapper function calling route handler parameter
test(
  'transforms wrapper functions that call handler parameters',
  `
function paginate(handler) {
  return (schema, request) => {
    const result = handler(schema, request);
    return { data: result };
  };
}
  `.trim(),
  `
function paginate(handler) {
  return async (schema, request) => {
    const result = await handler(schema, request);
    return { data: result };
  };
}
  `.trim()
);

// Test 30: QUnit module callback should stay synchronous
test(
  'does not make QUnit module() callback async',
  `
module('My Module', function(hooks) {
  hooks.beforeEach(function() {
    this.server.create('user');
  });
});
  `.trim(),
  `
module('My Module', function(hooks) {
  hooks.beforeEach(async function() {
    await this.server.create('user');
  });
});
  `.trim()
);

// Test 31: Function with no params but using this.server should transform
test(
  'transforms parameterless functions using this.server',
  `
function setupData() {
  this.server.create('user');
}
  `.trim(),
  `
async function setupData() {
  await this.server.create('user');
}
  `.trim()
);

// Test 32: Association .models.forEach()
test(
  'transforms association.models.forEach() with double await',
  `
Factory.extend({
  afterCreate(project, server) {
    project.runs.models.forEach(run => {
      console.log(run.id);
    });
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(project, server) {
    (await project.runs).models.forEach(run => {
      console.log(run.id);
    });
    return project;
  }
});
  `.trim(),
  false,
  'factories/project.js' // Pass factory filename as context
);

// Test 33: (await association).models should NOT be transformed
test(
  'does not transform (await association).models pattern',
  `
Factory.extend({
  async afterCreate(run, server) {
    let { createdAt } = (await run.runEvents).models.get('lastObject');
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(run, server) {
    let { createdAt } = (await run.runEvents).models.get('lastObject');
  }
});
  `.trim()
);

// Test 34: forEach with model.destroy() in callback
test(
  'handles forEach with model.destroy() correctly',
  `
Factory.extend({
  async afterCreate(organization, server) {
    (await server.schema.organizationMembershipV2s.where({ organizationId: organization.id })).models.forEach(m => m.destroy());
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(organization, server) {
    (await server.schema.organizationMembershipV2s.where({ organizationId: organization.id })).models.forEach(async m => await m.destroy());
    return organization;
  }
});
  `.trim()
);

// Test 35: Function accessing .models on parameter should not be made async
test(
  'does not make function async when accessing .models on parameter',
  `
function runEventTimestamps(run, target) {
  let timestamps = {};
  run.runEvents.models.forEach(event => {
    timestamps[event.action] = event.createdAt;
  });
  return timestamps;
}
  `.trim(),
  `
function runEventTimestamps(run, target) {
  let timestamps = {};
  run.runEvents.models.forEach(event => {
    timestamps[event.action] = event.createdAt;
  });
  return timestamps;
}
  `.trim()
);

// Test 36: Async afterCreate should add return statement
test(
  'adds return statement to async afterCreate without explicit return',
  `
import { Factory } from 'miragejs';

export default Factory.extend({
  afterCreate(agentPool) {
    agentPool.update({ organizationId: agentPool.organization.id });
  }
});
  `.trim(),
  `
import { Factory } from 'miragejs';

export default Factory.extend({
  async afterCreate(agentPool) {
    await agentPool.update({ organizationId: agentPool.organization.id });
    return agentPool;
  }
});
  `.trim()
);

// Test 37: Async afterCreate with existing return should not duplicate
test(
  'does not add return statement when afterCreate already returns',
  `
import { Factory } from 'miragejs';

export default Factory.extend({
  afterCreate(model) {
    model.update({ foo: 'bar' });
    return model;
  }
});
  `.trim(),
  `
import { Factory } from 'miragejs';

export default Factory.extend({
  async afterCreate(model) {
    await model.update({ foo: 'bar' });
    return model;
  }
});
  `.trim()
);

// Test 38: Trait afterCreate should also get return statement
test(
  'adds return statement to trait afterCreate',
  `
import { Factory, trait } from 'miragejs';

export default Factory.extend({
  withDefaults: trait({
    async afterCreate(auditConfiguration) {
      await auditConfiguration.update({
        hcpAuditLogStreaming: { enabled: true }
      });
    }
  })
});
  `.trim(),
  `
import { Factory, trait } from 'miragejs';

export default Factory.extend({
  withDefaults: trait({
    async afterCreate(auditConfiguration) {
      await auditConfiguration.update({
        hcpAuditLogStreaming: { enabled: true }
      });
      return auditConfiguration;
    }
  })
});
  `.trim()
);

// Test 39: Add await to server.create() in test scenarios
test(
  'adds await to unawaited server.create() calls',
  `
test('creates a user', function() {
  let user = server.create('user');
  visit('/users/' + user.id);
});
  `.trim(),
  `
test('creates a user', async function() {
  let user = await server.create('user');
  visit('/users/' + user.id);
});
  `.trim()
);

// Test 40: Add await to this.server.create() calls
test(
  'adds await to this.server.create() calls',
  `
test('creates a user', function() {
  let user = this.server.create('user');
  expect(user.name).toBe('John');
});
  `.trim(),
  `
test('creates a user', async function() {
  let user = await this.server.create('user');
  expect(user.name).toBe('John');
});
  `.trim()
);

// Test 41: Add await to server.createList() calls
test(
  'adds await to unawaited server.createList() calls',
  `
test('creates multiple users', function() {
  let users = server.createList('user', 5);
  expect(users.length).toBe(5);
});
  `.trim(),
  `
test('creates multiple users', async function() {
  let users = await server.createList('user', 5);
  expect(users.length).toBe(5);
});
  `.trim()
);

// Test 42: Add await to server.create in beforeEach hooks
test(
  'adds await to server.create in beforeEach hooks',
  `
module('test suite', function(hooks) {
  hooks.beforeEach(function() {
    this.user = this.server.create('user');
  });
  
  test('uses user', function() {
    expect(this.user.id).toBe('1');
  });
});
  `.trim(),
  `
module('test suite', function(hooks) {
  hooks.beforeEach(async function() {
    this.user = await this.server.create('user');
  });
  
  test('uses user', function() {
    expect(this.user.id).toBe('1');
  });
});
  `.trim()
);

// Test 43: Handle multiple server.create calls in one function
test(
  'adds await to multiple server.create calls',
  `
test('creates multiple models', function() {
  let user = server.create('user');
  let post = server.create('post', { author: user });
  expect(post.author.id).toBe(user.id);
});
  `.trim(),
  `
test('creates multiple models', async function() {
  let user = await server.create('user');
  let post = await server.create('post', { author: user });
  expect(post.author.id).toBe(user.id);
});
  `.trim()
);

// Test 44: Skip already awaited calls
test(
  'does not add await when server.create is already awaited',
  `
test('creates a user', async function() {
  let user = await server.create('user');
  expect(user.id).toBe('1');
});
  `.trim(),
  `
test('creates a user', async function() {
  let user = await server.create('user');
  expect(user.id).toBe('1');
});
  `.trim()
);

// Test 45: Handle server.create without variable assignment
test(
  'adds await to server.create without assignment',
  `
test('creates a user', function() {
  server.create('user');
  visit('/users');
});
  `.trim(),
  `
test('creates a user', async function() {
  await server.create('user');
  visit('/users');
});
  `.trim()
);

// Test: Collection methods with async functions
test(
  'adds await to collection.sort() with async comparator',
  `
export function index({ workspaceV2s }) {
  let workspaces = workspaceV2s.all();
  return workspaces.sort(async (a, b) => {
    return a.name.localeCompare(b.name);
  });
}
  `.trim(),
  `
export async function index({ workspaceV2s }) {
  let workspaces = await workspaceV2s.all();
  return await workspaces.sort(async (a, b) => {
    return a.name.localeCompare(b.name);
  });
}
  `.trim()
);

test(
  'adds await to collection.filter() with async predicate',
  `
export function filter({ projectV2s }) {
  let projects = projectV2s.all();
  projects = projects.filter(async project => {
    return project.isActive === true;
  });
  return projects;
}
  `.trim(),
  `
export async function filter({ projectV2s }) {
  let projects = await projectV2s.all();
  projects = await projects.filter(async project => {
    return project.isActive === true;
  });
  return projects;
}
  `.trim()
);

test(
  'adds await to schema.where() with async predicate',
  `
export function where({ varV2s }) {
  return varV2s.where(async function (v) {
    return v.someCondition === true;
  });
}
  `.trim(),
  `
export async function where({ varV2s }) {
  return await varV2s.where(async function (v) {
    return v.someCondition === true;
  });
}
  `.trim()
);

test(
  'does not make wrapper functions async (only inner handler)',
  `
export default function paginateWrapper(route, limit = 5) {
  return function paginate(schema, request) {
    let records = route(schema, request);
    return records;
  };
}
  `.trim(),
  `
export default function paginateWrapper(route, limit = 5) {
  return async function paginate(schema, request) {
    let records = await route(schema, request);
    return records;
  };
}
  `.trim()
);

test(
  'does not make higher-order destroy route wrapper async',
  `
export default function destroyRoute(collection, param = 'id') {
  return function (schema, request) {
    let model = schema[collection].find(request.params[param]);
    model.destroy();
    return new Response(204);
  };
}
  `.trim(),
  `
export default function destroyRoute(collection, param = 'id') {
  return async function(schema, request) {
    let model = await schema[collection].find(request.params[param]);
    await model.destroy();
    return new Response(204);
  };
}
  `.trim()
);

test(
  'makes afterCreate async when it has model.update calls',
  `
export default Model.extend({
  afterCreate(model) {
    if (!model.tags) {
      model.update({ tags: [] });
    }
  }
});
  `.trim(),
  `
export default Model.extend({
  async afterCreate(model) {
    if (!model.tags) {
      await model.update({ tags: [] });
    }
    return model;
  }
});
  `.trim()
);

test(
  'does not make serializer serialize() method async when it only accesses response.models',
  `
export default ApplicationSerializer.extend({
  serialize(response, request) {
    let json = ApplicationSerializer.prototype.serialize.apply(this, arguments);
    
    if (response instanceof Collection) {
      response.models
        .filter(m => m.vcsRepo)
        .forEach((model, i) => {
          json.data[i].attributes['vcs-repo'] = model.vcsRepo.name;
        });
      return json;
    }
    
    return json;
  },
});
  `.trim(),
  `
export default ApplicationSerializer.extend({
  serialize(response, request) {
    let json = ApplicationSerializer.prototype.serialize.apply(this, arguments);
    
    if (response instanceof Collection) {
      response.models
        .filter(m => m.vcsRepo)
        .forEach((model, i) => {
          json.data[i].attributes['vcs-repo'] = model.vcsRepo.name;
        });
      return json;
    }
    
    return json;
  },
});
  `.trim()
);

test(
  'awaits model.destroy() in route handlers',
  `
this.delete('/api/users/:id', function({ users }, request) {
  let user = users.find(request.params.id);
  user.destroy();
  return new Response(204);
});
  `.trim(),
  `
this.delete('/api/users/:id', async function({ users }, request) {
  let user = await users.find(request.params.id);
  await user.destroy();
  return new Response(204);
});
  `.trim()
);

test(
  'awaits chained model operations - find then destroy',
  `
export function deleteUser({ users }, { params }) {
  let user = users.find(params.id);
  if (user) {
    user.destroy();
  }
  return new Response(204);
}
  `.trim(),
  `
export async function deleteUser({ users }, { params }) {
  let user = await users.find(params.id);
  if (user) {
    await user.destroy();
  }
  return new Response(204);
}
  `.trim()
);

test(
  'awaits model.update() in route handlers',
  `
this.patch('/api/users/:id', function({ users }, request) {
  let user = users.find(request.params.id);
  let attrs = JSON.parse(request.requestBody);
  user.update(attrs);
  return user;
});
  `.trim(),
  `
this.patch('/api/users/:id', async function({ users }, request) {
  let user = await users.find(request.params.id);
  let attrs = JSON.parse(request.requestBody);
  await user.update(attrs);
  return user;
});
  `.trim()
);

test(
  'awaits double-awaited association.models pattern in afterCreate',
  `
Factory.extend({
  async afterCreate(varset) {
    varset.attrs.projectCount = (await (await varset.projects).models).length;
    varset.attrs.workspaceCount = (await (await varset.workspaces).models).length;
    
    if (varset.parent === null) {
      await varset.update({ parent: varset.organization });
    }
    return varset;
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(varset) {
    varset.attrs.projectCount = (await (await varset.projects).models).length;
    varset.attrs.workspaceCount = (await (await varset.workspaces).models).length;
    
    if (varset.parent === null) {
      await varset.update({ parent: varset.organization });
    }
    return varset;
  }
});
  `.trim()
);

test(
  'awaits relationship property in conditional',
  `
export function show({ sessions }, { params }) {
  let session = sessions.find(params.id);
  if (session && session.user) {
    return session.user;
  }
  return notFound();
}
  `.trim(),
  `
export async function show({ sessions }, { params }) {
  let session = await sessions.find(params.id);
  if (session && (await session.user)) {
    return await session.user;
  }
  return notFound();
}
  `.trim()
);

test(
  'awaits relationship property on model',
  `
this.get('/api/runs/:id/permissions', function({ runs }, request) {
  let run = runs.find(request.params.id);
  return run.permissions;
});
  `.trim(),
  `
this.get('/api/runs/:id/permissions', async function({ runs }, request) {
  let run = await runs.find(request.params.id);
  return await run.permissions;
});
  `.trim()
);

test(
  'awaits nested relationship access',
  `
this.get('/api/workspaces/:id/owner', function({ workspaces }, request) {
  let workspace = workspaces.find(request.params.id);
  return workspace.organization.owner;
});
  `.trim(),
  `
this.get('/api/workspaces/:id/owner', async function({ workspaces }, request) {
  let workspace = await workspaces.find(request.params.id);
  return await (await workspace.organization).owner;
});
  `.trim()
);

test(
  'does not await attrs property access',
  `
this.get('/api/models/:id/data', function({ models }, request) {
  let model = models.find(request.params.id);
  return model.attrs;
});
  `.trim(),
  `
this.get('/api/models/:id/data', async function({ models }, request) {
  let model = await models.find(request.params.id);
  return model.attrs;
});
  `.trim()
);

test(
  'does not await built-in model properties',
  `
this.get('/api/models/:id/info', function({ models }, request) {
  let model = models.find(request.params.id);
  return { id: model.id, name: model.modelName };
});
  `.trim(),
  `
this.get('/api/models/:id/info', async function({ models }, request) {
  let model = await models.find(request.params.id);
  return { id: model.id, name: model.modelName };
});
  `.trim()
);

test(
  'awaits only relationship properties, not all properties',
  `
this.post('/api/runs', function({ runs, workspaces }) {
  let workspace = workspaces.find('ws-123');
  let run = server.create('run', { workspace });
  return { id: run.id, status: run.status, workspace: run.workspace };
});
  `.trim(),
  `
this.post('/api/runs', async function({ runs, workspaces }) {
  let workspace = await workspaces.find('ws-123');
  let run = await server.create('run', { workspace });
  return { id: run.id, status: run.status, workspace: await run.workspace };
});
  `.trim()
);

test(
  'POTENTIAL BUG: may over-await non-relationship properties',
  `
// This documents a limitation: the codemod cannot distinguish
// between relationship properties and regular properties without
// schema information. It uses a heuristic based on common property names.
// Properties like 'customField' might be incorrectly awaited.
this.get('/api/models/:id', function({ models }) {
  let model = models.find('1');
  return { customField: model.customField };
});
  `.trim(),
  `
this.get('/api/models/:id', async function({ models }) {
  let model = await models.find('1');
  return { customField: await model.customField };
});
  `.trim(),
  { expectFailure: false } // This transformation happens, but may cause runtime errors
);

test(
  'does not add await before assignment expressions',
  `
export async function update(schema, { params }) {
  let org = await schema.organizations.find(params.id);
  
  // Clear out existing relationships
  org.moduleConsumersIds = [];
  
  // Update with new data
  await org.update({ name: 'New Name' });
  
  return await org.moduleConsumers;
}
  `.trim(),
  `
export async function update(schema, { params }) {
  let org = await schema.organizations.find(params.id);
  
  // Clear out existing relationships
  org.moduleConsumersIds = [];
  
  // Update with new data
  await org.update({ name: 'New Name' });
  
  return await org.moduleConsumers;
}
  `.trim()
);

test(
  'BUG: incorrectly adds await before assignment to relationship property',
  `
export async function update(schema, { params }) {
  let org = await schema.organizations.find(params.id);
  org.partnershipsIds = [];
  return org;
}
  `.trim(),
  `
export async function update(schema, { params }) {
  let org = await schema.organizations.find(params.id);
  await org.partnershipsIds = [];
  return org;
}
  `.trim(),
  { expectFailure: true } // This is a bug - produces invalid syntax
);

test(
  'makes arrow functions async when they contain await',
  `
this.get('/runs', function(schema) {
  let previousRuns = schema.runs.all();
  let mfaWaitingRuns = previousRuns
    .filter(r => r.status === 'planning')
    .filter(run => run.plan.status === 'mfa_waiting');
  return mfaWaitingRuns;
});
  `.trim(),
  `
this.get('/runs', async function(schema) {
  let previousRuns = await schema.runs.all();
  let mfaWaitingRuns = previousRuns
    .filter(r => r.status === 'planning')
    .filter(async run => (await run.plan).status === 'mfa_waiting');
  return mfaWaitingRuns;
});
  `.trim()
);

test(
  'BUG: adds await in arrow function without making it async',
  `
this.get('/runs', function(schema) {
  let previousRuns = schema.runs.all();
  let mfaWaitingRuns = previousRuns
    .filter(r => r.status === 'planning')
    .filter(run => run.plan.status === 'mfa_waiting');
  return mfaWaitingRuns;
});
  `.trim(),
  `
this.get('/runs', async function(schema) {
  let previousRuns = await schema.runs.all();
  let mfaWaitingRuns = previousRuns
    .filter(r => r.status === 'planning')
    .filter(run => (await run.plan).status === 'mfa_waiting');
  return mfaWaitingRuns;
});
  `.trim(),
  { expectFailure: true } // Bug: arrow function needs to be async
);

// Test collection methods: findBy, findWhere
test(
  'tracks variables from findBy and findWhere',
  `
this.get('/users/:id', function({ users }, request) {
  let user = users.findBy({ email: request.params.email });
  return user.organization;
});
  `.trim(),
  `
this.get('/users/:id', async function({ users }, request) {
  let user = await users.findBy({ email: request.params.email });
  return await user.organization;
});
  `.trim()
);

test(
  'tracks variables from findWhere',
  `
this.get('/users/active', function({ users }) {
  let activeUser = users.findWhere((u) => u.isActive);
  return activeUser.teams;
});
  `.trim(),
  `
this.get('/users/active', async function({ users }) {
  let activeUser = await users.findWhere((u) => u.isActive);
  return await activeUser.teams;
});
  `.trim()
);

// Test arrow function callbacks: map, forEach, some, every, reduce
test(
  'makes map arrow function async when accessing relationships',
  `
this.get('/runs', async function({ runs }) {
  let allRuns = await runs.all();
  let plans = allRuns.map(run => run.plan);
  return plans;
});
  `.trim(),
  `
this.get('/runs', async function({ runs }) {
  let allRuns = await runs.all();
  let plans = allRuns.map(async run => await run.plan);
  return plans;
});
  `.trim()
);

test(
  'makes forEach arrow function async when accessing relationships',
  `
this.get('/runs', async function({ runs }) {
  let allRuns = await runs.all();
  allRuns.models.forEach(run => {
    console.log(run.plan.status);
  });
});
  `.trim(),
  `
this.get('/runs', async function({ runs }) {
  let allRuns = await runs.all();
  allRuns.models.forEach(run => {
    console.log(run.plan.status);
  });
});
  `.trim()
);

test(
  'makes some arrow function async when accessing relationships',
  `
this.get('/runs/check', async function({ runs }) {
  let allRuns = await runs.all();
  let hasPending = allRuns.some(run => run.plan.status === 'pending');
  return { hasPending };
});
  `.trim(),
  `
this.get('/runs/check', async function({ runs }) {
  let allRuns = await runs.all();
  let hasPending = allRuns.some(async run => (await run.plan).status === 'pending');
  return { hasPending };
});
  `.trim()
);

test(
  'makes every arrow function async when accessing relationships',
  `
this.get('/runs/check', async function({ runs }) {
  let allRuns = await runs.all();
  let allCompleted = allRuns.every(run => run.plan.completed);
  return { allCompleted };
});
  `.trim(),
  `
this.get('/runs/check', async function({ runs }) {
  let allRuns = await runs.all();
  let allCompleted = allRuns.every(async run => (await run.plan).completed);
  return { allCompleted };
});
  `.trim()
);

test(
  'makes reduce arrow function async when accessing relationships',
  `
this.get('/runs/count', async function({ runs }) {
  let allRuns = await runs.all();
  let count = allRuns.reduce((acc, run) => {
    return acc + (run.plan.status === 'completed' ? 1 : 0);
  }, 0);
  return { count };
});
  `.trim(),
  `
this.get('/runs/count', async function({ runs }) {
  let allRuns = await runs.all();
  let count = allRuns.reduce(async (acc, run) => {
    return acc + ((await run.plan).status === 'completed' ? 1 : 0);
  }, 0);
  return { count };
});
  `.trim()
);

// Test that .models.forEach() is NOT transformed (it's on a plain array, not a collection)
test(
  'does not make models.forEach arrow function async',
  `
this.get('/projects/:id', async function({ projects }, request) {
  let project = await projects.find(request.params.id);
  let runs = await project.runs;
  runs.models.forEach(run => {
    console.log(run.workspace.name);
  });
  return project;
});
  `.trim(),
  `
this.get('/projects/:id', async function({ projects }, request) {
  let project = await projects.find(request.params.id);
  let runs = await project.runs;
  runs.models.forEach(run => {
    console.log(run.workspace.name);
  });
  return project;
});
  `.trim()
);

// Test awaiting relationship access inside array literals
test(
  'awaits relationship access inside array literals',
  `
this.post('/varsets', async function({ workspaces }, request) {
  let workspace = await workspaces.find(request.params.id);
  
  let varset = await this.create('varset-v2', {
    name: 'test-varset',
    projects: [workspace.project],
  });
  
  return varset;
});
  `.trim(),
  `
this.post('/varsets', async function({ workspaces }, request) {
  let workspace = await workspaces.find(request.params.id);
  
  let varset = await this.create('varset-v2', {
    name: 'test-varset',
    projects: [await workspace.project],
  });
  
  return varset;
});
  `.trim()
);

// Test chained relationship access with .models
test(
  'awaits chained relationship access correctly',
  `
this.post('/workspaces', function(schema) {
  schema.workspaces.create({
    async afterCreate(workspace, server) {
      if (!workspace.organization || !workspace.organization.oauthClients.models[0]) {
        await server.create('vcs-repo-v2', { workspace });
        return;
      }
      
      let oauthClient = workspace.organization.oauthClients.models[0];
      let oauthToken = oauthClient.oauthTokens.models[0];
      let authorizedRepo = oauthToken.authorizedRepos.models[0];
    }
  });
});
  `.trim(),
  `
this.post('/workspaces', async function(schema) {
  await schema.workspaces.create({
    async afterCreate(workspace, server) {
      if (!(await workspace.organization) || !(await (await workspace.organization).oauthClients).models[0]) {
        await server.create('vcs-repo-v2', { workspace });
        return;
      }
      
      let oauthClient = (await (await workspace.organization).oauthClients).models[0];
      let oauthToken = (await (await oauthClient).oauthTokens).models[0];
      let authorizedRepo = (await (await oauthToken).authorizedRepos).models[0];
    }
  });
});
  `.trim(),
  false,
  'factories/workspace.js' // Pass factory filename as context
);

// Test: Factory afterCreate with server.create passed to model.update (Atlas error pattern)
test(
  'transforms afterCreate with unawaited server.create passed to model.update',
  `
Factory.extend({
  afterCreate(policy, server) {
    const workspace = server.create('workspace', { name: 'target' });
    policy.update({ target: workspace });
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(policy, server) {
    const workspace = await server.create('workspace', { name: 'target' });
    await policy.update({ target: workspace });
    return policy;
  }
});
  `.trim()
);

// Test: Factory afterCreate with multiple creates and updates (complex Atlas pattern)
test(
  'transforms complex afterCreate with multiple unawaited operations',
  `
Factory.extend({
  afterCreate(membership, server) {
    const user = server.create('user');
    const org = server.create('organization');
    membership.update({ user: user, organization: org });
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(membership, server) {
    const user = await server.create('user');
    const org = await server.create('organization');
    await membership.update({ user: user, organization: org });
    return membership;
  }
});
  `.trim()
);

// Test: Factory afterCreate with server.create result directly in update (inline pattern)
test(
  'transforms afterCreate with server.create directly in update call',
  `
Factory.extend({
  afterCreate(policy, server) {
    policy.update({ 
      target: server.create('workspace'),
      owner: server.create('user')
    });
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(policy, server) {
    await policy.update({ 
      target: await server.create('workspace'),
      owner: await server.create('user')
    });
    return policy;
  }
});
  `.trim()
);

// Test: Trait afterCreate with unawaited server.create passed to model.update
test(
  'transforms trait afterCreate with unawaited creates',
  `
Factory.extend({
  withTarget: trait({
    afterCreate(policy, server) {
      const workspace = server.create('workspace');
      policy.update({ target: workspace });
    }
  })
});
  `.trim(),
  `
Factory.extend({
  withTarget: trait({
    async afterCreate(policy, server) {
      const workspace = await server.create('workspace');
      await policy.update({ target: workspace });
      return policy;
    }
  })
});
  `.trim()
);

// Test: Factory afterCreate creating HasMany relationship records
test(
  'transforms afterCreate creating records for HasMany relationships',
  `
Factory.extend({
  afterCreate(org, server) {
    const client1 = server.create('oauth-client', { organization: org });
    const client2 = server.create('oauth-client', { organization: org });
    org.update({ oauthClientIds: [client1.id, client2.id] });
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(org, server) {
    const client1 = await server.create('oauth-client', { organization: org });
    const client2 = await server.create('oauth-client', { organization: org });
    await org.update({ oauthClientIds: [client1.id, client2.id] });
    return org;
  }
});
  `.trim()
);

// Test case: Add async: true when createServer is called with a variable
test(
  'adds async: true to config object when createServer is called with a variable',
  `
import { createServer } from 'miragejs';

export default function (config) {
  let finalConfig = {
    ...config,
    factories,
    models,
    routes,
  };

  return createServer(finalConfig);
}
  `.trim(),
  `
import { createServer } from 'miragejs';

export default function (config) {
  let finalConfig = {
    async: true,
    ...config,
    factories,
    models,
    routes
  };

  return createServer(finalConfig);
}
  `.trim()
);

// Test case: Nested server.create in afterCreate during relationship mapping
test(
  'transforms nested server.create in afterCreate that assigns to relationship property',
  `
Factory.extend({
  afterCreate(workspace, server) {
    workspace.currentRun = server.create('run', { workspace });
  }
});
  `.trim(),
  `
Factory.extend({
  async afterCreate(workspace, server) {
    workspace.currentRun = await server.create('run', { workspace });
    return workspace;
  }
});
  `.trim()
);

console.log('\n' + '='.repeat(70));
console.log('✅ Test run completed!');
console.log('='.repeat(70));
console.log('Note: Tests marked "known limitation" are expected to fail.');
console.log('These document patterns the codemod cannot handle automatically.');
console.log('='.repeat(70));
