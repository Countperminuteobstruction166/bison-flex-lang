import { Location, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentModel, BisonDocument, FlexDocument, isBisonDocument } from '../parser/types';
import { getWordAtPosition } from './utils';

export function getDefinition(
  doc: DocumentModel,
  textDoc: TextDocument,
  position: Position
): Location | null {
  const lines = textDoc.getText().split(/\r?\n/);
  const line = lines[position.line] || '';

  const wordInfo = getWordAtPosition(line, position.line, position.character);
  if (!wordInfo) return null;

  const word = wordInfo.word;

  // Skip directives and semantic values — no "definition" for those
  if (word.startsWith('%') || word.startsWith('$') || word.startsWith('@')) return null;

  if (isBisonDocument(doc)) {
    return getBisonDefinition(doc, textDoc.uri, word);
  } else {
    return getFlexDefinition(doc, textDoc.uri, word);
  }
}

function getBisonDefinition(doc: BisonDocument, uri: string, word: string): Location | null {
  // Token declaration (%token)
  const token = doc.tokens.get(word);
  if (token) return Location.create(uri, token.location);

  // Non-terminal declaration (%type / %nterm)
  const nt = doc.nonTerminals.get(word);
  if (nt) return Location.create(uri, nt.location);

  // Rule definition (name : ...)
  const rule = doc.rules.get(word);
  if (rule) return Location.create(uri, rule.location);

  return null;
}

function getFlexDefinition(doc: FlexDocument, uri: string, word: string): Location | null {
  // Start condition declaration (%x / %s)
  const sc = doc.startConditions.get(word);
  if (sc) return Location.create(uri, sc.location);

  // Abbreviation definition (name  pattern)
  const abbr = doc.abbreviations.get(word);
  if (abbr) return Location.create(uri, abbr.location);

  return null;
}
