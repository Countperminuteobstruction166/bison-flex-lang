import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionParams,
  HoverParams,
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

connection.onCompletion((params: CompletionParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return [];

  let model = documentModels.get(textDoc.uri);
  if (!model) {
    const text = textDoc.getText();
    if (textDoc.languageId === 'bison') {
      model = parseBisonDocument(text);
    } else if (textDoc.languageId === 'flex') {
      model = parseFlexDocument(text);
    } else {
      return [];
    }
    documentModels.set(textDoc.uri, model);
  }

  return getCompletions(model, textDoc, params.position);
});

connection.onHover((params: HoverParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return null;

  let model = documentModels.get(textDoc.uri);
  if (!model) {
    const text = textDoc.getText();
    if (textDoc.languageId === 'bison') {
      model = parseBisonDocument(text);
    } else if (textDoc.languageId === 'flex') {
      model = parseFlexDocument(text);
    } else {
      return null;
    }
    documentModels.set(textDoc.uri, model);
  }

  return getHover(model, textDoc, params.position);
});

documents.listen(connection);
connection.listen();
