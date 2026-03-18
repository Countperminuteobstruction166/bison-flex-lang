import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
  TextDocument,
} from 'vscode-languageserver';
import { BisonDocument, FlexDocument, DocumentModel, isBisonDocument } from '../parser/types';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import {
  bisonDirectiveDocs,
  bisonDefineDocs,
  flexDirectiveDocs,
  flexOptionDocs,
  bisonSemanticDocs,
} from './documentation';
import { extractReturnedTokens } from './crossFileSync';

// ── Ranking: common Bison directives get a lower sort prefix ─────────────────
const COMMON_BISON_DIRECTIVES = new Set([
  '%token', '%type', '%left', '%right', '%nonassoc',
  '%start', '%union', '%define', '%code', '%skeleton', '%language',
]);

// ── Flex runtime symbols available in rule action blocks ─────────────────────
const FLEX_RUNTIME_ITEMS: CompletionItem[] = [
  {
    label: 'yytext',
    kind: CompletionItemKind.Variable,
    detail: 'Current token text (char*)',
    documentation: { kind: 'markdown', value: 'Pointer to the matched text. Valid for the duration of the rule action.' },
    sortText: '0yytext',
  },
  {
    label: 'yyleng',
    kind: CompletionItemKind.Variable,
    detail: 'Length of current token (int)',
    documentation: { kind: 'markdown', value: 'Number of characters in `yytext`.' },
    sortText: '0yyleng',
  },
  {
    label: 'yylineno',
    kind: CompletionItemKind.Variable,
    detail: 'Current line number (requires %option yylineno)',
    documentation: { kind: 'markdown', value: 'Current input line number. Requires `%option yylineno`.' },
    sortText: '0yylineno',
  },
  {
    label: 'yyless(n)',
    kind: CompletionItemKind.Function,
    detail: 'Return all but first n characters to input',
    documentation: { kind: 'markdown', value: 'Returns the last `yyleng − n` characters of `yytext` to the input stream.' },
    insertText: 'yyless(${1:n})',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '1yyless',
  },
  {
    label: 'yymore()',
    kind: CompletionItemKind.Function,
    detail: 'Append next match to yytext',
    documentation: { kind: 'markdown', value: 'The next match will be appended to `yytext` rather than replacing it.' },
    insertText: 'yymore()',
    insertTextFormat: InsertTextFormat.PlainText,
    sortText: '1yymore',
  },
  {
    label: 'ECHO',
    kind: CompletionItemKind.Keyword,
    detail: 'Copy yytext to yyout',
    documentation: { kind: 'markdown', value: 'Copies `yytext` to the scanner\'s output (`yyout`).' },
    sortText: '1ECHO',
  },
  {
    label: 'BEGIN',
    kind: CompletionItemKind.Function,
    detail: 'Switch to a start condition',
    documentation: { kind: 'markdown', value: 'Transitions to the named start condition: `BEGIN(STATE)`.' },
    insertText: 'BEGIN(${1:STATE})',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '1BEGIN',
  },
  {
    label: 'REJECT',
    kind: CompletionItemKind.Keyword,
    detail: 'Reject current rule, try next best match',
    documentation: { kind: 'markdown', value: 'Causes the scanner to proceed to the next applicable rule. Requires `%option reject`.' },
    sortText: '1REJECT',
  },
  {
    label: 'yypush_buffer_state()',
    kind: CompletionItemKind.Function,
    detail: 'Push a new buffer state onto the stack',
    documentation: { kind: 'markdown', value: 'Pushes the current buffer state onto a stack and switches to a new buffer.' },
    insertText: 'yypush_buffer_state(${1:buffer})',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '2yypush',
  },
  {
    label: 'yypop_buffer_state()',
    kind: CompletionItemKind.Function,
    detail: 'Pop the top buffer state from the stack',
    documentation: { kind: 'markdown', value: 'Pops the top buffer from the stack and switches to it.' },
    insertText: 'yypop_buffer_state()',
    insertTextFormat: InsertTextFormat.PlainText,
    sortText: '2yypop',
  },
];

// ── %define value table ───────────────────────────────────────────────────────
interface ValueDef {
  label: string;
  detail: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: InsertTextFormat;
  sortText: string;
}

const DEFINE_VALUES: Record<string, ValueDef[]> = {
  'api.value.type': [
    {
      label: 'variant',
      detail: 'C++ std::variant (Bison ≥ 3.2, requires C++17)',
      documentation: 'Each semantic value is stored as `std::variant`. Requires `%language "c++"` and a C++17 compiler.',
      sortText: '0',
    },
    {
      label: 'union',
      detail: 'C union (classic default)',
      documentation: 'Uses the `YYSTYPE` union. Compatible with C and older C++ Bison grammars.',
      sortText: '1',
    },
    {
      label: 'union-directive',
      detail: 'Union defined by %union directive',
      documentation: 'Use a union body declared with `%union { ... }`.',
      sortText: '2',
    },
    {
      label: 'std::variant<int, std::string>',
      detail: 'Explicit std::variant type list',
      insertText: 'std::variant<${1:int, std::string}>',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '3',
    },
  ],
  'parse.error': [
    { label: 'simple',   detail: 'Simple error messages (default)',                     sortText: '0' },
    { label: 'detailed', detail: 'Detailed error messages with token context',           sortText: '1' },
    { label: 'verbose',  detail: 'Verbose — list expected tokens in the error message',  sortText: '2' },
  ],
  'api.push-pull': [
    { label: 'pull', detail: 'Pull parser only — yyparse() drives the lexer (default)', sortText: '0' },
    { label: 'push', detail: 'Push parser only — caller feeds tokens one at a time',    sortText: '1' },
    { label: 'both', detail: 'Generate both push and pull interfaces',                  sortText: '2' },
  ],
  'api.token.constructor': [
    { label: 'true',  detail: 'Enable C++ token constructors',          sortText: '0' },
    { label: 'false', detail: 'Disable token constructors (default)',   sortText: '1' },
  ],
  'lr.type': [
    { label: 'lalr',         detail: 'LALR(1) — default, smallest tables',                   sortText: '0' },
    { label: 'ielr',         detail: 'IELR(1) — fewer conflicts than LALR, smaller than CLR', sortText: '1' },
    { label: 'canonical-lr', detail: 'Canonical LR(1) — most powerful, largest tables',      sortText: '2' },
  ],
};

function getDefineValueCompletions(variable: string): CompletionItem[] {
  const values = DEFINE_VALUES[variable];
  if (!values) return [];
  return values.map(v => ({
    label: v.label,
    kind: CompletionItemKind.Value,
    detail: v.detail,
    documentation: v.documentation ? { kind: 'markdown' as const, value: v.documentation } : undefined,
    insertText: v.insertText,
    insertTextFormat: v.insertTextFormat,
    sortText: v.sortText,
  }));
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function getCompletions(
  doc: DocumentModel,
  textDoc: TextDocument,
  position: Position,
  companionBison?: BisonDocument,
  companionFlexText?: string,
): CompletionItem[] {
  const text = textDoc.getText();
  const lineText = text.split(/\r?\n/)[position.line] || '';
  const linePrefix = lineText.substring(0, position.character);

  if (isBisonDocument(doc)) {
    return getBisonCompletions(doc, linePrefix, position, textDoc, companionFlexText);
  } else {
    return getFlexCompletions(doc as FlexDocument, linePrefix, position, companionBison);
  }
}

// ── Bison completions ─────────────────────────────────────────────────────────
function getBisonCompletions(
  doc: BisonDocument,
  linePrefix: string,
  position: Position,
  textDoc: TextDocument,
  companionFlexText?: string,
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // 1. %include file completions
  if (linePrefix.match(/%include\s+["'<][^"'<>]*$/)) {
    const match = linePrefix.match(/%include\s+["'<](.*)$/);
    const partial = match ? match[1] : '';
    try {
      const fileDir = path.dirname(fileURLToPath(textDoc.uri));
      const targetDir = partial.includes('/') || partial.includes(path.sep)
        ? path.join(fileDir, path.dirname(partial))
        : fileDir;
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      return entries.map(entry => ({
        label: entry.name,
        kind: entry.isDirectory() ? CompletionItemKind.Folder : CompletionItemKind.File,
        detail: entry.isDirectory() ? 'Directory' : 'File',
        sortText: (entry.isDirectory() ? '0' : '1') + entry.name,
      }));
    } catch {
      return [];
    }
  }

  // 2. %skeleton value completions
  if (linePrefix.match(/%skeleton\s+\S*$/)) {
    return [
      { label: '"lalr1.cc"',   kind: CompletionItemKind.Value, detail: 'C++ LALR(1) parser — default for C++',  sortText: '0' },
      { label: '"glr.cc"',     kind: CompletionItemKind.Value, detail: 'C++ GLR parser',                        sortText: '1' },
      { label: '"lalr1.c"',    kind: CompletionItemKind.Value, detail: 'C LALR(1) parser',                      sortText: '2' },
      { label: '"glr.c"',      kind: CompletionItemKind.Value, detail: 'C GLR parser',                          sortText: '3' },
      { label: '"location.cc"',kind: CompletionItemKind.Value, detail: 'Location tracking only (no parser)',    sortText: '4' },
    ];
  }

  // 3. %code qualifier completions  (must come before the generic %\w* directive check)
  if (linePrefix.match(/%code\s+\S*$/)) {
    return [
      {
        label: 'requires',
        kind: CompletionItemKind.Value,
        detail: '%code requires — emitted before the token/type definitions',
        documentation: { kind: 'markdown', value: 'Inserted near the top of the parser header. Use to declare types needed by `%union` or `%token` type tags.' },
        sortText: '0',
      },
      {
        label: 'provides',
        kind: CompletionItemKind.Value,
        detail: '%code provides — emitted after the token/type definitions',
        documentation: { kind: 'markdown', value: 'Inserted after the token and type declarations in the header file.' },
        sortText: '1',
      },
      {
        label: 'top',
        kind: CompletionItemKind.Value,
        detail: '%code top — at the very top of the generated source file',
        documentation: { kind: 'markdown', value: 'Inserted as early as possible in the generated `.cc`/`.c` file, before any Bison-generated code.' },
        sortText: '2',
      },
    ];
  }

  // 4. %define value completions
  const defineValueMatch = linePrefix.match(/%define\s+(\S+)\s+\S*$/);
  if (defineValueMatch) {
    const result = getDefineValueCompletions(defineValueMatch[1]);
    if (result.length > 0) return result;
  }

  // 5. Directive completions (after %)
  if (linePrefix.match(/%\w*$/) && !linePrefix.match(/%%.*/)) {
    for (const [name, entry] of bisonDirectiveDocs) {
      items.push({
        label: name,
        kind: CompletionItemKind.Keyword,
        detail: entry.signature,
        documentation: { kind: 'markdown', value: entry.description + (entry.example ? `\n\n\`\`\`bison\n${entry.example}\n\`\`\`` : '') },
        insertText: name.substring(1), // strip leading % (already typed)
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: (COMMON_BISON_DIRECTIVES.has(name) ? '00' : '01') + name,
      });
    }
    return items;
  }

  // 6. %define variable completions
  if (linePrefix.match(/%define\s+\S*$/)) {
    for (const [variable, entry] of bisonDefineDocs) {
      items.push({
        label: variable,
        kind: CompletionItemKind.Variable,
        detail: entry.signature,
        documentation: { kind: 'markdown', value: entry.description + (entry.example ? `\n\n\`\`\`bison\n${entry.example}\n\`\`\`` : '') },
        sortText: '0' + variable,
      });
    }
    return items;
  }

  // 7. Semantic value completions (after $ or @)
  if (linePrefix.match(/\$\w*$/)) {
    items.push({
      label: '$$',
      kind: CompletionItemKind.Variable,
      detail: 'Result value of the current rule',
      documentation: bisonSemanticDocs.get('$$')?.description,
      insertText: '$',
      sortText: '0$$',
    });
    for (let i = 1; i <= 9; i++) {
      items.push({
        label: `$${i}`,
        kind: CompletionItemKind.Variable,
        detail: `Value of RHS symbol #${i}`,
        insertText: `${i}`,
        sortText: `1$${i}`,
      });
    }
    return items;
  }

  if (linePrefix.match(/@\w*$/)) {
    items.push({
      label: '@$',
      kind: CompletionItemKind.Variable,
      detail: 'Location of the current rule',
      insertText: '$',
      sortText: '0@$',
    });
    for (let i = 1; i <= 9; i++) {
      items.push({
        label: `@${i}`,
        kind: CompletionItemKind.Variable,
        detail: `Location of RHS symbol #${i}`,
        insertText: `${i}`,
        sortText: `1@${i}`,
      });
    }
    return items;
  }

  // 8. Token and non-terminal name completions in rules section
  //    Tokens from companion .l file get a "not in lexer" indicator (Task 1b).
  const isInRulesSection = doc.separators.length > 0 && position.line > doc.separators[0];
  if (isInRulesSection) {
    // Pre-compute which tokens are returned in the companion Flex file
    const returnedByLexer = companionFlexText
      ? extractReturnedTokens(companionFlexText)
      : undefined;
    const SKIP_TOKENS = new Set(['EOF', 'YYEOF', 'YYUNDEF', 'YYerror', 'error']);

    for (const [name, decl] of doc.tokens) {
      const notInLexer = returnedByLexer && !returnedByLexer.has(name) && !SKIP_TOKENS.has(name);
      items.push({
        label: name,
        kind: CompletionItemKind.Constant,
        detail: `Token${decl.type ? ` <${decl.type}>` : ''}${decl.alias ? ` "${decl.alias}"` : ''}${notInLexer ? ' — ⚠ not returned in lexer' : ''}`,
        // Boost already-referenced tokens to the top
        sortText: (doc.ruleReferences.has(name) ? '10' : '20') + name,
      });
    }

    for (const [name, decl] of doc.nonTerminals) {
      items.push({
        label: name,
        kind: CompletionItemKind.Function,
        detail: `Non-terminal${decl.type ? ` <${decl.type}>` : ''}`,
        sortText: (doc.ruleReferences.has(name) ? '11' : '21') + name,
      });
    }

    for (const [name] of doc.rules) {
      if (!doc.nonTerminals.has(name)) {
        items.push({
          label: name,
          kind: CompletionItemKind.Function,
          detail: 'Rule',
          sortText: (doc.ruleReferences.has(name) ? '11' : '22') + name,
        });
      }
    }
  }

  // 9. Snippets (always available)
  items.push({
    label: 'rule',
    kind: CompletionItemKind.Snippet,
    detail: 'Rule template',
    insertText: '${1:name}:\n  ${2:production} { ${3:action} }\n;',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9rule',
  });
  items.push({
    label: '%code requires',
    kind: CompletionItemKind.Snippet,
    detail: '%code requires block',
    insertText: '%code requires\n{\n  ${1}\n}',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9code-req',
  });
  items.push({
    label: '%token declaration',
    kind: CompletionItemKind.Snippet,
    detail: '%token with type and alias',
    insertText: '%token <${1:type}> ${2:NAME} "${3:alias}"',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9token',
  });

  return items;
}

// ── Flex completions ──────────────────────────────────────────────────────────
function getFlexCompletions(
  doc: FlexDocument,
  linePrefix: string,
  position: Position,
  companionBison?: BisonDocument,
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // 1. Directive completions (after %)
  if (linePrefix.match(/%\w*$/) && !linePrefix.match(/%%.*/)) {
    for (const [name, entry] of flexDirectiveDocs) {
      items.push({
        label: name,
        kind: CompletionItemKind.Keyword,
        detail: entry.signature,
        documentation: { kind: 'markdown', value: entry.description + (entry.example ? `\n\n\`\`\`flex\n${entry.example}\n\`\`\`` : '') },
        insertText: name.substring(1),
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: '0' + name,
      });
    }
    return items;
  }

  // 2. %option value completions
  if (linePrefix.match(/%option\s+\S*$/)) {
    for (const [name, entry] of flexOptionDocs) {
      items.push({
        label: name,
        kind: CompletionItemKind.Property,
        detail: entry.signature,
        documentation: { kind: 'markdown', value: entry.description },
        sortText: '0' + name,
      });
    }
    return items;
  }

  // 3. Start condition completions (after <)
  if (linePrefix.match(/<[A-Z_]*$/)) {
    for (const [name, sc] of doc.startConditions) {
      items.push({
        label: name,
        kind: CompletionItemKind.Enum,
        detail: `${sc.exclusive ? 'Exclusive' : 'Inclusive'} start condition`,
        sortText: '0' + name,
      });
    }
    items.push({
      label: 'INITIAL',
      kind: CompletionItemKind.Enum,
      detail: 'Default start condition',
      sortText: '0INITIAL',
    });
    return items;
  }

  const isInFlexRules = doc.separators.length > 0 && position.line > doc.separators[0];

  // 4. Abbreviation completions in patterns ({abbrev} — no space after {)
  if (linePrefix.match(/\{[a-zA-Z_]*$/)) {
    for (const [name, abbr] of doc.abbreviations) {
      items.push({
        label: name,
        kind: CompletionItemKind.Variable,
        detail: `Abbreviation: ${abbr.pattern}`,
        insertText: name + '}',
        sortText: '0' + name,
      });
    }
    if (items.length > 0) return items;
  }

  // 5. Flex runtime completions in action blocks (Task 2)
  //    Detect action-block context:
  //    a) Indented line in rules section → multi-line action block
  //    b) Line starts with a pattern then whitespace + '{' → single-line action block
  const isInFlexAction = isInFlexRules && (
    /^\s+\S/.test(linePrefix) ||
    /^\S[\S\s]*\s+\{[^}]*$/.test(linePrefix)
  );

  if (isInFlexAction) {
    items.push(...FLEX_RUNTIME_ITEMS);

    // Also offer start condition names for BEGIN(STATE) expansion
    for (const [name] of doc.startConditions) {
      items.push({
        label: name,
        kind: CompletionItemKind.Enum,
        detail: 'Start condition (use with BEGIN)',
        sortText: '3' + name,
      });
    }
  }

  // 6. Cross-file: offer Bison tokens in rules section (Task 1a)
  //    These are the tokens the lexer is expected to return.
  if (isInFlexRules && companionBison) {
    for (const [name, decl] of companionBison.tokens) {
      items.push({
        label: name,
        kind: CompletionItemKind.Constant,
        detail: `Token from grammar${decl.type ? ` <${decl.type}>` : ''}`,
        documentation: {
          kind: 'markdown',
          value: `Declared with \`%token${decl.type ? ` <${decl.type}>` : ''} ${name}\` in the companion grammar file.\n\nUse \`return ${name};\` in the action block.`,
        },
        // Tokens already returned in this file rank higher
        sortText: (doc.abbreviationRefs.has(name) ? '1' : '2') + name,
      });
    }
  }

  // 7. Snippets
  items.push({
    label: 'rule with start condition',
    kind: CompletionItemKind.Snippet,
    detail: 'Flex rule with start condition',
    insertText: '<${1:CONDITION}>${2:pattern}  {\n  ${3:action}\n}',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9rule-sc',
  });
  items.push({
    label: '%option block',
    kind: CompletionItemKind.Snippet,
    detail: 'Common option directives',
    insertText: '%option noyywrap\n%option nounput\n%option noinput',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9options',
  });
  items.push({
    label: '%top block',
    kind: CompletionItemKind.Snippet,
    detail: '%top code block',
    insertText: '%top{\n  ${1}\n}',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9top',
  });

  return items;
}
