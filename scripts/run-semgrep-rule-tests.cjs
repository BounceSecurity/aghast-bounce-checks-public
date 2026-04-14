/**
 * Runs Semgrep rule unit tests across all check folders under checks/.
 *
 * Each check folder may contain a <id>.yaml rule and tests/ directory.
 * For each such folder, runs: semgrep --test --config <folder> <tests/>
 *
 * For YAML-language rules, semgrep --test cannot distinguish rule files from
 * target files, so we fall back to running the rule directly against test files
 * and validating findings against # ruleid: / # ok: annotations.
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

const checkFlag = process.argv.indexOf('--check');
const filterCheck = checkFlag !== -1 ? process.argv[checkFlag + 1] : null;

const checkFolders = fs.readdirSync(checksDir).filter(name => {
  if (filterCheck && name !== filterCheck) return false;
  const folderPath = path.join(checksDir, name);
  return fs.statSync(folderPath).isDirectory();
});

/**
 * Checks whether a Semgrep rule file targets the YAML language.
 */
function isYamlRule(rulePath) {
  const content = fs.readFileSync(rulePath, 'utf8');
  // Match both inline [yaml] and multi-line list format
  return /languages:\s*\[yaml\]/.test(content) ||
    /languages:\s*\n\s*-\s*yaml\b/.test(content);
}

/**
 * Parses # ruleid: and # ok: annotations from a YAML test file.
 * Returns { expectedFindings: Set<lineNumber>, expectedPasses: Set<lineNumber> }
 * where lineNumber is the line AFTER the annotation (the matched content line).
 */
function parseAnnotations(testFilePath, ruleId) {
  const lines = fs.readFileSync(testFilePath, 'utf8').split('\n');
  const expectedFindings = new Set();
  const expectedPasses = new Set();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Annotation applies to the next non-comment, non-blank line
    const ruleIdPattern = new RegExp(`#\\s*ruleid:\\s*${ruleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    const okPattern = new RegExp(`#\\s*ok:\\s*${ruleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

    if (ruleIdPattern.test(trimmed)) {
      // Find the next non-comment, non-blank line
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next && !next.startsWith('#')) {
          expectedFindings.add(j + 1); // 1-indexed
          break;
        }
      }
    } else if (okPattern.test(trimmed)) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next && !next.startsWith('#')) {
          expectedPasses.add(j + 1);
          break;
        }
      }
    }
  }

  return { expectedFindings, expectedPasses };
}

/**
 * Runs a YAML-language rule directly and validates against annotations.
 * Returns true if all assertions pass, false otherwise.
 */
function runYamlRuleTest(folder, rulePath, testsPath) {
  const testFiles = fs.readdirSync(testsPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  if (testFiles.length === 0) {
    console.error(`  No YAML test files found in ${testsPath}`);
    return false;
  }

  let allPassed = true;

  for (const testFile of testFiles) {
    const testFilePath = path.join(testsPath, testFile);
    const { expectedFindings, expectedPasses } = parseAnnotations(testFilePath, folder);

    if (expectedFindings.size === 0 && expectedPasses.size === 0) {
      console.error(`  No annotations found in ${testFile}`);
      allPassed = false;
      continue;
    }

    // Run semgrep and collect findings
    let results;
    try {
      const output = execSync(
        `semgrep --config "${rulePath}" "${testFilePath}" --json --no-git-ignore`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      results = JSON.parse(output);
    } catch (e) {
      // semgrep exits non-zero when findings exist; output is still on stdout
      if (e.stdout) {
        try {
          results = JSON.parse(e.stdout);
        } catch {
          console.error(`  Failed to parse Semgrep JSON output for ${testFile}`);
          allPassed = false;
          continue;
        }
      } else {
        console.error(`  Semgrep execution failed for ${testFile}: ${e.message}`);
        allPassed = false;
        continue;
      }
    }

    const foundLines = new Set(results.results.map(r => r.start.line));

    // Check that all expected findings were found
    let fileOk = true;
    for (const line of expectedFindings) {
      if (!foundLines.has(line)) {
        console.error(`  FAIL: Expected finding at ${testFile}:${line} (ruleid) but none found`);
        fileOk = false;
      }
    }

    // Check that ok-annotated lines were NOT found
    for (const line of expectedPasses) {
      if (foundLines.has(line)) {
        console.error(`  FAIL: Unexpected finding at ${testFile}:${line} (marked ok)`);
        fileOk = false;
      }
    }

    if (fileOk) {
      console.log(`  ${expectedFindings.size} finding(s) matched, ${expectedPasses.size} ok(s) verified`);
    } else {
      allPassed = false;
    }
  }

  return allPassed;
}

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

  if (isYamlRule(rulePath)) {
    console.log('  (YAML-language rule: using direct validation)');
    if (!runYamlRuleTest(folder, rulePath, testsPath)) {
      failed++;
    }
  } else {
    try {
      execSync(`semgrep --test --config "${folderPath}" "${testsPath}"`, {
        stdio: 'inherit',
      });
    } catch {
      failed++;
    }
  }
}

if (tested === 0) {
  console.log('No Semgrep rule tests found.');
  process.exit(0);
}

console.log(`\n=== ${tested} check(s) tested, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
