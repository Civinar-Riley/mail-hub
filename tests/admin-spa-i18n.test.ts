import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { spaFiles } from './helpers/spa-source.js';

// Text written straight into markup or a template stays in one language: the
// Chinese UI showed "No rules" and "Cumulative: … created", the English one
// showed 地址 and 封禁时间. Everything a reader sees goes through t() or data-i18n.
const read = (path: string) => readFileSync(resolve(process.cwd(), 'src/public', path), 'utf8');
const scripts = spaFiles().filter(p => p.endsWith('.js') && !p.endsWith('core/i18n.js'));
const CJK = /[一-鿿]/;

/** Visible text in a script: text nodes of markup in string and template literals. */
function templateTexts(path: string): { line: number; text: string }[] {
  const code = read(path);
  const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const out: { line: number; text: string }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      if (/[<>]/.test(n.text)) {
        for (const m of n.text.matchAll(/>([^<>]+)</g)) {
          const text = m[1].trim();
          if (text) out.push({ line: file.getLineAndCharacterOfPosition(n.getStart()).line + 1, text });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(file);
  return out;
}

describe('admin SPA text', () => {
  it('writes no Chinese into script templates', () => {
    const offenders = scripts.flatMap(path => templateTexts(path).filter(t => CJK.test(t.text)).map(t => `${path}:${t.line}  ${t.text}`));
    expect(offenders).toEqual([]);
  });

  it('writes no English sentences into script templates', () => {
    // Two or more lower-case English words in a text node is a sentence, not a name or an identifier.
    const sentence = /\b[A-Za-z][a-z]+\s+[a-z]{2,}\b/;
    const offenders = scripts.flatMap(path => templateTexts(path).filter(t => sentence.test(t.text) && !t.text.includes('${')).map(t => `${path}:${t.line}  ${t.text}`));
    expect(offenders).toEqual([]);
  });

  it('picks no wording by checking the language inline', () => {
    const offenders = scripts.flatMap(path => {
      const code = read(path);
      return [...code.matchAll(/_lang\s*===?\s*['"]zh['"]\s*\?\s*(['"`])([^'"`]*)\1/g)]
        .filter(m => CJK.test(m[2]))
        .map(m => `${path}:${code.slice(0, m.index).split('\n').length}  ${m[0]}`);
    });
    expect(offenders).toEqual([]);
  });

  // The docs view is markup too, and a title tooltip is read like any other text.
  it('gives every Chinese text and tooltip in the markup a data-i18n key', () => {
    const offenders: string[] = [];
    for (const path of ['index.html', 'views/docs.html']) {
      const html = read(path).replace(/<!--[\s\S]*?-->/g, '');
      const body = html.includes('<body') ? html.slice(html.indexOf('<body')) : html;
      // Open elements; text under one carrying data-i18n or data-i18n-html is translated with it.
      const open: { tag: string; keyed: boolean }[] = [];
      for (const m of body.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/g)) {
        if (m[4] !== undefined) {
          if (CJK.test(m[4]) && !open.some(e => e.keyed)) offenders.push(`${path}  ${m[4].trim().slice(0, 40)}`);
          continue;
        }
        const [, close, tag, attrs] = m;
        if (close) {
          const at = open.map(e => e.tag).lastIndexOf(tag);
          if (at >= 0) open.length = at;
          continue;
        }
        const title = attrs.match(/\btitle="([^"]*)"/);
        if (title && CJK.test(title[1]) && !/data-i18n-title/.test(attrs)) offenders.push(`${path}  title="${title[1].slice(0, 40)}"`);
        if (!/^(br|hr|img|input|meta|link|wbr)$/.test(tag) && !attrs.endsWith('/')) open.push({ tag, keyed: /data-i18n(-html)?=/.test(attrs) });
      }
    }
    expect(offenders).toEqual([]);
  });

  // A ${…} in static markup is never evaluated: the docs showed "等待并${t('inbox.extract')}code".
  it('writes no template expressions into static markup', () => {
    const offenders = ['index.html', 'views/docs.html'].flatMap(path =>
      [...read(path).matchAll(/\$\{\s*t\(/g)].map(m => `${path}:${read(path).slice(0, m.index).split('\n').length}`));
    expect(offenders).toEqual([]);
  });

  // An empty list is the shared empty state, which also hides the header.
  it('shows empty lists with the shared empty state, not a hand-made row', () => {
    const offenders = spaFiles().filter(p => p.endsWith('.js') || p.endsWith('.html'))
      .filter(path => /empty-row/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});
