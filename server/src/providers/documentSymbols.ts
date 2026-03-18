import { DocumentSymbol, SymbolKind, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentModel, BisonDocument, FlexDocument, isBisonDocument } from '../parser/types';

export function getDocumentSymbols(
  doc: DocumentModel,
  textDoc: TextDocument
): DocumentSymbol[] {
  if (isBisonDocument(doc)) {
    return getBisonDocumentSymbols(doc, textDoc);
  }
  return getFlexDocumentSymbols(doc as FlexDocument, textDoc);
}

// ── Bison ────────────────────────────────────────────────────────────────────

function getBisonDocumentSymbols(doc: BisonDocument, textDoc: TextDocument): DocumentSymbol[] {
  const lines = textDoc.getText().split(/\r?\n/);
  const lastLine = Math.max(0, lines.length - 1);
  const endOf = (ln: number) => Range.create(ln, 0, ln, lines[ln]?.length ?? 0);

  const sep0 = doc.separators[0] ?? lastLine;
  const sep1 = doc.separators[1] ?? lastLine;

  const symbols: DocumentSymbol[] = [];

  // ── Declarations ────────────────────────────────────────────────────────
  {
    const declChildren: DocumentSymbol[] = [];

    for (const [, tok] of doc.tokens) {
      declChildren.push(DocumentSymbol.create(
        tok.name,
        tok.type ? `<${tok.type}>` : undefined,
        SymbolKind.Variable,
        tok.location,
        tok.location,
      ));
    }

    for (const [, nt] of doc.nonTerminals) {
      declChildren.push(DocumentSymbol.create(
        nt.name,
        nt.type ? `<${nt.type}>` : undefined,
        SymbolKind.TypeParameter,
        nt.location,
        nt.location,
      ));
    }

    const declRange = Range.create(0, 0, Math.min(sep0, lastLine), lines[Math.min(sep0, lastLine)]?.length ?? 0);
    symbols.push({
      name: 'Declarations',
      kind: SymbolKind.Module,
      range: declRange,
      selectionRange: endOf(0),
      children: declChildren,
    });
  }

  // ── Rules ────────────────────────────────────────────────────────────────
  if (doc.separators.length > 0) {
    const rulesEnd = Math.min(doc.separators.length >= 2 ? sep1 : lastLine, lastLine);
    const rulesRange = Range.create(sep0, 0, rulesEnd, lines[rulesEnd]?.length ?? 0);
    const ruleChildren: DocumentSymbol[] = [];

    const startSymbol = doc.startSymbol ?? [...doc.rules.keys()][0];
    for (const [name, rule] of doc.rules) {
      const isEntry = name === startSymbol;
      const altCount = rule.alternatives.length;
      ruleChildren.push(DocumentSymbol.create(
        name,
        isEntry
          ? `⬤ entry point · ${altCount} alt${altCount !== 1 ? 's' : ''}`
          : `${altCount} alt${altCount !== 1 ? 's' : ''}`,
        SymbolKind.Function,
        rule.location,
        rule.location,
      ));
    }

    symbols.push({
      name: 'Rules',
      kind: SymbolKind.Module,
      range: rulesRange,
      selectionRange: endOf(sep0),
      children: ruleChildren,
    });
  }

  // ── Epilogue ─────────────────────────────────────────────────────────────
  if (doc.separators.length >= 2 && sep1 < lastLine) {
    symbols.push({
      name: 'Epilogue',
      kind: SymbolKind.Module,
      range: Range.create(sep1, 0, lastLine, lines[lastLine]?.length ?? 0),
      selectionRange: endOf(sep1),
      children: [],
    });
  }

  return symbols;
}

// ── Flex ─────────────────────────────────────────────────────────────────────

function getFlexDocumentSymbols(doc: FlexDocument, textDoc: TextDocument): DocumentSymbol[] {
  const lines = textDoc.getText().split(/\r?\n/);
  const lastLine = Math.max(0, lines.length - 1);
  const endOf = (ln: number) => Range.create(ln, 0, ln, lines[ln]?.length ?? 0);

  const sep0 = doc.separators[0] ?? lastLine;
  const sep1 = doc.separators[1] ?? lastLine;

  const symbols: DocumentSymbol[] = [];

  // ── Definitions ──────────────────────────────────────────────────────────
  {
    const defChildren: DocumentSymbol[] = [];

    for (const [, sc] of doc.startConditions) {
      defChildren.push(DocumentSymbol.create(
        sc.name,
        sc.exclusive ? 'exclusive (%x)' : 'inclusive (%s)',
        SymbolKind.Variable,
        sc.location,
        sc.location,
      ));
    }

    for (const [, abbr] of doc.abbreviations) {
      defChildren.push(DocumentSymbol.create(
        abbr.name,
        abbr.pattern,
        SymbolKind.Function,
        abbr.location,
        abbr.location,
      ));
    }

    const defRange = Range.create(0, 0, Math.min(sep0, lastLine), lines[Math.min(sep0, lastLine)]?.length ?? 0);
    symbols.push({
      name: 'Definitions',
      kind: SymbolKind.Module,
      range: defRange,
      selectionRange: endOf(0),
      children: defChildren,
    });
  }

  // ── Rules ────────────────────────────────────────────────────────────────
  if (doc.separators.length > 0) {
    const rulesEnd = Math.min(doc.separators.length >= 2 ? sep1 : lastLine, lastLine);
    symbols.push({
      name: 'Rules',
      kind: SymbolKind.Module,
      range: Range.create(sep0, 0, rulesEnd, lines[rulesEnd]?.length ?? 0),
      selectionRange: endOf(sep0),
      children: [],
    });
  }

  // ── User Code ────────────────────────────────────────────────────────────
  if (doc.separators.length >= 2 && sep1 < lastLine) {
    symbols.push({
      name: 'User Code',
      kind: SymbolKind.Module,
      range: Range.create(sep1, 0, lastLine, lines[lastLine]?.length ?? 0),
      selectionRange: endOf(sep1),
      children: [],
    });
  }

  return symbols;
}
