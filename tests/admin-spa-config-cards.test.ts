import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { spaScripts } from './helpers/spa-source.js';

// A config card is folded most of the time. A row action that reports into a
// status line inside it, or puts the cursor in one of its fields, does so
// invisibly: the click looks like it did nothing.
const html = readFileSync(resolve(process.cwd(), 'src/public/index.html'), 'utf8');

interface Card { id: string; ids: Set<string>; handlers: string }

/** Each .config-card in index.html: the ids inside it, and its delegated handlers written as calls (`name(`). */
function configCards(): Card[] {
  const cards: Card[] = [];
  for (const m of html.matchAll(/<div class="[^"]*\bconfig-card\b[^"]*" id="([^"]+)">/g)) {
    let depth = 0;
    let end = m.index!;
    for (const tag of html.slice(m.index!).matchAll(/<(\/?)div\b[^>]*>/g)) {
      depth += tag[1] ? -1 : 1;
      if (depth === 0) { end = m.index! + tag.index! + tag[0].length; break; }
    }
    const markup = html.slice(m.index!, end);
    cards.push({
      id: m[1],
      ids: new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map(x => x[1])),
      handlers: [...markup.matchAll(/\sdata-on-[a-z]+="([\w$]+)"/g)].map(x => `${x[1]}(`).join('\n'),
    });
  }
  return cards;
}

interface Fn { node: ts.FunctionDeclaration; calls: Set<string>; opensCard: boolean }

/**
 * Top-level functions with the names they call. Only real call expressions
 * count: a name inside a template string (a row button's onclick) is an action
 * the reader starts later, not a call.
 */
function functions(): Map<string, Fn> {
  const out = new Map<string, Fn>();
  for (const code of spaScripts()) {
    const file = ts.createSourceFile('spa.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    for (const s of file.statements) {
      if (!ts.isFunctionDeclaration(s) || !s.name || !s.body) continue;
      const calls = new Set<string>();
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.add(node.expression.text);
        ts.forEachChild(node, visit);
      };
      visit(s.body);
      out.set(s.name.text, { node: s, calls, opensCard: calls.has('openConfigTab') || calls.has('selectConfigTab') });
    }
  }
  return out;
}

/** The literal id of a `document.getElementById('…')` call, else null. */
function byIdLiteral(node: ts.Node): string | null {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  if (node.expression.name.text !== 'getElementById') return null;
  const arg = node.arguments[0];
  return arg && ts.isStringLiteral(arg) ? arg.text : null;
}

/**
 * Ids a function reaches out to: status/result lines it writes, and
 * elements it focuses or scrolls to. Follows `const x = getElementById(…)`.
 */
function reachedIds(fn: ts.FunctionDeclaration): Set<string> {
  const vars = new Map<string, string>();
  const reached = new Set<string>();
  const idOf = (expr: ts.Expression): string | null => {
    const e = ts.isNonNullExpression(expr) ? expr.expression : expr;
    if (ts.isIdentifier(e)) return vars.get(e.text) ?? null;
    return byIdLiteral(e);
  };
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const id = byIdLiteral(node.initializer);
      if (id) vars.set(node.name.text, id);
    }
    // x.textContent = …, x.innerHTML += … on a *-status / *-result element
    if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left)
      && ['textContent', 'innerHTML'].includes(node.left.name.text)) {
      const id = idOf(node.left.expression);
      if (id && /-(status|result)$/.test(id)) reached.add(id);
    }
    // x.focus(), x?.focus(), x.scrollIntoView()
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ['focus', 'scrollIntoView'].includes(node.expression.name.text)) {
      const id = idOf(node.expression.expression);
      if (id) reached.add(id);
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return reached;
}

describe('admin SPA config cards', () => {
  it('are reached only by actions started inside them, or that open them first', () => {
    const cards = configCards();
    expect(cards.length).toBeGreaterThan(0);
    const fns = functions();
    const offenders: string[] = [];
    for (const card of cards) {
      // Functions an action inside the card starts, and whatever they call in turn.
      const inside = new Set([...fns.keys()].filter(name => new RegExp(`\\b${name}\\(`).test(card.handlers)));
      for (const queue = [...inside]; queue.length;) {
        for (const next of fns.get(queue.pop()!)!.calls) {
          if (fns.has(next) && !inside.has(next)) { inside.add(next); queue.push(next); }
        }
      }
      for (const [name, fn] of fns) {
        const hits = [...reachedIds(fn.node)].filter(id => card.ids.has(id));
        if (hits.length && !inside.has(name) && !fn.opensCard) offenders.push(`${name} → #${hits.join(', #')} in #${card.id}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('are opened before handler code built in a script string focuses one of their fields', () => {
    const ids = new Set(configCards().flatMap(c => [...c.ids]));
    const offenders: string[] = [];
    for (const code of spaScripts()) {
      const file = ts.createSourceFile('spa.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
          || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
          for (const m of node.text.matchAll(/getElementById\('([\w-]+)'\)\??\.focus\(/g)) if (ids.has(m[1])) offenders.push(m[1]);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(offenders).toEqual([]);
  });
});
