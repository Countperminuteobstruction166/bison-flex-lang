import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { BisonDocument, FlexDocument } from '../parser/types';

export function computeBisonDiagnostics(doc: BisonDocument, text: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  // 1. Missing %% separator
  if (doc.separators.length === 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(0, 0, 0, lines[0]?.length || 0),
      message: 'Missing %% separator between declarations and rules sections.',
      source: 'bison',
    });
    return diagnostics; // Can't do much more without sections
  }

  // 2. Duplicate token declarations
  const tokenCounts = new Map<string, Range[]>();
  for (const [name, decl] of doc.tokens) {
    if (!tokenCounts.has(name)) tokenCounts.set(name, []);
    tokenCounts.get(name)!.push(decl.location);
  }
  // (Tokens are stored by name so duplicates overwrite — check during parse or track separately)

  // 3. Duplicate %type declarations
  const typeCounts = new Map<string, Range[]>();
  for (const [name, decl] of doc.nonTerminals) {
    if (!typeCounts.has(name)) typeCounts.set(name, []);
    typeCounts.get(name)!.push(decl.location);
  }

  // 4. Check for tokens used in rules but not declared
  // ALL_CAPS identifiers in rules that are not in %token
  for (const [name, refs] of doc.ruleReferences) {
    if (/^[A-Z_][A-Z0-9_]+$/.test(name) && !doc.tokens.has(name)) {
      // Skip known keywords and special identifiers
      const bisonKeywords = new Set(['EOF', 'YYEOF', 'YYUNDEF', 'YYerror']);
      if (bisonKeywords.has(name)) continue;

      for (const ref of refs) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: ref,
          message: `Token '${name}' is used but not declared with %token.`,
          source: 'bison',
        });
      }
    }
  }

  // 5. Non-terminals in %type that are never defined as rule LHS
  for (const [name, decl] of doc.nonTerminals) {
    if (!doc.rules.has(name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: decl.location,
        message: `Non-terminal '${name}' has a %type declaration but no rule definition.`,
        source: 'bison',
      });
    }
  }

  // 6. Rules defined but no %type declaration (only if api.value.type is variant)
  const isVariant = doc.defines.get('api.value.type')?.value === 'variant';
  if (isVariant) {
    for (const [name] of doc.rules) {
      if (!doc.nonTerminals.has(name)) {
        const rule = doc.rules.get(name)!;
        diagnostics.push({
          severity: DiagnosticSeverity.Information,
          range: rule.location,
          message: `Rule '${name}' has no %type declaration. With variant types, this may cause compilation errors.`,
          source: 'bison',
        });
      }
    }
  }

  // 7. Check for unclosed %{ blocks
  let prologueOpen = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '%{') prologueOpen = true;
    if (trimmed === '%}') prologueOpen = false;
  }
  if (prologueOpen) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(lines.length - 1, 0, lines.length - 1, 0),
      message: 'Unclosed %{ block — missing %} before end of file.',
      source: 'bison',
    });
  }

  return diagnostics;
}

export function computeFlexDiagnostics(doc: FlexDocument, text: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  // 1. Missing %% separator
  if (doc.separators.length === 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(0, 0, 0, lines[0]?.length || 0),
      message: 'Missing %% separator between definitions and rules sections.',
      source: 'flex',
    });
    return diagnostics;
  }

  // 2. Undefined start conditions used in rules
  for (const [name, refs] of doc.startConditionRefs) {
    if (!doc.startConditions.has(name) && name !== 'INITIAL') {
      for (const ref of refs) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: ref,
          message: `Start condition '${name}' is used but not declared with %x or %s.`,
          source: 'flex',
        });
      }
    }
  }

  // 3. Undefined abbreviations used in rules
  for (const [name, refs] of doc.abbreviationRefs) {
    if (!doc.abbreviations.has(name)) {
      for (const ref of refs) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: ref,
          message: `Abbreviation '{${name}}' is used but not defined in the definitions section.`,
          source: 'flex',
        });
      }
    }
  }

  // 4. Declared start conditions never used
  for (const [name, decl] of doc.startConditions) {
    if (!doc.startConditionRefs.has(name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Information,
        range: decl.location,
        message: `Start condition '${name}' is declared but never used in any rule.`,
        source: 'flex',
      });
    }
  }

  // 5. Declared abbreviations never used
  for (const [name, abbr] of doc.abbreviations) {
    if (!doc.abbreviationRefs.has(name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Information,
        range: abbr.location,
        message: `Abbreviation '${name}' is defined but never used in any rule pattern.`,
        source: 'flex',
      });
    }
  }

  // 6. Check for unclosed %{ blocks
  let prologueOpen = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '%{') prologueOpen = true;
    if (trimmed === '%}') prologueOpen = false;
  }
  if (prologueOpen) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(lines.length - 1, 0, lines.length - 1, 0),
      message: 'Unclosed %{ block — missing %} before end of file.',
      source: 'flex',
    });
  }

  return diagnostics;
}
