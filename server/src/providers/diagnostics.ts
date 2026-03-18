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

  // 2. Check for tokens used in rules but not declared
  // ALL_CAPS identifiers in rules that are not in %token
  for (const [name, refs] of doc.ruleReferences) {
    if (/^[A-Z_][A-Z0-9_]+$/.test(name) && !doc.tokens.has(name)) {
      // Skip known keywords, special identifiers, and Yacc C-macro names that
      // may appear inside action blocks but look like ALL_CAPS tokens.
      const bisonKeywords = new Set([
        'EOF', 'YYEOF', 'YYUNDEF', 'YYerror',
        // Yacc/Bison error-recovery magic token
        'error',
        // Yacc C macros (should be stripped by the parser's action-block
        // removal, but guard here for resilience)
        'YYERROR', 'YYACCEPT', 'YYABORT',
        'YYRECOVERING', 'YYMAXDEPTH', 'YYINITDEPTH',
        'YYLTYPE', 'YYSTYPE', 'YYLEX_PARAM', 'YYPARSE_PARAM',
      ]);
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
  // of the same rule. Suppressed when the token already has an explicit
  // %left / %right / %nonassoc declaration (Bison resolves the conflict itself).
  {
    const declaredPrecTokens = new Set<string>();
    for (const prec of doc.precedence) {
      for (const sym of prec.symbols) {
        declaredPrecTokens.add(sym);
      }
    }

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
        // Only warn when no %left/%right/%nonassoc covers this token
        if (count >= 2 && !declaredPrecTokens.has(token)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: rule.location,
            message: `Potential shift/reduce conflict in rule '${name}': token '${token}' starts ${count} alternatives without precedence disambiguation (%prec / %left / %right).`,
            source: 'bison',
          });
        }
      }
    }
  }

  // ── NEW 1: $n out of bounds ──────────────────────────────────────────────────
  // Covers both single-line actions { ... } and multi-line action blocks.
  // $$ and $<type>n are never matched by the /\$(\d+)/ scanner, so they are safe.
  for (const [name, rule] of doc.rules) {
    for (const alt of rule.alternatives) {
      const symbolCount = alt.symbols.length;
      for (const ref of alt.dollarRefs ?? []) {
        if (symbolCount === 0 && ref.n > 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: ref.range,
            message: `$${ref.n} is out of bounds: alternative in rule '${name}' has no symbols (empty production).`,
            source: 'bison',
          });
        } else if (ref.n > symbolCount) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: ref.range,
            message: `$${ref.n} is out of bounds: alternative in rule '${name}' has only ${symbolCount} symbol${symbolCount !== 1 ? 's' : ''} ($1–$${symbolCount}).`,
            source: 'bison',
          });
        }
      }
    }
  }

  // ── NEW 2: Undeclared binary operators — unresolved shift/reduce conflict ────
  // Fires when a rule has ≥2 left-recursive binary alternatives whose operator
  // tokens have NO %left / %right / %nonassoc declaration.
  {
    const tokenPrecLevel = new Map<string, number>();
    for (let i = 0; i < doc.precedence.length; i++) {
      for (const sym of doc.precedence[i].symbols) {
        tokenPrecLevel.set(sym, i);
      }
    }

    for (const [name, rule] of doc.rules) {
      const undeclaredOps: string[] = [];
      for (const alt of rule.alternatives) {
        if (alt.hasPrec) continue;
        const syms = alt.symbols;
        // Require a symmetric binary pattern: name OP... name
        // Both the first AND last symbol must be the rule's own name.
        // This avoids false positives on asymmetric rules like `term TIMES NUMBER`.
        if (syms.length >= 3 && syms[0] === name && syms[syms.length - 1] === name) {
          // Tokens in between are the operator(s)
          for (let k = 1; k < syms.length - 1; k++) {
            const sym = syms[k];
            if (doc.tokens.has(sym) && !tokenPrecLevel.has(sym) && !undeclaredOps.includes(sym)) {
              undeclaredOps.push(sym);
            }
          }
        }
      }
      if (undeclaredOps.length >= 2) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: rule.location,
          message: `Rule '${name}' has recursive alternatives using undeclared operators [${undeclaredOps.join(', ')}]. Add %left/%right/%nonassoc to resolve the shift/reduce conflict explicitly.`,
          source: 'bison',
        });
      }
    }
  }

  // ── NEW 3: Missing %start directive ─────────────────────────────────────────
  if (!doc.startSymbol && doc.rules.size > 2) {
    const firstRuleName = [...doc.rules.keys()][0];
    diagnostics.push({
      severity: DiagnosticSeverity.Information,
      range: Range.create(0, 0, 0, 0),
      message: `No %start directive found. Bison implicitly uses '${firstRuleName}' as the start symbol. Consider adding '%start ${firstRuleName}' for clarity.`,
      source: 'bison',
    });
  }

  // ── NEW 4: Empty production without %empty ───────────────────────────────────
  for (const [name, rule] of doc.rules) {
    for (const alt of rule.alternatives) {
      if (alt.symbols.length === 0 && !alt.hasExplicitEmpty) {
        // Guard against false positives on bare "rule :" header lines.
        // The parser now accumulates continuation-line symbols into the phantom
        // alt, so symbols.length === 0 after accumulation means either:
        //   (a) the rule truly has an empty first alternative ("rule:\n| alt"),
        //   (b) or there really is no content yet (unusual edge case).
        // Perform a one-line lookahead: if the next meaningful line starts with
        // something OTHER than '|' or ';', the body has not been appended yet
        // (transient state) and we must not fire.
        const altLine = lines[alt.range.start.line]?.trim() ?? '';
        if (/^[a-zA-Z_][a-zA-Z0-9_.]*\s*:(\s*(\/\/.*)?)?$/.test(altLine)) {
          let nextContent = '';
          for (let ln = alt.range.start.line + 1; ln < lines.length; ln++) {
            const t = lines[ln].trim();
            if (t && !t.startsWith('//') && !t.startsWith('/*')) { nextContent = t; break; }
          }
          // Continuation body found → symbols will be accumulated; not an empty production
          if (!nextContent.startsWith('|') && !nextContent.startsWith(';')) continue;
        }

        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: alt.range,
          message: `Empty production in rule '${name}' without %empty. Modern Bison (3.x+) recommends writing '%empty' to make empty productions explicit.`,
          source: 'bison',
        });
      }
    }
  }

  // ── NEW 5: %start references a non-existent rule ─────────────────────────────
  if (doc.startSymbol && !doc.rules.has(doc.startSymbol)) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: doc.startSymbolLocation ?? Range.create(0, 0, 0, 0),
      message: `%start symbol '${doc.startSymbol}' has no corresponding rule definition.`,
      source: 'bison',
    });
  }

  // ── NEW 6: %prec used with undeclared token ───────────────────────────────────
  {
    const declaredPrecSymbols = new Set<string>();
    for (const prec of doc.precedence) {
      for (const sym of prec.symbols) declaredPrecSymbols.add(sym);
    }
    for (const [name, rule] of doc.rules) {
      for (const alt of rule.alternatives) {
        if (alt.precToken && !declaredPrecSymbols.has(alt.precToken) && !doc.tokens.has(alt.precToken)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: alt.range,
            message: `%prec uses '${alt.precToken}' in rule '${name}', but '${alt.precToken}' is not declared with %token or a precedence directive.`,
            source: 'bison',
          });
        }
      }
    }
  }

  // ── NEW 7: Duplicate rule definitions ────────────────────────────────────────
  for (const dup of doc.duplicateRules) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: dup.location,
      message: `Rule '${dup.name}' is defined more than once. Only the first definition is used by Bison.`,
      source: 'bison',
    });
  }

  // ── NEW 8: Rule with no base case (all alternatives are directly recursive) ──
  for (const [name, rule] of doc.rules) {
    if (rule.alternatives.length === 0) continue;
    // A base case is an alternative that does NOT contain the rule's own name in symbols.
    const hasBaseCase = rule.alternatives.some(alt => !alt.symbols.includes(name));
    if (!hasBaseCase) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: rule.location,
        message: `Rule '${name}' has no base case: every alternative is directly recursive. This grammar will loop infinitely.`,
        source: 'bison',
      });
    }
  }

  // ── Yacc legacy migration hints ──────────────────────────────────────────
  diagnostics.push(...computeYaccLegacyHints(lines));

  return diagnostics;
}

/**
 * Scan for Yacc legacy directives / constructs and emit Information-level
 * suggestions pointing to the modern Bison 3.x equivalent.
 *
 * These are tolerated (no error) but flagged so the author can modernise.
 */
function computeYaccLegacyHints(lines: string[]): Diagnostic[] {
  const hints: Diagnostic[] = [];

  // Map of legacy directive regex → modern replacement message
  const migrations: Array<{ re: RegExp; message: string }> = [
    {
      re: /^\s*%(?:pure[_-]parser)\b/,
      message:
        "Yacc legacy '%pure-parser': migrate to '%define api.pure full' (Bison 3.x).",
    },
    {
      re: /^\s*%(?:union)\b/,
      message:
        "Yacc legacy '%union': consider migrating to '%define api.value.type variant' " +
        "with per-token <%type> declarations for type-safe semantic values (Bison 3.x).",
    },
    {
      re: /^\s*%error[_-]verbose\b/,
      message:
        "Yacc legacy '%error-verbose': migrate to '%define parse.error verbose' (Bison 3.x).",
    },
    {
      re: /^\s*%name[_-]prefix\b/,
      message:
        "Yacc legacy '%name-prefix': migrate to '%define api.prefix {prefix}' (Bison 3.x).",
    },
    {
      re: /^\s*%pure_parser\b/,
      message:
        "Yacc legacy '%pure_parser': migrate to '%define api.pure full' (Bison 3.x).",
    },
    {
      re: /^\s*%binary\b/,
      message:
        "Yacc legacy '%binary': use '%nonassoc' instead (standard Bison / POSIX Yacc).",
    },
    {
      re: /^\s*%lex[_-]param\b/,
      message:
        "Yacc legacy '%lex-param': migrate to '%define api.pure full' and use '%lex-param {{type} {name}}' (Bison 3.x).",
    },
    {
      re: /^\s*%parse[_-]param\b/,
      message:
        "Yacc legacy '%parse-param': migrate to '%param {{type} {name}}' (Bison 3.x).",
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const { re, message } of migrations) {
      if (re.test(lines[i])) {
        const col = lines[i].search(/\S/);
        hints.push({
          severity: DiagnosticSeverity.Information,
          range: Range.create(i, col >= 0 ? col : 0, i, lines[i].length),
          message,
          source: 'bison-yacc-compat',
          tags: [],
        });
        break; // one hint per line is enough
      }
    }
  }

  // Also warn about YYLEX / YYPARSE function-style prototypes in prologue
  for (let i = 0; i < lines.length; i++) {
    if (/\byylex\s*\(/.test(lines[i]) || /\byyparse\s*\(/.test(lines[i])) {
      hints.push({
        severity: DiagnosticSeverity.Information,
        range: Range.create(i, 0, i, lines[i].length),
        message:
          'Yacc-style yylex/yyparse declarations: consider using %define api.pure full ' +
          'and passing parameters via %lex-param / %parse-param (Bison 3.x).',
        source: 'bison-yacc-compat',
      });
    }
  }

  return hints;
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

  // ── NEW 5: Invalid regex patterns ────────────────────────────────────────────
  for (const rule of doc.rules) {
    const pat = rawPattern(rule.pattern);
    // Skip special/trivial patterns that we know are valid
    if (!pat || pat === '.' || pat === '<<EOF>>' || pat === '.*' || pat === '.+') continue;
    const err = validateFlexRegex(pat);
    if (err) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: rule.location,
        message: `Invalid regex pattern '${pat}': ${err}.`,
        source: 'flex',
      });
    }
  }

  // ── NEW 6: Keyword shadowed by a general identifier pattern ──────────────────
  // In Flex, longest match wins; for equal-length matches the FIRST rule wins.
  // If an identifier-like pattern appears before a literal keyword in the same
  // start-condition context, the keyword rule can never match.
  {
    const rulesByContext = new Map<string, Array<{ rule: typeof doc.rules[0]; pat: string }>>();
    for (const rule of doc.rules) {
      const ctx = contextKey(rule);
      const pat = rawPattern(rule.pattern);
      if (!rulesByContext.has(ctx)) rulesByContext.set(ctx, []);
      rulesByContext.get(ctx)!.push({ rule, pat });
    }

    for (const [, entries] of rulesByContext) {
      // Collect indices of word-like patterns and literal-keyword patterns
      const wordPatternIdxs: number[] = [];
      const literalEntries: Array<{ idx: number; word: string }> = [];

      for (let i = 0; i < entries.length; i++) {
        const { pat } = entries[i];
        const lit = getLiteralKeyword(pat);
        if (lit) {
          literalEntries.push({ idx: i, word: lit });
        } else if (isWordPattern(pat)) {
          wordPatternIdxs.push(i);
        }
      }

      // Warn when a word pattern precedes a literal keyword in the same context
      for (const wordIdx of wordPatternIdxs) {
        for (const { idx: litIdx, word } of literalEntries) {
          if (wordIdx < litIdx) {
            const wordPat = entries[wordIdx].pat;
            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range: entries[litIdx].rule.location,
              message: `Flex rule '${word}': this keyword may be shadowed by the more general pattern '${wordPat}' at line ${entries[wordIdx].rule.location.start.line + 1}. Place keyword rules before identifier patterns.`,
              source: 'flex',
            });
          }
        }
      }
    }
  }

  // ── NEW 8: Multiple <<EOF>> rules for the same start condition ───────────────
  {
    const eofContexts = new Map<string, number>(); // context -> first line
    for (const rule of doc.rules) {
      const pat = rawPattern(rule.pattern);
      if (pat === '<<EOF>>') {
        const ctx = contextKey(rule);
        if (eofContexts.has(ctx)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: rule.location,
            message: `Duplicate <<EOF>> rule for context '${ctx}': first defined at line ${eofContexts.get(ctx)! + 1}. Only the first one will be used.`,
            source: 'flex',
          });
        } else {
          eofContexts.set(ctx, rule.location.start.line);
        }
      }
    }
  }

  // ── NEW 9: %option stack declared but stack functions never used ──────────────
  if (doc.options.has('stack')) {
    const stackUsed = text.includes('yy_push_state') || text.includes('yy_pop_state') || text.includes('yy_top_state');
    if (!stackUsed) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: doc.options.get('stack')!.location,
        message: '%option stack is declared but yy_push_state/yy_pop_state are never called. Remove this option if the state stack is not needed.',
        source: 'flex',
      });
    }
  }

  // ── NEW 7: Missing %option noyywrap ─────────────────────────────────────────
  if (!doc.options.has('noyywrap')) {
    const hasYywrap = text.includes('yywrap');
    if (!hasYywrap) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: Range.create(0, 0, 0, lines[0]?.length ?? 0),
        message: 'Missing %option noyywrap and no yywrap() function defined. Add "%option noyywrap" to prevent linker errors, or define int yywrap(void) { return 1; }.',
        source: 'flex',
      });
    }
  }

  return diagnostics;
}

// ── Helpers for Flex diagnostics ────────────────────────────────────────────

/**
 * Try to validate a Flex regex pattern by converting Flex-specific constructs
 * to JS equivalents and calling new RegExp().
 * Returns an error message string on failure, or null on success.
 */
function validateFlexRegex(pat: string): string | null {
  // Convert Flex-specific syntax → approximate JS regex
  let p = pat
    .replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, 'x')           // {abbr} → placeholder
    .replace(/"([^"]*)"/g, (_, s) =>                          // "str" → escaped literal
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .replace(/\[:(alpha|upper|lower):\]/g, 'a-zA-Z')         // POSIX classes (inside [...])
    .replace(/\[:digit:\]/g, '0-9')
    .replace(/\[:alnum:\]/g, 'a-zA-Z0-9')
    .replace(/\[:space:\]/g, ' \\t\\n\\r')
    .replace(/\[:word:\]/g, 'a-zA-Z0-9_')
    .replace(/\[:print:\]/g, '\\x20-\\x7E');
  try {
    new RegExp(p);
    return null;
  } catch (e: any) {
    return e.message ?? 'syntax error';
  }
}

/**
 * If `pat` is a bare literal word (only letters/digits/underscore) or a
 * double-quoted word, return the word string; otherwise return null.
 */
function getLiteralKeyword(pat: string): string | null {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pat)) return pat;
  const m = pat.match(/^"([a-zA-Z_][a-zA-Z0-9_]*)"$/);
  return m ? m[1] : null;
}

/**
 * Return true if this pattern looks like a "general word / identifier" matcher,
 * i.e., could match arbitrary letter sequences including keywords.
 */
function isWordPattern(pat: string): boolean {
  // Character class starting with a letter or underscore range: [a-z...], [A-Z...], [_...]
  if (/^\[[a-zA-Z_]/.test(pat)) return true;
  // POSIX character-class expressions that match letter sequences: [[:alpha:]], [[:alnum:]], etc.
  if (/^\[\[:(alpha|upper|lower|alnum|word):\]/.test(pat)) return true;
  // Common abbreviation references for identifiers
  if (/^\{(id|identifier|ident|IDENT|word|alpha)\}/.test(pat)) return true;
  return false;
}
