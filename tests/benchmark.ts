/**
 * Benchmark: measures re-parse times on fixture files.
 * Warns if average parse time exceeds 50ms.
 *
 * Run with: npx ts-node --project server/tsconfig.json tests/benchmark.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { parseBisonDocument } from '../server/src/parser/bisonParser';
import { parseFlexDocument } from '../server/src/parser/flexParser';

const ITERATIONS = 100;
const THRESHOLD_MS = 50;

interface BenchResult {
  file: string;
  iterations: number;
  min: number;
  max: number;
  avg: number;
  warn: boolean;
}

function benchmarkParse(filePath: string, parser: (text: string) => unknown): BenchResult {
  const text = fs.readFileSync(filePath, 'utf-8');
  const name = path.basename(filePath);
  const times: number[] = [];

  // Warm-up: 5 iterations
  for (let i = 0; i < 5; i++) {
    parser(text);
  }

  // Measured runs
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    parser(text);
    const end = performance.now();
    times.push(end - start);
  }

  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;

  return { file: name, iterations: ITERATIONS, min, max, avg, warn: avg > THRESHOLD_MS };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nBenchmark: ${ITERATIONS} iterations per file, threshold = ${THRESHOLD_MS}ms\n`);
console.log('─'.repeat(70));

const fixtureDir = path.resolve(__dirname, 'fixtures');
const bisonFiles = ['calc.y', 'json.y', 'sql.y'];
const flexFiles = ['calc.l', 'json.l', 'sql.l'];

let hasWarning = false;
const results: BenchResult[] = [];

for (const file of bisonFiles) {
  const filePath = path.join(fixtureDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(`  [SKIP] ${file} not found`);
    continue;
  }
  const result = benchmarkParse(filePath, parseBisonDocument);
  results.push(result);
}

for (const file of flexFiles) {
  const filePath = path.join(fixtureDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(`  [SKIP] ${file} not found`);
    continue;
  }
  const result = benchmarkParse(filePath, parseFlexDocument);
  results.push(result);
}

// Print results table
const colFile = 14;
const colNum = 10;

console.log(
  'File'.padEnd(colFile) +
  'Min (ms)'.padStart(colNum) +
  'Max (ms)'.padStart(colNum) +
  'Avg (ms)'.padStart(colNum) +
  '  Status'
);
console.log('─'.repeat(70));

for (const r of results) {
  const status = r.warn ? '⚠ SLOW' : '✓ OK';
  console.log(
    r.file.padEnd(colFile) +
    r.min.toFixed(2).padStart(colNum) +
    r.max.toFixed(2).padStart(colNum) +
    r.avg.toFixed(2).padStart(colNum) +
    `  ${status}`
  );
  if (r.warn) hasWarning = true;
}

console.log('─'.repeat(70));

if (hasWarning) {
  console.log(`\n⚠ WARNING: One or more files exceeded the ${THRESHOLD_MS}ms threshold.\n`);
  process.exit(1);
} else {
  console.log(`\n✓ All files parsed under ${THRESHOLD_MS}ms average.\n`);
  process.exit(0);
}
