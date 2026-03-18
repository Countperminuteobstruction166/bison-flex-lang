# Changelog

All notable changes to the **Bison/Flex Language Support** extension will be documented in this file.

## [1.1.0] - 2026-03-18

### Added

- **Document Symbols** — Outline view (`Ctrl+Shift+O`) with collapsible sections for declarations, rules, and epilogue (Bison) or definitions, rules, and user code (Flex)
- **Workspace Symbols** — Fuzzy symbol search (`Ctrl+T`) across all open Bison and Flex files (up to 200 results)
- **Code Lens** — "N reference(s)" above each Bison rule and Flex start condition; "⬪ entry point" badge above the start symbol
- **Inlay Hints** — Inline type annotations for `$$`, `$1`, `$2`, etc. derived from `%type`/`%token` declarations
- **CMake Integration**
  - Diagnostic warning when a `.y`/`.l` file is not referenced in a nearby `BISON_TARGET`/`FLEX_TARGET`
  - New command **Bison/Flex: Add CMake Target** — appends the correct `BISON_TARGET` or `FLEX_TARGET` snippet to `CMakeLists.txt`
- **Compile Commands**
  - **Bison: Compile** — runs `bison -d` on the current file and surfaces errors as VS Code diagnostics
  - **Flex: Compile** — runs `flex` on the current file and surfaces errors as VS Code diagnostics
- **Grammar Tools**
  - **Bison: Show Parse Table** — renders the `.output` parse table in a side panel
  - **Bison: Show Grammar Graph** — interactive D3.js force-directed graph; click a node to navigate to the rule; detects left/right recursion
  - **Bison: Explain Conflict** — detailed shift/reduce conflict analysis with fix suggestions and precedence recommendations
  - **Bison: Generate AST Skeleton** — generates a complete C++ AST with visitor pattern, forward declarations, and node classes
  - **Flex: Test Rule** — interactive regex tester for the pattern on the current line
- **Initialize tasks.json** — auto-generates `.vscode/tasks.json` with Bison/Flex problem matchers; auto-detects CMake and Makefile projects
- **Yacc Legacy Hints** — inlay hints for legacy `%pure_parser`, `%union`, and `YYSTYPE` patterns pointing to modern Bison equivalents
- **Smart Indent** — `onEnterRules` for Bison and Flex that indent correctly after rule openers and `%{`/`%}`

### Changed

- README updated with all new features, configuration settings, and screenshots
- Status bar shows a "Grammar Graph" shortcut button when a Bison file is active

### Configuration

Three new settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `bisonFlex.showInlayHints` | `true` | Show inlay hints for `$$`/`$1`/`@$` semantic values |
| `bisonFlex.enableCodeLens` | `true` | Show Code Lens reference counts and entry-point badges |
| `bisonFlex.enableCmakeDiagnostics` | `true` | Warn when a `.y`/`.l` file is missing from `CMakeLists.txt` |

---

## [1.0.0] - 2026-03-13

### Added

- **Syntax highlighting** for Bison (`.y`, `.yy`) and Flex/RE-flex (`.l`, `.ll`)
  - Section-aware grammars (declarations / rules / epilogue)
  - Embedded C/C++ highlighting in code blocks and actions
  - Semantic value highlighting (`$$`, `$1`, `@$`, `@1`)
  - Start condition highlighting (`<SC_NAME>`)
  - Abbreviation reference highlighting (`{name}`)
- **Real-time diagnostics**
  - Bison:
    - Missing `%%` section separator (Error)
    - Unknown/invalid directive — e.g. `%prout` (Error)
    - Token used in grammar rules but not declared with `%token` (Warning)
    - `%type` declared for a non-terminal that has no rule (Warning)
    - Rule missing `%type` declaration when `api.value.type=variant` is active (Info)
    - Unclosed `%{ %}` code block (Error)
    - Unused grammar rules — not reachable from the start symbol (Warning)
    - Unused tokens — declared with `%token` but never referenced in rules (Warning)
    - Shift/reduce conflict heuristic — same terminal appears in two or more alternatives of a rule (Warning)
  - Flex:
    - Missing `%%` section separator (Error)
    - Unknown/invalid directive — e.g. `%woops` (Error)
    - Undefined start condition used in a rule (`<SC>` not declared with `%x`/`%s`) (Error)
    - Undefined abbreviation referenced in a pattern (`{name}` not in definitions section) (Warning)
    - Start condition declared but never used in any rule (Info)
    - Abbreviation declared but never referenced in any pattern (Info)
    - Unclosed `%{ %}` code block (Error)
    - Inaccessible rule — catch-all pattern before a specific pattern, or duplicate pattern (Warning)
- **Autocompletion**
  - 30+ Bison directives with documentation
  - 20+ Flex `%option` values
  - All `%define` configuration variables
  - Token and non-terminal names from declarations
  - Semantic value references (`$$`, `$1`, `@$`)
  - Start conditions and abbreviation names (Flex)
- **Hover documentation**
  - Every Bison directive with signature, description, and example
  - Every `%define` variable
  - Flex directives, options, and built-in functions
  - Token/non-terminal declaration info
- **Code snippets**
  - 14 Bison snippets (grammar skeleton, rules, directives)
  - 12 Flex snippets (scanner skeleton, RE-flex skeleton, comment/string handlers)
- **Language configuration**
  - Bracket matching, auto-closing pairs, comment toggling, folding
- **File icon theme** (`bison-flex-icons`)
  - Distinct orange "B" icon for Bison files (`.y`, `.yy`, `.ypp`, `.bison`)
  - Distinct blue "F" icon for Flex files (`.l`, `.ll`, `.lex`, `.flex`)
