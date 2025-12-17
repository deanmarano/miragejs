const fs = require('fs');

const filePath = '__tests__/internal/unit/server-test.js';
let content = fs.readFileSync(filePath, 'utf8');

// Pattern 1: Make test functions async if they contain server.create/build/createList/buildList
content = content.replace(
  /test\(["']([^"']+)["'], function \(\) {/g,
  'test("$1", async function () {'
);

content = content.replace(
  /test\(["']([^"']+)["'], \(\) => {/g,
  'test("$1", async () => {'
);

// Pattern 2: Add await before server.create calls
content = content.replace(
  /(\s+)(let|const|var) (\w+) = server\.(create|build|createList|buildList)\(/g,
  '$1$2 $3 = await server.$4('
);

// Pattern 3: Add await before server.create without assignment
content = content.replace(
  /(\s+)server\.(create|createList)\(/g,
  '$1await server.$2('
);

// Pattern 4: Add await in expect statements
content = content.replace(
  /expect\(server\.(create|build|createList|buildList)\(/g,
  'expect(await server.$1('
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed server-test.js');
