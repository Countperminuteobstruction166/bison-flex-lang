import { SymbolInformation, SymbolKind } from 'vscode-languageserver';
import { DocumentModel, BisonDocument, FlexDocument, isBisonDocument } from '../parser/types';

/** Return up to 200 symbols from all known documents matching `query`. */
export function getWorkspaceSymbols(
  query: string,
  documentModels: Map<string, DocumentModel>
): SymbolInformation[] {
  const results: SymbolInformation[] = [];
  const q = query.toLowerCase();

  for (const [uri, model] of documentModels) {
    if (isBisonDocument(model)) {
      collectBisonSymbols(model, uri, q, results);
    } else {
      collectFlexSymbols(model as FlexDocument, uri, q, results);
    }
    if (results.length >= 200) break;
  }

  return results.slice(0, 200);
}

function matches(name: string, q: string): boolean {
  if (!q) return true;
  // Fuzzy: every character of the query must appear in order in the name
  const low = name.toLowerCase();
  let qi = 0;
  for (let i = 0; i < low.length && qi < q.length; i++) {
    if (low[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function collectBisonSymbols(
  doc: BisonDocument,
  uri: string,
  q: string,
  results: SymbolInformation[]
): void {
  for (const [, tok] of doc.tokens) {
    if (matches(tok.name, q)) {
      results.push(SymbolInformation.create(
        tok.name,
        SymbolKind.Variable,
        tok.location,
        uri,
        'token',
      ));
    }
  }

  for (const [name, rule] of doc.rules) {
    if (matches(name, q)) {
      const startSymbol = doc.startSymbol ?? [...doc.rules.keys()][0];
      results.push(SymbolInformation.create(
        name,
        SymbolKind.Function,
        rule.location,
        uri,
        name === startSymbol ? 'rule · entry point' : 'rule',
      ));
    }
  }

  // %type declarations without a matching rule definition
  for (const [, nt] of doc.nonTerminals) {
    if (!doc.rules.has(nt.name) && matches(nt.name, q)) {
      results.push(SymbolInformation.create(
        nt.name,
        SymbolKind.TypeParameter,
        nt.location,
        uri,
        '%type',
      ));
    }
  }
}

function collectFlexSymbols(
  doc: FlexDocument,
  uri: string,
  q: string,
  results: SymbolInformation[]
): void {
  for (const [, sc] of doc.startConditions) {
    if (matches(sc.name, q)) {
      results.push(SymbolInformation.create(
        sc.name,
        SymbolKind.Variable,
        sc.location,
        uri,
        sc.exclusive ? '%x (exclusive)' : '%s (inclusive)',
      ));
    }
  }

  for (const [, abbr] of doc.abbreviations) {
    if (matches(abbr.name, q)) {
      results.push(SymbolInformation.create(
        abbr.name,
        SymbolKind.Function,
        abbr.location,
        uri,
        `abbreviation · ${abbr.pattern}`,
      ));
    }
  }
}
