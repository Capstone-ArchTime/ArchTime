import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// The dependency extractor mining runs on every commit: the files of a checkout and the imports between them.
// Moved out of MiningService unchanged so the extractor-accuracy evaluation (scripts/extractor-eval.ts, T33) measures
// exactly the code mining uses. Behaviour changes here change both, on purpose.

export type GraphNode = { id: string; name: string; type: string };
export type GraphEdge = { source: string; target: string; type: string };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const edgeKey = (e: { source: string; target: string }) => `${e.source}\u0000${e.target}`;

/** Folders never analyzed: dependencies, build output, VCS and IDE data. */
const SKIPPED_DIRS = ['node_modules', '.git', 'bin', 'obj', 'target', '__pycache__', 'dist', 'build', '.vs', '.idea'];

export function getAllFiles(dirPath: string, exts: string[], arrayOfFiles: string[] = []): string[] {
  const base = path.basename(dirPath);
  if (SKIPPED_DIRS.includes(base)) return arrayOfFiles;

  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    let isDir = false;
    try { isDir = fs.statSync(fullPath).isDirectory(); } catch { return; } // broken symlink
    if (isDir) {
      arrayOfFiles = getAllFiles(fullPath, exts, arrayOfFiles);
    } else {
      if (exts.some(ext => fullPath.endsWith(ext))) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

/**
 * Files and import edges of the checkout at `dirPath`. TypeScript/JavaScript is read with the TypeScript parser
 * (top-level `import` declarations); C#, Java, Python, Go, Ruby and C/C++ with regular expressions. Edge targets are
 * import specifiers joined with the importer's folder, or package names; fileDependencies (domain/architecture/buildView.ts)
 * resolves them to files.
 */
export function extractDependencies(dirPath: string): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // --- TypeScript / JavaScript (AST-based) ---
  const tsFiles = getAllFiles(dirPath, ['.ts', '.tsx', '.js', '.jsx']);
  if (tsFiles.length > 0) {
    const program = ts.createProgram(tsFiles, { allowJs: true });
    for (const sourceFile of program.getSourceFiles()) {
      if (!sourceFile.isDeclarationFile && !sourceFile.fileName.includes('node_modules')) {
        const fileId = path.relative(dirPath, sourceFile.fileName).replace(/\\/g, '/');
        nodes.push({ id: fileId, name: path.basename(fileId), type: 'module' });
        ts.forEachChild(sourceFile, node => {
          if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
              let target = moduleSpecifier.text;
              if (target.startsWith('.')) {
                const resolved = path.join(path.dirname(fileId), target).replace(/\\/g, '/');
                edges.push({ source: fileId, target: resolved, type: 'imports' });
              } else {
                edges.push({ source: fileId, target, type: 'imports' });
              }
            }
          }
        });
      }
    }
  }

  // --- C# / Java / Python / Go / Ruby / C/C++ (regex-based) ---
  const otherFiles = getAllFiles(dirPath, ['.cs', '.java', '.py', '.go', '.rb', '.c', '.cpp', '.h', '.hpp']);
  // Build a lookup: namespace/package → list of file ids that define it
  const nsToFiles = new Map<string, string[]>();
  const fileContents = new Map<string, string>();

  for (const absPath of otherFiles) {
    const fileId = path.relative(dirPath, absPath).replace(/\\/g, '/');
    nodes.push({ id: fileId, name: path.basename(fileId), type: 'module' });
    let content: string;
    try { content = fs.readFileSync(absPath, 'utf-8'); } catch { continue; }
    fileContents.set(fileId, content);

    // Extract the namespace / package this file belongs to
    const ext = path.extname(absPath);
    let ns: string | null = null;
    if (ext === '.cs') {
      const m = content.match(/^namespace\s+([\w.]+)/m);
      ns = m?.[1] ?? null;
    } else if (ext === '.java') {
      const m = content.match(/^package\s+([\w.]+)/m);
      ns = m?.[1] ?? null;
    } else if (ext === '.py') {
      // Use directory-based module path: Services/Auth/views.py → Services.Auth.views
      ns = fileId.replace(/\//g, '.').replace(/\.py$/, '');
    } else if (ext === '.go') {
      const m = content.match(/^package\s+(\w+)/m);
      ns = m?.[1] ?? null;
    } else if (ext === '.rb') {
      // Ruby: use directory-based module path like Python
      ns = fileId.replace(/\//g, '::').replace(/\.rb$/, '');
    } else if (['.c', '.cpp', '.h', '.hpp'].includes(ext)) {
      // C/C++: use directory-based path
      ns = fileId;
    }
    if (ns) {
      const arr = nsToFiles.get(ns) ?? [];
      arr.push(fileId);
      nsToFiles.set(ns, arr);
    }
  }

  // Now extract imports and resolve them to file-ids via the namespace lookup
  for (const [fileId, content] of fileContents.entries()) {
    const ext = path.extname(fileId);
    const importedNamespaces: string[] = [];

    if (ext === '.cs') {
      for (const m of content.matchAll(/^using\s+(?:static\s+)?([\w.]+)\s*;/gm)) importedNamespaces.push(m[1]);
    } else if (ext === '.java') {
      for (const m of content.matchAll(/^import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/gm)) {
        const imp = m[1].replace(/\.\*$/, '');
        importedNamespaces.push(imp);
      }
    } else if (ext === '.py') {
      for (const m of content.matchAll(/^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) {
        importedNamespaces.push(m[1] ?? m[2]);
      }
    } else if (ext === '.go') {
      // Go imports are paths like "project/pkg/auth"
      for (const m of content.matchAll(/^\s*"([^"]+)"/gm)) importedNamespaces.push(m[1]);
    } else if (ext === '.rb') {
      // Ruby: require 'lib/foo' or require_relative '../bar'
      for (const m of content.matchAll(/^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm)) {
        let target = m[1];
        if (m[0].includes('require_relative')) {
          target = path.join(path.dirname(fileId), target).replace(/\\/g, '/');
        }
        // Push as edge directly; normalization will try adding .rb extension
        const resolved = target.endsWith('.rb') ? target : target;
        edges.push({ source: fileId, target: resolved, type: 'imports' });
        // Also track as namespace for prefix matching
        importedNamespaces.push(target.replace(/\//g, '::').replace(/\.rb$/, ''));
      }
    } else if (['.c', '.cpp', '.h', '.hpp'].includes(ext)) {
      // C/C++: #include "local/header.h" (skip <system> includes)
      for (const m of content.matchAll(/^\s*#include\s+"([^"]+)"/gm)) {
        let target = m[1];
        // Resolve relative to the current file's directory
        const resolved = path.join(path.dirname(fileId), target).replace(/\\/g, '/');
        edges.push({ source: fileId, target: resolved, type: 'includes' });
        // Also try from repo root
        if (resolved !== target) {
          edges.push({ source: fileId, target: target, type: 'includes' });
        }
      }
    }

    for (const ns of importedNamespaces) {
      // Exact match
      const targets = nsToFiles.get(ns);
      if (targets) {
        for (const t of targets) {
          if (t !== fileId) edges.push({ source: fileId, target: t, type: 'imports' });
        }
        continue;
      }
      // Prefix match: using Services.Auth → find all files whose namespace starts with that
      for (const [key, files] of nsToFiles.entries()) {
        if (key.startsWith(ns + '.') || ns.startsWith(key + '.')) {
          for (const t of files) {
            if (t !== fileId) edges.push({ source: fileId, target: t, type: 'imports' });
          }
        }
      }
    }
  }

  // Normalize edge targets to map to actual fileIds if they exist
  const nodeIds = new Set(nodes.map(n => n.id));
  edges.forEach(e => {
    const possibleExts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js', '.cs', '.java', '.py', '.go', '.rb', '.c', '.cpp', '.h', '.hpp'];
    for (const ext of possibleExts) {
      if (nodeIds.has(e.target + ext)) {
        e.target = e.target + ext;
        break;
      }
    }
  });

  // Deduplicate edges
  const seen = new Set<string>();
  const deduped = edges.filter(e => {
    const k = edgeKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { nodes, edges: deduped };
}
