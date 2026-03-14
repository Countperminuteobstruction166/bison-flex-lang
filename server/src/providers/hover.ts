import { Hover, Position, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BisonDocument, FlexDocument, DocumentModel, isBisonDocument } from '../parser/types';
import {
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
  position: Position
): Hover | null {
  const text = textDoc.getText();
  const lines = text.split(/\r?\n/);
  const line = lines[position.line] || '';

  // Get the word under cursor (extended to handle %, $, @, dots, hyphens)
  const wordInfo = getWordUtil(line, position.line, position.character);
  if (!wordInfo) return null;
  const word = wordInfo.word;

  if (isBisonDocument(doc)) {
    return getBisonHover(doc, word, line, position);
  } else {
    return getFlexHover(doc, word, line, position);
  }
}

function getBisonHover(doc: BisonDocument, word: string, line: string, position: Position): Hover | null {
  // 1. Check if it's a directive (starts with %)
  if (word.startsWith('%')) {
    const entry = bisonDirectiveDocs.get(word);
    if (entry) {
      return makeHover(entry.signature, entry.description, entry.example);
    }
  }

  // 2. Check if it's a %define variable (on a %define line)
  if (line.trim().startsWith('%define')) {
    const entry = bisonDefineDocs.get(word);
    if (entry) {
      return makeHover(entry.signature, entry.description, entry.example);
    }
  }

  // 3. Check if hovering on a known %define variable anywhere
  const defineEntry = bisonDefineDocs.get(word);
  if (defineEntry) {
    return makeHover(defineEntry.signature, defineEntry.description, defineEntry.example);
  }

  // 4. Semantic values
  if (word.startsWith('$') || word.startsWith('@')) {
    let key = word;
    // Normalize: $2, $3 etc. -> $1
    if (/^\$[0-9]+$/.test(word)) key = '$1';
    if (/^@[0-9]+$/.test(word)) key = '@1';

    const entry = bisonSemanticDocs.get(key);
    if (entry) {
      return makeHover(entry.signature, entry.description, entry.example);
    }
  }

  // 5. Token names
  const tokenDecl = doc.tokens.get(word);
  if (tokenDecl) {
    const parts = [`**Token:** \`${word}\``];
    if (tokenDecl.type) parts.push(`**Type:** \`<${tokenDecl.type}>\``);
    if (tokenDecl.alias) parts.push(`**Alias:** \`"${tokenDecl.alias}"\``);
    if (tokenDecl.value !== undefined) parts.push(`**Value:** \`${tokenDecl.value}\``);
    return {
      contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') },
    };
  }

  // 6. Non-terminal names
  const ntDecl = doc.nonTerminals.get(word);
  if (ntDecl) {
    const parts = [`**Non-terminal:** \`${word}\``];
    if (ntDecl.type) parts.push(`**Type:** \`<${ntDecl.type}>\``);
    return {
      contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') },
    };
  }

  // 7. Rule names — with First/Follow sets
  const rule = doc.rules.get(word);
  if (rule) {
    const type = doc.nonTerminals.get(word);
    const parts = [`**Rule:** \`${word}\``];
    if (type?.type) parts.push(`**Type:** \`<${type.type}>\``);
    parts.push(`Defined at line ${rule.location.start.line + 1}`);

    // Compute and display First/Follow sets
    const firstSets = computeFirstSets(doc);
    const followSets = computeFollowSets(doc, firstSets);
    const firstSet = firstSets.get(word);
    const followSet = followSets.get(word);
    if (firstSet && firstSet.size > 0) {
      parts.push(`**First:** { ${[...firstSet].sort().join(', ')} }`);
    }
    if (followSet && followSet.size > 0) {
      parts.push(`**Follow:** { ${[...followSet].sort().join(', ')} }`);
    }

    return {
      contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') },
    };
  }

  return null;
}

function getFlexHover(doc: FlexDocument, word: string, line: string, position: Position): Hover | null {
  // 1. Flex directives
  if (word.startsWith('%')) {
    const entry = flexDirectiveDocs.get(word);
    if (entry) {
      return makeHover(entry.signature, entry.description, entry.example);
    }
  }

  // 2. %option values
  if (line.trim().startsWith('%option')) {
    const optionEntry = flexOptionDocs.get(word);
    if (optionEntry) {
      return makeHover(optionEntry.signature, optionEntry.description);
    }
  }

  // Check option docs even outside %option lines
  const optEntry = flexOptionDocs.get(word);
  if (optEntry) {
    return makeHover(optEntry.signature, optEntry.description);
  }

  // 3. Built-in functions and special patterns
  const builtinEntry = flexBuiltinDocs.get(word);
  if (builtinEntry) {
    return makeHover(builtinEntry.signature, builtinEntry.description, builtinEntry.example);
  }

  // Handle <<EOF>> specially
  if (line.includes('<<EOF>>') && position.character >= line.indexOf('<<EOF>>') && position.character <= line.indexOf('<<EOF>>') + 7) {
    const entry = flexBuiltinDocs.get('<<EOF>>');
    if (entry) {
      return makeHover(entry.signature, entry.description, entry.example);
    }
  }

  // 4. Start conditions
  const sc = doc.startConditions.get(word);
  if (sc) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**Start condition:** \`${word}\`\n\n**Type:** ${sc.exclusive ? 'Exclusive (%x)' : 'Inclusive (%s)'}\n\nDeclared at line ${sc.location.start.line + 1}`,
      },
    };
  }

  // INITIAL special case
  if (word === 'INITIAL') {
    const entry = flexBuiltinDocs.get('INITIAL');
    if (entry) {
      return makeHover(entry.signature, entry.description);
    }
  }

  // 5. Abbreviations
  const abbr = doc.abbreviations.get(word);
  if (abbr) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**Abbreviation:** \`${word}\`\n\n**Pattern:** \`${abbr.pattern}\`\n\nDefined at line ${abbr.location.start.line + 1}`,
      },
    };
  }

  return null;
}

function makeHover(signature: string, description: string, example?: string): Hover {
  let value = `\`\`\`\n${signature}\n\`\`\`\n\n${description}`;
  if (example) {
    value += `\n\n**Example:**\n\`\`\`\n${example}\n\`\`\``;
  }
  const content: MarkupContent = { kind: MarkupKind.Markdown, value };
  return { contents: content };
}

