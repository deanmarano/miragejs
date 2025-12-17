/**
 * Tests for the async migration codemod
 * 
 * Run with: node codemods/__tests__/async-migration.test.js
 */

const fs = require('fs');
const path = require('path');
const jscodeshift = require('jscodeshift');
const transform = require('../async-migration.cjs');

function applyTransform(source) {
  const api = {
    jscodeshift: jscodeshift.withParser('babel'),
  };
  return transform({ path: 'test.js', source }, api) || source;
}

function test(name, input, expected) {
  const result = applyTransform(input);
  // Normalize whitespace, semicolons, and trailing commas for comparison
  const normalize = (str) => str.replace(/\s+/g, ' ').replace(/[;,]/g, '').trim();
  const passed = normalize(result) === normalize(expected);
  
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
    const lastEvent = (await (await run.runEvents).models).get('lastObject');
    return run;
  }
});
  `.trim()
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
    const first = (await (await project.runs).models)[0];
    return project;
  }
});
  `.trim()
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
    const first = (await (await project.runs).models).firstObject;
    return project;
  }
});
  `.trim()
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
    (await (await project.runs).models).forEach(run => {
      console.log(run.id);
    });
    return project;
  }
});
  `.trim()
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

console.log('\n✅ All tests completed!');
