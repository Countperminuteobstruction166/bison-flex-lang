/**
 * Integration test: exercises parsers, diagnostics, completion, and hover
 * against the real parsetiger.yy and scantiger.ll files.
 *
 * Run with: npx ts-node --project server/tsconfig.json test-parsers.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseBisonDocument } from '../server/src/parser/bisonParser';
import { parseFlexDocument } from '../server/src/parser/flexParser';
import { computeBisonDiagnostics, computeFlexDiagnostics } from '../server/src/providers/diagnostics';
import { bisonDirectiveDocs, bisonDefineDocs, flexDirectiveDocs, flexOptionDocs, flexBuiltinDocs } from '../server/src/providers/documentation';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

// ── Load real files ──
const bisonPath = path.resolve(__dirname, '../tiger-compiler/src/parse/parsetiger.yy');
const flexPath = path.resolve(__dirname, '../tiger-compiler/src/parse/scantiger.ll');

const bisonText = fs.existsSync(bisonPath) ? fs.readFileSync(bisonPath, 'utf-8') : '';
const flexText = fs.existsSync(flexPath) ? fs.readFileSync(flexPath, 'utf-8') : '';

// ════════════════════════════════════════
// TEST 1: Bison Parser
// ════════════════════════════════════════
console.log('\n=== TEST: Bison Parser (parsetiger.yy) ===\n');

if (!bisonText) {
  console.log('  [SKIP] parsetiger.yy not found');
} else {
  const bisonDoc = parseBisonDocument(bisonText);

  // %% separators
  assert(bisonDoc.separators.length >= 1, `Found ${bisonDoc.separators.length} %% separator(s) (expected >= 1)`);

  // Tokens
  console.log(`\n  Tokens found: ${bisonDoc.tokens.size}`);
  const expectedTokens = ['STRING', 'ID', 'INT', 'AND', 'ARRAY', 'ASSIGN', 'BREAK', 'CAST',
    'CLASS', 'COLON', 'COMMA', 'DIVIDE', 'DO', 'DOT', 'ELSE', 'END', 'EQ',
    'EXTENDS', 'FOR', 'FUNCTION', 'GE', 'GT', 'IF', 'IMPORT', 'IN',
    'LBRACE', 'LBRACK', 'LE', 'LET', 'LPAREN', 'LT', 'MINUS', 'METHOD',
    'NE', 'NEW', 'NIL', 'OF', 'OR', 'PLUS', 'PRIMITIVE', 'RBRACE',
    'RBRACK', 'RPAREN', 'SEMI', 'THEN', 'TIMES', 'TO', 'TYPE', 'VAR',
    'WHILE', 'EOF'];
  for (const tok of expectedTokens) {
    assert(bisonDoc.tokens.has(tok), `Token '${tok}' found`);
  }

  // Check typed tokens
  const stringToken = bisonDoc.tokens.get('STRING');
  assert(stringToken?.type === 'std::string', `STRING token has type <std::string> (got: ${stringToken?.type})`);
  const idToken = bisonDoc.tokens.get('ID');
  assert(idToken?.type === 'misc::symbol', `ID token has type <misc::symbol> (got: ${idToken?.type})`);
  const intToken = bisonDoc.tokens.get('INT');
  assert(intToken?.type === 'int', `INT token has type <int> (got: ${intToken?.type})`);

  // Token aliases
  assert(stringToken?.alias === 'string', `STRING alias is "string" (got: ${stringToken?.alias})`);
  assert(idToken?.alias === 'identifier', `ID alias is "identifier" (got: ${idToken?.alias})`);
  assert(intToken?.alias === 'integer', `INT alias is "integer" (got: ${intToken?.alias})`);

  // Non-terminals (%type)
  console.log(`\n  Non-terminals found: ${bisonDoc.nonTerminals.size}`);
  const expectedNT = ['exp', 'chunks', 'tychunk', 'tydec', 'typeid', 'ty', 'tyfield', 'tyfields', 'tyfields.1'];
  for (const nt of expectedNT) {
    assert(bisonDoc.nonTerminals.has(nt), `Non-terminal '${nt}' found`);
  }

  // Check non-terminal types
  const expType = bisonDoc.nonTerminals.get('exp');
  assert(expType?.type === 'ast::Exp*', `exp has type <ast::Exp*> (got: ${expType?.type})`);

  // %define variables
  console.log(`\n  %define variables found: ${bisonDoc.defines.size}`);
  const expectedDefines = ['api.prefix', 'api.namespace', 'api.parser.class', 'api.value.type',
    'api.token.constructor', 'parse.error', 'api.token.prefix', 'api.filename.type'];
  for (const def of expectedDefines) {
    assert(bisonDoc.defines.has(def), `%define '${def}' found`);
  }
  assert(bisonDoc.defines.get('api.value.type')?.value === 'variant',
    `api.value.type = variant (got: ${bisonDoc.defines.get('api.value.type')?.value})`);

  // Rules
  console.log(`\n  Rules found: ${bisonDoc.rules.size}`);
  const expectedRules = ['program', 'exp', 'chunks', 'tychunk', 'tydec', 'ty', 'tyfields', 'tyfields.1', 'tyfield', 'typeid'];
  for (const rule of expectedRules) {
    assert(bisonDoc.rules.has(rule), `Rule '${rule}' found`);
  }

  // Start symbol
  assert(bisonDoc.startSymbol === 'program', `Start symbol is 'program' (got: ${bisonDoc.startSymbol})`);

  // Precedence
  assert(bisonDoc.precedence.length >= 1, `Found ${bisonDoc.precedence.length} precedence declaration(s)`);

  // Diagnostics
  console.log('\n  --- Bison Diagnostics ---');
  const bisonDiags = computeBisonDiagnostics(bisonDoc, bisonText);
  console.log(`  Total diagnostics: ${bisonDiags.length}`);
  for (const d of bisonDiags) {
    console.log(`    [${d.severity === 1 ? 'ERROR' : d.severity === 2 ? 'WARN' : 'INFO'}] L${d.range.start.line + 1}: ${d.message}`);
  }
  // We should NOT have critical false positives (missing %%, etc.)
  const errors = bisonDiags.filter(d => d.severity === 1);
  assert(!errors.some(e => e.message.includes('Missing %%')), 'No false "missing %%" error');
}

// ════════════════════════════════════════
// TEST 2: Flex Parser
// ════════════════════════════════════════
console.log('\n\n=== TEST: Flex Parser (scantiger.ll) ===\n');

if (!flexText) {
  console.log('  [SKIP] scantiger.ll not found');
} else {
  const flexDoc = parseFlexDocument(flexText);

  // %% separators
  assert(flexDoc.separators.length >= 1, `Found ${flexDoc.separators.length} %% separator(s) (expected >= 1)`);

  // Options
  console.log(`\n  Options found: ${flexDoc.options.size}`);
  const expectedOpts = ['noyywrap', 'bison-complete', 'bison-locations', 'lex', 'namespace', 'lexer', 'params'];
  for (const opt of expectedOpts) {
    assert(flexDoc.options.has(opt), `Option '${opt}' found`);
  }
  assert(flexDoc.options.get('lexer')?.value === 'Lexer', `lexer option value is 'Lexer' (got: ${flexDoc.options.get('lexer')?.value})`);

  // Start conditions
  console.log(`\n  Start conditions found: ${flexDoc.startConditions.size}`);
  assert(flexDoc.startConditions.has('SC_COMMENT'), `Start condition 'SC_COMMENT' found`);
  assert(flexDoc.startConditions.has('SC_STRING'), `Start condition 'SC_STRING' found`);
  const scComment = flexDoc.startConditions.get('SC_COMMENT');
  assert(scComment?.exclusive === true, `SC_COMMENT is exclusive (got: ${scComment?.exclusive})`);

  // Abbreviations
  console.log(`\n  Abbreviations found: ${flexDoc.abbreviations.size}`);
  const expectedAbbrs = ['int', 'spaces', 'id'];
  for (const abbr of expectedAbbrs) {
    assert(flexDoc.abbreviations.has(abbr), `Abbreviation '${abbr}' found`);
  }
  assert(flexDoc.abbreviations.get('int')?.pattern === '[0-9]+',
    `int pattern is [0-9]+ (got: ${flexDoc.abbreviations.get('int')?.pattern})`);

  // Start condition references in rules
  console.log(`\n  Start condition references: ${flexDoc.startConditionRefs.size}`);
  assert(flexDoc.startConditionRefs.has('SC_COMMENT'), `SC_COMMENT referenced in rules`);
  assert(flexDoc.startConditionRefs.has('SC_STRING'), `SC_STRING referenced in rules`);

  // Abbreviation references in rules
  console.log(`\n  Abbreviation references: ${flexDoc.abbreviationRefs.size}`);
  assert(flexDoc.abbreviationRefs.has('int'), `{int} referenced in rules`);
  assert(flexDoc.abbreviationRefs.has('id'), `{id} referenced in rules`);
  assert(flexDoc.abbreviationRefs.has('spaces'), `{spaces} referenced in rules`);

  // Rules
  console.log(`\n  Rules found: ${flexDoc.rules.length}`);
  assert(flexDoc.rules.length > 20, `Found ${flexDoc.rules.length} rules (expected > 20)`);

  // Diagnostics
  console.log('\n  --- Flex Diagnostics ---');
  const flexDiags = computeFlexDiagnostics(flexDoc, flexText);
  console.log(`  Total diagnostics: ${flexDiags.length}`);
  for (const d of flexDiags) {
    console.log(`    [${d.severity === 1 ? 'ERROR' : d.severity === 2 ? 'WARN' : 'INFO'}] L${d.range.start.line + 1}: ${d.message}`);
  }
  // Should NOT have false positives
  const flexErrors = flexDiags.filter(d => d.severity === 1);
  assert(!flexErrors.some(e => e.message.includes('Missing %%')), 'No false "missing %%" error');
  assert(!flexErrors.some(e => e.message.includes('SC_COMMENT') && e.message.includes('not declared')),
    'No false "SC_COMMENT not declared" error');
  assert(!flexErrors.some(e => e.message.includes('SC_STRING') && e.message.includes('not declared')),
    'No false "SC_STRING not declared" error');
}

// ════════════════════════════════════════
// TEST 3: Documentation Database
// ════════════════════════════════════════
console.log('\n\n=== TEST: Documentation Database ===\n');

assert(bisonDirectiveDocs.size >= 25, `Bison directive docs: ${bisonDirectiveDocs.size} entries (expected >= 25)`);
assert(bisonDefineDocs.size >= 10, `Bison %define docs: ${bisonDefineDocs.size} entries (expected >= 10)`);
assert(flexDirectiveDocs.size >= 4, `Flex directive docs: ${flexDirectiveDocs.size} entries (expected >= 4)`);
assert(flexOptionDocs.size >= 15, `Flex option docs: ${flexOptionDocs.size} entries (expected >= 15)`);
assert(flexBuiltinDocs.size >= 8, `Flex builtin docs: ${flexBuiltinDocs.size} entries (expected >= 8)`);

// Verify key docs have all fields
for (const [key, doc] of bisonDirectiveDocs) {
  assert(doc.signature.length > 0, `Bison directive '${key}' has signature`);
  assert(doc.description.length > 0, `Bison directive '${key}' has description`);
}

// ════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
