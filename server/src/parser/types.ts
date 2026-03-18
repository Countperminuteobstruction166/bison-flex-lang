import { Range } from 'vscode-languageserver';

export interface UnknownDirective {
  name: string;       // e.g. "%prout"
  location: Range;
}

export interface TokenDeclaration {
  name: string;
  type?: string;       // e.g., "int", "std::string"
  alias?: string;      // e.g., "integer", "+"
  location: Range;
  value?: number;
}

export interface NonTerminalDeclaration {
  name: string;
  type?: string;
  location: Range;
}

export interface DefineDeclaration {
  variable: string;
  value: string;
  location: Range;
}

export interface PrecedenceDeclaration {
  kind: 'left' | 'right' | 'nonassoc' | 'precedence';
  symbols: string[];
  symbolRanges: Range[];  // per-symbol ranges for rename/references support
  location: Range;
}

export interface CodeBlock {
  qualifier?: string;  // "requires", "provides", "top"
  range: Range;
}

/** A $n reference found inside an inline action block. */
export interface DollarRef {
  n: number;    // the index used (e.g., 3 for $3)
  range: Range;
}

export interface RuleAlternative {
  range: Range;
  firstSymbol?: string;  // first terminal/non-terminal of this production (for conflict detection)
  symbols: string[];     // ordered list of all grammar symbols in this production
  dollarRefs?: DollarRef[];       // $n references found in the inline action of this alternative
  hasExplicitEmpty?: boolean;     // true when %empty was written explicitly in the RHS
  hasPrec?: boolean;              // true when %prec TOKEN is present in the RHS
  precToken?: string;             // the symbol name following %prec, if any
}

export interface RuleDefinition {
  name: string;
  location: Range;
  alternatives: RuleAlternative[];
}

export interface BisonDocument {
  tokens: Map<string, TokenDeclaration>;
  nonTerminals: Map<string, NonTerminalDeclaration>;
  defines: Map<string, DefineDeclaration>;
  precedence: PrecedenceDeclaration[];
  codeBlocks: CodeBlock[];
  rules: Map<string, RuleDefinition>;
  separators: number[];  // line numbers of %%
  startSymbol?: string;
  startSymbolLocation?: Range;   // location of the symbol name in %start
  ruleReferences: Map<string, Range[]>;  // symbol name -> locations used in rules RHS
  unknownDirectives: UnknownDirective[];
  duplicateRules: Array<{ name: string; location: Range }>;  // rules defined more than once
}

export interface FlexOption {
  name: string;
  value?: string;
  location: Range;
}

export interface StartCondition {
  name: string;
  exclusive: boolean;
  location: Range;
}

export interface Abbreviation {
  name: string;
  pattern: string;
  location: Range;
}

export interface FlexRule {
  pattern: string;
  startConditions: string[];
  location: Range;
}

export interface FlexDocument {
  options: Map<string, FlexOption>;
  startConditions: Map<string, StartCondition>;
  abbreviations: Map<string, Abbreviation>;
  codeBlocks: CodeBlock[];
  rules: FlexRule[];
  separators: number[];
  startConditionRefs: Map<string, Range[]>;  // SC name -> locations used in rules
  abbreviationRefs: Map<string, Range[]>;    // abbrev name -> locations used in rules
  unknownDirectives: UnknownDirective[];
}

export type DocumentModel = BisonDocument | FlexDocument;

export function isBisonDocument(doc: DocumentModel): doc is BisonDocument {
  return 'tokens' in doc;
}

export function isFlexDocument(doc: DocumentModel): doc is FlexDocument {
  return 'options' in doc;
}
