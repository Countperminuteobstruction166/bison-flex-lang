export interface DocEntry {
  signature: string;
  description: string;
  example?: string;
}

// ── Bison Directives ──

export const bisonDirectiveDocs: Map<string, DocEntry> = new Map([
  ['%token', {
    signature: '%token <type> NAME "alias"',
    description: 'Declares a terminal symbol (token). Optionally specify a semantic value type in angle brackets and a string alias for better error messages.',
    example: '%token <int> INT "integer"\n%token <std::string> STRING "string"',
  }],
  ['%type', {
    signature: '%type <type> nonterminal ...',
    description: 'Declares the semantic value type for one or more nonterminal symbols.',
    example: '%type <ast::Exp*> exp\n%type <ast::ChunkList*> chunks',
  }],
  ['%nterm', {
    signature: '%nterm <type> nonterminal ...',
    description: 'Synonym for %type. Declares the semantic value type for nonterminal symbols.',
    example: '%nterm <ast::Exp*> exp',
  }],
  ['%define', {
    signature: '%define variable value',
    description: 'Sets a Bison configuration variable. Controls parser behavior, API style, namespace, and more.',
    example: '%define api.value.type variant\n%define api.namespace {parse}',
  }],
  ['%code', {
    signature: '%code [qualifier] { ... }',
    description: 'Inserts C/C++ code into specific locations in the generated parser. Qualifiers: `requires` (before YYSTYPE), `provides` (after YYSTYPE, in header), `top` (top of implementation).',
    example: '%code requires {\n  #include <ast/fwd.hh>\n}',
  }],
  ['%left', {
    signature: '%left symbol ...',
    description: 'Declares tokens as left-associative with a given precedence level. Tokens on the same line share the same precedence. Later declarations have higher precedence.',
    example: '%left "+" "-"\n%left "*" "/"',
  }],
  ['%right', {
    signature: '%right symbol ...',
    description: 'Declares tokens as right-associative with a given precedence level.',
    example: '%right "^"',
  }],
  ['%nonassoc', {
    signature: '%nonassoc symbol ...',
    description: 'Declares tokens as non-associative. Using them in an associative context is a syntax error.',
    example: '%nonassoc "=" "<>" "<" "<=" ">" ">="',
  }],
  ['%precedence', {
    signature: '%precedence symbol ...',
    description: 'Declares precedence for tokens without specifying associativity. Useful for context-dependent precedence with %prec.',
    example: '%precedence CHUNKS\n%precedence TYPE',
  }],
  ['%start', {
    signature: '%start symbol',
    description: 'Specifies the start symbol of the grammar. If omitted, the first rule\'s left-hand side is used.',
    example: '%start program',
  }],
  ['%union', {
    signature: '%union { ... }',
    description: 'Defines the semantic value type as a C union. Prefer `%define api.value.type variant` in C++ mode.',
    example: '%union {\n  int ival;\n  char* sval;\n}',
  }],
  ['%expect', {
    signature: '%expect N',
    description: 'Tells Bison to expect exactly N shift/reduce conflicts. Bison reports an error if the actual count differs.',
    example: '%expect 1',
  }],
  ['%expect-rr', {
    signature: '%expect-rr N',
    description: 'Tells Bison to expect exactly N reduce/reduce conflicts. Only meaningful for GLR parsers.',
    example: '%expect-rr 0',
  }],
  ['%require', {
    signature: '%require "version"',
    description: 'Requires a minimum Bison version to process the grammar.',
    example: '%require "3.8"',
  }],
  ['%language', {
    signature: '%language "lang"',
    description: 'Selects the output programming language. Supported: "c", "c++", "d", "java".',
    example: '%language "c++"',
  }],
  ['%skeleton', {
    signature: '%skeleton "file"',
    description: 'Selects the parser skeleton. Common C++ skeletons: "lalr1.cc", "glr.cc", "glr2.cc".',
    example: '%skeleton "glr2.cc"',
  }],
  ['%glr-parser', {
    signature: '%glr-parser',
    description: 'Requests a GLR (Generalized LR) parser that can handle ambiguous grammars by forking and testing each parsing path at runtime.',
  }],
  ['%locations', {
    signature: '%locations',
    description: 'Enables location tracking. Each symbol has a location (@$, @1, etc.) recording its position in the input.',
  }],
  ['%defines', {
    signature: '%defines ["filename"]',
    description: 'Generates a header file with token definitions and other declarations. Optionally specify the output filename.',
    example: '%defines "parser.hh"',
  }],
  ['%debug', {
    signature: '%debug',
    description: 'Enables parser debugging support. The parser can then be run with tracing enabled.',
  }],
  ['%param', {
    signature: '%param { declaration }',
    description: 'Adds a parameter to both yylex() and yyparse(). The parameter is available throughout parsing.',
    example: '%param { ::parse::TigerDriver& td }',
  }],
  ['%parse-param', {
    signature: '%parse-param { declaration }',
    description: 'Adds a parameter to yyparse() only (not yylex).',
    example: '%parse-param { ::parse::Lexer& lexer }',
  }],
  ['%lex-param', {
    signature: '%lex-param { declaration }',
    description: 'Adds a parameter to yylex() only (not yyparse).',
    example: '%lex-param { YYSTYPE* yylval }',
  }],
  ['%printer', {
    signature: '%printer { code } symbols',
    description: 'Defines how to print semantic values for debugging. The code can use $$ to refer to the value and yyo for the output stream.',
    example: '%printer { yyo << $$; } <int> <std::string>',
  }],
  ['%destructor', {
    signature: '%destructor { code } symbols',
    description: 'Defines how to free/destroy semantic values when discarded during error recovery. Use $$ to refer to the value.',
    example: '%destructor { delete $$; } <ast::Exp*>',
  }],
  ['%empty', {
    signature: '%empty',
    description: 'Explicitly marks an alternative as matching the empty string. Used in rules to document intentional empty productions.',
    example: 'items:\n  %empty     { $$ = new List(); }\n| items item { $1->push($2); $$ = $1; }',
  }],
  ['%prec', {
    signature: '%prec TOKEN',
    description: 'Overrides the default precedence of a rule with the precedence of the specified token. Used for context-dependent precedence.',
    example: 'exp: "-" exp %prec UMINUS { $$ = -$2; }',
  }],
  ['%initial-action', {
    signature: '%initial-action { code }',
    description: 'Code executed once before parsing begins. Commonly used to initialize the location.',
    example: '%initial-action {\n  @$.begin.filename = @$.end.filename = &driver.file;\n}',
  }],
  ['%verbose', {
    signature: '%verbose',
    description: 'Requests a verbose parser output file (.output) with detailed state information for debugging grammar conflicts.',
  }],
  ['%no-lines', {
    signature: '%no-lines',
    description: 'Suppresses #line directives in the generated parser. Useful for debugging the generated code directly.',
  }],
  ['%token-table', {
    signature: '%token-table',
    description: 'Generates a table of token names, allowing runtime lookup of token names by their integer values.',
  }],
  ['%output', {
    signature: '%output "filename"',
    description: 'Specifies the name of the generated parser implementation file.',
    example: '%output "parser.cc"',
  }],
  ['%file-prefix', {
    signature: '%file-prefix "prefix"',
    description: 'Specifies the prefix for all generated file names.',
  }],
]);

// ── Bison %define Variables ──

export const bisonDefineDocs: Map<string, DocEntry> = new Map([
  ['api.value.type', {
    signature: '%define api.value.type variant|union|{type}',
    description: 'Selects the semantic value type. `variant` uses Bison\'s type-safe C++ variant. `union` uses a C union. A braced type specifies a single type for all values.',
    example: '%define api.value.type variant',
  }],
  ['api.token.prefix', {
    signature: '%define api.token.prefix {PREFIX_}',
    description: 'Adds a prefix to all token names to avoid name collisions.',
    example: '%define api.token.prefix {TOK_}',
  }],
  ['api.token.constructor', {
    signature: '%define api.token.constructor',
    description: 'Enables token constructors (make_TOKEN functions) for type-safe token creation in C++.',
  }],
  ['api.namespace', {
    signature: '%define api.namespace {name}',
    description: 'Sets the C++ namespace for the generated parser class.',
    example: '%define api.namespace {parse}',
  }],
  ['api.prefix', {
    signature: '%define api.prefix {name}',
    description: 'Renames the yy prefix used in all generated symbols (parser class, token enum, etc.).',
    example: '%define api.prefix {parse}',
  }],
  ['api.parser.class', {
    signature: '%define api.parser.class {ClassName}',
    description: 'Sets the name of the generated parser class.',
    example: '%define api.parser.class {parser}',
  }],
  ['api.filename.type', {
    signature: '%define api.filename.type {type}',
    description: 'Sets the type used for filenames in location tracking.',
    example: '%define api.filename.type {const std::string}',
  }],
  ['api.location.type', {
    signature: '%define api.location.type {type}',
    description: 'Overrides the default location type used by the parser.',
  }],
  ['api.value.automove', {
    signature: '%define api.value.automove',
    description: 'Automatically applies std::move() when passing semantic values, useful with variant types.',
  }],
  ['parse.error', {
    signature: '%define parse.error verbose|detailed|custom|simple',
    description: 'Controls the verbosity of syntax error messages.\n- `simple`: just "syntax error"\n- `verbose`: includes unexpected/expected tokens\n- `detailed`: like verbose with token names\n- `custom`: user-defined error function',
    example: '%define parse.error verbose',
  }],
  ['parse.lac', {
    signature: '%define parse.lac full|none',
    description: 'Enables Lookahead Correction (LAC) for more accurate list of expected tokens in error messages.',
    example: '%define parse.lac full',
  }],
  ['parse.trace', {
    signature: '%define parse.trace',
    description: 'Enables compile-time tracing support (equivalent to %debug).',
  }],
  ['lr.type', {
    signature: '%define lr.type lalr|ielr|canonical-lr',
    description: 'Selects the LR parser table construction algorithm.\n- `lalr`: default, fast, may have conflicts\n- `ielr`: improved, fewer conflicts\n- `canonical-lr`: no conflicts but large tables',
  }],
  ['lr.default-reduction', {
    signature: '%define lr.default-reduction most|consistent|accepting',
    description: 'Controls when the parser uses default reductions, affecting error detection timing.',
  }],
]);

// ── Bison Semantic Values ──

export const bisonSemanticDocs: Map<string, DocEntry> = new Map([
  ['$$', {
    signature: '$$',
    description: 'The semantic value of the left-hand side (result) of the current rule. Assign to it to set the rule\'s value.',
    example: 'exp: exp "+" exp { $$ = $1 + $3; }',
  }],
  ['$1', {
    signature: '$N',
    description: 'The semantic value of the Nth symbol on the right-hand side of the rule. $1 is the first symbol, $2 is the second, etc.',
    example: 'exp: exp "+" exp { $$ = $1 + $3; }',
  }],
  ['@$', {
    signature: '@$',
    description: 'The location (source position) of the left-hand side of the current rule. Automatically computed from the locations of the RHS symbols.',
  }],
  ['@1', {
    signature: '@N',
    description: 'The location (source position) of the Nth symbol on the right-hand side. @1 is the first symbol, etc.',
  }],
]);

// ── Flex Directives ──

export const flexDirectiveDocs: Map<string, DocEntry> = new Map([
  ['%option', {
    signature: '%option name[=value] ...',
    description: 'Sets scanner generation options. Multiple options can be on one line or separate lines.',
    example: '%option noyywrap\n%option bison-complete',
  }],
  ['%x', {
    signature: '%x STATE1 STATE2 ...',
    description: 'Declares exclusive start conditions. When an exclusive condition is active, only rules with that condition (or no condition) are active.',
    example: '%x SC_COMMENT SC_STRING',
  }],
  ['%s', {
    signature: '%s STATE1 STATE2 ...',
    description: 'Declares inclusive start conditions. When an inclusive condition is active, rules with no condition are also active.',
    example: '%s SC_SPECIAL',
  }],
  ['%top', {
    signature: '%top { code }',
    description: 'Inserts code at the very top of the generated scanner file, before any Flex-generated code. Useful for #include directives that must come first.',
    example: '%top{\n  #include <string>\n  #include "parser.hh"\n}',
  }],
  ['%class', {
    signature: '%class { members }',
    description: '(RE-flex) Declares member variables and methods for the generated scanner class.',
    example: '%class{\n  std::string string_content;\n  int comment_depth = 0;\n}',
  }],
]);

// ── Flex Option Values ──

export const flexOptionDocs: Map<string, DocEntry> = new Map([
  ['noyywrap', {
    signature: '%option noyywrap',
    description: 'Disables the yywrap() function call at end-of-file. The scanner will simply stop instead of checking for more input.',
  }],
  ['nounput', {
    signature: '%option nounput',
    description: 'Suppresses generation of the unput() function, avoiding unused function warnings.',
  }],
  ['noinput', {
    signature: '%option noinput',
    description: 'Suppresses generation of the input() function, avoiding unused function warnings.',
  }],
  ['nodefault', {
    signature: '%option nodefault',
    description: 'Makes the scanner emit an error for unmatched input instead of echoing it. Recommended for catching missing rules.',
  }],
  ['debug', {
    signature: '%option debug',
    description: 'Enables scanner debugging mode. The scanner traces its actions when the debug flag is set.',
  }],
  ['bison-complete', {
    signature: '%option bison-complete',
    description: '(RE-flex) Enables full Bison-compatible interface including make_TOKEN constructors and location tracking.',
  }],
  ['bison-cc-parser', {
    signature: '%option bison-cc-parser=ClassName',
    description: '(RE-flex) Specifies the Bison C++ parser class name for token type generation.',
    example: '%option bison-cc-parser=parser',
  }],
  ['bison_cc_namespace', {
    signature: '%option bison_cc_namespace=ns',
    description: '(RE-flex) Sets the namespace of the Bison parser class.',
    example: '%option bison_cc_namespace=parse',
  }],
  ['bison-locations', {
    signature: '%option bison-locations',
    description: '(RE-flex) Enables Bison location tracking in the scanner.',
  }],
  ['bison-bridge', {
    signature: '%option bison-bridge',
    description: 'Enables the Bison bridge interface (reentrant scanner with yylval parameter).',
  }],
  ['reentrant', {
    signature: '%option reentrant',
    description: 'Generates a reentrant (thread-safe) scanner with no global state.',
  }],
  ['lex', {
    signature: '%option lex=name',
    description: '(RE-flex) Sets the name of the scanning method.',
    example: '%option lex=lex',
  }],
  ['lexer', {
    signature: '%option lexer=ClassName',
    description: '(RE-flex) Sets the name of the generated scanner class.',
    example: '%option lexer=Lexer',
  }],
  ['namespace', {
    signature: '%option namespace=ns',
    description: '(RE-flex) Sets the namespace for the generated scanner class.',
    example: '%option namespace=parse',
  }],
  ['params', {
    signature: '%option params="declaration"',
    description: '(RE-flex) Adds extra parameters to the lex() scanning function.',
    example: '%option params="::parse::TigerDriver& td"',
  }],
  ['prefix', {
    signature: '%option prefix="name"',
    description: 'Changes the yy prefix to the specified name, allowing multiple scanners in one program.',
    example: '%option prefix="tiger"',
  }],
  ['header-file', {
    signature: '%option header-file="filename"',
    description: 'Generates a C header file with scanner declarations.',
    example: '%option header-file="scanner.hh"',
  }],
  ['outfile', {
    signature: '%option outfile="filename"',
    description: 'Sets the name of the generated scanner source file.',
  }],
  ['case-insensitive', {
    signature: '%option case-insensitive',
    description: 'Makes the scanner case-insensitive. Patterns match regardless of letter case.',
  }],
  ['yylineno', {
    signature: '%option yylineno',
    description: 'Makes the scanner maintain a line count in the variable yylineno.',
  }],
  ['stack', {
    signature: '%option stack',
    description: 'Enables start condition stacking with yy_push_state() and yy_pop_state().',
  }],
  ['8bit', {
    signature: '%option 8bit',
    description: 'Generates an 8-bit scanner (default). Recognizes full 8-bit character set.',
  }],
  ['extra-type', {
    signature: '%option extra-type="type"',
    description: 'Specifies the type of yyextra, the extra data passed to a reentrant scanner.',
    example: '%option extra-type="struct Context*"',
  }],
]);

// ── Flex Built-in Functions ──

export const flexBuiltinDocs: Map<string, DocEntry> = new Map([
  ['start', {
    signature: 'start(condition)',
    description: '(RE-flex) Switches to the specified start condition. Equivalent to BEGIN(condition) in classic Flex.',
    example: 'start(SC_COMMENT);',
  }],
  ['text', {
    signature: 'text()',
    description: '(RE-flex) Returns the matched text as a const char*. Equivalent to yytext in classic Flex.',
    example: 'std::string s = text();',
  }],
  ['BEGIN', {
    signature: 'BEGIN(condition)',
    description: 'Switches to the specified start condition. Rules prefixed with <condition> become active.',
    example: 'BEGIN(COMMENT);',
  }],
  ['ECHO', {
    signature: 'ECHO',
    description: 'Copies the matched text (yytext) to the output (yyout). Default action for unmatched text.',
  }],
  ['REJECT', {
    signature: 'REJECT',
    description: 'Rejects the current match and tries the next best alternative rule. Expensive; avoid if possible.',
  }],
  ['yymore', {
    signature: 'yymore()',
    description: 'Tells the scanner to append the next match to the current yytext instead of replacing it.',
  }],
  ['yyless', {
    signature: 'yyless(n)',
    description: 'Pushes back all but the first n characters of the match. Re-scanned on next call.',
    example: 'yyless(1); // keep only first character',
  }],
  ['INITIAL', {
    signature: 'INITIAL',
    description: 'The default start condition. All rules without a start condition prefix are active in this state.',
  }],
  ['<<EOF>>', {
    signature: '<<EOF>>',
    description: 'Special pattern that matches end-of-file. Use with start conditions for EOF handling in different states.',
    example: '<SC_STRING><<EOF>> {\n  error("unterminated string");\n}',
  }],
]);
