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
  - Bison: undeclared tokens, orphan `%type` declarations, missing `%%`, unclosed blocks
  - Flex: undefined start conditions, undefined abbreviations, missing `%%`, unclosed blocks
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
