import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionParams,
  HoverParams,
  DefinitionParams,
  ReferenceParams,
  RenameParams,
  PrepareRenameParams,
  InlayHintParams,
  FoldingRangeParams,
  CodeActionParams,
  DocumentFormattingParams,
  TextDocuments,
  Diagnostic,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import * as path from 'path';
import { parseBisonDocument } from './parser/bisonParser';
import { parseFlexDocument } from './parser/flexParser';
import { DocumentModel, BisonDocument, FlexDocument, isBisonDocument } from './parser/types';
import { computeBisonDiagnostics, computeFlexDiagnostics } from './providers/diagnostics';
import { getCompletions } from './providers/completion';
import { getHover } from './providers/hover';
import { getDefinition } from './providers/definition';
import { getReferences } from './providers/references';
import { prepareRename, getRename } from './providers/rename';
import { getInlayHints } from './providers/inlayHints';
import {
  computeBisonCrossFileDiagnostics,
  computeFlexCrossFileDiagnostics,
} from './providers/crossFileSync';
import { getCodeActions } from './providers/codeActions';
import { getFoldingRanges } from './providers/foldingRanges';
import { formatBisonDocument } from './providers/formatting';
import { computeFirstSets, computeFollowSets } from './providers/firstFollow';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Cache of parsed documents
const documentModels = new Map<string, DocumentModel>();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ['%', '$', '@', '<', '{'],
        resolveProvider: false,
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      inlayHintProvider: true,
      codeActionProvider: true,
      foldingRangeProvider: true,
      documentFormattingProvider: true,
    },
  };
});

// Revalidate on document change
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

documents.onDidClose((event) => {
  documentModels.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

/** Find the companion file (.y↔.l) in the same directory. */
function findCompanionFile(uri: string, currentLang: 'bison' | 'flex'): { filePath: string; uri: string } | undefined {
  const parsed = URI.parse(uri);
  const dir = path.dirname(parsed.fsPath);
  const baseName = path.basename(parsed.fsPath, path.extname(parsed.fsPath));

  const extensions = currentLang === 'bison'
    ? ['.l', '.ll', '.lex', '.flex']
    : ['.y', '.yy', '.ypp', '.bison'];

  for (const ext of extensions) {
    const candidate = path.join(dir, baseName + ext);
    if (fs.existsSync(candidate)) {
      return { filePath: candidate, uri: URI.file(candidate).toString() };
    }
  }
  return undefined;
}

/** Read companion file text: prefer open document, fall back to filesystem. */
function readCompanionText(companionUri: string, companionPath: string): string | undefined {
  const openDoc = documents.get(companionUri);
  if (openDoc) return openDoc.getText();
  try {
    return fs.readFileSync(companionPath, 'utf-8');
  } catch {
    return undefined;
  }
}

function validateDocument(textDoc: TextDocument): void {
  const text = textDoc.getText();
  const languageId = textDoc.languageId;
  let model: DocumentModel;
  let diagnostics: Diagnostic[];

  if (languageId === 'bison') {
    model = parseBisonDocument(text);
    diagnostics = computeBisonDiagnostics(model as BisonDocument, text);

    // Cross-file: check tokens against companion .l file
    const companion = findCompanionFile(textDoc.uri, 'bison');
    if (companion) {
      const flexText = readCompanionText(companion.uri, companion.filePath);
      if (flexText) {
        diagnostics.push(...computeBisonCrossFileDiagnostics(model as BisonDocument, flexText, companion.uri));
      }
    }
  } else if (languageId === 'flex') {
    model = parseFlexDocument(text);
    diagnostics = computeFlexDiagnostics(model as FlexDocument, text);

    // Cross-file: check returned tokens against companion .y file
    const companion = findCompanionFile(textDoc.uri, 'flex');
    if (companion) {
      const bisonText = readCompanionText(companion.uri, companion.filePath);
      if (bisonText) {
        const bisonDoc = parseBisonDocument(bisonText);
        diagnostics.push(...computeFlexCrossFileDiagnostics(text, bisonDoc, companion.uri));
      }
    }
  } else {
    return;
  }

  documentModels.set(textDoc.uri, model);
  connection.sendDiagnostics({ uri: textDoc.uri, diagnostics });
}

/** Ensure we have a parsed model for the given document. */
function ensureModel(textDoc: TextDocument): DocumentModel | undefined {
  let model = documentModels.get(textDoc.uri);
  if (!model) {
    const text = textDoc.getText();
    if (textDoc.languageId === 'bison') {
      model = parseBisonDocument(text);
    } else if (textDoc.languageId === 'flex') {
      model = parseFlexDocument(text);
    } else {
      return undefined;
    }
    documentModels.set(textDoc.uri, model);
  }
  return model;
}

connection.onCompletion((params: CompletionParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return [];
  const model = ensureModel(textDoc);
  if (!model) return [];
  return getCompletions(model, textDoc, params.position);
});

connection.onHover((params: HoverParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return null;
  const model = ensureModel(textDoc);
  if (!model) return null;
  return getHover(model, textDoc, params.position);
});

connection.onDefinition((params: DefinitionParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return null;
  const model = ensureModel(textDoc);
  if (!model) return null;
  return getDefinition(model, textDoc, params.position);
});

connection.onReferences((params: ReferenceParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return [];
  const model = ensureModel(textDoc);
  if (!model) return [];
  return getReferences(model, textDoc, params.position, params.context.includeDeclaration);
});

connection.onPrepareRename((params: PrepareRenameParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return null;
  const model = ensureModel(textDoc);
  if (!model) return null;
  return prepareRename(model, textDoc, params.position);
});

connection.onRenameRequest((params: RenameParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return null;
  const model = ensureModel(textDoc);
  if (!model) return null;
  return getRename(model, textDoc, params.position, params.newName);
});

connection.languages.inlayHint.on((params: InlayHintParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return [];
  const model = ensureModel(textDoc);
  if (!model) return [];
  return getInlayHints(model, textDoc, params.range);
});

connection.onCodeAction((params: CodeActionParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return [];
  const model = ensureModel(textDoc);
  if (!model) return [];
  return getCodeActions(model, textDoc, params);
});

connection.onFoldingRanges((params: FoldingRangeParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return [];
  return getFoldingRanges(textDoc);
});

// ── Formatting ──────────────────────────────────────────────────────────────
connection.onDocumentFormatting((params: DocumentFormattingParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc || textDoc.languageId !== 'bison') return [];
  return formatBisonDocument(textDoc, params.options);
});

// ── Custom request: Grammar Graph ───────────────────────────────────────────
interface GrammarGraphNode {
  id: string;
  type: 'rule' | 'token';
  line: number;
}
interface GrammarGraphEdge {
  source: string;
  target: string;
}

connection.onRequest('bisonFlex/grammarGraph', (params: { uri: string }) => {
  const textDoc = documents.get(params.uri);
  if (!textDoc) return null;
  const model = ensureModel(textDoc);
  if (!model || !isBisonDocument(model)) return null;

  const nodes: GrammarGraphNode[] = [];
  const edges: GrammarGraphEdge[] = [];
  const nodeIds = new Set<string>();

  // Add rule nodes
  for (const [name, rule] of model.rules) {
    nodes.push({ id: name, type: 'rule', line: rule.location.start.line });
    nodeIds.add(name);
  }

  // Add token nodes (only those referenced in rules)
  for (const [name, tok] of model.tokens) {
    if (model.ruleReferences.has(name)) {
      nodes.push({ id: name, type: 'token', line: tok.location.start.line });
      nodeIds.add(name);
    }
  }

  // Build edges from rule alternatives
  for (const [name, rule] of model.rules) {
    const targetSet = new Set<string>();
    for (const alt of rule.alternatives) {
      for (const sym of alt.symbols) {
        if (sym !== name && nodeIds.has(sym) && !targetSet.has(sym)) {
          targetSet.add(sym);
          edges.push({ source: name, target: sym });
        }
      }
    }
  }

  return { nodes, edges, startSymbol: model.startSymbol ?? [...model.rules.keys()][0] };
});

// ── Custom request: First/Follow sets ───────────────────────────────────────
connection.onRequest('bisonFlex/firstFollowSets', (params: { uri: string }) => {
  const textDoc = documents.get(params.uri);
  if (!textDoc) return null;
  const model = ensureModel(textDoc);
  if (!model || !isBisonDocument(model)) return null;

  const firstSets = computeFirstSets(model);
  const followSets = computeFollowSets(model, firstSets);

  // Convert Set→Array for JSON serialization
  const first: Record<string, string[]> = {};
  const follow: Record<string, string[]> = {};
  for (const [k, v] of firstSets) first[k] = [...v];
  for (const [k, v] of followSets) follow[k] = [...v];

  return { first, follow };
});

documents.listen(connection);
connection.listen();
