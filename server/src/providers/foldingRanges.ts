import { FoldingRange, FoldingRangeKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Compute folding ranges for Bison and Flex files.
 *
 * Folds:
 * - Sections delimited by %% separators
 * - %{ ... %} prologue blocks
 * - %code { ... } / %code qualifier { ... } blocks
 * - %top{ ... } and %class{ ... } blocks (Flex/RE-flex)
 * - Bison rules: from "name :" to ";"
 * - Block comments
 */
export function getFoldingRanges(textDoc: TextDocument): FoldingRange[] {
  const text = textDoc.getText();
  const lines = text.split(/\r?\n/);
  const ranges: FoldingRange[] = [];
  const isBison = textDoc.languageId === 'bison';

  // Track %% separator positions for section folding
  const separators: number[] = [];

  // Stack for %{ %} blocks
  let prologueStart: number | undefined;

  // Stack for brace-delimited blocks (%code, %top, %class)
  let braceBlockStart: number | undefined;
  let braceBlockDepth = 0;
  let inBraceBlock = false;

  // Bison rule tracking
  let ruleStart: number | undefined;

  // Block comment tracking
  let commentStart: number | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── %% separators ────────────────────────────────────────────────────
    if (trimmed === '%%') {
      separators.push(i);

      // Close any open rule at %%
      if (ruleStart !== undefined && i - 1 > ruleStart) {
        ranges.push(FoldingRange.create(ruleStart, i - 1, undefined, undefined, FoldingRangeKind.Region));
        ruleStart = undefined;
      }
      continue;
    }

    // ── Block comments /* ... */ ──────────────────────────────────────────
    if (commentStart === undefined && trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      commentStart = i;
      continue;
    }
    if (commentStart !== undefined && trimmed.includes('*/')) {
      if (i > commentStart) {
        ranges.push(FoldingRange.create(commentStart, i, undefined, undefined, FoldingRangeKind.Comment));
      }
      commentStart = undefined;
      continue;
    }
    if (commentStart !== undefined) continue;

    // ── %{ ... %} prologue blocks ────────────────────────────────────────
    if (trimmed === '%{') {
      prologueStart = i;
      continue;
    }
    if (trimmed === '%}' && prologueStart !== undefined) {
      if (i > prologueStart) {
        ranges.push(FoldingRange.create(prologueStart, i, undefined, undefined, FoldingRangeKind.Region));
      }
      prologueStart = undefined;
      continue;
    }

    // ── Brace-delimited blocks: %code { }, %top{ }, %class{ } ───────────
    if (!inBraceBlock) {
      const braceMatch = trimmed.match(/^%(code(?:\s+\w+)?|top|class)\s*\{/);
      if (braceMatch) {
        braceBlockStart = i;
        braceBlockDepth = 0;
        inBraceBlock = true;
        // Count braces on this line
        for (const ch of line) {
          if (ch === '{') braceBlockDepth++;
          if (ch === '}') braceBlockDepth--;
        }
        if (braceBlockDepth <= 0) {
          // Single-line block, no fold needed
          inBraceBlock = false;
          braceBlockStart = undefined;
        }
        continue;
      }
    }

    if (inBraceBlock) {
      for (const ch of line) {
        if (ch === '{') braceBlockDepth++;
        if (ch === '}') braceBlockDepth--;
      }
      if (braceBlockDepth <= 0) {
        if (braceBlockStart !== undefined && i > braceBlockStart) {
          ranges.push(FoldingRange.create(braceBlockStart, i, undefined, undefined, FoldingRangeKind.Region));
        }
        inBraceBlock = false;
        braceBlockStart = undefined;
      }
      continue;
    }

    // ── Bison rules: name : ... ; ────────────────────────────────────────
    if (isBison && prologueStart === undefined) {
      // Rule definition start: "name :"
      const ruleDefMatch = trimmed.match(/^[a-zA-Z_][a-zA-Z0-9_.]*\s*:/);
      if (ruleDefMatch) {
        // Close previous rule if not yet closed
        if (ruleStart !== undefined && i - 1 > ruleStart) {
          ranges.push(FoldingRange.create(ruleStart, i - 1, undefined, undefined, FoldingRangeKind.Region));
        }
        ruleStart = i;

        // If line ends with ;, rule is single-line
        if (trimmed.endsWith(';')) {
          ruleStart = undefined;
        }
        continue;
      }

      // Rule end: line containing ;
      if (ruleStart !== undefined && trimmed.includes(';')) {
        if (i > ruleStart) {
          ranges.push(FoldingRange.create(ruleStart, i, undefined, undefined, FoldingRangeKind.Region));
        }
        ruleStart = undefined;
      }
    }
  }

  // ── Section folding between %% markers ───────────────────────────────
  if (separators.length >= 1) {
    // Declarations section: line 0 to first %%
    if (separators[0] > 0) {
      ranges.push(FoldingRange.create(0, separators[0], undefined, undefined, FoldingRangeKind.Region));
    }
    // Rules section: first %% to second %% (or end of file)
    const rulesEnd = separators.length >= 2 ? separators[1] : lines.length - 1;
    if (rulesEnd > separators[0]) {
      ranges.push(FoldingRange.create(separators[0], rulesEnd, undefined, undefined, FoldingRangeKind.Region));
    }
    // Epilogue section: second %% to end of file
    if (separators.length >= 2 && lines.length - 1 > separators[1]) {
      ranges.push(FoldingRange.create(separators[1], lines.length - 1, undefined, undefined, FoldingRangeKind.Region));
    }
  }

  return ranges;
}
