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
  TextDocuments,
  Diagnostic,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseBisonDocument } from './parser/bisonParser';
import { parseFlexDocument } from './parser/flexParser';
import { DocumentModel, BisonDocument, FlexDocument } from './parser/types';
import { computeBisonDiagnostics, computeFlexDiagnostics } from './providers/diagnostics';
import { getCompletions } from './providers/completion';
import { getHover } from './providers/hover';
import { getDefinition } from './providers/definition';
import { getReferences } from './providers/references';
import { prepareRename, getRename } from './providers/rename';
import { getInlayHints } from './providers/inlayHints';

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

function validateDocument(textDoc: TextDocument): void {
  const text = textDoc.getText();
  const languageId = textDoc.languageId;
  let model: DocumentModel;
  let diagnostics: Diagnostic[];

  if (languageId === 'bison') {
    model = parseBisonDocument(text);
    diagnostics = computeBisonDiagnostics(model as BisonDocument, text);
  } else if (languageId === 'flex') {
    model = parseFlexDocument(text);
    diagnostics = computeFlexDiagnostics(model as FlexDocument, text);
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

documents.listen(connection);
connection.listen();
