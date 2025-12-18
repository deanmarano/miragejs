/**
 * Tests for the async migration codemod
 * 
 * Run with: node codemods/__tests__/async-migration.test.js
 */

const fs = require('fs');
const path = require('path');
const jscodeshift = require('jscodeshift');
const transform = require('../async-migration.js');

function applyTransform(source) {
  const api = {
    jscodeshift: jscodeshift.withParser('babel'),
  };
  return transform({ path: 'test.js', source }, api) || source;
}

function test(name, input, expected) {
  const result = applyTransform(input);
  const passed = result.trim() === expected.trim();
  
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
    this.get('/users', async (schema) => {
      return await schema.users.all();
    });
  },
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
    this.get('/users', async (schema) => {
      return await schema.db.users.find(1);
    });
  },
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
    this.get('/users', async (schema) => await schema.users.all());
  },
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
    this.get('/users', async (schema) => await schema.users.all());
  },
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

// Test 11: Module callback should become async but QUnit module() should not be awaited
test(
  'makes module callback async when it contains async hooks',
  `
module('Acceptance | test', function(hooks) {
  hooks.beforeEach(function() {
    this.user = this.server.create('user');
  });
});
  `.trim(),
  `
module('Acceptance | test', async function(hooks) {
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
afterCreate(run, server) {
  const lastEvent = run.runEvents.models.get('lastObject');
}
  `.trim(),
  `
async afterCreate(run, server) {
  const lastEvent = (await (await run.runEvents).models).get('lastObject');
}
  `.trim()
);

// Test 13: Association .models with array index
test(
  'transforms association.models[index] with double await',
  `
afterCreate(project, server) {
  const first = project.runs.models[0];
}
  `.trim(),
  `
async afterCreate(project, server) {
  const first = (await (await project.runs).models)[0];
}
  `.trim()
);

// Test 14: Association .models with .firstObject
test(
  'transforms association.models.firstObject with double await',
  `
afterCreate(project, server) {
  const first = project.runs.models.firstObject;
}
  `.trim(),
  `
async afterCreate(project, server) {
  const first = (await (await project.runs).models).firstObject;
}
  `.trim()
);

// Test 15: Awaited where() with .models should only await once
test(
  'does not double-await .models after awaited CallExpression',
  `
const projects = server.schema.projects.where({ active: true }).models;
  `.trim(),
  `
const projects = (await server.schema.projects.where({ active: true })).models;
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
    }
  })
});
  `.trim()
);

// Test 20: Model instance methods (save, update, destroy)
test(
  'transforms model instance methods',
  `
afterCreate(user, server) {
  user.update({ verified: true });
  user.save();
}
  `.trim(),
  `
async afterCreate(user, server) {
  await user.update({ verified: true });
  await user.save();
}
  `.trim()
);

// Test 21: Scenario function with server parameter
test(
  'transforms scenario functions',
  `
scenarios: {
  default(server) {
    server.create('user');
    server.createList('post', 10);
  }
}
  `.trim(),
  `
scenarios: {
  async default(server) {
    await server.create('user');
    await server.createList('post', 10);
  }
}
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
this.get('/users', async (schemas) => {
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
afterCreate(project, server) {
  project.latestRun.apply.update({ status: 'applied' });
}
  `.trim(),
  `
async afterCreate(project, server) {
  await project.latestRun.apply.update({ status: 'applied' });
}
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
this.get('/users', async (schema) => await schema.users.all());
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
afterCreate(project, server) {
  project.runs.models.forEach(run => {
    console.log(run.id);
  });
}
  `.trim(),
  `
async afterCreate(project, server) {
  (await (await project.runs).models).forEach(run => {
    console.log(run.id);
  });
}
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

// Test 46: Factory afterCreate with server.create passed to model.update (Atlas error pattern)
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

// Test 47: Factory afterCreate with multiple creates and updates (complex Atlas pattern)
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

// Test 48: Factory afterCreate with server.create result directly in update (inline pattern)
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

// Test 49: Trait afterCreate with unawaited server.create passed to model.update
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

// Test 50: Factory afterCreate creating HasMany relationship records
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

console.log('\n✅ All tests completed!');
