import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import type { Hono } from 'hono';

/**
 * The admin SPA is index.html plus text assets under /assets. Everything is
 * read once at startup (dev restarts on change), so a request can only ever
 * receive a file that was in public/ — there is no path to resolve and no
 * traversal to guard against.
 */

export interface PublicAsset {
  body: string;
  contentType: string;
  hash: string;
}

export interface PublicBundle {
  indexHtml: string;
  assets: Map<string, PublicAsset>;
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// Served by their own routes: index.html at /, extensions.js at /extensions.js.
const NOT_ASSETS = new Set(['index.html', 'extensions.js']);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function shortHash(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 10);
}

export function loadPublicBundle(publicDir: string): PublicBundle {
  const assets = new Map<string, PublicAsset>();
  for (const file of walk(publicDir)) {
    const key = relative(publicDir, file).split('\\').join('/');
    const contentType = CONTENT_TYPES[key.slice(key.lastIndexOf('.'))];
    if (!contentType || NOT_ASSETS.has(key)) continue;
    const body = readFileSync(file, 'utf-8');
    assets.set(key, { body, contentType, hash: shortHash(body) });
  }

  // Pin each asset URL to its content, so a deploy can never be served from a
  // stale cache; a name with no file behind it is a broken build, so stop here.
  // data-src names markup that a script fetches after load.
  let indexHtml = readFileSync(join(publicDir, 'index.html'), 'utf-8').replace(
    /(\s(?:src|href|data-src)=")\/assets\/([^"?#]+)"/g,
    (_, prefix: string, key: string) => {
      const asset = assets.get(key);
      if (!asset) throw new Error(`index.html references a missing asset: /assets/${key}`);
      return `${prefix}/assets/${key}?h=${asset.hash}"`;
    },
  );
  // Modules import each other by plain path. The import map points every such
  // path at its hashed URL, so each module is fetched and instantiated once,
  // from one URL, and still caches for good. It must precede the first module.
  const moduleMarker = '<script type="module"';
  if (indexHtml.includes(moduleMarker)) {
    const imports = Object.fromEntries([...assets]
      .filter(([key]) => key.startsWith('js/') && key.endsWith('.js'))
      .map(([key, asset]) => [`/assets/${key}`, `/assets/${key}?h=${asset.hash}`]));
    indexHtml = indexHtml.replace(moduleMarker, `<script type="importmap">${JSON.stringify({ imports })}</script>\n${moduleMarker}`);
  }
  return { indexHtml, assets };
}

/**
 * GET /assets/<path>. A URL carrying the current hash is immutable for a
 * year; anything else (a fetch() that does not know the hash) revalidates
 * against the ETag.
 */
export function registerAssetRoutes(app: Hono<any>, bundle: PublicBundle): void {
  app.get('/assets/*', (c) => {
    let key: string;
    try {
      key = decodeURIComponent(c.req.path.slice('/assets/'.length));
    } catch {
      return c.notFound();
    }
    const asset = bundle.assets.get(key);
    if (!asset) return c.notFound();
    const etag = `"${asset.hash}"`;
    c.header('ETag', etag);
    c.header('Cache-Control', c.req.query('h') === asset.hash ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304);
    c.header('Content-Type', asset.contentType);
    return c.body(asset.body);
  });
}
