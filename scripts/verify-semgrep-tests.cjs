/**
 * Verifies that every check folder with a <id>.yaml rule also has a tests/ directory
 * containing at least one test file.
 *
 * Exit 0 if all rules have tests, exit 1 if any are missing.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const checksDir = path.resolve(__dirname, '..', 'checks');

if (!fs.existsSync(checksDir)) {
  console.log('No checks directory found.');
  process.exit(0);
}

const checkFolders = fs.readdirSync(checksDir).filter(name => {
  const folderPath = path.join(checksDir, name);
  return fs.statSync(folderPath).isDirectory();
});

const rulesWithoutTests = [];
let ruleCount = 0;

for (const folder of checkFolders) {
  const folderPath = path.join(checksDir, folder);
  const rulePath = path.join(folderPath, folder + '.yaml');

  if (!fs.existsSync(rulePath)) {
    continue;
  }

  ruleCount++;
  const testsPath = path.join(folderPath, 'tests');

  if (!fs.existsSync(testsPath) || fs.readdirSync(testsPath).length === 0) {
    rulesWithoutTests.push(folder);
  }
}

if (ruleCount === 0) {
  console.log('No Semgrep rules found.');
  process.exit(0);
}

if (rulesWithoutTests.length > 0) {
  console.error('Check folders with Semgrep rules missing test files:');
  rulesWithoutTests.forEach(f => console.error('  - ' + f));
  process.exit(1);
}

console.log('All ' + ruleCount + ' Semgrep rules have corresponding test files.');
