import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
  TextDocument,
} from 'vscode-languageserver';
import { BisonDocument, FlexDocument, DocumentModel, isBisonDocument } from '../parser/types';
import {
  bisonDirectiveDocs,
  bisonDefineDocs,
  flexDirectiveDocs,
  flexOptionDocs,
  bisonSemanticDocs,
} from './documentation';

export function getCompletions(
  doc: DocumentModel,
  textDoc: TextDocument,
  position: Position
): CompletionItem[] {
  const text = textDoc.getText();
  const offset = textDoc.offsetAt(position);
  const lineText = text.split(/\r?\n/)[position.line] || '';
  const linePrefix = lineText.substring(0, position.character);

  if (isBisonDocument(doc)) {
    return getBisonCompletions(doc, linePrefix, position, text);
  } else {
    return getFlexCompletions(doc, linePrefix, position, text);
  }
}

function getBisonCompletions(
  doc: BisonDocument,
  linePrefix: string,
  position: Position,
  _text: string
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // 1. Directive completions (after %)
  if (linePrefix.match(/%\w*$/) && !linePrefix.match(/%%.*/)) {
    for (const [name, entry] of bisonDirectiveDocs) {
      const label = name;
      items.push({
        label,
        kind: CompletionItemKind.Keyword,
        detail: entry.signature,
        documentation: { kind: 'markdown', value: entry.description + (entry.example ? `\n\n\`\`\`bison\n${entry.example}\n\`\`\`` : '') },
        insertText: label.substring(1), // remove the % since user already typed it
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: '0' + label,
      });
    }
    return items;
  }

  // 2. %define variable completions
  if (linePrefix.match(/%define\s+\S*$/)) {
    for (const [variable, entry] of bisonDefineDocs) {
      items.push({
        label: variable,
        kind: CompletionItemKind.Variable,
        detail: entry.signature,
        documentation: { kind: 'markdown', value: entry.description + (entry.example ? `\n\n\`\`\`bison\n${entry.example}\n\`\`\`` : '') },
        sortText: '0' + variable,
      });
    }
    return items;
  }

  // 3. Semantic value completions (after $ or @)
  if (linePrefix.match(/\$\w*$/)) {
    items.push({
      label: '$$',
      kind: CompletionItemKind.Variable,
      detail: 'Result value of the current rule',
      documentation: bisonSemanticDocs.get('$$')?.description,
      insertText: '$',
      sortText: '0$$',
    });
    for (let i = 1; i <= 9; i++) {
      items.push({
        label: `$${i}`,
        kind: CompletionItemKind.Variable,
        detail: `Value of RHS symbol #${i}`,
        insertText: `${i}`,
        sortText: `1$${i}`,
      });
    }
    return items;
  }

  if (linePrefix.match(/@\w*$/)) {
    items.push({
      label: '@$',
      kind: CompletionItemKind.Variable,
      detail: 'Location of the current rule',
      insertText: '$',
      sortText: '0@$',
    });
    for (let i = 1; i <= 9; i++) {
      items.push({
        label: `@${i}`,
        kind: CompletionItemKind.Variable,
        detail: `Location of RHS symbol #${i}`,
        insertText: `${i}`,
        sortText: `1@${i}`,
      });
    }
    return items;
  }

  // 4. Token and non-terminal name completions in rules section
  const isInRulesSection = doc.separators.length > 0 && position.line > doc.separators[0];
  if (isInRulesSection) {
    // Offer token names
    for (const [name, decl] of doc.tokens) {
      items.push({
        label: name,
        kind: CompletionItemKind.Constant,
        detail: `Token${decl.type ? ` <${decl.type}>` : ''}${decl.alias ? ` "${decl.alias}"` : ''}`,
        sortText: '2' + name,
      });
    }
    // Offer non-terminal names
    for (const [name, decl] of doc.nonTerminals) {
      items.push({
        label: name,
        kind: CompletionItemKind.Function,
        detail: `Non-terminal${decl.type ? ` <${decl.type}>` : ''}`,
        sortText: '3' + name,
      });
    }
    // Offer rule names (LHS)
    for (const [name] of doc.rules) {
      if (!doc.nonTerminals.has(name)) {
        items.push({
          label: name,
          kind: CompletionItemKind.Function,
          detail: 'Rule',
          sortText: '3' + name,
        });
      }
    }
  }

  // 5. Snippets (always available)
  items.push({
    label: 'rule',
    kind: CompletionItemKind.Snippet,
    detail: 'Rule template',
    insertText: '${1:name}:\n  ${2:production} { ${3:action} }\n;',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9rule',
  });
  items.push({
    label: '%code requires',
    kind: CompletionItemKind.Snippet,
    detail: '%code requires block',
    insertText: '%code requires\n{\n  ${1}\n}',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9code-req',
  });
  items.push({
    label: '%token declaration',
    kind: CompletionItemKind.Snippet,
    detail: '%token with type and alias',
    insertText: '%token <${1:type}> ${2:NAME} "${3:alias}"',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9token',
  });

  return items;
}

function getFlexCompletions(
  doc: FlexDocument,
  linePrefix: string,
  position: Position,
  _text: string
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // 1. Directive completions (after %)
  if (linePrefix.match(/%\w*$/) && !linePrefix.match(/%%.*/)) {
    for (const [name, entry] of flexDirectiveDocs) {
      items.push({
        label: name,
        kind: CompletionItemKind.Keyword,
        detail: entry.signature,
        documentation: { kind: 'markdown', value: entry.description + (entry.example ? `\n\n\`\`\`flex\n${entry.example}\n\`\`\`` : '') },
        insertText: name.substring(1),
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: '0' + name,
      });
    }
    return items;
  }

  // 2. %option value completions
  if (linePrefix.match(/%option\s+\S*$/)) {
    for (const [name, entry] of flexOptionDocs) {
      items.push({
        label: name,
        kind: CompletionItemKind.Property,
        detail: entry.signature,
        documentation: { kind: 'markdown', value: entry.description },
        sortText: '0' + name,
      });
    }
    return items;
  }

  // 3. Start condition completions (after <)
  if (linePrefix.match(/<[A-Z_]*$/)) {
    for (const [name, sc] of doc.startConditions) {
      items.push({
        label: name,
        kind: CompletionItemKind.Enum,
        detail: `${sc.exclusive ? 'Exclusive' : 'Inclusive'} start condition`,
        sortText: '0' + name,
      });
    }
    items.push({
      label: 'INITIAL',
      kind: CompletionItemKind.Enum,
      detail: 'Default start condition',
      sortText: '0INITIAL',
    });
    return items;
  }

  // 4. Abbreviation completions (after {)
  if (linePrefix.match(/\{[a-zA-Z_]*$/)) {
    for (const [name, abbr] of doc.abbreviations) {
      items.push({
        label: name,
        kind: CompletionItemKind.Variable,
        detail: `Abbreviation: ${abbr.pattern}`,
        insertText: name + '}',
        sortText: '0' + name,
      });
    }
    return items;
  }

  // 5. Snippets
  items.push({
    label: 'rule with start condition',
    kind: CompletionItemKind.Snippet,
    detail: 'Flex rule with start condition',
    insertText: '<${1:CONDITION}>${2:pattern}  {\n  ${3:action}\n}',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9rule-sc',
  });
  items.push({
    label: '%option block',
    kind: CompletionItemKind.Snippet,
    detail: 'Common option directives',
    insertText: '%option noyywrap\n%option nounput\n%option noinput',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9options',
  });
  items.push({
    label: '%top block',
    kind: CompletionItemKind.Snippet,
    detail: '%top code block',
    insertText: '%top{\n  ${1}\n}',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '9top',
  });

  return items;
}
