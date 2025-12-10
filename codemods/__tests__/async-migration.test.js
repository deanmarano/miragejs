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

console.log('\n✅ All tests completed!');
