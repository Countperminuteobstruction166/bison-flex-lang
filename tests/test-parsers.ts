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
// TEST 4: Diagnostic – Unknown directives (Task 1)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Unknown Directives ===\n');

{
  // Bison: %prout is not a valid directive
  const bisonSrc = [
    '%token NUMBER',
    '%prout foo',          // ← unknown directive
    '%%',
    'start: NUMBER ;',
    '%%',
  ].join('\n');

  const doc = parseBisonDocument(bisonSrc);
  assert(doc.unknownDirectives.length === 1, `Bison: 1 unknown directive detected (got ${doc.unknownDirectives.length})`);
  assert(doc.unknownDirectives[0]?.name === '%prout', `Bison: unknown directive name is '%prout' (got '${doc.unknownDirectives[0]?.name}')`);
  assert(doc.unknownDirectives[0]?.location.start.line === 1, `Bison: unknown directive on line 1 (got ${doc.unknownDirectives[0]?.location.start.line})`);

  const diags = computeBisonDiagnostics(doc, bisonSrc);
  const unknownDiag = diags.find(d => d.message.includes('%prout'));
  assert(unknownDiag !== undefined, `Bison: Error diagnostic emitted for '%prout'`);
  assert(unknownDiag?.severity === 1, `Bison: unknown directive has Error severity`);

  // Known directives should NOT be flagged
  const bisonKnown = [
    '%token NUMBER',
    '%define api.value.type variant',
    '%left PLUS',
    '%%',
    'start: NUMBER ;',
    '%%',
  ].join('\n');
  const docKnown = parseBisonDocument(bisonKnown);
  assert(docKnown.unknownDirectives.length === 0, `Bison: no false positives for known directives`);

  // Flex: %woops is not valid
  const flexSrc = [
    '%option noyywrap',
    '%woops bar',          // ← unknown directive
    '%%',
    '. ;',
    '%%',
  ].join('\n');

  const { parseFlexDocument: pflex } = require('../server/src/parser/flexParser');
  const flexDoc = pflex(flexSrc);
  assert(flexDoc.unknownDirectives.length === 1, `Flex: 1 unknown directive detected (got ${flexDoc.unknownDirectives.length})`);
  assert(flexDoc.unknownDirectives[0]?.name === '%woops', `Flex: unknown directive name is '%woops' (got '${flexDoc.unknownDirectives[0]?.name}')`);

  const flexDiags = computeFlexDiagnostics(flexDoc, flexSrc);
  const flexUnknownDiag = flexDiags.find(d => d.message.includes('%woops'));
  assert(flexUnknownDiag !== undefined, `Flex: Error diagnostic emitted for '%woops'`);
  assert(flexUnknownDiag?.severity === 1, `Flex: unknown directive has Error severity`);
}

// ════════════════════════════════════════
// TEST 5: Diagnostic – Unused rules (Task 2)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Unused Rules ===\n');

{
  const bisonSrc = [
    '%token NUMBER PLUS',
    '%%',
    'start : expr ;',
    'expr  : NUMBER ;',
    'unused_rule : PLUS ;',  // ← never referenced
    '%%',
  ].join('\n');

  const doc = parseBisonDocument(bisonSrc);
  const diags = computeBisonDiagnostics(doc, bisonSrc);

  const unusedDiags = diags.filter(d => d.message.includes('unused_rule') && d.message.includes('never referenced'));
  assert(unusedDiags.length >= 1, `Unused rule 'unused_rule' produces a Warning diagnostic`);
  assert(unusedDiags[0]?.severity === 2, `Unused rule diagnostic has Warning severity`);

  // The start symbol must NOT be flagged as unused
  const startDiags = diags.filter(d => d.message.includes('start') && d.message.includes('never referenced'));
  assert(startDiags.length === 0, `Start symbol 'start' is not flagged as unused`);

  // A rule that IS used must NOT be flagged
  const exprDiags = diags.filter(d => d.message.includes("'expr'") && d.message.includes('never referenced'));
  assert(exprDiags.length === 0, `Used rule 'expr' is not flagged as unused`);
}

// ════════════════════════════════════════
// TEST 6: Diagnostic – Unused tokens (Task 3)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Unused Tokens ===\n');

{
  const bisonSrc = [
    '%token NUMBER PLUS UNUSED_TOK',  // UNUSED_TOK never appears in rules
    '%%',
    'start : NUMBER PLUS NUMBER ;',
    '%%',
  ].join('\n');

  const doc = parseBisonDocument(bisonSrc);
  const diags = computeBisonDiagnostics(doc, bisonSrc);

  const unusedTokDiags = diags.filter(d => d.message.includes('UNUSED_TOK') && d.message.includes('never used'));
  assert(unusedTokDiags.length >= 1, `Unused token 'UNUSED_TOK' produces a Warning diagnostic`);
  assert(unusedTokDiags[0]?.severity === 2, `Unused token diagnostic has Warning severity`);

  // Tokens that ARE used must NOT be flagged
  const numberDiags = diags.filter(d => d.message.includes("'NUMBER'") && d.message.includes('never used'));
  assert(numberDiags.length === 0, `Used token 'NUMBER' is not flagged as unused`);

  const plusDiags = diags.filter(d => d.message.includes("'PLUS'") && d.message.includes('never used'));
  assert(plusDiags.length === 0, `Used token 'PLUS' is not flagged as unused`);
}

// ════════════════════════════════════════
// TEST 7: Diagnostic – Shift/reduce conflicts (Task 4)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Shift/Reduce Conflicts ===\n');

{
  // Two alternatives of 'stmt' both start with IF → potential conflict
  // Note: parser requires "name :" on the same line (Bison inline format)
  const bisonSrc = [
    '%token IF ELSE NUMBER',
    '%%',
    'start : stmt ;',
    'stmt : IF NUMBER         { }',
    '     | IF NUMBER ELSE NUMBER { }',
    '     ;',
    '%%',
  ].join('\n');

  const doc = parseBisonDocument(bisonSrc);
  const diags = computeBisonDiagnostics(doc, bisonSrc);

  const conflictDiags = diags.filter(d => d.message.includes('shift/reduce') && d.message.includes('IF'));
  assert(conflictDiags.length >= 1, `Shift/reduce conflict detected for token 'IF' in rule 'stmt'`);
  assert(conflictDiags[0]?.severity === 2, `Shift/reduce conflict diagnostic has Warning severity`);

  // A rule with distinct first tokens must NOT produce a conflict warning
  const bisonClean = [
    '%token IF ELSE NUMBER',
    '%%',
    'start : stmt ;',
    'stmt : IF NUMBER { }',
    '     | ELSE NUMBER { }',
    '     ;',
    '%%',
  ].join('\n');
  const docClean = parseBisonDocument(bisonClean);
  const cleanDiags = computeBisonDiagnostics(docClean, bisonClean);
  const cleanConflicts = cleanDiags.filter(d => d.message.includes('shift/reduce'));
  assert(cleanConflicts.length === 0, `No shift/reduce warning for rule with distinct first tokens`);
}

// ════════════════════════════════════════
// TEST 8: Diagnostic – Inaccessible Flex rules (Task 5)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Inaccessible Flex Rules ===\n');

{
  // Catch-all '.' before a specific pattern → specific rule is inaccessible
  const flexSrc = [
    '%option noyywrap',
    '%%',
    '.         { /* catchall */ }',
    '[a-z]+    { /* unreachable */ }',   // ← shadowed by '.' above
    '%%',
  ].join('\n');

  const { parseFlexDocument: pflex2 } = require('../server/src/parser/flexParser');
  const flexDoc = pflex2(flexSrc);
  const diags = computeFlexDiagnostics(flexDoc, flexSrc);

  const inaccessDiags = diags.filter(d => d.message.includes('inaccessible') || d.message.includes('catch-all'));
  assert(inaccessDiags.length >= 1, `Inaccessible Flex rule detected after catch-all '.'`);
  assert(inaccessDiags[0]?.severity === 2, `Inaccessible rule diagnostic has Warning severity`);

  // Duplicate pattern detection
  const flexDup = [
    '%option noyywrap',
    '%%',
    '[a-z]+    { /* first */ }',
    '[a-z]+    { /* duplicate — inaccessible */ }',
    '%%',
  ].join('\n');

  const flexDocDup = pflex2(flexDup);
  const dupDiags = computeFlexDiagnostics(flexDocDup, flexDup);
  const dupWarn = dupDiags.filter(d => d.message.includes('inaccessible') && d.message.includes('identical'));
  assert(dupWarn.length >= 1, `Duplicate Flex pattern detected as inaccessible`);

  // Specific before catch-all → should NOT be flagged
  const flexOk = [
    '%option noyywrap',
    '%%',
    '[a-z]+    { /* specific first — OK */ }',
    '.         { /* catchall last — OK */ }',
    '%%',
  ].join('\n');

  const flexDocOk = pflex2(flexOk);
  const okDiags = computeFlexDiagnostics(flexDocOk, flexOk);
  const okInacc = okDiags.filter(d => d.message.includes('inaccessible') || d.message.includes('catch-all'));
  assert(okInacc.length === 0, `No inaccessible warning when specific rule precedes catch-all`);
}

// ════════════════════════════════════════
// TEST 9: Fixture — Calculator (calc.y + calc.l)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Fixture — Calculator ===\n');

{
  const calcYPath = path.resolve(__dirname, 'fixtures/calc.y');
  const calcLPath = path.resolve(__dirname, 'fixtures/calc.l');

  if (!fs.existsSync(calcYPath) || !fs.existsSync(calcLPath)) {
    console.log('  [SKIP] calc.y or calc.l not found');
  } else {
    const calcY = fs.readFileSync(calcYPath, 'utf-8');
    const calcL = fs.readFileSync(calcLPath, 'utf-8');
    const calcDoc = parseBisonDocument(calcY);

    // Tokens
    assert(calcDoc.tokens.has('NUMBER'), 'calc.y: TOKEN NUMBER found');
    assert(calcDoc.tokens.has('PLUS'), 'calc.y: TOKEN PLUS found');
    assert(calcDoc.tokens.has('MINUS'), 'calc.y: TOKEN MINUS found');
    assert(calcDoc.tokens.has('TIMES'), 'calc.y: TOKEN TIMES found');
    assert(calcDoc.tokens.has('DIVIDE'), 'calc.y: TOKEN DIVIDE found');
    assert(calcDoc.tokens.has('LPAREN'), 'calc.y: TOKEN LPAREN found');
    assert(calcDoc.tokens.has('RPAREN'), 'calc.y: TOKEN RPAREN found');
    assert(calcDoc.tokens.has('LETTER'), 'calc.y: TOKEN LETTER found');
    assert(calcDoc.tokens.has('ASSIGN'), 'calc.y: TOKEN ASSIGN found');
    assert(calcDoc.tokens.has('NEWLINE'), 'calc.y: TOKEN NEWLINE found');

    // Token types
    assert(calcDoc.tokens.get('NUMBER')?.type === 'double', `calc.y: NUMBER type is <double> (got ${calcDoc.tokens.get('NUMBER')?.type})`);
    assert(calcDoc.tokens.get('LETTER')?.type === 'int', `calc.y: LETTER type is <int> (got ${calcDoc.tokens.get('LETTER')?.type})`);

    // Token aliases
    assert(calcDoc.tokens.get('PLUS')?.alias === '+', `calc.y: PLUS alias is "+" (got ${calcDoc.tokens.get('PLUS')?.alias})`);

    // Rules
    assert(calcDoc.rules.has('program'), 'calc.y: rule program found');
    assert(calcDoc.rules.has('expr'), 'calc.y: rule expr found');
    assert(calcDoc.rules.has('term'), 'calc.y: rule term found');
    assert(calcDoc.rules.has('factor'), 'calc.y: rule factor found');
    assert(calcDoc.rules.has('primary'), 'calc.y: rule primary found');
    assert(calcDoc.rules.has('lines'), 'calc.y: rule lines found');
    assert(calcDoc.rules.has('line'), 'calc.y: rule line found');

    // Separators
    assert(calcDoc.separators.length === 2, `calc.y: 2 %% separators (got ${calcDoc.separators.length})`);

    // Non-terminals
    assert(calcDoc.nonTerminals.has('expr'), 'calc.y: non-terminal expr');
    assert(calcDoc.nonTerminals.get('expr')?.type === 'double', `calc.y: expr type <double>`);

    // Precedence
    assert(calcDoc.precedence.length >= 3, `calc.y: >= 3 precedence decls (got ${calcDoc.precedence.length})`);

    // Defines
    assert(calcDoc.defines.has('api.value.type'), 'calc.y: %define api.value.type');
    assert(calcDoc.defines.get('api.value.type')?.value === 'union', `calc.y: value.type = union`);

    // Start symbol
    assert(calcDoc.startSymbol === 'program', `calc.y: start symbol is program`);

    // Diagnostics — should be clean (no errors)
    const calcDiags = computeBisonDiagnostics(calcDoc, calcY);
    const calcErrors = calcDiags.filter(d => d.severity === 1);
    assert(calcErrors.length === 0, `calc.y: no error diagnostics (got ${calcErrors.length})`);

    // Flex companion
    const { parseFlexDocument: pflexCalc } = require('../server/src/parser/flexParser');
    const calcFlexDoc = pflexCalc(calcL);

    assert(calcFlexDoc.separators.length >= 1, `calc.l: has %% separator`);
    assert(calcFlexDoc.options.has('noyywrap'), 'calc.l: option noyywrap');
    assert(calcFlexDoc.abbreviations.has('digit'), 'calc.l: abbreviation digit');
    assert(calcFlexDoc.abbreviations.has('number'), 'calc.l: abbreviation number');
    assert(calcFlexDoc.abbreviations.has('letter'), 'calc.l: abbreviation letter');
    assert(calcFlexDoc.abbreviations.has('spaces'), 'calc.l: abbreviation spaces');
    assert(calcFlexDoc.rules.length >= 10, `calc.l: >= 10 rules (got ${calcFlexDoc.rules.length})`);

    const calcFlexDiags = computeFlexDiagnostics(calcFlexDoc, calcL);
    const calcFlexErrors = calcFlexDiags.filter((d: any) => d.severity === 1);
    assert(calcFlexErrors.length === 0, `calc.l: no error diagnostics (got ${calcFlexErrors.length})`);
  }
}

// ════════════════════════════════════════
// TEST 10: Fixture — JSON (json.y + json.l)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Fixture — JSON ===\n');

{
  const jsonYPath = path.resolve(__dirname, 'fixtures/json.y');
  const jsonLPath = path.resolve(__dirname, 'fixtures/json.l');

  if (!fs.existsSync(jsonYPath) || !fs.existsSync(jsonLPath)) {
    console.log('  [SKIP] json.y or json.l not found');
  } else {
    const jsonY = fs.readFileSync(jsonYPath, 'utf-8');
    const jsonL = fs.readFileSync(jsonLPath, 'utf-8');
    const jsonDoc = parseBisonDocument(jsonY);

    // Tokens
    assert(jsonDoc.tokens.has('STRING'), 'json.y: TOKEN STRING');
    assert(jsonDoc.tokens.has('NUMBER'), 'json.y: TOKEN NUMBER');
    assert(jsonDoc.tokens.has('TRUE'), 'json.y: TOKEN TRUE');
    assert(jsonDoc.tokens.has('FALSE'), 'json.y: TOKEN FALSE');
    assert(jsonDoc.tokens.has('NULL_TOK'), 'json.y: TOKEN NULL_TOK');
    assert(jsonDoc.tokens.has('LBRACE'), 'json.y: TOKEN LBRACE');
    assert(jsonDoc.tokens.has('RBRACE'), 'json.y: TOKEN RBRACE');
    assert(jsonDoc.tokens.has('LBRACK'), 'json.y: TOKEN LBRACK');
    assert(jsonDoc.tokens.has('RBRACK'), 'json.y: TOKEN RBRACK');
    assert(jsonDoc.tokens.has('COLON'), 'json.y: TOKEN COLON');
    assert(jsonDoc.tokens.has('COMMA'), 'json.y: TOKEN COMMA');

    // Rules
    assert(jsonDoc.rules.has('json'), 'json.y: rule json');
    assert(jsonDoc.rules.has('value'), 'json.y: rule value');
    assert(jsonDoc.rules.has('object'), 'json.y: rule object');
    assert(jsonDoc.rules.has('array'), 'json.y: rule array');
    assert(jsonDoc.rules.has('members'), 'json.y: rule members');
    assert(jsonDoc.rules.has('pair'), 'json.y: rule pair');
    assert(jsonDoc.rules.has('elements'), 'json.y: rule elements');

    // value rule should have 7 alternatives
    const valueRule = jsonDoc.rules.get('value');
    assert(valueRule!.alternatives.length === 7, `json.y: value has 7 alternatives (got ${valueRule?.alternatives.length})`);

    // Start symbol
    assert(jsonDoc.startSymbol === 'json', `json.y: start symbol is json`);

    // Separators
    assert(jsonDoc.separators.length === 2, `json.y: 2 separators`);

    // No errors
    const jsonDiags = computeBisonDiagnostics(jsonDoc, jsonY);
    const jsonErrors = jsonDiags.filter(d => d.severity === 1);
    assert(jsonErrors.length === 0, `json.y: no error diagnostics (got ${jsonErrors.length})`);

    // Flex
    const { parseFlexDocument: pflexJson } = require('../server/src/parser/flexParser');
    const jsonFlexDoc = pflexJson(jsonL);

    assert(jsonFlexDoc.separators.length >= 1, `json.l: has %% separator`);
    assert(jsonFlexDoc.options.has('noyywrap'), 'json.l: option noyywrap');
    assert(jsonFlexDoc.startConditions.has('SC_STRING'), 'json.l: start condition SC_STRING');
    assert(jsonFlexDoc.abbreviations.has('digit'), 'json.l: abbreviation digit');
    assert(jsonFlexDoc.rules.length >= 10, `json.l: >= 10 rules (got ${jsonFlexDoc.rules.length})`);

    const jsonFlexDiags = computeFlexDiagnostics(jsonFlexDoc, jsonL);
    const jsonFlexErrors = jsonFlexDiags.filter((d: any) => d.severity === 1);
    assert(jsonFlexErrors.length === 0, `json.l: no error diagnostics (got ${jsonFlexErrors.length})`);
  }
}

// ════════════════════════════════════════
// TEST 11: Fixture — SQL (sql.y + sql.l)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Fixture — SQL ===\n');

{
  const sqlYPath = path.resolve(__dirname, 'fixtures/sql.y');
  const sqlLPath = path.resolve(__dirname, 'fixtures/sql.l');

  if (!fs.existsSync(sqlYPath) || !fs.existsSync(sqlLPath)) {
    console.log('  [SKIP] sql.y or sql.l not found');
  } else {
    const sqlY = fs.readFileSync(sqlYPath, 'utf-8');
    const sqlL = fs.readFileSync(sqlLPath, 'utf-8');
    const sqlDoc = parseBisonDocument(sqlY);

    // Tokens
    const expectedSqlTokens = [
      'IDENTIFIER', 'STRING_LIT', 'NUMBER',
      'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES',
      'CREATE', 'TABLE', 'DROP', 'AND', 'OR', 'NOT', 'NULL_TOK',
      'INT_TYPE', 'VARCHAR', 'TEXT',
      'STAR', 'COMMA', 'LPAREN', 'RPAREN', 'SEMI',
      'EQ', 'NE', 'LT', 'GT', 'LE', 'GE', 'DOT',
    ];
    for (const tok of expectedSqlTokens) {
      assert(sqlDoc.tokens.has(tok), `sql.y: TOKEN ${tok}`);
    }

    // Rules
    const expectedSqlRules = [
      'program', 'statements', 'statement', 'select_stmt', 'insert_stmt',
      'create_stmt', 'drop_stmt', 'column_list', 'table_ref', 'where_clause',
      'condition', 'expr', 'expr_list', 'column_defs', 'column_def', 'data_type',
    ];
    for (const rule of expectedSqlRules) {
      assert(sqlDoc.rules.has(rule), `sql.y: rule ${rule}`);
    }

    // Start symbol
    assert(sqlDoc.startSymbol === 'program', `sql.y: start symbol is program`);

    // Precedence
    assert(sqlDoc.precedence.length >= 2, `sql.y: >= 2 precedence decls (got ${sqlDoc.precedence.length})`);

    // condition rule should have many alternatives (comparison operators + AND/OR/NOT/parens)
    const condRule = sqlDoc.rules.get('condition');
    assert(condRule!.alternatives.length >= 8, `sql.y: condition has >= 8 alternatives (got ${condRule?.alternatives.length})`);

    // No errors
    const sqlDiags = computeBisonDiagnostics(sqlDoc, sqlY);
    const sqlErrors = sqlDiags.filter(d => d.severity === 1);
    assert(sqlErrors.length === 0, `sql.y: no error diagnostics (got ${sqlErrors.length})`);

    // Flex
    const { parseFlexDocument: pflexSql } = require('../server/src/parser/flexParser');
    const sqlFlexDoc = pflexSql(sqlL);

    assert(sqlFlexDoc.separators.length >= 1, `sql.l: has %% separator`);
    assert(sqlFlexDoc.options.has('noyywrap'), 'sql.l: option noyywrap');
    assert(sqlFlexDoc.startConditions.has('SC_STRING'), 'sql.l: start condition SC_STRING');
    assert(sqlFlexDoc.abbreviations.has('digit'), 'sql.l: abbreviation digit');
    assert(sqlFlexDoc.abbreviations.has('identifier'), 'sql.l: abbreviation identifier');
    assert(sqlFlexDoc.rules.length >= 20, `sql.l: >= 20 rules (got ${sqlFlexDoc.rules.length})`);

    const sqlFlexDiags = computeFlexDiagnostics(sqlFlexDoc, sqlL);
    const sqlFlexErrors = sqlFlexDiags.filter((d: any) => d.severity === 1);
    assert(sqlFlexErrors.length === 0, `sql.l: no error diagnostics (got ${sqlFlexErrors.length})`);
  }
}

// ════════════════════════════════════════
// TEST 12: First/Follow Sets
// ════════════════════════════════════════
console.log('\n\n=== TEST: First/Follow Sets ===\n');

{
  const { computeFirstSets, computeFollowSets } = require('../server/src/providers/firstFollow');

  // Simple grammar: E → T E' ; E' → + T E' | ε ; T → id
  // Encoded as Bison inline format
  const bisonSrc = [
    '%token PLUS ID',
    '%%',
    'expr : term expr_tail ;',
    'expr_tail : PLUS term expr_tail ;',
    '          | ;',           // empty production (no symbols)
    'term : ID ;',
    '%%',
  ].join('\n');

  const doc = parseBisonDocument(bisonSrc);
  const firstSets = computeFirstSets(doc);
  const followSets = computeFollowSets(doc, firstSets);

  // First(term) = { ID }
  assert(firstSets.get('term')?.has('ID'), 'First(term) contains ID');
  assert(firstSets.get('term')?.size === 1, `First(term) has 1 element (got ${firstSets.get('term')?.size})`);

  // First(expr) should contain ID (through term)
  assert(firstSets.get('expr')?.has('ID'), 'First(expr) contains ID');

  // First(expr_tail) should contain PLUS and ε
  assert(firstSets.get('expr_tail')?.has('PLUS'), 'First(expr_tail) contains PLUS');
  assert(firstSets.get('expr_tail')?.has('ε'), 'First(expr_tail) contains ε');

  // Follow(expr) should contain $end
  assert(followSets.get('expr')?.has('$end'), 'Follow(expr) contains $end');

  // Follow(term) should contain PLUS and $end (since expr_tail can be ε)
  assert(followSets.get('term')?.has('PLUS'), 'Follow(term) contains PLUS');
  assert(followSets.get('term')?.has('$end'), 'Follow(term) contains $end');
}

// ════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
