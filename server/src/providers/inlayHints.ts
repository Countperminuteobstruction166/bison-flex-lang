import { InlayHint, InlayHintKind, Position, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentModel, BisonDocument, isBisonDocument } from '../parser/types';

/**
 * Provide inlay hints showing the inferred type of $1, $2, $$, etc.
 * Only applies to Bison files where %type / %token declare types.
 */
export function getInlayHints(
  doc: DocumentModel,
  textDoc: TextDocument,
  range: Range
): InlayHint[] {
  // Inlay hints only make sense for Bison (typed semantic values $N)
  if (!isBisonDocument(doc)) return [];

  return getBisonInlayHints(doc, textDoc, range);
}

interface LineContext {
  ruleName: string;
  symbols: string[];
}

function getBisonInlayHints(doc: BisonDocument, textDoc: TextDocument, range: Range): InlayHint[] {
  const hints: InlayHint[] = [];
  const text = textDoc.getText();
  const lines = text.split(/\r?\n/);

  const rulesStart = doc.separators.length > 0 ? doc.separators[0] + 1 : lines.length;
  const rulesEnd = doc.separators.length > 1 ? doc.separators[1] : lines.length;

  // Phase 1: Build a map of line → { ruleName, ordered symbols } for the rules section.
  // We walk through rule definitions and track which alternative each line belongs to.
  let currentRuleName: string | undefined;
  let currentSymbols: string[] = [];
  let braceDepth = 0;
  const lineContext = new Map<number, LineContext>();

  for (let i = rulesStart; i < rulesEnd; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    if (braceDepth === 0) {
      // Rule definition: name :
      const ruleDefMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*:/);
      if (ruleDefMatch) {
        currentRuleName = ruleDefMatch[1];
        const rest = trimmed.substring(ruleDefMatch[0].length);
        currentSymbols = extractOrderedSymbols(rest);
      } else if (trimmed.startsWith('|') && currentRuleName) {
        // New alternative
        currentSymbols = extractOrderedSymbols(trimmed.slice(1));
      } else if (currentRuleName && trimmed !== ';') {
        // Continuation line — may add more symbols before the action block
        const moreSymbols = extractOrderedSymbols(trimmed);
        if (moreSymbols.length > 0) {
          currentSymbols = [...currentSymbols, ...moreSymbols];
        }
      }

      if (trimmed === ';') {
        currentRuleName = undefined;
        currentSymbols = [];
      }
    }

    // Record context for this line (even inside action blocks, so $N can be resolved)
    if (currentRuleName) {
      lineContext.set(i, { ruleName: currentRuleName, symbols: [...currentSymbols] });
    }

    // Track brace depth
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }

    if (trimmed === ';' && braceDepth === 0) {
      currentRuleName = undefined;
      currentSymbols = [];
    }
  }

  // Phase 2: Scan the requested range for $N / $$ patterns and resolve types.
  const startLine = Math.max(range.start.line, rulesStart);
  const endLine = Math.min(range.end.line, rulesEnd - 1);

  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i];
    if (!line) continue;

    const ctx = lineContext.get(i);
    if (!ctx) continue;

    // Find all $N and $$ occurrences
    const dollarMatches = line.matchAll(/\$(\$|\d+)/g);
    for (const m of dollarMatches) {
      const value = m[1];
      const col = m.index!;

      let type: string | undefined;

      if (value === '$') {
        // $$ → type of the rule's own non-terminal (LHS)
        type = resolveSymbolType(doc, ctx.ruleName);
      } else {
        const n = parseInt(value);
        if (n >= 1 && n <= ctx.symbols.length) {
          const symbol = ctx.symbols[n - 1];
          type = resolveSymbolType(doc, symbol);
        }
      }

      if (type) {
        hints.push({
          position: Position.create(i, col + m[0].length),
          label: `/* <${type}> */`,
          kind: InlayHintKind.Type,
          paddingLeft: true,
        });
      }
    }
  }

  return hints;
}

/**
 * Extract the ordered list of grammar symbols from a production body,
 * stopping at the first action block `{` or semicolon `;`.
 */
function extractOrderedSymbols(text: string): string[] {
  let cleaned = text
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')   // remove double-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')    // remove single-quoted char literals
    .replace(/%prec\s+\S+/g, ' ')          // remove %prec TOKEN
    .replace(/%empty/g, ' ')               // remove %empty
    .replace(/\/\/.*$/g, ' ');             // remove line comments

  // Stop at first action block
  const braceIdx = cleaned.indexOf('{');
  if (braceIdx >= 0) cleaned = cleaned.substring(0, braceIdx);

  // Stop at semicolon
  const semiIdx = cleaned.indexOf(';');
  if (semiIdx >= 0) cleaned = cleaned.substring(0, semiIdx);

  const symbols: string[] = [];
  const matches = cleaned.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_.]*)\b/g);
  for (const m of matches) {
    symbols.push(m[1]);
  }
  return symbols;
}

/**
 * Resolve a symbol name to its declared type (from %token or %type/%nterm).
 */
function resolveSymbolType(doc: BisonDocument, symbol: string): string | undefined {
  const token = doc.tokens.get(symbol);
  if (token?.type) return token.type;

  const nt = doc.nonTerminals.get(symbol);
  if (nt?.type) return nt.type;

  return undefined;
}
