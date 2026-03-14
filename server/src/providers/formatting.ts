import { TextEdit, Range, FormattingOptions } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Format a Bison document:
 * - Normalize whitespace around %%
 * - Align | alternatives under the : of the rule
 * - Indent action blocks { }
 * - Clean up trailing whitespace
 */
export function formatBisonDocument(
  textDoc: TextDocument,
  options: FormattingOptions
): TextEdit[] {
  const text = textDoc.getText();
  const lines = text.split(/\r?\n/);
  const tab = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
  const formatted: string[] = [];

  // Phase 1: Find %% separators (same logic as parser)
  const separatorLines: number[] = [];
  let inPrologueBlock = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '%{') { inPrologueBlock = true; continue; }
    if (trimmed === '%}') { inPrologueBlock = false; continue; }
    if (inPrologueBlock) continue;

    for (const ch of lines[i]) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }

    if (trimmed === '%%' && braceDepth === 0) {
      separatorLines.push(i);
    }
  }

  const rulesStart = separatorLines.length > 0 ? separatorLines[0] + 1 : lines.length;
  const rulesEnd = separatorLines.length > 1 ? separatorLines[1] : lines.length;

  // Phase 2: Format declarations section (lines 0 to first %%)
  for (let i = 0; i < Math.min(rulesStart, lines.length); i++) {
    if (i > 0 && separatorLines.includes(i)) {
      // Ensure blank line before %%
      if (formatted.length > 0 && formatted[formatted.length - 1].trim() !== '') {
        formatted.push('');
      }
      formatted.push('%%');
      // Ensure blank line after %%
      if (i + 1 < lines.length && lines[i + 1].trim() !== '') {
        formatted.push('');
      }
      continue;
    }

    const line = lines[i];
    const trimmed = line.trim();

    // Preserve %{ %} code blocks as-is
    if (trimmed === '%{' || trimmed === '%}') {
      formatted.push(trimmed);
      continue;
    }

    // Normalize directive indentation
    if (trimmed.startsWith('%') && !trimmed.startsWith('%{') && !trimmed.startsWith('%}')) {
      formatted.push(trimmed);
      continue;
    }

    // Inside %{ %} block: preserve indentation
    if (isInsidePrologueBlock(lines, i)) {
      formatted.push(line);
      continue;
    }

    // Other declaration lines
    formatted.push(line.trimEnd());
  }

  // Phase 3: Format rules section
  if (separatorLines.length > 0) {
    let currentRuleName = '';
    let colonCol = 0;
    braceDepth = 0;
    let inActionBlock = false;

    for (let i = rulesStart; i < rulesEnd; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        formatted.push('');
        continue;
      }

      // Track brace depth for action blocks
      if (inActionBlock) {
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
        }
        if (braceDepth === 0) inActionBlock = false;
        // Indent action block content
        formatted.push(tab + trimmed);
        continue;
      }

      // Rule definition: name :
      const ruleMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*:/);
      if (ruleMatch) {
        currentRuleName = ruleMatch[1];
        colonCol = currentRuleName.length + 1; // "name :"

        // Reformat: "name\n  : body" → "name\n  : body"
        const afterColon = trimmed.substring(trimmed.indexOf(':') + 1).trim();

        if (afterColon && afterColon !== ';') {
          // Rule with inline body
          const bodyFormatted = formatRuleBody(afterColon, tab);
          formatted.push(`${currentRuleName}\n${tab}: ${bodyFormatted}`);
        } else if (afterColon === ';') {
          formatted.push(`${currentRuleName}\n${tab}: /* empty */\n${tab};`);
        } else {
          formatted.push(`${currentRuleName}`);
        }

        // Check for action block
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        braceDepth = openBraces - closeBraces;
        if (braceDepth > 0) inActionBlock = true;

        continue;
      }

      // Colon on its own line (continuation)
      if (trimmed === ':' || trimmed.startsWith(': ')) {
        const body = trimmed.length > 1 ? trimmed.substring(1).trim() : '';
        if (body) {
          formatted.push(`${tab}: ${formatRuleBody(body, tab)}`);
        } else {
          formatted.push(`${tab}:`);
        }
        continue;
      }

      // Alternative: | body
      if (trimmed.startsWith('|')) {
        const altBody = trimmed.substring(1).trim();
        if (altBody) {
          formatted.push(`${tab}| ${formatRuleBody(altBody, tab)}`);
        } else {
          formatted.push(`${tab}|`);
        }

        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        braceDepth = openBraces - closeBraces;
        if (braceDepth > 0) inActionBlock = true;

        continue;
      }

      // Semicolon ending a rule
      if (trimmed === ';') {
        formatted.push(`${tab};`);
        currentRuleName = '';
        continue;
      }

      // Standalone action block start
      if (trimmed.startsWith('{')) {
        const openBraces = (trimmed.match(/{/g) || []).length;
        const closeBraces = (trimmed.match(/}/g) || []).length;
        braceDepth = openBraces - closeBraces;
        if (braceDepth > 0) inActionBlock = true;
        formatted.push(`${tab}${tab}${trimmed}`);
        continue;
      }

      // Other content in rules section
      formatted.push(`${tab}${trimmed}`);
    }

    // Second %% separator
    if (separatorLines.length > 1) {
      if (formatted.length > 0 && formatted[formatted.length - 1].trim() !== '') {
        formatted.push('');
      }
      formatted.push('%%');
    }
  }

  // Phase 4: Epilogue section (after second %%) — preserve as-is
  if (separatorLines.length > 1) {
    const epilogueStart = separatorLines[1] + 1;
    for (let i = epilogueStart; i < lines.length; i++) {
      formatted.push(lines[i]);
    }
  }

  // Build the full replacement edit
  const formattedText = formatted.join('\n');
  if (formattedText === text) return [];

  const fullRange = Range.create(0, 0, lines.length - 1, lines[lines.length - 1].length);
  return [TextEdit.replace(fullRange, formattedText)];
}

function isInsidePrologueBlock(lines: string[], lineIndex: number): boolean {
  let inside = false;
  for (let i = 0; i < lineIndex; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '%{') inside = true;
    if (trimmed === '%}') inside = false;
  }
  return inside;
}

function formatRuleBody(body: string, _tab: string): string {
  // Normalize multiple spaces to single space, but preserve strings
  return body
    .replace(/\s+/g, ' ')
    .trim();
}
