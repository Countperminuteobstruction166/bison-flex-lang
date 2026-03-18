import { Location, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentModel, BisonDocument, FlexDocument, isBisonDocument } from '../parser/types';
import { getWordAtPosition } from './utils';

export function getReferences(
  doc: DocumentModel,
  textDoc: TextDocument,
  position: Position,
  includeDeclaration: boolean
): Location[] {
  const lines = textDoc.getText().split(/\r?\n/);
  const line = lines[position.line] || '';

  const wordInfo = getWordAtPosition(line, position.line, position.character);
  if (!wordInfo) return [];

  const word = wordInfo.word;

  if (word.startsWith('%') || word.startsWith('$') || word.startsWith('@')) return [];

  if (isBisonDocument(doc)) {
    return getBisonReferences(doc, textDoc.uri, word, includeDeclaration);
  } else {
    return getFlexReferences(doc, textDoc.uri, word, includeDeclaration);
  }
}

function getBisonReferences(doc: BisonDocument, uri: string, word: string, includeDeclaration: boolean): Location[] {
  const locations: Location[] = [];

  // Check the symbol exists in at least one map or special location
  const hasToken = doc.tokens.has(word);
  const hasNT = doc.nonTerminals.has(word);
  const hasRule = doc.rules.has(word);
  const hasRefs = doc.ruleReferences.has(word);
  const isStartSymbol = doc.startSymbol === word;
  const hasPrecRef = doc.precedence.some(p => p.symbols.includes(word));

  if (!hasToken && !hasNT && !hasRule && !hasRefs && !isStartSymbol && !hasPrecRef) return [];

  // Declaration locations
  if (includeDeclaration) {
    const token = doc.tokens.get(word);
    if (token) locations.push(Location.create(uri, token.location));

    const nt = doc.nonTerminals.get(word);
    if (nt) locations.push(Location.create(uri, nt.location));

    const rule = doc.rules.get(word);
    if (rule) locations.push(Location.create(uri, rule.location));
  }

  // %start directive reference
  if (isStartSymbol && doc.startSymbolLocation) {
    locations.push(Location.create(uri, doc.startSymbolLocation));
  }

  // Precedence declaration references (%left, %right, %nonassoc, %precedence)
  for (const prec of doc.precedence) {
    for (let j = 0; j < prec.symbols.length; j++) {
      if (prec.symbols[j] === word && prec.symbolRanges[j]) {
        locations.push(Location.create(uri, prec.symbolRanges[j]));
      }
    }
  }

  // Usage references in rule bodies (includes %prec token references)
  const refs = doc.ruleReferences.get(word);
  if (refs) {
    for (const range of refs) {
      locations.push(Location.create(uri, range));
    }
  }

  return locations;
}

function getFlexReferences(doc: FlexDocument, uri: string, word: string, includeDeclaration: boolean): Location[] {
  const locations: Location[] = [];

  const hasSC = doc.startConditions.has(word);
  const hasAbbr = doc.abbreviations.has(word);
  const hasSCRefs = doc.startConditionRefs.has(word);
  const hasAbbrRefs = doc.abbreviationRefs.has(word);

  if (!hasSC && !hasAbbr && !hasSCRefs && !hasAbbrRefs) return [];

  if (includeDeclaration) {
    const sc = doc.startConditions.get(word);
    if (sc) locations.push(Location.create(uri, sc.location));

    const abbr = doc.abbreviations.get(word);
    if (abbr) locations.push(Location.create(uri, abbr.location));
  }

  const scRefs = doc.startConditionRefs.get(word);
  if (scRefs) {
    for (const range of scRefs) {
      locations.push(Location.create(uri, range));
    }
  }

  const abbrRefs = doc.abbreviationRefs.get(word);
  if (abbrRefs) {
    for (const range of abbrRefs) {
      locations.push(Location.create(uri, range));
    }
  }

  return locations;
}
