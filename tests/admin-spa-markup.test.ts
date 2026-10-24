import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { spaFiles } from './helpers/spa-source.js';

// A view's markup that closes one <div> too many ends the view early: the rest
// of it lands directly in <main>, outside every .view, and shows on all views.
const read = (path: string) => readFileSync(resolve(process.cwd(), 'src/public', path), 'utf8');

/** The opening tags of the top-level <div>s in `markup`, and the depth left at its end. */
function topLevelDivs(markup: string): { tops: string[]; depth: number } {
  const tops: string[] = [];
  let depth = 0;
  for (const tag of markup.matchAll(/<(\/?)div\b[^>]*>/g)) {
    if (tag[1]) { depth--; continue; }
    if (depth === 0) tops.push(tag[0]);
    depth++;
  }
  return { tops, depth };
}

describe('admin SPA markup', () => {
  it('keeps everything in <main> inside a view', () => {
    const html = read('index.html');
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    const { tops, depth } = topLevelDivs(main.slice(main.indexOf('>') + 1));
    expect(depth).toBe(0);
    expect(tops.filter(tag => !/\bclass="view\b/.test(tag) && !/id="time-zone-label"/.test(tag))).toEqual([]);
  });

  it('balances the divs of a view fetched as a fragment', () => {
    expect(topLevelDivs(read('views/docs.html')).depth).toBe(0);
  });

  // Tables scroll sideways by one mechanism: a .table-wrap around a real table. A
  // table turned into a block instead stops filling its panel, so its header and
  // an empty list's message hug the left edge on narrow screens.
  it('puts every table directly inside a .table-wrap', () => {
    const sources = spaFiles().filter(path => path.endsWith('.html') || path.endsWith('.js'));
    const offenders: string[] = [];
    for (const path of sources) {
      const text = read(path);
      for (const m of text.matchAll(/<table\b[^>]*>/g)) {
        const before = text.slice(Math.max(0, m.index! - 80), m.index!);
        // The settings key-value list is not a data table: its long values wrap instead.
        const keyValue = /^\s*<tbody id="system-info"/.test(text.slice(m.index! + m[0].length, m.index! + m[0].length + 60));
        if (!/<div class="table-wrap[^"]*">\s*$/.test(before) && !keyValue) offenders.push(`${path}:${text.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // U+FFFD is what an encoding slip leaves behind; one sat in index.html from May
  // until 2026-10-24, hidden only because data-i18n replaced the text at runtime.
  it('holds no replacement characters in any SPA source', () => {
    expect(spaFiles().filter(path => read(path).includes('\uFFFD'))).toEqual([]);
  });

  // .table-wrap scrolls sideways; a rule that also makes the table inside it a
  // scroller stacks a second scrollbar under the first (seen on narrow screens).
  it('never makes a table inside a .table-wrap scroll by itself', () => {
    const css = ['components', 'features', 'responsive', 'states', 'overlays', 'shell', 'base', 'tokens', 'docs']
      .map(name => read(`css/${name}.css`)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders: string[] = [];
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/overflow(-x)?\s*:\s*(auto|scroll)/.test(rule[2])) continue;
      for (const selector of rule[1].split(',').map(s => s.trim())) {
        // Only selectors whose subject is a bare `table` can reach a wrapped one.
        if (!/(^|[\s>+~])table(:not\([^)]*\))*$/.test(selector)) continue;
        if (!/:not\(\.table-wrap\s*>?\s*table\)/.test(selector)) offenders.push(selector);
      }
    }
    expect(offenders).toEqual([]);
  });
});
