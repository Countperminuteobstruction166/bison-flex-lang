import { Hover, Position, MarkupContent, MarkupKind, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BisonDocument, FlexDocument, DocumentModel, RuleAlternative, isBisonDocument } from '../parser/types';
import {
  DocEntry,
  bisonDirectiveDocs,
  bisonDefineDocs,
  bisonSemanticDocs,
  flexDirectiveDocs,
  flexOptionDocs,
  flexBuiltinDocs,
} from './documentation';
import { getWordAtPosition as getWordUtil } from './utils';
import { computeFirstSets, computeFollowSets } from './firstFollow';

export function getHover(
  doc: DocumentModel,
  textDoc: TextDocument,
  position: Position,
  companionBison?: BisonDocument,
): Hover | null {
  const text = textDoc.getText();
  const lines = text.split(/\r?\n/);
  const line = lines[position.line] || '';

  const wordInfo = getWordUtil(line, position.line, position.character);
  if (!wordInfo) return null;
  const word = wordInfo.word;

  if (isBisonDocument(doc)) {
    return getBisonHover(doc, word, line, position);
  } else {
    return getFlexHover(doc as FlexDocument, word, line, position, companionBison);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** True when position is inside range (inclusive start, exclusive end). */
function containsPosition(range: Range, pos: Position): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) return false;
  if (pos.line === range.start.line && pos.character < range.start.character) return false;
  if (pos.line === range.end.line && pos.character > range.end.character) return false;
  return true;
}

/** Find the rule name + alternative that contains the given position. */
function findEnclosingAlternative(
  doc: BisonDocument,
  position: Position,
): { ruleName: string; alt: RuleAlternative } | null {
  for (const [ruleName, rule] of doc.rules) {
    for (const alt of rule.alternatives) {
      if (containsPosition(alt.range, position)) {
        return { ruleName, alt };
      }
    }
  }
  return null;
}

/** Return up to `limit` rule names whose alternatives reference the given symbol. */
function findReferencingRules(doc: BisonDocument, symbol: string, limit = 6): string[] {
  const found: string[] = [];
  for (const [name, rule] of doc.rules) {
    if (found.length >= limit) break;
    for (const alt of rule.alternatives) {
      if (alt.symbols.includes(symbol)) {
        found.push(name);
        break;
      }
    }
  }
  return found;
}

/** Resolve the declared type of a Bison symbol (token or non-terminal). */
function symbolType(doc: BisonDocument, sym: string): string | undefined {
  return doc.tokens.get(sym)?.type ?? doc.nonTerminals.get(sym)?.type;
}

// ── makeHover ────────────────────────────────────────────────────────────────

/** Render a DocEntry as a Hover. */
function makeHover(entry: DocEntry, lang: 'bison' | 'flex' = 'bison'): Hover {
  let value = `\`\`\`${lang}\n${entry.signature}\n\`\`\`\n\n${entry.description}`;
  if (entry.example) {
    value += `\n\n**Simple example:**\n\`\`\`${lang}\n${entry.example}\n\`\`\``;
  }
  if (entry.example2) {
    value += `\n\n**Advanced example:**\n\`\`\`${lang}\n${entry.example2}\n\`\`\``;
  }
  if (entry.commonErrors) {
    value += `\n\n> ⚠️ **Common error:** ${entry.commonErrors}`;
  }
  if (entry.docUrl) {
    value += `\n\n[→ GNU documentation](${entry.docUrl})`;
  }
  const content: MarkupContent = { kind: MarkupKind.Markdown, value };
  return { contents: content };
}

// ── Bison hover ───────────────────────────────────────────────────────────────

function getBisonHover(doc: BisonDocument, word: string, line: string, position: Position): Hover | null {
  // 1. Directives (start with %)
  if (word.startsWith('%')) {
    const entry = bisonDirectiveDocs.get(word);
    if (entry) return makeHover(entry, 'bison');
  }

  // 2. %define variables (on a %define line or via direct map lookup)
  if (line.trim().startsWith('%define')) {
    const entry = bisonDefineDocs.get(word);
    if (entry) return makeHover(entry, 'bison');
  }
  const defineEntry = bisonDefineDocs.get(word);
  if (defineEntry) return makeHover(defineEntry, 'bison');

  // 3. Semantic values: $$ / $N / @$ / @N
  if (word === '$$' || word === '@$') {
    const entry = bisonSemanticDocs.get(word);
    if (entry) {
      // Try to enrich with the actual LHS type from the enclosing rule
      const enclosing = findEnclosingAlternative(doc, position);
      if (enclosing) {
        const type = symbolType(doc, enclosing.ruleName);
        const base = makeHover(entry, 'bison');
        if (type) {
          const extra = `\n\n**Inferred type** (rule \`${enclosing.ruleName}\`): \`<${type}>\``;
          const mc = base.contents as MarkupContent;
          if (mc && typeof mc === 'object' && 'value' in mc) mc.value += extra;
        }
        return base;
      }
      return makeHover(entry, 'bison');
    }
  }

  if (/^\$[0-9]+$/.test(word)) {
    const n = parseInt(word.slice(1), 10);
    const enclosing = findEnclosingAlternative(doc, position);
    if (enclosing && n >= 1 && n <= enclosing.alt.symbols.length) {
      const sym = enclosing.alt.symbols[n - 1];
      const type = symbolType(doc, sym);
      const isToken = doc.tokens.has(sym);
      const parts = [
        `**\`${word}\`** — N-th symbol of rule \`${enclosing.ruleName}\``,
        `**Symbol:** \`${sym}\` (${isToken ? 'token' : 'non-terminal'})`,
      ];
      if (type) parts.push(`**Type:** \`<${type}>\``);
      else parts.push('**Type:** *(none declared)*');
      return { contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') } };
    }
    const entry = bisonSemanticDocs.get('$1');
    if (entry) return makeHover(entry, 'bison');
  }

  if (/^@[0-9]+$/.test(word)) {
    const entry = bisonSemanticDocs.get('@1');
    if (entry) return makeHover(entry, 'bison');
  }

  // 4. Token declarations
  const tokenDecl = doc.tokens.get(word);
  if (tokenDecl) {
    const usageCount = doc.ruleReferences.get(word)?.length ?? 0;
    const referencingRules = findReferencingRules(doc, word);
    const parts: string[] = [`**Token:** \`${word}\``];
    parts.push(`**Declared at:** line ${tokenDecl.location.start.line + 1} (\`%token\`)`);
    if (tokenDecl.type) parts.push(`**Type:** \`<${tokenDecl.type}>\``);
    if (tokenDecl.alias) parts.push(`**Alias:** \`"${tokenDecl.alias}"\``);
    if (tokenDecl.value !== undefined) parts.push(`**Value:** \`${tokenDecl.value}\``);
    parts.push(`**Used:** ${usageCount} time${usageCount !== 1 ? 's' : ''} in rule bodies`);
    if (referencingRules.length > 0) {
      parts.push(`**Appears in:** ${referencingRules.map(r => `\`${r}\``).join(', ')}`);
    }
    return { contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') } };
  }

  // 5. Non-terminal declarations
  const ntDecl = doc.nonTerminals.get(word);
  if (ntDecl) {
    const usageCount = doc.ruleReferences.get(word)?.length ?? 0;
    const referencingRules = findReferencingRules(doc, word);
    const parts: string[] = [`**Non-terminal:** \`${word}\``];
    parts.push(`**Declared at:** line ${ntDecl.location.start.line + 1} (\`%type\`)`);
    if (ntDecl.type) parts.push(`**Type:** \`<${ntDecl.type}>\``);
    parts.push(`**Used:** ${usageCount} time${usageCount !== 1 ? 's' : ''} in rule bodies`);
    if (referencingRules.length > 0) {
      parts.push(`**Referenced by:** ${referencingRules.map(r => `\`${r}\``).join(', ')}`);
    }
    return { contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') } };
  }

  // 6. Rule names — First/Follow sets + usage info
  const rule = doc.rules.get(word);
  if (rule) {
    const type = doc.nonTerminals.get(word);
    const usageCount = doc.ruleReferences.get(word)?.length ?? 0;
    const referencingRules = findReferencingRules(doc, word);
    const parts: string[] = [`**Rule:** \`${word}\``];
    parts.push(`**Defined at:** line ${rule.location.start.line + 1}`);
    if (type?.type) parts.push(`**Type:** \`<${type.type}>\``);
    parts.push(`**Alternatives:** ${rule.alternatives.length}`);
    parts.push(`**Used:** ${usageCount} time${usageCount !== 1 ? 's' : ''} in other rules`);
    if (referencingRules.length > 0) {
      parts.push(`**Referenced by:** ${referencingRules.map(r => `\`${r}\``).join(', ')}`);
    }

    // First / Follow sets
    const firstSets = computeFirstSets(doc);
    const followSets = computeFollowSets(doc, firstSets);
    const firstSet = firstSets.get(word);
    const followSet = followSets.get(word);
    if (firstSet && firstSet.size > 0) {
      parts.push(`**First(${word})** = { ${[...firstSet].sort().join(', ')} }`);
    }
    if (followSet && followSet.size > 0) {
      parts.push(`**Follow(${word})** = { ${[...followSet].sort().join(', ')} }`);
    }

    return { contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') } };
  }

  return null;
}

// ── Flex hover ────────────────────────────────────────────────────────────────

function getFlexHover(
  doc: FlexDocument,
  word: string,
  line: string,
  position: Position,
  companionBison?: BisonDocument,
): Hover | null {
  // 1. Flex directives
  if (word.startsWith('%')) {
    const entry = flexDirectiveDocs.get(word);
    if (entry) return makeHover(entry, 'flex');
  }

  // 2. %option values
  if (line.trim().startsWith('%option')) {
    const optionEntry = flexOptionDocs.get(word);
    if (optionEntry) return makeHover(optionEntry, 'flex');
  }
  const optEntry = flexOptionDocs.get(word);
  if (optEntry) return makeHover(optEntry, 'flex');

  // 3. Built-in functions / patterns
  // Handle <<EOF>> character range
  if (line.includes('<<EOF>>')) {
    const idx = line.indexOf('<<EOF>>');
    if (position.character >= idx && position.character <= idx + 7) {
      const entry = flexBuiltinDocs.get('<<EOF>>');
      if (entry) return makeHover(entry, 'flex');
    }
  }
  const builtinEntry = flexBuiltinDocs.get(word);
  if (builtinEntry) return makeHover(builtinEntry, 'flex');

  // 4. INITIAL special case
  if (word === 'INITIAL') {
    const entry = flexBuiltinDocs.get('INITIAL');
    if (entry) return makeHover(entry, 'flex');
  }

  // 5. Start conditions
  const sc = doc.startConditions.get(word);
  if (sc) {
    const usageCount = doc.startConditionRefs.get(word)?.length ?? 0;
    const parts = [
      `**Start condition:** \`${word}\``,
      `**Type:** ${sc.exclusive ? 'Exclusive (`%x`)' : 'Inclusive (`%s`)'}`,
      `**Declared at:** line ${sc.location.start.line + 1}`,
      `**Used:** ${usageCount} time${usageCount !== 1 ? 's' : ''} in rules`,
    ];
    return { contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') } };
  }

  // 6. Abbreviations
  const abbr = doc.abbreviations.get(word);
  if (abbr) {
    const usageCount = doc.abbreviationRefs.get(word)?.length ?? 0;
    const parts = [
      `**Abbreviation:** \`${word}\``,
      `**Pattern:** \`${abbr.pattern}\``,
      `**Defined at:** line ${abbr.location.start.line + 1}`,
      `**Used:** ${usageCount} time${usageCount !== 1 ? 's' : ''} in rules`,
    ];
    return { contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') } };
  }

  // 7. Cross-file: token declared in companion .y file
  if (companionBison) {
    const tokenDecl = companionBison.tokens.get(word);
    if (tokenDecl) {
      const parts = [
        `**Token** *(from companion \`.y\`)*: \`${word}\``,
        `**Declared at:** line ${tokenDecl.location.start.line + 1} in grammar file (\`%token\`)`,
      ];
      if (tokenDecl.type) parts.push(`**Type:** \`<${tokenDecl.type}>\``);
      if (tokenDecl.alias) parts.push(`**Alias:** \`"${tokenDecl.alias}"\``);
      if (tokenDecl.value !== undefined) parts.push(`**Value:** \`${tokenDecl.value}\``);
      return { contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') } };
    }
  }

  return null;
}
