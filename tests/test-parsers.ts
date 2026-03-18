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
// TEST 13: $n out of bounds (NEW 1)
// ════════════════════════════════════════
console.log('\n\n=== TEST: $n Out of Bounds ===\n');

{
  // $5 in a rule with only 2 symbols → Error
  const bisonSrc = [
    '%token PLUS NUMBER',
    '%%',
    'start : expr ;',
    'expr  : NUMBER PLUS { $$ = $5; }',  // 2 symbols, $5 out of bounds
    '%%',
  ].join('\n');

  const doc = parseBisonDocument(bisonSrc);
  const diags = computeBisonDiagnostics(doc, bisonSrc);

  const oobDiags = diags.filter(d => d.message.includes('$5') && d.message.includes('out of bounds'));
  assert(oobDiags.length >= 1, `$5 in a 2-symbol rule produces an Error diagnostic`);
  assert(oobDiags[0]?.severity === 1, `$5 out-of-bounds has Error severity`);

  // In-bounds reference must NOT be flagged
  const bisonOk = [
    '%token PLUS NUMBER',
    '%%',
    'start : expr ;',
    'expr  : NUMBER PLUS NUMBER { $$ = $1 + $3; }',  // 3 symbols, $1 and $3 valid
    '%%',
  ].join('\n');

  const docOk = parseBisonDocument(bisonOk);
  const okDiags = computeBisonDiagnostics(docOk, bisonOk);
  const oobOk = okDiags.filter(d => d.message.includes('out of bounds'));
  assert(oobOk.length === 0, `In-bounds $1 and $3 are not flagged`);

  // $$ (result) must NOT be flagged — it is not a $n ref
  const bisonDollarDollar = [
    '%token NUMBER',
    '%%',
    'start : NUMBER { $$ = $1; }',
    '%%',
  ].join('\n');
  const docDD = parseBisonDocument(bisonDollarDollar);
  const ddDiags = computeBisonDiagnostics(docDD, bisonDollarDollar);
  const ddOob = ddDiags.filter(d => d.message.includes('out of bounds'));
  assert(ddOob.length === 0, `$$ is not flagged as out-of-bounds`);
}

// ════════════════════════════════════════
// TEST 14: Undeclared binary operators conflict (NEW 2)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Undeclared Binary Operators ===\n');

{
  // Two left-recursive alternatives with undeclared operators
  const bisonSrc = [
    '%token NUMBER PLUS MINUS',  // no %left/%right for PLUS/MINUS
    '%%',
    'start : expr ;',
    'expr : expr PLUS expr',
    '     | expr MINUS expr',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');

  const doc = parseBisonDocument(bisonSrc);
  const diags = computeBisonDiagnostics(doc, bisonSrc);

  const conflictDiags = diags.filter(d => d.message.includes('undeclared operators') && d.message.includes('expr'));
  assert(conflictDiags.length >= 1, `Undeclared binary operators produce a Warning`);
  assert(conflictDiags[0]?.severity === 2, `Undeclared binary operators warning has Warning severity`);

  // With %left declarations the check must NOT fire
  const bisonDeclared = [
    '%token NUMBER PLUS MINUS',
    '%left PLUS MINUS',
    '%%',
    'start : expr ;',
    'expr : expr PLUS expr',
    '     | expr MINUS expr',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');
  const docDecl = parseBisonDocument(bisonDeclared);
  const declDiags = computeBisonDiagnostics(docDecl, bisonDeclared);
  const declConflict = declDiags.filter(d => d.message.includes('undeclared operators'));
  assert(declConflict.length === 0, `Declared operators not flagged as undeclared`);
}

// ════════════════════════════════════════
// TEST 15: Missing %start directive (NEW 3)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Missing %start Directive ===\n');

{
  // Grammar with > 2 rules and no %start
  const bisonSrc = [
    '%token NUMBER PLUS',
    '%%',
    'program : stmtlist ;',
    'stmtlist : stmtlist stmt',
    '         | stmt',
    '         ;',
    'stmt : NUMBER PLUS NUMBER ;',
    '%%',
  ].join('\n');

  const doc = parseBisonDocument(bisonSrc);
  assert(!doc.startSymbol, 'No %start symbol parsed');
  const diags = computeBisonDiagnostics(doc, bisonSrc);

  const startDiags = diags.filter(d => d.message.includes('No %start') || d.message.includes('%start'));
  assert(startDiags.length >= 1, `Missing %start produces an Information diagnostic`);
  assert(startDiags[0]?.severity === 3, `Missing %start has Information severity`);
  assert(startDiags[0]?.message.includes('program'), `Diagnostic names the implicit start symbol`);

  // With explicit %start the check must NOT fire
  const bisonWithStart = [
    '%token NUMBER PLUS',
    '%start program',
    '%%',
    'program : stmtlist ;',
    'stmtlist : stmtlist stmt | stmt ;',
    'stmt : NUMBER PLUS NUMBER ;',
    '%%',
  ].join('\n');
  const docWS = parseBisonDocument(bisonWithStart);
  const wsDiags = computeBisonDiagnostics(docWS, bisonWithStart);
  const wsStart = wsDiags.filter(d => d.message.includes('No %start'));
  assert(wsStart.length === 0, `Explicit %start suppresses the Information diagnostic`);
}

// ════════════════════════════════════════
// TEST 16: Empty production without %empty (NEW 4)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Missing %empty ===\n');

{
  // An empty production without %empty
  const bisonSrc = [
    '%token NUMBER',
    '%%',
    'start : list ;',
    'list : NUMBER list',
    '     |',             // empty without %empty
    '     ;',
    '%%',
  ].join('\n');

  const doc = parseBisonDocument(bisonSrc);
  const diags = computeBisonDiagnostics(doc, bisonSrc);

  const emptyDiags = diags.filter(d => d.message.includes('%empty') && d.message.includes("'list'"));
  assert(emptyDiags.length >= 1, `Empty production without %empty produces a Warning`);
  assert(emptyDiags[0]?.severity === 2, `Missing %empty has Warning severity`);

  // %empty explicitly written must NOT trigger the warning
  const bisonWithEmpty = [
    '%token NUMBER',
    '%%',
    'start : list ;',
    'list : NUMBER list',
    '     | %empty',
    '     ;',
    '%%',
  ].join('\n');
  const docWE = parseBisonDocument(bisonWithEmpty);
  const weDiags = computeBisonDiagnostics(docWE, bisonWithEmpty);
  const weEmpty = weDiags.filter(d => d.message.includes('%empty') && d.message.includes("'list'"));
  assert(weEmpty.length === 0, `Explicit %empty suppresses the Warning`);
}

// ════════════════════════════════════════
// TEST 17: Flex – Invalid regex pattern (NEW 5)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Flex Invalid Regex ===\n');

{
  // Unclosed bracket [ is an invalid regex
  const flexSrc = [
    '%option noyywrap',
    '%%',
    '[unclosed   { /* bad pattern */ }',
    '[a-z]+      { /* valid */ }',
    '%%',
  ].join('\n');

  const { parseFlexDocument: pflex3 } = require('../server/src/parser/flexParser');
  const flexDoc = pflex3(flexSrc);
  const diags = computeFlexDiagnostics(flexDoc, flexSrc);

  const invalidDiags = diags.filter(d => d.message.includes('Invalid regex') || d.message.includes('invalid'));
  assert(invalidDiags.length >= 1, `Invalid Flex regex produces an Error diagnostic`);
  assert(invalidDiags[0]?.severity === 1, `Invalid Flex regex has Error severity`);

  // Valid patterns must NOT be flagged
  const flexOk = [
    '%option noyywrap',
    '%%',
    '[a-z]+    { }',
    '[0-9]+    { }',
    '"hello"   { }',
    '%%',
  ].join('\n');
  const flexDocOk = pflex3(flexOk);
  const okDiags = computeFlexDiagnostics(flexDocOk, flexOk);
  const okInvalid = okDiags.filter(d => d.message.includes('Invalid regex'));
  assert(okInvalid.length === 0, `Valid Flex patterns are not flagged`);
}

// ════════════════════════════════════════
// TEST 18: Flex – Keyword shadowed by identifier pattern (NEW 6)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Flex Keyword Overlap ===\n');

{
  // Identifier pattern before keyword → keyword shadowed
  const flexSrc = [
    '%option noyywrap',
    '%%',
    '[a-zA-Z_][a-zA-Z0-9_]*  { /* identifier */ }',
    'if                       { /* shadowed keyword */ }',
    '%%',
  ].join('\n');

  const { parseFlexDocument: pflex4 } = require('../server/src/parser/flexParser');
  const flexDoc = pflex4(flexSrc);
  const diags = computeFlexDiagnostics(flexDoc, flexSrc);

  const overlapDiags = diags.filter(d => d.message.includes('shadowed') || d.message.includes('keyword'));
  assert(overlapDiags.length >= 1, `Keyword after identifier pattern produces a Warning`);
  assert(overlapDiags[0]?.severity === 2, `Keyword overlap has Warning severity`);

  // Keyword before identifier pattern → correct order, no warning
  const flexOk = [
    '%option noyywrap',
    '%%',
    'if                       { /* keyword first — correct */ }',
    '[a-zA-Z_][a-zA-Z0-9_]*  { /* identifier */ }',
    '%%',
  ].join('\n');
  const flexDocOk = pflex4(flexOk);
  const okDiags = computeFlexDiagnostics(flexDocOk, flexOk);
  const okOverlap = okDiags.filter(d => d.message.includes('shadowed') || d.message.includes('keyword'));
  assert(okOverlap.length === 0, `Keyword before identifier pattern is not flagged`);
}

// ════════════════════════════════════════
// TEST 19: Flex – Missing %option noyywrap (NEW 7)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Flex Missing noyywrap ===\n');

{
  // No %option noyywrap and no yywrap() defined
  const flexSrc = [
    '%%',
    '[a-z]+   { }',
    '%%',
  ].join('\n');

  const { parseFlexDocument: pflex5 } = require('../server/src/parser/flexParser');
  const flexDoc = pflex5(flexSrc);
  const diags = computeFlexDiagnostics(flexDoc, flexSrc);

  const yywrapDiags = diags.filter(d => d.message.includes('noyywrap') || d.message.includes('yywrap'));
  assert(yywrapDiags.length >= 1, `Missing noyywrap produces a Warning`);
  assert(yywrapDiags[0]?.severity === 2, `Missing noyywrap has Warning severity`);

  // With %option noyywrap → no warning
  const flexWithOption = [
    '%option noyywrap',
    '%%',
    '[a-z]+   { }',
    '%%',
  ].join('\n');
  const flexDocOpt = pflex5(flexWithOption);
  const optDiags = computeFlexDiagnostics(flexDocOpt, flexWithOption);
  const optYywrap = optDiags.filter(d => d.message.includes('noyywrap') || d.message.includes('yywrap'));
  assert(optYywrap.length === 0, `%option noyywrap suppresses the Warning`);

  // With yywrap defined in code → no warning
  const flexWithYywrap = [
    '%{',
    'int yywrap(void) { return 1; }',
    '%}',
    '%%',
    '[a-z]+   { }',
    '%%',
  ].join('\n');
  const flexDocYY = pflex5(flexWithYywrap);
  const yyDiags = computeFlexDiagnostics(flexDocYY, flexWithYywrap);
  const yyWrap = yyDiags.filter(d => d.message.includes('noyywrap') || d.message.includes('yywrap'));
  assert(yyWrap.length === 0, `yywrap() definition suppresses the Warning`);
}

// ════════════════════════════════════════
// TEST 20: False-positive fix — bare "rule :" header vs. true empty production
// ════════════════════════════════════════
console.log('\n\n=== TEST: FP Fix — %empty bare header ===\n');

{
  // "rule :" on its own line followed by body on the next lines.
  // The parser creates a phantom empty alternative for the header line;
  // the diagnostic must NOT fire for it.
  const bisonBare = [
    '%token NUMBER',
    '%%',
    'start : list ;',
    'list :',               // bare rule-header — NOT an empty production
    '    NUMBER list',
    '  | %empty',
    '  ;',
    '%%',
  ].join('\n');

  const docBare = parseBisonDocument(bisonBare);
  const bareDiags = computeBisonDiagnostics(docBare, bisonBare);
  const bareEmpty = bareDiags.filter(
    d => d.message.includes('%empty') && d.message.includes("'list'"),
  );
  assert(bareEmpty.length === 0, `Bare 'list :' header does not trigger false %empty warning`);

  // A genuine empty production "| ;" must still be detected.
  const bisonRealEmpty = [
    '%token NUMBER',
    '%%',
    'start : list ;',
    'list : NUMBER list',
    '     |',               // real empty production without %empty
    '     ;',
    '%%',
  ].join('\n');

  const docReal = parseBisonDocument(bisonRealEmpty);
  const realDiags = computeBisonDiagnostics(docReal, bisonRealEmpty);
  const realEmpty = realDiags.filter(
    d => d.message.includes('%empty') && d.message.includes("'list'"),
  );
  assert(realEmpty.length >= 1, `Genuine empty production '| ;' still produces a Warning`);
  assert(realEmpty[0]?.severity === 2, `Genuine empty production Warning has Warning severity`);

  // "rule : ;" on a single line — still an empty production, must still warn.
  const bisonInline = [
    '%token NUMBER',
    '%%',
    'start : opt ;',
    'opt : NUMBER',
    '    | ;',              // inline empty — must warn
    '%%',
  ].join('\n');

  const docInline = parseBisonDocument(bisonInline);
  const inlineDiags = computeBisonDiagnostics(docInline, bisonInline);
  const inlineEmpty = inlineDiags.filter(
    d => d.message.includes('%empty') && d.message.includes("'opt'"),
  );
  assert(inlineEmpty.length >= 1, `Inline 'rule : ;' empty production still produces a Warning`);

  // Edge case: bare "rule :" header immediately followed by "| alt" on the next
  // line.  The phantom alternative IS a genuine empty first production; the
  // diagnostic must still fire.
  const bisonBareWithPipe = [
    '%token LETTER',
    '%%',
    'start : opt ;',
    'opt :',
    '    | LETTER',    // first alternative is empty (bare header + first |)
    '    ;',
    '%%',
  ].join('\n');

  const docBWP = parseBisonDocument(bisonBareWithPipe);
  const bwpDiags = computeBisonDiagnostics(docBWP, bisonBareWithPipe);
  const bwpEmpty = bwpDiags.filter(
    d => d.message.includes('%empty') && d.message.includes("'opt'"),
  );
  assert(bwpEmpty.length >= 1, `Bare header followed by '| alt' still produces a %empty warning`);
}

// ════════════════════════════════════════
// TEST 21: False-positive fix — shift/reduce with declared precedence
// ════════════════════════════════════════
console.log('\n\n=== TEST: FP Fix — shift/reduce with %right/%left ===\n');

{
  // Classic dangling-else: two alts start with IF, but IF is declared %right.
  // Bison resolves this implicitly; the diagnostic must NOT fire.
  const bisonDanglingElse = [
    '%token IF ELSE NUMBER',
    '%right IF ELSE',
    '%%',
    'start : stmt ;',
    'stmt : IF NUMBER',
    '     | IF NUMBER ELSE NUMBER',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');

  const docDE = parseBisonDocument(bisonDanglingElse);
  const deDiags = computeBisonDiagnostics(docDE, bisonDanglingElse);
  const deConflicts = deDiags.filter(
    d => d.message.includes('shift/reduce') && d.message.includes('IF'),
  );
  assert(
    deConflicts.length === 0,
    `shift/reduce not warned when 'IF' has %right declaration`,
  );

  // Same grammar WITHOUT %right → must still warn.
  const bisonNoPrecedence = [
    '%token IF ELSE NUMBER',
    '%%',
    'start : stmt ;',
    'stmt : IF NUMBER',
    '     | IF NUMBER ELSE NUMBER',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');

  const docNP = parseBisonDocument(bisonNoPrecedence);
  const npDiags = computeBisonDiagnostics(docNP, bisonNoPrecedence);
  const npConflicts = npDiags.filter(
    d => d.message.includes('shift/reduce') && d.message.includes('IF'),
  );
  assert(
    npConflicts.length >= 1,
    `shift/reduce still warned when 'IF' has no precedence declaration`,
  );

  // %left covers PLUS and MINUS — expression grammar must not warn.
  const bisonExpr = [
    '%token NUMBER PLUS MINUS',
    '%left PLUS MINUS',
    '%%',
    'start : expr ;',
    'expr : expr PLUS NUMBER',
    '     | expr MINUS NUMBER',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');

  const docExpr = parseBisonDocument(bisonExpr);
  const exprDiags = computeBisonDiagnostics(docExpr, bisonExpr);
  // Note: firstSymbol of "expr PLUS NUMBER" is "expr" (non-terminal, lowercase)
  // so the shift/reduce heuristic would not fire on it anyway — but the test
  // also confirms no spurious warning appears.
  const exprConflicts = exprDiags.filter(d => d.message.includes('shift/reduce'));
  assert(exprConflicts.length === 0, `Expression grammar with %left has no shift/reduce warning`);
}

// ════════════════════════════════════════
// TEST 22: Parser — multi-line rule continuation accumulation
// ════════════════════════════════════════
console.log('\n\n=== TEST: Multi-line rule continuation ===\n');

{
  // Rule with bare "rule :" header and multi-line body; action is on the
  // continuation line, so $n references must be validated against the full
  // accumulated symbol count (not just those on the header line).
  const bisonSrc = [
    '%token NUMBER PLUS MINUS',
    '%%',
    'start : expr ;',
    'expr :',
    '    expr PLUS NUMBER   { $$ = $1 + $3; }',  // 3 symbols, $3 valid
    '  | expr MINUS NUMBER  { $$ = $1 - $3; }',  // 3 symbols, $3 valid
    '  | NUMBER',
    '  ;',
    '%%',
  ].join('\n');

  const doc = parseBisonDocument(bisonSrc);
  const exprRule = doc.rules.get('expr');

  // All three alternatives must be present (no phantom empty alt counted separately)
  assert(
    exprRule?.alternatives.length === 3,
    `Multi-line rule 'expr' has 3 alternatives (got ${exprRule?.alternatives.length})`,
  );

  // Continuation symbols must be accumulated into the first alternative
  assert(
    !!exprRule?.alternatives[0].symbols.includes('PLUS'),
    `First alt of 'expr' has PLUS (from continuation line)`,
  );
  assert(
    !!exprRule?.alternatives[0].symbols.includes('NUMBER'),
    `First alt of 'expr' has NUMBER (from continuation line)`,
  );

  const diags = computeBisonDiagnostics(doc, bisonSrc);

  // $3 is valid for a 3-symbol alternative — must NOT be flagged
  const oobDiags = diags.filter(d => d.message.includes('out of bounds'));
  assert(oobDiags.length === 0, `Valid $3 in 3-symbol multi-line alt is not flagged`);

  // Bare 'expr:' header with continuation body must NOT trigger %empty warning
  const emptyDiags = diags.filter(
    d => d.message.includes('%empty') && d.message.includes("'expr'"),
  );
  assert(emptyDiags.length === 0, `Multi-line 'expr:' does not trigger false %empty`);

  // — Negative case: $4 in a 3-symbol multi-line alt must still be caught ——
  const bisonOob = [
    '%token NUMBER PLUS',
    '%%',
    'start : expr ;',
    'expr :',
    '    expr PLUS NUMBER   { $$ = $4; }',  // 3 symbols, $4 out of bounds
    '  | NUMBER',
    '  ;',
    '%%',
  ].join('\n');

  const docOob = parseBisonDocument(bisonOob);
  const oobDiags2 = computeBisonDiagnostics(docOob, bisonOob)
    .filter(d => d.message.includes('$4') && d.message.includes('out of bounds'));
  assert(oobDiags2.length >= 1, `$4 in 3-symbol multi-line alt is still detected`);
  assert(oobDiags2[0]?.severity === 1, `Multi-line $n out-of-bounds is an Error`);

  // — Multi-line action block: $n refs are now tracked across lines ———————————
  const bisonMLAction = [
    '%token NUMBER PLUS',
    '%%',
    'start : expr ;',
    'expr : NUMBER PLUS NUMBER',   // 3 symbols
    '     {',                       // action opens on next line
    '       $$ = $1 + $3;',         // $1 and $3 valid
    '     }',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');

  const docMLA = parseBisonDocument(bisonMLAction);
  const mlaDiags = computeBisonDiagnostics(docMLA, bisonMLAction)
    .filter(d => d.message.includes('out of bounds'));
  assert(mlaDiags.length === 0, `Valid $1/$3 in multi-line action block are not flagged`);

  // $5 in a multi-line action block with only 3 symbols → Error
  const bisonMLAOob = [
    '%token NUMBER PLUS',
    '%%',
    'start : expr ;',
    'expr : NUMBER PLUS NUMBER',   // 3 symbols
    '     {',
    '       $$ = $5;',              // $5 out of bounds
    '     }',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');

  const docMLAOob = parseBisonDocument(bisonMLAOob);
  const mlaOobDiags = computeBisonDiagnostics(docMLAOob, bisonMLAOob)
    .filter(d => d.message.includes('$5') && d.message.includes('out of bounds'));
  assert(mlaOobDiags.length >= 1, `$5 in multi-line action (3 symbols) is detected`);
  assert(mlaOobDiags[0]?.severity === 1, `Multi-line action $5 out-of-bounds is an Error`);
}

// ════════════════════════════════════════
// TEST 23: Flex — POSIX character class patterns shadow keywords
// ════════════════════════════════════════
console.log('\n\n=== TEST: Flex POSIX class keyword overlap ===\n');

{
  // [[:alpha:]][[:alnum:]_]* is a general identifier matcher; 'if' after it is shadowed
  const flexSrc = [
    '%option noyywrap',
    '%%',
    '[[:alpha:]][[:alnum:]_]*  { /* identifier */ }',
    'if                        { /* keyword — shadowed */ }',
    '%%',
  ].join('\n');

  const { parseFlexDocument: pflexPosix } = require('../server/src/parser/flexParser');
  const flexDoc = pflexPosix(flexSrc);
  const diags = computeFlexDiagnostics(flexDoc, flexSrc);

  const overlapDiags = diags.filter(d => d.message.includes('shadowed') || d.message.includes('keyword'));
  assert(overlapDiags.length >= 1, `POSIX-class identifier pattern shadows 'if' keyword`);
  assert(overlapDiags[0]?.severity === 2, `POSIX keyword overlap Warning has Warning severity`);

  // Keyword BEFORE POSIX pattern → no warning
  const flexOk = [
    '%option noyywrap',
    '%%',
    'if                        { /* keyword first */ }',
    '[[:alpha:]][[:alnum:]_]*  { /* identifier */ }',
    '%%',
  ].join('\n');
  const flexDocOk = pflexPosix(flexOk);
  const okDiags = computeFlexDiagnostics(flexDocOk, flexOk);
  const okOverlap = okDiags.filter(d => d.message.includes('shadowed') || d.message.includes('keyword'));
  assert(okOverlap.length === 0, `Keyword before POSIX pattern is not flagged`);
}

// ════════════════════════════════════════
// TEST 24: %start references non-existent rule (NEW 5)
// ════════════════════════════════════════
console.log('\n\n=== TEST: %start references non-existent rule ===\n');

{
  const bisonBad = [
    '%token NUMBER',
    '%start missing_rule',
    '%%',
    'program : NUMBER ;',
    '%%',
  ].join('\n');

  const docBad = parseBisonDocument(bisonBad);
  assert(docBad.startSymbol === 'missing_rule', `%start 'missing_rule' parsed`);
  const diagsBad = computeBisonDiagnostics(docBad, bisonBad);
  const startErrDiags = diagsBad.filter(d => d.message.includes('missing_rule') && d.message.includes('no corresponding rule'));
  assert(startErrDiags.length >= 1, `%start with non-existent rule produces an Error`);
  assert(startErrDiags[0]?.severity === 1, `%start missing rule diagnostic has Error severity`);

  // Valid %start — no error
  const bisonOk = [
    '%token NUMBER',
    '%start program',
    '%%',
    'program : NUMBER ;',
    '%%',
  ].join('\n');
  const docOk = parseBisonDocument(bisonOk);
  const diagsOk = computeBisonDiagnostics(docOk, bisonOk);
  const startErrOk = diagsOk.filter(d => d.message.includes('no corresponding rule'));
  assert(startErrOk.length === 0, `Valid %start does not produce an Error`);
}

// ════════════════════════════════════════
// TEST 25: %prec with undeclared token (NEW 6)
// ════════════════════════════════════════
console.log('\n\n=== TEST: %prec with undeclared token ===\n');

{
  const bisonBad = [
    '%token NUMBER PLUS',
    '%%',
    'start : expr ;',
    'expr : expr PLUS expr %prec NONEXISTENT',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');

  const docBad = parseBisonDocument(bisonBad);
  const diagsBad = computeBisonDiagnostics(docBad, bisonBad);
  const precDiags = diagsBad.filter(d => d.message.includes('NONEXISTENT') && d.message.includes('%prec'));
  assert(precDiags.length >= 1, `%prec with undeclared token produces a Warning`);
  assert(precDiags[0]?.severity === 2, `%prec undeclared token has Warning severity`);

  // %prec with a declared token → no warning
  const bisonOk = [
    '%token NUMBER PLUS',
    '%right UMINUS',
    '%%',
    'start : expr ;',
    'expr : expr PLUS expr %prec UMINUS',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');
  const docOk = parseBisonDocument(bisonOk);
  const diagsOk = computeBisonDiagnostics(docOk, bisonOk);
  const precOk = diagsOk.filter(d => d.message.includes('UMINUS') && d.message.includes('%prec'));
  assert(precOk.length === 0, `%prec with declared token is not flagged`);
}

// ════════════════════════════════════════
// TEST 26: Duplicate rule definitions (NEW 7)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Duplicate rule definitions ===\n');

{
  const bisonDup = [
    '%token NUMBER PLUS',
    '%%',
    'start : expr ;',
    'expr : NUMBER PLUS NUMBER ;',
    'expr : NUMBER ;',           // duplicate!
    '%%',
  ].join('\n');

  const docDup = parseBisonDocument(bisonDup);
  assert(docDup.duplicateRules.length >= 1, `Duplicate rule 'expr' recorded`);
  assert(docDup.duplicateRules[0].name === 'expr', `Duplicate rule name is 'expr'`);

  const diagsDup = computeBisonDiagnostics(docDup, bisonDup);
  const dupDiags = diagsDup.filter(d => d.message.includes("'expr'") && d.message.includes('more than once'));
  assert(dupDiags.length >= 1, `Duplicate rule produces a Warning`);
  assert(dupDiags[0]?.severity === 2, `Duplicate rule Warning has Warning severity`);

  // No duplicate → no warning
  const bisonOk = [
    '%token NUMBER PLUS',
    '%%',
    'start : expr ;',
    'expr : NUMBER PLUS NUMBER',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');
  const docOk = parseBisonDocument(bisonOk);
  assert(docOk.duplicateRules.length === 0, `No duplicate rules in valid grammar`);
  const diagsOk = computeBisonDiagnostics(docOk, bisonOk);
  const dupOk = diagsOk.filter(d => d.message.includes('more than once'));
  assert(dupOk.length === 0, `No duplicate warning in valid grammar`);
}

// ════════════════════════════════════════
// TEST 27: Rule with no base case (NEW 8)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Rule with no base case ===\n');

{
  // All alternatives are recursive — no base case
  const bisonInfinite = [
    '%token PLUS',
    '%%',
    'start : expr ;',
    'expr : expr PLUS expr',
    '     | expr PLUS expr PLUS expr',
    '     ;',
    '%%',
  ].join('\n');

  const docInf = parseBisonDocument(bisonInfinite);
  const diagsInf = computeBisonDiagnostics(docInf, bisonInfinite);
  const baseDiags = diagsInf.filter(d => d.message.includes('no base case') && d.message.includes("'expr'"));
  assert(baseDiags.length >= 1, `Fully-recursive rule produces a Warning`);
  assert(baseDiags[0]?.severity === 2, `No-base-case Warning has Warning severity`);

  // Grammar with a base case — must NOT warn
  const bisonOk = [
    '%token NUMBER PLUS',
    '%%',
    'start : expr ;',
    'expr : expr PLUS NUMBER',
    '     | NUMBER',
    '     ;',
    '%%',
  ].join('\n');
  const docOk = parseBisonDocument(bisonOk);
  const diagsOk = computeBisonDiagnostics(docOk, bisonOk);
  const baseOk = diagsOk.filter(d => d.message.includes('no base case') && d.message.includes("'expr'"));
  assert(baseOk.length === 0, `Rule with base case does not trigger warning`);
}

// ════════════════════════════════════════
// TEST 28: Flex — multiple <<EOF>> rules for same context (NEW 8)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Flex duplicate <<EOF>> rules ===\n');

{
  const flexDup = [
    '%option noyywrap',
    '%%',
    '<<EOF>>   { return 0; }',
    '<<EOF>>   { return 1; }',  // duplicate for INITIAL context
    '[a-z]+    { }',
    '%%',
  ].join('\n');

  const { parseFlexDocument: pflexEof } = require('../server/src/parser/flexParser');
  const flexDoc = pflexEof(flexDup);
  const diags = computeFlexDiagnostics(flexDoc, flexDup);

  const eofDiags = diags.filter(d => d.message.includes('<<EOF>>') && d.message.includes('Duplicate'));
  assert(eofDiags.length >= 1, `Duplicate <<EOF>> rules produce a Warning`);
  assert(eofDiags[0]?.severity === 2, `Duplicate <<EOF>> Warning has Warning severity`);

  // Single <<EOF>> — no warning
  const flexOk = [
    '%option noyywrap',
    '%%',
    '[a-z]+    { }',
    '<<EOF>>   { return 0; }',
    '%%',
  ].join('\n');
  const flexDocOk = pflexEof(flexOk);
  const okDiags = computeFlexDiagnostics(flexDocOk, flexOk);
  const eofOk = okDiags.filter(d => d.message.includes('<<EOF>>') && d.message.includes('Duplicate'));
  assert(eofOk.length === 0, `Single <<EOF>> rule does not trigger a warning`);
}

// ════════════════════════════════════════
// TEST 29: Flex — %option stack without stack calls (NEW 9)
// ════════════════════════════════════════
console.log('\n\n=== TEST: Flex %option stack unused ===\n');

{
  const flexUnused = [
    '%option noyywrap stack',
    '%%',
    '[a-z]+   { }',
    '%%',
  ].join('\n');

  const { parseFlexDocument: pflexStack } = require('../server/src/parser/flexParser');
  const flexDoc = pflexStack(flexUnused);
  const diags = computeFlexDiagnostics(flexDoc, flexUnused);

  const stackDiags = diags.filter(d => d.message.includes('stack') && d.message.includes('yy_push_state'));
  assert(stackDiags.length >= 1, `%option stack without stack calls produces a Warning`);
  assert(stackDiags[0]?.severity === 2, `Unused stack option has Warning severity`);

  // With yy_push_state in code → no warning
  const flexUsed = [
    '%option noyywrap stack',
    '%%',
    '[a-z]+   { yy_push_state(0); }',
    '%%',
  ].join('\n');
  const flexDocUsed = pflexStack(flexUsed);
  const usedDiags = computeFlexDiagnostics(flexDocUsed, flexUsed);
  const stackUsed = usedDiags.filter(d => d.message.includes('stack') && d.message.includes('yy_push_state'));
  assert(stackUsed.length === 0, `%option stack with yy_push_state call is not flagged`);
}

// ════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
