import * as path from 'path';
import * as cp from 'child_process';
import {
  ExtensionContext,
  workspace,
  window,
  commands,
  languages,
  Diagnostic as VDiagnostic,
  DiagnosticSeverity as VDiagnosticSeverity,
  Range as VRange,
  Uri,
  DiagnosticCollection,
  ViewColumn,
  WebviewPanel,
  StatusBarItem,
  StatusBarAlignment,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;
let compilerDiagnostics: DiagnosticCollection;

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(
    path.join('dist', 'server', 'server.js')
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'bison' },
      { scheme: 'file', language: 'flex' },
    ],
    synchronize: {
      configurationSection: 'bisonFlex',
      fileEvents: workspace.createFileSystemWatcher('**/*.{y,yy,l,ll}'),
    },
  };

  client = new LanguageClient(
    'bisonFlexLanguageServer',
    'Bison & Flex Language Server',
    serverOptions,
    clientOptions
  );

  client.start();

  // Diagnostic collection for compiler output
  compilerDiagnostics = languages.createDiagnosticCollection('bisonFlexCompiler');
  context.subscriptions.push(compilerDiagnostics);

  // ── Command: Bison: Compile ──────────────────────────────────────────────
  context.subscriptions.push(
    commands.registerCommand('bisonFlex.compileBison', () => {
      const editor = window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'bison') {
        window.showWarningMessage('Open a Bison file (.y, .yy) to compile.');
        return;
      }
      editor.document.save().then(() => {
        const filePath = editor.document.uri.fsPath;
        const config = workspace.getConfiguration('bisonFlex');
        const bisonPath = config.get<string>('bisonPath', 'bison');
        const cwd = path.dirname(filePath);

        compilerDiagnostics.clear();
        const outputChannel = window.createOutputChannel('Bison Compile');
        outputChannel.show(true);
        outputChannel.appendLine(`Running: ${bisonPath} -d "${path.basename(filePath)}"`);

        cp.exec(
          `"${bisonPath}" -d "${path.basename(filePath)}"`,
          { cwd },
          (error, stdout, stderr) => {
            const output = stderr || stdout || '';
            outputChannel.appendLine(output);

            if (!error) {
              outputChannel.appendLine('Compilation successful.');
              window.showInformationMessage('Bison compilation successful.');
            } else {
              outputChannel.appendLine(`Exit code: ${error.code}`);
            }

            // Parse diagnostics from output
            const diags = parseCompilerOutput(output, cwd);
            for (const [uri, fileDiags] of diags) {
              compilerDiagnostics.set(uri, fileDiags);
            }
          }
        );
      });
    })
  );

  // ── Command: Flex: Compile ───────────────────────────────────────────────
  context.subscriptions.push(
    commands.registerCommand('bisonFlex.compileFlex', () => {
      const editor = window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'flex') {
        window.showWarningMessage('Open a Flex file (.l, .ll) to compile.');
        return;
      }
      editor.document.save().then(() => {
        const filePath = editor.document.uri.fsPath;
        const config = workspace.getConfiguration('bisonFlex');
        const flexPath = config.get<string>('flexPath', 'flex');
        const cwd = path.dirname(filePath);

        compilerDiagnostics.clear();
        const outputChannel = window.createOutputChannel('Flex Compile');
        outputChannel.show(true);
        outputChannel.appendLine(`Running: ${flexPath} "${path.basename(filePath)}"`);

        cp.exec(
          `"${flexPath}" "${path.basename(filePath)}"`,
          { cwd },
          (error, stdout, stderr) => {
            const output = stderr || stdout || '';
            outputChannel.appendLine(output);

            if (!error) {
              outputChannel.appendLine('Compilation successful.');
              window.showInformationMessage('Flex compilation successful.');
            } else {
              outputChannel.appendLine(`Exit code: ${error.code}`);
            }

            const diags = parseCompilerOutput(output, cwd);
            for (const [uri, fileDiags] of diags) {
              compilerDiagnostics.set(uri, fileDiags);
            }
          }
        );
      });
    })
  );

  // ── Command: Bison: Show Parse Table ─────────────────────────────────────
  let parseTablePanel: WebviewPanel | undefined;

  context.subscriptions.push(
    commands.registerCommand('bisonFlex.showParseTable', () => {
      const editor = window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'bison') {
        window.showWarningMessage('Open a Bison file (.y, .yy) to show parse table.');
        return;
      }
      editor.document.save().then(() => {
        const filePath = editor.document.uri.fsPath;
        const config = workspace.getConfiguration('bisonFlex');
        const bisonPath = config.get<string>('bisonPath', 'bison');
        const cwd = path.dirname(filePath);
        const baseName = path.basename(filePath, path.extname(filePath));
        const outputFile = path.join(cwd, baseName + '.output');

        window.withProgress(
          { location: { viewId: 'explorer' }, title: 'Generating parse table...' },
          () => new Promise<void>((resolve) => {
            cp.exec(
              `"${bisonPath}" -v "${path.basename(filePath)}"`,
              { cwd },
              (error, _stdout, stderr) => {
                if (error && !require('fs').existsSync(outputFile)) {
                  window.showErrorMessage(`Bison failed: ${stderr || error.message}`);
                  resolve();
                  return;
                }

                let content: string;
                try {
                  content = require('fs').readFileSync(outputFile, 'utf-8');
                } catch {
                  window.showErrorMessage(`Cannot read ${outputFile}`);
                  resolve();
                  return;
                }

                if (parseTablePanel) {
                  parseTablePanel.reveal(ViewColumn.Beside);
                } else {
                  parseTablePanel = window.createWebviewPanel(
                    'bisonParseTable',
                    `Parse Table — ${baseName}`,
                    ViewColumn.Beside,
                    { enableScripts: false }
                  );
                  parseTablePanel.onDidDispose(() => { parseTablePanel = undefined; });
                }

                parseTablePanel.title = `Parse Table — ${baseName}`;
                parseTablePanel.webview.html = renderParseTableHtml(content, baseName);
                resolve();
              }
            );
          })
        );
      });
    })
  );

  // ── Command: Bison: Show Grammar Graph ───────────────────────────────────
  let grammarGraphPanel: WebviewPanel | undefined;

  context.subscriptions.push(
    commands.registerCommand('bisonFlex.showGrammarGraph', async () => {
      const editor = window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'bison') {
        window.showWarningMessage('Open a Bison file (.y, .yy) to show grammar graph.');
        return;
      }

      const uri = editor.document.uri.toString();

      const result = await client.sendRequest('bisonFlex/grammarGraph', { uri });
      if (!result) {
        window.showErrorMessage('Could not build grammar graph. Ensure the file has valid Bison content.');
        return;
      }

      const graphData = result as {
        nodes: { id: string; type: string; line: number }[];
        edges: { source: string; target: string }[];
        startSymbol: string;
      };

      if (grammarGraphPanel) {
        grammarGraphPanel.reveal(ViewColumn.Beside);
      } else {
        grammarGraphPanel = window.createWebviewPanel(
          'bisonGrammarGraph',
          'Grammar Graph',
          ViewColumn.Beside,
          { enableScripts: true }
        );
        grammarGraphPanel.onDidDispose(() => { grammarGraphPanel = undefined; });
      }

      grammarGraphPanel.webview.html = renderGrammarGraphHtml(graphData);

      // Handle click messages from WebView → navigate to rule
      grammarGraphPanel.webview.onDidReceiveMessage((msg: { command: string; line: number }) => {
        if (msg.command === 'navigateToRule') {
          const targetLine = msg.line;
          const doc = editor.document;
          const pos = new (require('vscode')).Position(targetLine, 0);
          const range = new (require('vscode')).Range(pos, pos);
          window.showTextDocument(doc, { selection: range, viewColumn: ViewColumn.One });
        }
      });
    })
  );

  // ── Status Bar: Show Grammar Graph button ─────────────────────────────────
  const graphStatusBar: StatusBarItem = window.createStatusBarItem(
    StatusBarAlignment.Right,
    100
  );
  graphStatusBar.command = 'bisonFlex.showGrammarGraph';
  graphStatusBar.text = '$(type-hierarchy) Grammar Graph';
  graphStatusBar.tooltip = 'Bison: Show Grammar Graph';
  context.subscriptions.push(graphStatusBar);

  function updateGraphStatusBar(): void {
    const editor = window.activeTextEditor;
    if (editor && editor.document.languageId === 'bison') {
      graphStatusBar.show();
    } else {
      graphStatusBar.hide();
    }
  }

  context.subscriptions.push(window.onDidChangeActiveTextEditor(updateGraphStatusBar));
  updateGraphStatusBar();
}

/** Render the grammar graph WebView with D3.js */
function renderGrammarGraphHtml(data: {
  nodes: { id: string; type: string; line: number }[];
  edges: { source: string; target: string }[];
  startSymbol: string;
}): string {
  const graphJSON = JSON.stringify(data);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Grammar Graph</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }
    svg { width: 100%; height: 100%; }
    .link {
      stroke: var(--vscode-editorWidget-border, #454545);
      stroke-opacity: 0.6;
      fill: none;
      marker-end: url(#arrowhead);
    }
    .link:hover { stroke-opacity: 1; stroke-width: 2.5; }
    .node circle {
      stroke-width: 2;
      cursor: pointer;
      transition: r 0.15s;
    }
    .node circle:hover { r: 12; }
    .node text {
      font-size: 11px;
      fill: var(--vscode-editor-foreground, #d4d4d4);
      pointer-events: none;
      text-anchor: middle;
      dominant-baseline: central;
    }
    .node.rule circle {
      fill: var(--vscode-charts-blue, #569cd6);
      stroke: var(--vscode-charts-blue, #3794ff);
    }
    .node.token circle {
      fill: var(--vscode-charts-orange, #ce9178);
      stroke: var(--vscode-charts-orange, #d7ba7d);
    }
    .node.start circle {
      fill: var(--vscode-charts-green, #4ec9b0);
      stroke: var(--vscode-charts-green, #6a9955);
      r: 12;
    }
    .legend {
      position: fixed;
      top: 10px;
      right: 10px;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 4px;
      padding: 8px 12px;
      font-size: 12px;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    #tooltip {
      position: fixed;
      display: none;
      background: var(--vscode-editorHoverWidget-background, #2d2d30);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      color: var(--vscode-editorHoverWidget-foreground, #d4d4d4);
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 12px;
      pointer-events: none;
      z-index: 100;
    }
  </style>
</head>
<body>
  <div id="tooltip"></div>
  <div class="legend">
    <div class="legend-item"><span class="legend-dot" style="background:#4ec9b0"></span> Start symbol</div>
    <div class="legend-item"><span class="legend-dot" style="background:#569cd6"></span> Non-terminal (rule)</div>
    <div class="legend-item"><span class="legend-dot" style="background:#ce9178"></span> Terminal (token)</div>
  </div>
  <svg></svg>

  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script>
    const vscode = acquireVsCodeApi();
    const data = ${graphJSON};
    const tooltip = document.getElementById('tooltip');

    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select('svg')
      .attr('viewBox', [0, 0, width, height]);

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'var(--vscode-editorWidget-border, #454545)');

    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.edges).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    const link = svg.append('g')
      .selectAll('line')
      .data(data.edges)
      .join('line')
      .attr('class', 'link')
      .attr('stroke-width', 1.5);

    const node = svg.append('g')
      .selectAll('g')
      .data(data.nodes)
      .join('g')
      .attr('class', d => 'node ' + (d.id === data.startSymbol ? 'start' : d.type))
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    node.append('circle')
      .attr('r', d => d.id === data.startSymbol ? 12 : 8)
      .on('click', (event, d) => {
        vscode.postMessage({ command: 'navigateToRule', line: d.line });
      })
      .on('mouseover', (event, d) => {
        tooltip.style.display = 'block';
        tooltip.textContent = d.id + ' (line ' + (d.line + 1) + ')';
      })
      .on('mousemove', (event) => {
        tooltip.style.left = (event.clientX + 12) + 'px';
        tooltip.style.top = (event.clientY - 10) + 'px';
      })
      .on('mouseout', () => {
        tooltip.style.display = 'none';
      });

    node.append('text')
      .text(d => d.id.length > 12 ? d.id.slice(0, 10) + '…' : d.id)
      .attr('dy', -14);

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    });

    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        svg.selectAll('g').attr('transform', event.transform);
      });
    svg.call(zoom);
  </script>
</body>
</html>`;
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

/**
 * Parse compiler output (bison/flex) into VS Code diagnostics.
 * Supports formats:
 *   file:line.col: error: message
 *   file:line.col-col: warning: message
 *   file:line: error: message
 *   "file", line N: message
 */
function parseCompilerOutput(output: string, cwd: string): Map<Uri, VDiagnostic[]> {
  const result = new Map<Uri, VDiagnostic[]>();
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    // Bison format: file:line.col[-line.col]: severity: message
    let m = line.match(/^(.+?):(\d+)(?:\.(\d+))?(?:-(\d+)(?:\.(\d+))?)?:\s*(error|warning|note):\s*(.+)/);
    if (m) {
      const file = path.isAbsolute(m[1]) ? m[1] : path.join(cwd, m[1]);
      const lineNum = Math.max(0, parseInt(m[2]) - 1);
      const colStart = m[3] ? Math.max(0, parseInt(m[3]) - 1) : 0;
      const lineEnd = m[4] ? Math.max(0, parseInt(m[4]) - 1) : lineNum;
      const colEnd = m[5] ? parseInt(m[5]) : colStart + 1;
      const severity = m[6] === 'error' ? VDiagnosticSeverity.Error
        : m[6] === 'warning' ? VDiagnosticSeverity.Warning
        : VDiagnosticSeverity.Information;
      const message = m[7];

      const uri = Uri.file(file);
      const diag = new VDiagnostic(
        new VRange(lineNum, colStart, lineEnd, colEnd),
        message,
        severity
      );
      diag.source = 'bison/flex compiler';

      if (!result.has(uri)) result.set(uri, []);
      result.get(uri)!.push(diag);
      continue;
    }

    // Flex format: "file", line N: message
    m = line.match(/^"(.+?)",\s*line\s+(\d+):\s*(.+)/);
    if (m) {
      const file = path.isAbsolute(m[1]) ? m[1] : path.join(cwd, m[1]);
      const lineNum = Math.max(0, parseInt(m[2]) - 1);
      const message = m[3];
      const severity = /error/i.test(message) ? VDiagnosticSeverity.Error : VDiagnosticSeverity.Warning;

      const uri = Uri.file(file);
      const diag = new VDiagnostic(
        new VRange(lineNum, 0, lineNum, 1000),
        message,
        severity
      );
      diag.source = 'bison/flex compiler';

      if (!result.has(uri)) result.set(uri, []);
      result.get(uri)!.push(diag);
    }
  }

  return result;
}

/** Render the .output file content in a syntax-highlighted WebView. */
function renderParseTableHtml(content: string, baseName: string): string {
  // Escape HTML
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Colorize known patterns
  const colorized = esc(content)
    .split('\n')
    .map(line => {
      // State headers: "State N"
      if (/^State\s+\d+/.test(line)) {
        return `<span class="state-header">${line}</span>`;
      }
      // Conflict lines
      if (/conflict/.test(line)) {
        return `<span class="conflict">${line}</span>`;
      }
      // Rule lines (numbered): "  N rule: ..."
      if (/^\s+\d+\s+\S+:/.test(line)) {
        return `<span class="rule">${line}</span>`;
      }
      // Shift/reduce/goto actions
      if (/\b(shift|reduce|go to|accept)\b/.test(line)) {
        return line
          .replace(/\b(shift)\b/g, '<span class="shift">$1</span>')
          .replace(/\b(reduce)\b/g, '<span class="reduce">$1</span>')
          .replace(/\b(go to)\b/g, '<span class="goto">$1</span>')
          .replace(/\b(accept)\b/g, '<span class="accept">$1</span>');
      }
      // Section headers
      if (/^(Grammar|Terminals|Nonterminals|rules? useless|Automaton)/.test(line)) {
        return `<span class="section-header">${line}</span>`;
      }
      return line;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parse Table — ${esc(baseName)}</title>
  <style>
    body {
      font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      white-space: pre;
      line-height: 1.5;
    }
    .state-header {
      color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
      font-weight: bold;
    }
    .section-header {
      color: var(--vscode-symbolIcon-namespaceForeground, #dcdcaa);
      font-weight: bold;
      font-size: 1.1em;
    }
    .rule {
      color: var(--vscode-symbolIcon-functionForeground, #569cd6);
    }
    .conflict {
      color: var(--vscode-editorWarning-foreground, #ff9900);
      font-weight: bold;
    }
    .shift { color: var(--vscode-charts-green, #4ec9b0); }
    .reduce { color: var(--vscode-charts-blue, #569cd6); }
    .goto { color: var(--vscode-charts-purple, #c586c0); }
    .accept { color: var(--vscode-charts-green, #6a9955); font-weight: bold; }
  </style>
</head>
<body>${colorized}</body>
</html>`;
}
