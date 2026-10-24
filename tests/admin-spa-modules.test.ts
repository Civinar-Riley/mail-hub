import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

// The admin SPA is ES modules (js/boot.js is the entry). A name a module uses
// but never imports is a ReferenceError — thrown only when that code runs, so a
// rarely used button can carry one for months. The type checker sees it now.
const jsDir = resolve(process.cwd(), 'src/public/js');
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
const modules = walk(jsDir).filter(f => f.endsWith('.js'));

// Unresolved names, missing modules or exports, and reads before declaration.
const RESOLUTION = new Set([2304, 2552, 2305, 2307, 2614, 2724, 2448, 2454, 2582, 2583, 2584]);

describe('admin SPA modules', () => {
  it('resolve every name they use to an import, a local, or a browser global', () => {
    const program = ts.createProgram(modules, {
      allowJs: true, checkJs: true, noEmit: true, strict: false,
      module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    });
    const offenders = modules.flatMap(f => program.getSemanticDiagnostics(program.getSourceFile(f)))
      .filter(d => RESOLUTION.has(d.code))
      .map(d => `${d.file ? d.file.fileName.slice(jsDir.length + 1) + ':' + (d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1) : ''}  TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    expect(offenders).toEqual([]);
  }, 60_000);

  it('are loaded through one module entry, not one script tag each', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/public/index.html'), 'utf8');
    expect([...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[0])).toEqual(['<script type="module" src="/assets/js/boot.js"']);
  });
});
