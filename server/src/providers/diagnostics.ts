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

  // ── TASK 1: Unknown directives ──────────────────────────────────────────────
  for (const unk of doc.unknownDirectives) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: unk.location,
      message: `Unknown Bison directive '${unk.name}'. Check the Bison manual for valid directives.`,
      source: 'bison',
    });
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

  // ── TASK 2: Unused rules (non-terminals never referenced) ───────────────────
  // If %start is not declared, Bison uses the first rule as the implicit start symbol
  const effectiveStart = doc.startSymbol ?? (doc.rules.size > 0 ? [...doc.rules.keys()][0] : undefined);

  for (const [name, rule] of doc.rules) {
    // The start symbol is the grammar entry point — always "used"
    if (name === effectiveStart) continue;
    // If this name never appears in any rule body, it is unreachable
    if (!doc.ruleReferences.has(name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: rule.location,
        message: `Non-terminal '${name}' is defined but never referenced in any rule. It is unreachable from the grammar.`,
        source: 'bison',
      });
    }
  }

  // ── TASK 3: Unused tokens ────────────────────────────────────────────────────
  for (const [name, decl] of doc.tokens) {
    if (!doc.ruleReferences.has(name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: decl.location,
        message: `Token '${name}' is declared with %token but never used in any rule.`,
        source: 'bison',
      });
    }
  }

  // ── TASK 4: Obvious shift/reduce conflicts ───────────────────────────────────
  // Heuristic: same terminal token appears as first symbol in ≥2 alternatives
  // of the same rule, with no %prec disambiguation tracked.
  for (const [name, rule] of doc.rules) {
    // Count how many alternatives start with each terminal (ALL_CAPS)
    const firstTerminalCount = new Map<string, number>();
    for (const alt of rule.alternatives) {
      const sym = alt.firstSymbol;
      if (sym && /^[A-Z_][A-Z0-9_]*$/.test(sym) && doc.tokens.has(sym)) {
        firstTerminalCount.set(sym, (firstTerminalCount.get(sym) ?? 0) + 1);
      }
    }
    for (const [token, count] of firstTerminalCount) {
      if (count >= 2) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: rule.location,
          message: `Potential shift/reduce conflict in rule '${name}': token '${token}' starts ${count} alternatives without precedence disambiguation (%prec / %left / %right).`,
          source: 'bison',
        });
      }
    }
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

  // ── TASK 1: Unknown directives ──────────────────────────────────────────────
  for (const unk of doc.unknownDirectives) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: unk.location,
      message: `Unknown Flex directive '${unk.name}'. Valid directives are %option, %x, %s, %top, %class.`,
      source: 'flex',
    });
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

  // ── TASK 5: Inaccessible Flex rules ─────────────────────────────────────────
  // Heuristic A: Exact duplicate pattern → second one is always shadowed.
  // Heuristic B: Catch-all pattern (. or .* or .*\n etc.) before specific patterns
  //              in the same start-condition context → subsequent rules unreachable.

  // Build a canonical "context key" for a rule: sorted start conditions, or "INITIAL"
  const contextKey = (rule: typeof doc.rules[0]): string =>
    rule.startConditions.length > 0 ? [...rule.startConditions].sort().join(',') : 'INITIAL';

  /**
   * Extract just the regex part of a Flex rule pattern string.
   * doc.rules[].pattern is the full trimmed line: "<SC> pattern   { action }"
   * We strip the optional <SC> prefix, then take the first non-space token (the regex).
   * In Flex, patterns cannot contain unescaped spaces, so the pattern ends at
   * the first whitespace after the regex.
   */
  const rawPattern = (pattern: string): string => {
    // Remove optional <SC> or <SC1,SC2> prefix
    let p = pattern.replace(/^<[A-Z_*][A-Z0-9_,*]*>\s*/, '').trimStart();
    // The pattern is the first "word" — Flex patterns have no unescaped spaces
    const m = p.match(/^(\S+)/);
    return m ? m[1] : p;
  };

  // Catch-all patterns that would shadow everything after them
  const CATCHALL_PATTERNS = new Set(['.', '.*', '.+', '.|\\n', '(.|\n)*', '(.|\n)+', '(.|\\n)*', '(.|\\n)+']);

  // Track: first seen pattern per context (for duplicate detection)
  const seenPatterns = new Map<string, number>(); // "context|pattern" -> line number of first occurrence

  // Track: catch-all line per context key
  const catchallLine = new Map<string, number>(); // context -> line number

  for (const rule of doc.rules) {
    const ctx = contextKey(rule);
    const pat = rawPattern(rule.pattern);
    const lineNum = rule.location.start.line;
    const dupKey = `${ctx}|${pat}`;

    // Heuristic B: is this rule after a catch-all in the same context?
    if (catchallLine.has(ctx) && !CATCHALL_PATTERNS.has(pat)) {
      const catchLine = catchallLine.get(ctx)!;
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: rule.location,
        message: `Flex rule '${pat}' may be inaccessible: catch-all pattern at line ${catchLine + 1} will always match first.`,
        source: 'flex',
      });
    }

    // Heuristic A: duplicate pattern in same context?
    if (seenPatterns.has(dupKey)) {
      const firstLine = seenPatterns.get(dupKey)!;
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: rule.location,
        message: `Flex rule '${pat}' is inaccessible: identical pattern already defined at line ${firstLine + 1}.`,
        source: 'flex',
      });
    } else {
      seenPatterns.set(dupKey, lineNum);
    }

    // Register catch-all (only on first occurrence in this context)
    if (CATCHALL_PATTERNS.has(pat) && !catchallLine.has(ctx)) {
      catchallLine.set(ctx, lineNum);
    }
  }

  return diagnostics;
}
