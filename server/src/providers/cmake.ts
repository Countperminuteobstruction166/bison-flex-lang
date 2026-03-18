import * as fs from 'fs';
import * as path from 'path';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { URI } from 'vscode-uri';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CmakeAnalysis {
  hasCmake: boolean;
  cmakePath?: string;
  /** True when the file appears in a BISON_TARGET / FLEX_TARGET call. */
  isReferenced: boolean;
  bisonTargetNames: string[];
  flexTargetNames: string[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Walk up the directory tree (up to 6 levels) looking for CMakeLists.txt,
 * then check whether `fileUri`'s basename appears in a BISON_TARGET / FLEX_TARGET.
 */
export function analyzeCmake(fileUri: string): CmakeAnalysis {
  const filePath = URI.parse(fileUri).fsPath;
  const fileName = path.basename(filePath);
  let dir = path.dirname(filePath);

  for (let depth = 0; depth < 6; depth++) {
    const cmakePath = path.join(dir, 'CMakeLists.txt');
    if (fs.existsSync(cmakePath)) {
      try {
        const content = fs.readFileSync(cmakePath, 'utf-8');
        const inner = parseCmakelists(content, fileName);
        return { ...inner, hasCmake: true, cmakePath };
      } catch {
        // Unreadable CMakeLists — skip, report as unreferenced
        return { hasCmake: true, cmakePath, isReferenced: false, bisonTargetNames: [], flexTargetNames: [] };
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  return { hasCmake: false, isReferenced: false, bisonTargetNames: [], flexTargetNames: [] };
}

/**
 * Emit a Warning diagnostic when the file has a CMakeLists.txt nearby but is
 * not referenced by any BISON_TARGET / FLEX_TARGET.
 * Returns `undefined` when no CMake file is found, or when the file is referenced.
 */
export function computeCmakeDiagnostic(
  fileUri: string,
  languageId: 'bison' | 'flex',
): Diagnostic | undefined {
  const analysis = analyzeCmake(fileUri);
  if (!analysis.hasCmake || analysis.isReferenced) return undefined;

  const fileName = path.basename(URI.parse(fileUri).fsPath);
  const macro = languageId === 'bison' ? 'BISON_TARGET' : 'FLEX_TARGET';

  return {
    severity: DiagnosticSeverity.Warning,
    range: Range.create(0, 0, 0, 0),
    message:
      `'${fileName}' is not referenced in CMakeLists.txt. ` +
      `Add a ${macro}() call, or run "Bison/Flex: Add CMake Target" to insert a snippet.`,
    source: 'cmake',
    code: 'cmake-not-referenced',
  };
}

/**
 * Generate the CMake snippet to insert for a Bison file.
 * Returns both the BISON_TARGET/FLEX_TARGET block and an ADD_FLEX_BISON_DEPENDENCY
 * skeleton when both language types are detected.
 */
export function generateCmakeSnippet(
  fileName: string,
  targetName: string,
  languageId: 'bison' | 'flex',
): string {
  const base = path.basename(fileName, path.extname(fileName));
  if (languageId === 'bison') {
    return [
      `BISON_TARGET(${targetName} ${fileName} \${CMAKE_CURRENT_BINARY_DIR}/${base}.tab.cpp`,
      `  DEFINES_FILE \${CMAKE_CURRENT_BINARY_DIR}/${base}.tab.h)`,
    ].join('\n');
  } else {
    return [
      `FLEX_TARGET(${targetName} ${fileName} \${CMAKE_CURRENT_BINARY_DIR}/${base}.yy.cpp)`,
    ].join('\n');
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

interface CmakeInner {
  isReferenced: boolean;
  bisonTargetNames: string[];
  flexTargetNames: string[];
}

function parseCmakelists(content: string, fileName: string): CmakeInner {
  // Strip line comments (# ...)
  const stripped = content.replace(/#[^\n]*/g, '');

  const bisonTargetNames: string[] = [];
  const flexTargetNames: string[] = [];
  let isReferenced = false;

  // BISON_TARGET(Name  inputFile  outputFile  ...)
  const bisonRe = /BISON_TARGET\s*\(\s*(\w+)\s+(\S+)/gi;
  let m: RegExpExecArray | null;
  while ((m = bisonRe.exec(stripped)) !== null) {
    const targetName = m[1];
    const inputFile = m[2].replace(/^["']|["']$/g, ''); // strip optional quotes
    bisonTargetNames.push(targetName);
    if (fileMatches(inputFile, fileName)) isReferenced = true;
  }

  // FLEX_TARGET(Name  inputFile  outputFile  ...)
  const flexRe = /FLEX_TARGET\s*\(\s*(\w+)\s+(\S+)/gi;
  while ((m = flexRe.exec(stripped)) !== null) {
    const targetName = m[1];
    const inputFile = m[2].replace(/^["']|["']$/g, '');
    flexTargetNames.push(targetName);
    if (fileMatches(inputFile, fileName)) isReferenced = true;
  }

  return { isReferenced, bisonTargetNames, flexTargetNames };
}

/** True if the CMake input-file argument resolves to the grammar file's basename. */
function fileMatches(cmakeArg: string, fileName: string): boolean {
  // Handle relative paths like "src/parser.y" or just "parser.y"
  const base = path.basename(cmakeArg);
  return base === fileName || cmakeArg === fileName;
}
