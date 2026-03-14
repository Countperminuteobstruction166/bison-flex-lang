import { Range } from 'vscode-languageserver';
import {
  BisonDocument,
  TokenDeclaration,
  NonTerminalDeclaration,
  DefineDeclaration,
  PrecedenceDeclaration,
  RuleDefinition,
  RuleAlternative,
} from './types';

/**
 * All directives recognized by GNU Bison (and common deprecated aliases).
 * Anything starting with % that isn't in this set → unknown directive diagnostic.
 */
const KNOWN_BISON_DIRECTIVES = new Set([
  'token', 'type', 'nterm', 'define', 'code',
  'left', 'right', 'nonassoc', 'precedence',
  'start', 'union', 'expect', 'expect-rr', 'require',
  'language', 'skeleton', 'glr-parser', 'locations',
  'defines', 'debug', 'param', 'parse-param', 'lex-param',
  'printer', 'destructor', 'empty', 'prec',
  'initial-action', 'verbose', 'no-lines', 'token-table',
  'output', 'file-prefix', 'header', 'name-prefix',
  'pure-parser', 'error-verbose',
]);

export function parseBisonDocument(text: string): BisonDocument {
  const lines = text.split(/\r?\n/);
  const doc: BisonDocument = {
    tokens: new Map(),
    nonTerminals: new Map(),
    defines: new Map(),
    precedence: [],
    codeBlocks: [],
    rules: new Map(),
    separators: [],
    ruleReferences: new Map(),
    unknownDirectives: [],
  };

  // Phase 1: Find %% separators (skip those inside code blocks)
  let braceDepth = 0;
  let inPrologueBlock = false; // %{ ... %}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '%{') {
      inPrologueBlock = true;
      continue;
    }
    if (trimmed === '%}') {
      inPrologueBlock = false;
      continue;
    }
    if (inPrologueBlock) continue;

    // Track brace depth for %code blocks etc.
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }

    if (trimmed === '%%' && braceDepth === 0) {
      doc.separators.push(i);
    }
  }

  const declarationsEnd = doc.separators.length > 0 ? doc.separators[0] : lines.length;
  const rulesStart = doc.separators.length > 0 ? doc.separators[0] + 1 : lines.length;
  const rulesEnd = doc.separators.length > 1 ? doc.separators[1] : lines.length;

  // Phase 2: Parse declarations section
  let lastTokenDirectiveLine = -1;
  let lastTokenType: string | undefined;

  for (let i = 0; i < declarationsEnd; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    // Skip %{ %} blocks
    if (trimmed === '%{' || trimmed === '%}') continue;

    // %token <type> NAME "alias" NAME2 "alias2" ...
    const tokenMatch = trimmed.match(/^%token(?:\s+<([^>]+)>)?\s+(.+)/);
    if (tokenMatch) {
      lastTokenType = tokenMatch[1];
      lastTokenDirectiveLine = i;
      parseTokenNames(tokenMatch[2], lastTokenType, i, doc);
      continue;
    }

    // %type <type> name1 name2 ...
    const typeMatch = trimmed.match(/^%type\s+<([^>]+)>\s+(.+)/);
    if (typeMatch) {
      const type = typeMatch[1];
      const names = typeMatch[2].match(/[a-zA-Z_][a-zA-Z0-9_.]*/g);
      if (names) {
        for (const name of names) {
          const col = line.indexOf(name);
          const decl: NonTerminalDeclaration = {
            name,
            type,
            location: Range.create(i, col, i, col + name.length),
          };
          doc.nonTerminals.set(name, decl);
        }
      }
      continue;
    }

    // %nterm <type> name1 name2 ...
    const ntermMatch = trimmed.match(/^%nterm\s+<([^>]+)>\s+(.+)/);
    if (ntermMatch) {
      const type = ntermMatch[1];
      const names = ntermMatch[2].match(/[a-zA-Z_][a-zA-Z0-9_.]*/g);
      if (names) {
        for (const name of names) {
          const col = line.indexOf(name);
          doc.nonTerminals.set(name, {
            name,
            type,
            location: Range.create(i, col, i, col + name.length),
          });
        }
      }
      continue;
    }

    // %define variable value
    const defineMatch = trimmed.match(/^%define\s+([a-zA-Z_.][a-zA-Z_.0-9-]*)\s*(.*)/);
    if (defineMatch) {
      const variable = defineMatch[1];
      const value = defineMatch[2]?.trim() || '';
      const col = line.indexOf(variable);
      doc.defines.set(variable, {
        variable,
        value,
        location: Range.create(i, col, i, col + variable.length),
      });
      continue;
    }

    // %left / %right / %nonassoc / %precedence
    const precMatch = trimmed.match(/^%(left|right|nonassoc|precedence)\s+(.*)/);
    if (precMatch) {
      const kind = precMatch[1] as PrecedenceDeclaration['kind'];
      const symbols = precMatch[2].match(/[A-Z_][A-Z0-9_]*|"[^"]*"/g) || [];
      doc.precedence.push({
        kind,
        symbols: symbols.map(s => s.replace(/"/g, '')),
        location: Range.create(i, 0, i, line.length),
      });
      continue;
    }

    // %start symbol
    const startMatch = trimmed.match(/^%start\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (startMatch) {
      doc.startSymbol = startMatch[1];
      continue;
    }

    // %expect / %expect-rr
    // %require, %language, %skeleton, etc. — parsed for awareness but no special handling

    // Continuation lines for %token (indented ALL_CAPS names after a %token line)
    if (lastTokenDirectiveLine >= 0 && i === lastTokenDirectiveLine + 1 && /^\s+[A-Z_]/.test(line)) {
      parseTokenNames(trimmed, lastTokenType, i, doc);
      lastTokenDirectiveLine = i; // allow chaining
      continue;
    }
    if (/^\s+[A-Z_]/.test(line) && i > 0 && i <= lastTokenDirectiveLine + 1) {
      parseTokenNames(trimmed, lastTokenType, i, doc);
      lastTokenDirectiveLine = i;
      continue;
    }

    lastTokenDirectiveLine = -1;

    // Unknown directive: any %word that didn't match a known pattern above
    if (trimmed.startsWith('%') && !trimmed.startsWith('%%')) {
      const directiveMatch = trimmed.match(/^%([a-zA-Z][a-zA-Z0-9_-]*)/);
      if (directiveMatch && !KNOWN_BISON_DIRECTIVES.has(directiveMatch[1])) {
        doc.unknownDirectives.push({
          name: '%' + directiveMatch[1],
          location: Range.create(i, 0, i, directiveMatch[0].length),
        });
      }
    }
  }

  // Phase 3: Parse rules section
  let currentRule: string | undefined;
  braceDepth = 0;

  for (let i = rulesStart; i < rulesEnd; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    // Skip lines inside action blocks
    if (braceDepth > 0) {
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
      }
      continue;
    }

    // Rule definition: name:
    const ruleDefMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*:/);
    if (ruleDefMatch) {
      currentRule = ruleDefMatch[1];
      const col = line.indexOf(currentRule);
      if (!doc.rules.has(currentRule)) {
        doc.rules.set(currentRule, {
          name: currentRule,
          location: Range.create(i, col, i, col + currentRule.length),
          alternatives: [],
        });
      }
      // Parse the rest of the line after ':' as the first alternative
      const rest = trimmed.substring(ruleDefMatch[0].length);
      const altRange = Range.create(i, 0, i, line.length);
      const alt: RuleAlternative = { range: altRange, firstSymbol: getFirstSymbol(rest), symbols: extractSymbols(rest) };
      doc.rules.get(currentRule)!.alternatives.push(alt);
      extractRuleReferences(rest, i, line, doc);
    } else if (trimmed.startsWith('|') && currentRule) {
      // New alternative: track first symbol
      const altBody = trimmed.slice(1); // strip leading '|'
      const altRange = Range.create(i, 0, i, line.length);
      const alt: RuleAlternative = { range: altRange, firstSymbol: getFirstSymbol(altBody), symbols: extractSymbols(altBody) };
      doc.rules.get(currentRule)?.alternatives.push(alt);
      extractRuleReferences(trimmed, i, line, doc);
    } else if (currentRule) {
      // Continuation of current alternative (no '|', no rule def)
      extractRuleReferences(trimmed, i, line, doc);
    }

    // Track braces
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }

    // %token directive in rules section (e.g., %token CHUNKS "_chunks")
    const inlineTokenMatch = trimmed.match(/^%token\s+([A-Z_][A-Z0-9_]*)\s*(".*")?/);
    if (inlineTokenMatch) {
      const name = inlineTokenMatch[1];
      const alias = inlineTokenMatch[2]?.replace(/"/g, '');
      const col = line.indexOf(name);
      doc.tokens.set(name, {
        name,
        alias,
        location: Range.create(i, col, i, col + name.length),
      });
    }
  }

  return doc;
}

/**
 * Extract all grammar symbols (identifiers) from a production RHS in order.
 */
function extractSymbols(text: string): string[] {
  const cleaned = text
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')    // remove strings
    .replace(/\{[^}]*\}/g, ' ')            // remove inline actions
    .replace(/%prec\s+\S+/g, ' ')          // remove %prec TOKEN
    .replace(/%empty/g, ' ')               // remove %empty
    .replace(/\/\/.*$/g, ' ')              // remove line comments
    .trim();
  const symbols: string[] = [];
  const regex = /\b([a-zA-Z_][a-zA-Z0-9_.]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(cleaned)) !== null) {
    symbols.push(m[1]);
  }
  return symbols;
}

/**
 * Extract the first terminal or non-terminal symbol from a production RHS.
 * Returns undefined for empty productions (%empty) or pure action blocks.
 */
function getFirstSymbol(text: string): string | undefined {
  const cleaned = text
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')    // remove strings
    .replace(/\{[^}]*\}/g, ' ')            // remove inline actions
    .replace(/%prec\s+\S+/g, ' ')          // remove %prec TOKEN
    .replace(/%empty/g, ' ')               // remove %empty
    .replace(/\/\/.*$/g, ' ')             // remove line comments
    .trim();
  const m = cleaned.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)/);
  return m ? m[1] : undefined;
}

function parseTokenNames(text: string, type: string | undefined, lineNum: number, doc: BisonDocument): void {
  // Match patterns like: NAME "alias" VALUE  or just NAME
  const regex = /([A-Z_][A-Z0-9_]*)\s*(?:("(?:[^"\\]|\\.)*")\s*)?(?:(\d+)\s*)?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const alias = match[2]?.replace(/"/g, '');
    const value = match[3] ? parseInt(match[3]) : undefined;
    const decl: TokenDeclaration = {
      name,
      type,
      alias,
      location: Range.create(lineNum, match.index, lineNum, match.index + name.length),
      value,
    };
    doc.tokens.set(name, decl);
  }
}

function extractRuleReferences(text: string, lineNum: number, fullLine: string, doc: BisonDocument): void {
  // Find identifiers in rule bodies (potential token/nonterminal references)
  // Skip: strings, actions (braces), %prec, %empty, comments
  const cleaned = text
    .replace(/"(?:[^"\\]|\\.)*"/g, '')     // remove strings
    .replace(/\{[^}]*\}/g, '')             // remove inline actions
    .replace(/%prec\s+\S+/g, '')           // remove %prec
    .replace(/%empty/g, '')                // remove %empty
    .replace(/\/\/.*$/g, '');              // remove line comments

  const identifiers = cleaned.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_.]*)\b/g);
  for (const m of identifiers) {
    const name = m[0];
    if (!name) continue;
    const col = fullLine.indexOf(name, m.index);
    const range = Range.create(lineNum, col >= 0 ? col : 0, lineNum, (col >= 0 ? col : 0) + name.length);
    if (!doc.ruleReferences.has(name)) {
      doc.ruleReferences.set(name, []);
    }
    doc.ruleReferences.get(name)!.push(range);
  }
}
