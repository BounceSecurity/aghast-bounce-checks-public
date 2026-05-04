/**
 * Regression test runner for aghast security checks (core / CI-ready).
 *
 * Non-interactive runner that scans test codebases and compares results
 * against expected-results JSON files in _ai-finding-notes/.
 *
 * Usage (standalone):
 *   npx tsx scripts/regression-test.ts                                   (run all enabled checks)
 *   npx tsx scripts/regression-test.ts --dry-run                         (show what would run)
 *   npx tsx scripts/regression-test.ts --static-only                     (static checks only, no API key)
 *   npx tsx scripts/regression-test.ts --codebase test-9-sast-false-positives
 *   npx tsx scripts/regression-test.ts --agent-provider opencode --model opencode/big-pickle
 *   npx tsx scripts/regression-test.ts --log-level debug
 *   npx tsx scripts/regression-test.ts --installed                       (use globally installed aghast)
 *
 * This module also exports core functions for use by wrapper scripts
 * (e.g. the private checks-config regression-test that adds interactive features).
 */

import { execSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Types ---

export interface ExpectedResult {
  checkId: string;
  codebase: string;
  expectedStatus: string;
  expectedFindingCount: number;
  findings: ExpectedFinding[];
}

export interface ExpectedFinding {
  file: string;
  startLine: number;
  lineTolerance?: number;
}

export interface ScanResults {
  checks: CheckResult[];
  issues: ActualIssue[];
  agentProvider?: { models: string[] };
}

export interface CheckResult {
  checkId: string;
  status: string;
  issuesFound: number;
}

export interface ActualIssue {
  checkId: string;
  file: string;
  startLine: number;
  endLine: number;
  description: string;
}

export interface ComparisonResult {
  checkId: string;
  codebase: string;
  statusPass: boolean;
  actualStatus: string;
  expectedStatus: string;
  countPass: boolean;
  actualCount: number;
  expectedCount: number;
  locationResults: LocationResult[];
  error?: string;
}

export interface LocationResult {
  type: 'matched' | 'missing' | 'unexpected';
  file: string;
  actualLine?: number;
  expectedLine?: number;
  tolerance?: number;
}

// --- Runner Configuration ---

export interface RegressionConfig {
  /** Directory containing checks-config.json, checks/, test-codebases/ */
  configDir: string;
  /** Directory containing the aghast scanner source (parent of configDir by default) */
  scannerDir: string;
  /** Directory containing _ai-finding-notes/ subdirectories */
  findingNotesDir: string;
  /** Temp directory for scan output */
  tmpDir: string;
  /** Use globally installed aghast binary instead of local source */
  useInstalled: boolean;
  /** Agent provider override (e.g. 'opencode') */
  agentProvider?: string;
  /** Model override (e.g. 'opencode/big-pickle') */
  modelOverride?: string;
  /** Log level to pass to scanner */
  logLevel?: string;
  /** Run only this codebase */
  codebaseFilter?: string;
  /** Run only static checks (no AI) */
  staticOnly: boolean;
  /** Show what would run without scanning */
  dryRun: boolean;
}

/** Results returned from runRegressionTest(). */
export interface RunResult {
  results: ComparisonResult[];
  passed: ComparisonResult[];
  failed: ComparisonResult[];
  modelsUsed: string[];
  durationSeconds: string;
}

// --- Constants ---

const DEFAULT_TOLERANCE = 10;

// --- Helpers ---

export function loadJSON<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function loadExpectedResults(findingNotesDir: string): ExpectedResult[] {
  if (!existsSync(findingNotesDir)) {
    console.error(`Finding notes directory not found: ${findingNotesDir}`);
    process.exit(1);
  }

  const results: ExpectedResult[] = [];
  const codebaseDirs = readdirSync(findingNotesDir, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const dir of codebaseDirs) {
    const dirPath = join(findingNotesDir, dir.name);
    const jsonFiles = readdirSync(dirPath).filter(f => f.endsWith('.json'));
    for (const file of jsonFiles) {
      try {
        results.push(loadJSON<ExpectedResult>(join(dirPath, file)));
      } catch (err) {
        console.error(`ERROR: Failed to parse ${dir.name}/${file}: ${err}`);
      }
    }
  }

  if (results.length === 0) {
    console.error('No expected-results JSON files found.');
    process.exit(1);
  }

  return results;
}

export function loadChecksConfig(configDir: string): { checks: Array<{ id: string; repositories: string[]; enabled?: boolean }> } {
  return loadJSON(join(configDir, 'checks-config.json'));
}

export function isStaticCheck(configDir: string, checkId: string): boolean {
  const defPath = join(configDir, 'checks', checkId, `${checkId}.json`);
  try {
    const def = loadJSON<{ checkTarget?: { type?: string } }>(defPath);
    return def.checkTarget?.type === 'static';
  } catch {
    return false;
  }
}

export function allChecksStatic(configDir: string, checkIds: string[]): boolean {
  return checkIds.length > 0 && checkIds.every(id => isStaticCheck(configDir, id));
}

export type CheckType = 'static' | 'targeted-semgrep' | 'targeted-sarif' | 'targeted-openant' | 'targeted-diff-semgrep' | 'repository';

export function resolveCheckType(def: { checkTarget?: { type?: string; discovery?: string } }): CheckType {
  const type = def.checkTarget?.type;
  const discovery = def.checkTarget?.discovery;
  if (type === 'static') return 'static';
  if (type === 'targeted') {
    if (discovery === 'sarif') return 'targeted-sarif';
    if (discovery === 'openant') return 'targeted-openant';
    if (discovery === 'diff-semgrep') return 'targeted-diff-semgrep';
    return 'targeted-semgrep';
  }
  return 'repository';
}

export function getCheckType(configDir: string, checkId: string): CheckType {
  const defPath = join(configDir, 'checks', checkId, `${checkId}.json`);
  try {
    const def = loadJSON<{ checkTarget?: { type?: string; discovery?: string } }>(defPath);
    return resolveCheckType(def);
  } catch {
    return 'repository';
  }
}

export function getSarifFilePath(configDir: string, checkId: string): string | undefined {
  const checkDir = join(configDir, 'checks', checkId);
  try {
    const files = readdirSync(checkDir).filter(f => f.endsWith('.sarif'));
    return files.length > 0 ? join(checkDir, files[0]) : undefined;
  } catch {
    return undefined;
  }
}

export function getDatasetFilePath(codebasePath: string): string | undefined {
  const base = join(codebasePath, 'dataset.json');
  if (existsSync(base)) return base;
  const enhanced = join(codebasePath, 'dataset_enhanced.json');
  if (existsSync(enhanced)) return enhanced;
  return undefined;
}

export function getDiffFilePath(codebasePath: string): string | undefined {
  const diffFile = join(codebasePath, 'example.diff');
  if (existsSync(diffFile)) return diffFile;
  return undefined;
}

/** Quote a shell argument if it contains spaces or special characters. */
export function shellQuote(arg: string): string {
  if (/^[\w.:/\\=-]+$/.test(arg)) return arg;
  if (process.platform === 'win32') {
    return `"${arg.replace(/"/g, '\\"').replace(/%/g, '%%')}"`;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Uses spawn (shell command string) instead of execSync because:
// - We need to kill the entire process tree on timeout. execSync's `timeout` option
//   on Windows only kills the spawned cmd.exe — child processes (npm, tsx, opencode
//   server, AI workers) survive as orphans, leak logs into subsequent scans, and
//   may exhaust API quota.
// - Shell is required: execFileSync cannot execute npm on Windows (.cmd files
//   require a shell), and execFileSync with shell:true + args array triggers
//   DEP0190 in Node.js 22+.
export async function runScan(
  config: RegressionConfig,
  codebasePath: string,
  outputPath: string,
  options?: { modelOverride?: string; mockAi?: boolean; sarifFile?: string; datasetFile?: string; diffFile?: string },
): Promise<{ success: boolean; error: string }> {
  const args = config.useInstalled
    ? [
        'aghast', 'scan',
        codebasePath,
        '--config-dir', config.configDir,
        '--output', outputPath,
        '--output-format', 'json',
      ]
    : [
        'npm', '--prefix', config.scannerDir, 'run',
        'scan', '--',
        codebasePath,
        '--config-dir', config.configDir,
        '--output', outputPath,
        '--output-format', 'json',
      ];

  if (options?.sarifFile) {
    args.push('--sarif-file', options.sarifFile);
  }

  if (options?.diffFile) {
    args.push('--diff-file', options.diffFile);
  }

  if (config.agentProvider) {
    args.push('--agent-provider', config.agentProvider);
  }

  if (config.modelOverride) {
    args.push('--model', config.modelOverride);
  }

  if (config.logLevel) {
    args.push('--log-level', config.logLevel);
  }

  const env = { ...process.env };
  if (options?.modelOverride) {
    env.AGHAST_AI_MODEL = options.modelOverride;
  }
  if (options?.mockAi) {
    env.AGHAST_MOCK_AI = 'true';
  }
  if (options?.datasetFile) {
    env.AGHAST_OPENANT_DATASET = options.datasetFile;
  }

  const cmd = args.map(shellQuote).join(' ');
  const TIMEOUT_MS = 600_000;

  const child = spawn(cmd, {
    cwd: config.scannerDir,
    env,
    shell: true,
    stdio: ['pipe', 'inherit', 'inherit'],
    // detached on POSIX puts the child in its own process group so we can signal
    // the whole group via kill(-pid). On Windows we use taskkill /T /F instead.
    detached: process.platform !== 'win32',
  });

  let timedOut = false;
  const killTree = () => {
    if (child.pid === undefined) return;
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // Tree may already be gone.
      }
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Group may already be gone.
      }
    }
  };

  const timer = setTimeout(() => {
    timedOut = true;
    killTree();
  }, TIMEOUT_MS);

  return new Promise((resolveResult) => {
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        resolveResult({ success: false, error: `Scan timed out after ${TIMEOUT_MS / 1000}s; killed process tree` });
      } else if (code === 0) {
        resolveResult({ success: true, error: '' });
      } else {
        resolveResult({ success: false, error: `Scan exited with code ${code ?? signal}` });
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolveResult({ success: false, error: err.message });
    });
  });
}

export function matchLocations(
  expected: ExpectedFinding[],
  actual: ActualIssue[],
): LocationResult[] {
  const results: LocationResult[] = [];
  const usedActual = new Set<number>();

  // Greedy bipartite match: for each expected finding, find best matching actual
  for (const exp of expected) {
    const tolerance = exp.lineTolerance ?? DEFAULT_TOLERANCE;
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < actual.length; i++) {
      if (usedActual.has(i)) continue;

      const act = actual[i];
      if (act.file !== exp.file) continue;

      const dist = Math.abs(act.startLine - exp.startLine);
      if (dist <= tolerance && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      usedActual.add(bestIdx);
      results.push({
        type: 'matched',
        file: exp.file,
        actualLine: actual[bestIdx].startLine,
        expectedLine: exp.startLine,
        tolerance,
      });
    } else {
      results.push({
        type: 'missing',
        file: exp.file,
        expectedLine: exp.startLine,
        tolerance,
      });
    }
  }

  // Report unexpected actual findings (not matched to any expected)
  for (let i = 0; i < actual.length; i++) {
    if (!usedActual.has(i)) {
      results.push({
        type: 'unexpected',
        file: actual[i].file,
        actualLine: actual[i].startLine,
      });
    }
  }

  return results;
}

export function compareResults(
  expected: ExpectedResult,
  scanResults: ScanResults,
): ComparisonResult {
  const checkResult = scanResults.checks.find(c => c.checkId === expected.checkId);

  if (!checkResult) {
    return {
      checkId: expected.checkId,
      codebase: expected.codebase,
      statusPass: false,
      actualStatus: 'NOT RUN',
      expectedStatus: expected.expectedStatus,
      countPass: false,
      actualCount: 0,
      expectedCount: expected.expectedFindingCount,
      locationResults: [],
      error: `Check ${expected.checkId} not found in scan results`,
    };
  }

  const statusPass = checkResult.status === expected.expectedStatus;
  const countPass = checkResult.issuesFound === expected.expectedFindingCount;
  const checkIssues = (scanResults.issues ?? []).filter(i => i.checkId === expected.checkId);
  const locationResults = matchLocations(expected.findings, checkIssues);

  return {
    checkId: expected.checkId,
    codebase: expected.codebase,
    statusPass,
    actualStatus: checkResult.status,
    expectedStatus: expected.expectedStatus,
    countPass,
    actualCount: checkResult.issuesFound,
    expectedCount: expected.expectedFindingCount,
    locationResults,
  };
}

export function isComparisonPass(result: ComparisonResult): boolean {
  if (result.error) return false;
  if (!result.statusPass) return false;
  if (!result.countPass) return false;
  return result.locationResults.every(r => r.type === 'matched');
}

// --- Output formatting ---

export function printResult(result: ComparisonResult): void {
  console.log(`  ${result.checkId}:`);

  if (result.error) {
    console.log(`    ERROR: ${result.error}`);
    console.log(`    RESULT: FAIL`);
    return;
  }

  const statusTag = result.statusPass ? 'OK' : 'MISMATCH';
  console.log(`    Status:   ${result.actualStatus} (expected ${result.expectedStatus})${' '.repeat(Math.max(0, 30 - result.actualStatus.length - result.expectedStatus.length))}${statusTag}`);

  const countTag = result.countPass ? 'OK' : 'MISMATCH';
  console.log(`    Findings: ${result.actualCount} (expected ${result.expectedCount})${' '.repeat(Math.max(0, 30 - String(result.actualCount).length - String(result.expectedCount).length))}${countTag}`);

  if (result.locationResults.length > 0) {
    console.log('    Locations:');
    for (const loc of result.locationResults) {
      if (loc.type === 'matched') {
        const tolerance = loc.actualLine !== loc.expectedLine ? `  (tolerance ±${loc.tolerance})` : '';
        console.log(`      ${`${loc.file}:${loc.actualLine}`.padEnd(45)} ~ expected :${loc.expectedLine}  OK${tolerance}`);
      } else if (loc.type === 'missing') {
        console.log(`      MISSING: ${loc.file.padEnd(38)} ~ expected :${loc.expectedLine}  FAIL`);
      } else {
        console.log(`      UNEXPECTED: ${loc.file}:${loc.actualLine}  FAIL`);
      }
    }
  }

  console.log(`    RESULT: ${isComparisonPass(result) ? 'PASS' : 'FAIL'}`);
}

// --- Argument parsing ---

function parseArgValue(argv: string[], flag: string, label: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx < 0) return undefined;
  if (idx + 1 >= argv.length || argv[idx + 1].startsWith('--')) {
    console.error(`ERROR: ${flag} requires a value (e.g. ${flag} ${label})`);
    process.exit(1);
  }
  return argv[idx + 1];
}

export function parseConfig(argv: string[], configDir: string): RegressionConfig {
  const scannerDir = resolve(configDir, '..');
  return {
    configDir,
    scannerDir,
    findingNotesDir: resolve(configDir, 'test-codebases', '_ai-finding-notes'),
    tmpDir: resolve(configDir, 'tmp', 'regression'),
    useInstalled: argv.includes('--installed'),
    agentProvider: parseArgValue(argv, '--agent-provider', 'opencode'),
    modelOverride: parseArgValue(argv, '--model', 'opencode/big-pickle'),
    logLevel: parseArgValue(argv, '--log-level', 'debug'),
    codebaseFilter: parseArgValue(argv, '--codebase', 'test-9-sast-false-positives'),
    staticOnly: argv.includes('--static-only'),
    dryRun: argv.includes('--dry-run'),
  };
}

// --- Core scan runner ---

export async function runCodebaseScan(
  config: RegressionConfig,
  allResults: Map<string, ComparisonResult>,
  modelsUsed: string[],
  codebase: string,
  expectations: ExpectedResult[],
  label: string,
  modelOverride?: string,
): Promise<void> {
  const codebasePath = resolve(config.configDir, 'test-codebases', codebase);
  const outputPath = join(config.tmpDir, `${codebase}.json`);

  const checkIds = expectations.map(e => e.checkId);
  const staticOnly = allChecksStatic(config.configDir, checkIds);
  const checkNames = checkIds.join(', ');
  const modelTag = modelOverride ? ` [model: ${modelOverride}]` : '';
  const semgrepTag = staticOnly ? ' [static]' : '';
  console.log(`--- ${label} ${codebase} (${checkNames})${modelTag}${semgrepTag} ---\n`);

  if (!existsSync(codebasePath)) {
    console.log(`  ERROR: Codebase not found: ${codebasePath}\n`);
    for (const exp of expectations) {
      allResults.set(`${exp.codebase}/${exp.checkId}`, {
        checkId: exp.checkId,
        codebase: exp.codebase,
        statusPass: false,
        actualStatus: 'ERROR',
        expectedStatus: exp.expectedStatus,
        countPass: false,
        actualCount: 0,
        expectedCount: exp.expectedFindingCount,
        locationResults: [],
        error: `Codebase directory not found: ${codebasePath}`,
      });
    }
    return;
  }

  // Detect targeted-sarif checks and resolve the SARIF file path
  const sarifVerifyCheck = checkIds.find(id => getCheckType(config.configDir, id) === 'targeted-sarif');
  const sarifFile = sarifVerifyCheck ? getSarifFilePath(config.configDir, sarifVerifyCheck) : undefined;

  // Detect targeted-openant checks and resolve the dataset file path
  const openantCheck = checkIds.find(id => getCheckType(config.configDir, id) === 'targeted-openant');
  const datasetFile = openantCheck ? getDatasetFilePath(codebasePath) : undefined;

  // Detect targeted-diff-semgrep checks and resolve the diff + dataset file paths
  const diffSemgrepCheck = checkIds.find(id => getCheckType(config.configDir, id) === 'targeted-diff-semgrep');
  const diffFile = diffSemgrepCheck ? getDiffFilePath(codebasePath) : undefined;
  const diffDatasetFile = diffSemgrepCheck ? getDatasetFilePath(codebasePath) : undefined;

  const scanStart = Date.now();
  const { success, error } = await runScan(config, codebasePath, outputPath, {
    modelOverride,
    mockAi: staticOnly,
    sarifFile,
    datasetFile: datasetFile ?? diffDatasetFile,
    diffFile,
  });
  const scanDuration = ((Date.now() - scanStart) / 1000).toFixed(1);

  if (!success) {
    console.log(`\n  --- Regression comparison (${scanDuration}s) ---`);
    console.log(`  ERROR: Scan failed`);
    if (error) console.log(`  Detail: ${error.slice(0, 500)}`);
    console.log();
    for (const exp of expectations) {
      allResults.set(`${exp.codebase}/${exp.checkId}`, {
        checkId: exp.checkId,
        codebase: exp.codebase,
        statusPass: false,
        actualStatus: 'ERROR',
        expectedStatus: exp.expectedStatus,
        countPass: false,
        actualCount: 0,
        expectedCount: exp.expectedFindingCount,
        locationResults: [],
        error: `Scan failed: ${error.slice(0, 200)}`,
      });
    }
    return;
  }

  console.log(`\n  --- Regression comparison (${scanDuration}s) ---`);

  let scanResults: ScanResults;
  try {
    scanResults = loadJSON<ScanResults>(outputPath);
  } catch (err) {
    console.log(`  ERROR: Failed to parse scan output: ${err}\n`);
    for (const exp of expectations) {
      allResults.set(`${exp.codebase}/${exp.checkId}`, {
        checkId: exp.checkId,
        codebase: exp.codebase,
        statusPass: false,
        actualStatus: 'ERROR',
        expectedStatus: exp.expectedStatus,
        countPass: false,
        actualCount: 0,
        expectedCount: exp.expectedFindingCount,
        locationResults: [],
        error: `Failed to parse scan output`,
      });
    }
    return;
  }

  // Track models used
  if (scanResults.agentProvider?.models) {
    for (const m of scanResults.agentProvider.models) {
      if (!modelsUsed.includes(m)) modelsUsed.push(m);
    }
  }

  // Compare each expected result
  for (const exp of expectations) {
    const comparison = compareResults(exp, scanResults);
    allResults.set(`${exp.codebase}/${exp.checkId}`, comparison);
    printResult(comparison);
    console.log();
  }
}

// --- Main regression test flow (non-interactive) ---

export async function runRegressionTest(config: RegressionConfig): Promise<RunResult> {
  const startTime = Date.now();

  console.log('=== aghast Regression Test ===\n');

  // Preflight checks
  if (config.useInstalled) {
    try {
      execSync('aghast --version', { stdio: 'pipe' });
    } catch {
      console.error('ERROR: aghast binary not found. Install with: npm install -g @bouncesecurity/aghast');
      process.exit(1);
    }
    console.log('Using globally installed aghast binary.\n');
  } else if (!existsSync(join(config.scannerDir, 'package.json'))) {
    console.error(`ERROR: aghast scanner not found at ${config.scannerDir}`);
    console.error('The checks repo must be inside the aghast repo root.');
    process.exit(1);
  }

  if (process.env.AGHAST_MOCK_AI) {
    console.log('NOTE: Running with AGHAST_MOCK_AI — results will not reflect real AI analysis.\n');
  }

  // Load expected results
  const allExpected = loadExpectedResults(config.findingNotesDir);
  console.log(`Loaded ${allExpected.length} expected-results files.\n`);

  // Load config to discover codebases
  const checksConfig = loadChecksConfig(config.configDir);
  const enabledChecks = checksConfig.checks.filter(c => c.enabled !== false);

  // Group expected results by codebase
  const byCodebase = new Map<string, ExpectedResult[]>();
  for (const exp of allExpected) {
    const checkConfig = enabledChecks.find(c => c.id === exp.checkId);
    if (!checkConfig) {
      console.log(`SKIP: ${exp.checkId} -- ${exp.codebase} (check disabled or not in config)\n`);
      continue;
    }
    if (config.staticOnly && !isStaticCheck(config.configDir, exp.checkId)) {
      console.log(`SKIP: ${exp.checkId} -- ${exp.codebase} (not static)\n`);
      continue;
    }
    if (config.codebaseFilter && exp.codebase !== config.codebaseFilter) {
      console.log(`SKIP: ${exp.checkId} -- ${exp.codebase} (codebase filter)\n`);
      continue;
    }
    const list = byCodebase.get(exp.codebase) ?? [];
    list.push(exp);
    byCodebase.set(exp.codebase, list);
  }

  if (config.codebaseFilter && byCodebase.size === 0) {
    console.error(`ERROR: No expected results matched --codebase "${config.codebaseFilter}".`);
    console.error('Available codebases:');
    const allCodebases = [...new Set(allExpected.map(e => e.codebase))].sort();
    for (const cb of allCodebases) {
      console.error(`  ${cb}`);
    }
    process.exit(1);
  }

  if (config.dryRun) {
    console.log('--- DRY RUN ---\n');
    for (const [codebase, expectations] of byCodebase) {
      console.log(`Would scan: test-codebases/${codebase}`);
      for (const exp of expectations) {
        console.log(`  Check: ${exp.checkId} (expect ${exp.expectedStatus}, ${exp.expectedFindingCount} findings)`);
      }
    }
    console.log('\nDry run complete — no scans executed.');
    return { results: [], passed: [], failed: [], modelsUsed: [], durationSeconds: '0' };
  }

  // Set up temp dir
  if (existsSync(config.tmpDir)) {
    rmSync(config.tmpDir, { recursive: true });
  }
  mkdirSync(config.tmpDir, { recursive: true });

  const allResults = new Map<string, ComparisonResult>();
  const modelsUsed: string[] = [];

  // --- Run scans ---
  let codebaseIdx = 0;
  const codebaseTotal = byCodebase.size;
  for (const [codebase, expectations] of byCodebase) {
    codebaseIdx++;
    await runCodebaseScan(config, allResults, modelsUsed, codebase, expectations, `[${codebaseIdx}/${codebaseTotal}]`);
  }

  // --- Summary ---
  const results = [...allResults.values()];
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed = results.filter(isComparisonPass);
  const failed = results.filter(r => !isComparisonPass(r));

  console.log('=== Summary ===');
  for (const r of results) {
    const tag = isComparisonPass(r) ? 'PASS' : 'FAIL';
    console.log(`  ${r.codebase} / ${r.checkId}: ${tag}`);
  }

  console.log(`\n${passed.length}/${results.length} checks passed (${totalDuration}s)`);
  console.log(`Overall: ${failed.length === 0 ? 'PASS' : 'FAIL'}`);

  // Cleanup temp dir
  rmSync(config.tmpDir, { recursive: true, force: true });

  return { results, passed, failed, modelsUsed, durationSeconds: totalDuration };
}

// --- Auto-run when executed directly ---

const thisFile = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(thisFile);

if (isMain) {
  const configDir = resolve(fileURLToPath(import.meta.url), '..', '..');
  const config = parseConfig(process.argv, configDir);

  runRegressionTest(config)
    .then(({ failed }) => {
      process.exit(failed.length === 0 ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
