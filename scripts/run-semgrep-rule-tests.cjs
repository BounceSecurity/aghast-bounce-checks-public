/**
 * Runs Semgrep rule unit tests across all check folders under checks/.
 *
 * Each check folder may contain a <id>.yaml rule and tests/ directory.
 * For each such folder, runs: semgrep --test --config <folder> <tests/>
 *
 * Exit 0 if all pass, exit 1 if any fail.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const checksDir = path.resolve(__dirname, '..', 'checks');

if (!fs.existsSync(checksDir)) {
  console.log('No checks directory found.');
  process.exit(0);
}

const checkFolders = fs.readdirSync(checksDir).filter(name => {
  const folderPath = path.join(checksDir, name);
  return fs.statSync(folderPath).isDirectory();
});

let tested = 0;
let failed = 0;

for (const folder of checkFolders) {
  const folderPath = path.join(checksDir, folder);
  const rulePath = path.join(folderPath, folder + '.yaml');
  const testsPath = path.join(folderPath, 'tests');

  if (!fs.existsSync(rulePath) || !fs.existsSync(testsPath)) {
    continue;
  }

  tested++;
  console.log(`\n--- Testing ${folder} ---`);

  try {
    execSync(`semgrep --test --config "${folderPath}" "${testsPath}"`, {
      stdio: 'inherit',
    });
  } catch {
    failed++;
  }
}

if (tested === 0) {
  console.log('No Semgrep rule tests found.');
  process.exit(0);
}

console.log(`\n=== ${tested} check(s) tested, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
