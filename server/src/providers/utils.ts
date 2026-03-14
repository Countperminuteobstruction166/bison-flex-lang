import { Range } from 'vscode-languageserver';

export interface WordAtPosition {
  word: string;
  range: Range;
}

/**
 * Extract the word under the cursor, extended to handle %, $, @, dots, hyphens.
 * Returns both the word and its precise range in the document.
 */
export function getWordAtPosition(line: string, lineNum: number, character: number): WordAtPosition | null {
  let start = character;
  let end = character;

  // Expand left
  while (start > 0 && isWordChar(line[start - 1])) {
    start--;
  }
  // Check for leading %, $, @
  if (start > 0 && (line[start - 1] === '%' || line[start - 1] === '$' || line[start - 1] === '@')) {
    start--;
  }

  // Expand right
  while (end < line.length && isWordChar(line[end])) {
    end++;
  }

  if (start === end) return null;

  return {
    word: line.substring(start, end),
    range: Range.create(lineNum, start, lineNum, end),
  };
}

function isWordChar(ch: string): boolean {
  return /[a-zA-Z0-9_.\-]/.test(ch);
}
