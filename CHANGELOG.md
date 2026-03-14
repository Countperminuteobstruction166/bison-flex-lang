# Changelog

All notable changes to the **Bison/Flex Language Support** extension will be documented in this file.

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
