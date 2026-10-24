import { readFileSync, readdirSync } from 'fs';
import { join, relative, resolve } from 'path';

// The admin SPA lives in several files under src/public, so a test that reads
// its source reads all of them. extensions.js is optional and not in the repository;
// leaving it out keeps the result the same here and in CI.
const ROOT = resolve(process.cwd(), 'src/public');
const SOURCE_TYPES = new Set(['.html', '.js', '.css']);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** SPA source files relative to src/public, index.html first, the rest sorted. */
export function spaFiles(): string[] {
  return walk(ROOT)
    .map(path => relative(ROOT, path).split('\\').join('/'))
    .filter(path => path !== 'extensions.js' && SOURCE_TYPES.has(path.slice(path.lastIndexOf('.'))))
    .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
}

/** Every SPA source file joined into one string, in spaFiles() order. */
export function spaSource(): string {
  return spaFiles().map(path => readFileSync(join(ROOT, path), 'utf8')).join('\n');
}

/** Each classic script the page runs: whole .js files, and inline <script> blocks of .html files. */
export function spaScripts(): string[] {
  return spaFiles().flatMap(path => {
    const text = readFileSync(join(ROOT, path), 'utf8');
    if (path.endsWith('.js')) return [text];
    if (!path.endsWith('.html')) return [];
    return [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  });
}
