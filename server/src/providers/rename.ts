import { Position, TextEdit, WorkspaceEdit, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentModel, BisonDocument, FlexDocument, isBisonDocument } from '../parser/types';
import { getWordAtPosition, WordAtPosition } from './utils';

/**
 * Validate that the cursor is on a renameable symbol and return its range + placeholder.
 */
export function prepareRename(
  doc: DocumentModel,
  textDoc: TextDocument,
  position: Position
): { range: Range; placeholder: string } | null {
  const lines = textDoc.getText().split(/\r?\n/);
  const line = lines[position.line] || '';

  const wordInfo = getWordAtPosition(line, position.line, position.character);
  if (!wordInfo) return null;

  const word = wordInfo.word;

  // Directives, semantic values are not renameable
  if (word.startsWith('%') || word.startsWith('$') || word.startsWith('@')) return null;

  if (isBisonDocument(doc)) {
    if (doc.tokens.has(word) || doc.nonTerminals.has(word) || doc.rules.has(word)) {
      return { range: wordInfo.range, placeholder: word };
    }
  } else {
    if (doc.startConditions.has(word) || doc.abbreviations.has(word)) {
      return { range: wordInfo.range, placeholder: word };
    }
  }

  return null;
}

/**
 * Compute all edits needed to rename a symbol across the file.
 */
export function getRename(
  doc: DocumentModel,
  textDoc: TextDocument,
  position: Position,
  newName: string
): WorkspaceEdit | null {
  const lines = textDoc.getText().split(/\r?\n/);
  const line = lines[position.line] || '';

  const wordInfo = getWordAtPosition(line, position.line, position.character);
  if (!wordInfo) return null;

  const word = wordInfo.word;
  const edits: TextEdit[] = [];

  if (isBisonDocument(doc)) {
    collectBisonRenameEdits(doc, word, newName, edits);
  } else {
    collectFlexRenameEdits(doc, word, newName, edits);
  }

  if (edits.length === 0) return null;

  return { changes: { [textDoc.uri]: edits } };
}

function collectBisonRenameEdits(doc: BisonDocument, oldName: string, newName: string, edits: TextEdit[]): void {
  // Declaration: %token
  const token = doc.tokens.get(oldName);
  if (token) edits.push(TextEdit.replace(token.location, newName));

  // Declaration: %type / %nterm
  const nt = doc.nonTerminals.get(oldName);
  if (nt) edits.push(TextEdit.replace(nt.location, newName));

  // Declaration: rule definition name
  const rule = doc.rules.get(oldName);
  if (rule) edits.push(TextEdit.replace(rule.location, newName));

  // All references in rule bodies
  const refs = doc.ruleReferences.get(oldName);
  if (refs) {
    for (const range of refs) {
      edits.push(TextEdit.replace(range, newName));
    }
  }
}

function collectFlexRenameEdits(doc: FlexDocument, oldName: string, newName: string, edits: TextEdit[]): void {
  // Declaration: start condition
  const sc = doc.startConditions.get(oldName);
  if (sc) edits.push(TextEdit.replace(sc.location, newName));

  // Declaration: abbreviation
  const abbr = doc.abbreviations.get(oldName);
  if (abbr) edits.push(TextEdit.replace(abbr.location, newName));

  // Start condition references in rules
  const scRefs = doc.startConditionRefs.get(oldName);
  if (scRefs) {
    for (const range of scRefs) {
      edits.push(TextEdit.replace(range, newName));
    }
  }

  // Abbreviation references in rules
  const abbrRefs = doc.abbreviationRefs.get(oldName);
  if (abbrRefs) {
    for (const range of abbrRefs) {
      edits.push(TextEdit.replace(range, newName));
    }
  }
}
