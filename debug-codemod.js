const transform = require('./codemods/async-migration.cjs');
const jscodeshift = require('jscodeshift');

const input = `export function filter({ projectV2s }) {
  let projects = projectV2s.all();
  projects = projects.filter(async project => {
    return project.isActive === true;
  });
  return projects;
}`;

// Patch the transform to add logging
const originalTransform = transform.toString();
console.log('Running transform...\n');

const api = { jscodeshift: jscodeshift.withParser('babel') };
const result = transform({ path: 'test.js', source: input }, api);

console.log('\n===RESULT===');
console.log(result);
console.log('\n===END===');
