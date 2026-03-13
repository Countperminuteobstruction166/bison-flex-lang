import { Range } from 'vscode-languageserver';
import {
  FlexDocument,
  FlexOption,
  StartCondition,
  Abbreviation,
  FlexRule,
} from './types';

/**
 * Code block types in Flex/RE-flex files:
 * - %{ ... %}    prologue block
 * - %top{ ... %} RE-flex top block (closes with %})
 * - %class{ ... } RE-flex class block (closes with } at indent 0)
 */
type CodeBlockState = 'none' | 'prologue' | 'top' | 'class';

function skipCodeBlocks(lines: string[]): boolean[] {
  // Returns a boolean array: true = line is inside a code block (skip it)
  const skip = new Array<boolean>(lines.length).fill(false);
  let state: CodeBlockState = 'none';
  let classBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    switch (state) {
      case 'none':
        // Check for block openers
        if (trimmed === '%{') {
          state = 'prologue';
          skip[i] = true;
        } else if (/^%top\s*\{/.test(trimmed)) {
          state = 'top';
          skip[i] = true;
        } else if (/^%class\s*\{/.test(trimmed)) {
          state = 'class';
          classBraceDepth = 1;
          // Count additional braces on opening line
          for (let j = trimmed.indexOf('{') + 1; j < trimmed.length; j++) {
            if (trimmed[j] === '{') classBraceDepth++;
            if (trimmed[j] === '}') classBraceDepth--;
          }
          skip[i] = true;
          if (classBraceDepth <= 0) state = 'none';
        }
        break;

      case 'prologue':
        skip[i] = true;
        if (trimmed === '%}') state = 'none';
        break;

      case 'top':
        skip[i] = true;
        // %top{ blocks close with %} in RE-flex
        if (trimmed === '%}' || trimmed === '}') state = 'none';
        break;

      case 'class':
        skip[i] = true;
        for (const ch of line) {
          if (ch === '{') classBraceDepth++;
          if (ch === '}') classBraceDepth--;
        }
        if (classBraceDepth <= 0) state = 'none';
        break;
    }
  }
  return skip;
}

export function parseFlexDocument(text: string): FlexDocument {
  const lines = text.split(/\r?\n/);
  const doc: FlexDocument = {
    options: new Map(),
    startConditions: new Map(),
    abbreviations: new Map(),
    codeBlocks: [],
    rules: [],
    separators: [],
    startConditionRefs: new Map(),
    abbreviationRefs: new Map(),
  };

  // Build skip map for code blocks
  const skip = skipCodeBlocks(lines);

  // Phase 1: Find %% separators
  for (let i = 0; i < lines.length; i++) {
    if (skip[i]) continue;
    const trimmed = lines[i].trim();
    if (trimmed === '%%') {
      doc.separators.push(i);
    }
  }

  const definitionsEnd = doc.separators.length > 0 ? doc.separators[0] : lines.length;
  const rulesStart = doc.separators.length > 0 ? doc.separators[0] + 1 : lines.length;
  const rulesEnd = doc.separators.length > 1 ? doc.separators[1] : lines.length;

  // Phase 2: Parse definitions section
  let inBlockComment = false;

  for (let i = 0; i < definitionsEnd; i++) {
    if (skip[i]) continue;
    const line = lines[i];
    const trimmed = line.trim();

    // Track block comments
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }

    // Skip line comments
    if (trimmed.startsWith('//')) continue;

    // Skip empty lines
    if (!trimmed) continue;

    // %option directives
    const optionMatch = trimmed.match(/^%option\s+(.+)/);
    if (optionMatch) {
      parseOptions(optionMatch[1], i, line, doc);
      continue;
    }

    // %x exclusive start conditions
    const exclusiveMatch = trimmed.match(/^%x\s+(.+)/);
    if (exclusiveMatch) {
      parseStartConditions(exclusiveMatch[1], true, i, line, doc);
      continue;
    }

    // %s inclusive start conditions
    const inclusiveMatch = trimmed.match(/^%s\s+(.+)/);
    if (inclusiveMatch) {
      parseStartConditions(inclusiveMatch[1], false, i, line, doc);
      continue;
    }

    // Abbreviation definitions: name followed by whitespace then pattern
    // Must start at column 0 with a letter/underscore
    // Use flexible whitespace (tabs or 2+ spaces) between name and pattern
    const abbrMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:\t+|\s{2,})(\S.*)$/);
    if (abbrMatch && !abbrMatch[1].startsWith('%')) {
      const name = abbrMatch[1];
      const pattern = abbrMatch[2].trim();
      doc.abbreviations.set(name, {
        name,
        pattern,
        location: Range.create(i, 0, i, name.length),
      });
      continue;
    }
  }

  // Phase 3: Parse rules section
  let braceDepth = 0;
  inBlockComment = false;

  for (let i = rulesStart; i < rulesEnd; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track block comments
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlockComment = true;
      continue;
    }

    // Skip empty lines and line comments
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Skip action blocks (brace-delimited C code)
    if (braceDepth > 0) {
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
      }
      continue;
    }

    // Extract start condition references: <SC_NAME> or <SC1,SC2>
    // Exclude <<EOF>> which is a special pattern, not a start condition
    const scRefs = line.matchAll(/(?<!<)<([A-Z_][A-Z0-9_]*(?:,[A-Z_][A-Z0-9_]*)*)>(?!>)/g);
    for (const m of scRefs) {
      const conditions = m[1].split(',');
      for (const cond of conditions) {
        const col = line.indexOf(cond, m.index);
        const range = Range.create(i, col >= 0 ? col : 0, i, (col >= 0 ? col : 0) + cond.length);
        if (!doc.startConditionRefs.has(cond)) {
          doc.startConditionRefs.set(cond, []);
        }
        doc.startConditionRefs.get(cond)!.push(range);
      }
    }

    // Extract abbreviation references: {name} (but not C code {})
    // Only match {name} where name is a valid identifier
    const abbrRefs = line.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g);
    for (const m of abbrRefs) {
      const name = m[1];
      // Only count as abbreviation ref if it appears before any action block on this line
      const actionStart = line.indexOf('{', (line.match(/\s{2,}\{/) || { index: line.length }).index || line.length);
      if (m.index !== undefined && m.index < actionStart) {
        const col = m.index;
        const range = Range.create(i, col, i, col + m[0].length);
        if (!doc.abbreviationRefs.has(name)) {
          doc.abbreviationRefs.set(name, []);
        }
        doc.abbreviationRefs.get(name)!.push(range);
      }
    }

    // Build rule entry
    const startConditions: string[] = [];
    const scMatch = trimmed.match(/^<([A-Z_][A-Z0-9_]*(?:,[A-Z_][A-Z0-9_]*)*)>/);
    if (scMatch) {
      startConditions.push(...scMatch[1].split(','));
    }

    doc.rules.push({
      pattern: trimmed,
      startConditions,
      location: Range.create(i, 0, i, line.length),
    });

    // Track braces for action blocks
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }
  }

  return doc;
}

function parseOptions(text: string, lineNum: number, fullLine: string, doc: FlexDocument): void {
  // Options can be: name, name=value, or nooption
  const parts = text.split(/\s+/);
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    let name: string;
    let value: string | undefined;
    if (eqIdx >= 0) {
      name = part.substring(0, eqIdx);
      value = part.substring(eqIdx + 1);
    } else {
      name = part;
    }
    if (!name) continue;
    const col = fullLine.indexOf(name);
    const opt: FlexOption = {
      name,
      value,
      location: Range.create(lineNum, col >= 0 ? col : 0, lineNum, (col >= 0 ? col : 0) + name.length),
    };
    doc.options.set(name, opt);
  }
}

function parseStartConditions(text: string, exclusive: boolean, lineNum: number, fullLine: string, doc: FlexDocument): void {
  const names = text.match(/[A-Z_][A-Z0-9_]*/g);
  if (!names) return;
  for (const name of names) {
    const col = fullLine.indexOf(name);
    const sc: StartCondition = {
      name,
      exclusive,
      location: Range.create(lineNum, col >= 0 ? col : 0, lineNum, (col >= 0 ? col : 0) + name.length),
    };
    doc.startConditions.set(name, sc);
  }
}
