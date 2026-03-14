import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  TextEdit,
  Range,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentModel, BisonDocument, isBisonDocument } from '../parser/types';

/**
 * Provide code actions (quick fixes) for diagnostics.
 *
 * Currently handles:
 * - "Token 'X' is used but not declared with %token" → insert %token X
 */
export function getCodeActions(
  model: DocumentModel,
  textDoc: TextDocument,
  params: CodeActionParams,
): CodeAction[] {
  if (!isBisonDocument(model)) return [];

  const bisonDoc = model as BisonDocument;
  const actions: CodeAction[] = [];

  for (const diag of params.context.diagnostics) {
    // Match the undeclared token diagnostic
    const tokenMatch = diag.message.match(/^Token '([A-Z_][A-Z0-9_]+)' is used but not declared with %token\.$/);
    if (!tokenMatch) continue;

    const tokenName = tokenMatch[1];

    // Find insertion point: last line before first %%
    const insertionLine = bisonDoc.separators.length > 0 ? bisonDoc.separators[0] : 0;

    const action: CodeAction = {
      title: `Declare token '%token ${tokenName}'`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diag],
      isPreferred: true,
      edit: {
        changes: {
          [params.textDocument.uri]: [
            TextEdit.insert(
              Range.create(insertionLine, 0, insertionLine, 0).start,
              `%token ${tokenName}\n`
            ),
          ],
        },
      },
    };

    actions.push(action);
  }

  return actions;
}
