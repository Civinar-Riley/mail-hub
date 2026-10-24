import { describe, expect, it } from 'vitest';
import { spaFiles } from './helpers/spa-source.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Colours, backgrounds and fonts come from the stylesheets.
// An inline one cannot follow the theme switch, skips the tokens, and outranks
// every rule, so the next restyle silently misses it.
const VISUAL = /(^|[;{\s'"])(color|background(-color)?|font-(size|weight|family)|accent-color)\s*:/;

const sources = spaFiles()
  .filter(path => path.endsWith('.html') || path.endsWith('.js'))
  .map(path => ({ path, text: readFileSync(resolve(process.cwd(), 'src/public', path), 'utf8') }));

describe('admin SPA styles', () => {
  it('markup and templates set no inline colour, background or font', () => {
    const offenders: string[] = [];
    for (const { path, text } of sources) {
      // style="…", style='…', and style=\"…\" inside script strings.
      for (const m of text.matchAll(/style=(\\?)(["'])([\s\S]*?)\1\2/g)) {
        if (VISUAL.test(m[3])) offenders.push(`${path}:${text.slice(0, m.index).split('\n').length}  ${m[0].slice(0, 100)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // Layout goes through classes as well: a style attribute is invisible to every later restyle,
  // and 77 of them had piled up in index.html alone. Values computed at run time (drag offsets,
  // animated heights) are set through element.style, which this does not cover.
  it('markup and templates write no style attribute at all', () => {
    const offenders: string[] = [];
    for (const { path, text } of sources) {
      for (const m of text.matchAll(/\bstyle=\\?["']/g)) offenders.push(`${path}:${text.slice(0, m.index).split('\n').length}`);
    }
    expect(offenders).toEqual([]);
  });

  it('scripts do not paint colours, backgrounds or fonts through element.style', () => {
    const offenders: string[] = [];
    for (const { path, text } of sources) {
      if (!path.endsWith('.js')) continue;
      for (const m of text.matchAll(/\.style\.(color|background\w*|font\w*|accentColor)\s*=|\.style\.setProperty\(\s*['"](color|background[\w-]*|font-[\w-]+)/g)) {
        offenders.push(`${path}:${text.slice(0, m.index).split('\n').length}  ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // A badge class assembled from a tone name (`badge-${tone}`) can name a class
  // the stylesheet never defined: "error" then shows in the same grey as "ok".
  it('uses only badge classes the stylesheet defines, written out whole', () => {
    const css = spaFiles().filter(path => path.endsWith('.css'))
      .map(path => readFileSync(resolve(process.cwd(), 'src/public', path), 'utf8')).join('\n');
    const defined = new Set([...css.matchAll(/\.(badge-[\w-]+)/g)].map(m => m[1]));
    const offenders: string[] = [];
    for (const { path, text } of sources) {
      for (const m of text.matchAll(/\bbadge-(\$\{|[\w-]+)/g)) {
        if (m[1] === '${' || !defined.has(`badge-${m[1]}`)) offenders.push(`${path}:${text.slice(0, m.index).split('\n').length}  ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // A table made a block stops filling its panel: headers and empty messages hug the left.
  it('never turns a table into a block', () => {
    const offenders: string[] = [];
    for (const path of spaFiles().filter(p => p.endsWith('.css'))) {
      const css = readFileSync(resolve(process.cwd(), 'src/public', path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/display\s*:\s*block/.test(rule[2])) continue;
        for (const sel of rule[1].split(',').map(x => x.trim())) {
          if (/(^|[\s>+~])table(\.[\w-]+|:not\([^)]*\))*$|\.docs-param-table$/.test(sel)) offenders.push(`${path}  ${sel}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Emerald marks the primary action, focus, the current nav item and tab,
  // links, switches and checkboxes that are on, selection, success and the highlighted code.
  // Anything else painted green reads as one of those: trust pips, the docs base URL,
  // parameter names and a section bullet all did.
  it('paints emerald only where the design allows it', () => {
    const allowed = new Set([
      'a', ':focus-visible', 'progress', ':root',
      '.btn-primary', '.login-btn', '.login-logo', '.logo-icon', '.nav-icon.active', '.card-tab-ind', '.docs-nav a.active',
      'input:focus', 'select:focus', '.textarea:focus', '.search-box:focus', '.login-input:focus',
      '.toggle input:checked+.toggle-track', '.toggle:hover input:checked+.toggle-track', 'input[type=checkbox]', 'input[type=radio]',
      'tr.row-selected td', 'tr.row-selected td:first-child', '.gmail-rule.is-on', '.gmail-rule.is-on .gmail-rule-name',
      '.code-value', '.code-link', 'pre.docs-code .cv',
      '.tone-ok', '.dot-ok', '.ad-green', '.toast.success', '.toast.success::before',
      '.panel-title .indicator', '.dot-pulse', '0%',
      '.method.m-post', '.method-tag.m-post',
    ]);
    const offenders: string[] = [];
    for (const path of spaFiles().filter(p => p.endsWith('.css'))) {
      const css = readFileSync(resolve(process.cwd(), 'src/public', path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/var\(--emerald\)/.test(rule[2])) continue;
        for (const sel of rule[1].split(',').map(x => x.trim().replace(/\s+/g, ' '))) {
          if (!allowed.has(sel)) offenders.push(`${path}  ${sel}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Only acronyms are capitals; group names and headers keep their case.
  it('never uppercases text through CSS', () => {
    const offenders = spaFiles().filter(path => path.endsWith('.css'))
      .filter(path => /text-transform\s*:\s*uppercase/.test(readFileSync(resolve(process.cwd(), 'src/public', path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  // Badges are for states; type, tier, source and group are plain text.
  it('keeps the retired metadata pills out of markup, scripts and styles', () => {
    // data-px="static": the snow block read as garbage in an empty list (user, 2026-10-24).
    const retired = /\b(badge-(free|paid|alias|provider|closed|active)|dispatch-chip|provider-avatar|pa-(emerald|blue|amber|rose)|icon-soft-(blue|amber)|page-tag|card-icon|ci-(emerald|blue|amber|rose))\b|--blue\b|data-px="static"|--(bg1|bg4|card|text1|text-dim|app-bg|sidebar-bg|panel-bg|panel-header-bg|control-bg|control-subtle-bg|surface-shadow|surface-filter|shadow-sm|shadow-md|emerald-mid|accent-hover|text-xs|text-xl)(?![\w-])/g;
    const offenders: string[] = [];
    for (const path of spaFiles()) {
      const text = readFileSync(resolve(process.cwd(), 'src/public', path), 'utf8');
      for (const m of text.matchAll(retired)) offenders.push(`${path}:${text.slice(0, m.index).split('\n').length}  ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
