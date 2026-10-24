import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { spaScripts } from './helpers/spa-source.js';

// A detail loader shows a "loading" placeholder once its fetch has taken 150ms.
// If the fetch then fails and the catch only cancels that timer, the placeholder
// — or the previous inbox's messages — stays on screen as if it were the answer.
describe('admin SPA detail loaders', () => {
  it('replace their area with the error when the fetch fails', () => {
    const offenders: string[] = [];
    for (const code of spaScripts()) {
      const file = ts.createSourceFile('spa.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      for (const statement of file.statements) {
        if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
        if (!/\bdeferredLoading\(/.test(statement.body.getText(file))) continue;
        const catches: ts.CatchClause[] = [];
        const visit = (node: ts.Node) => { if (ts.isCatchClause(node)) catches.push(node); ts.forEachChild(node, visit); };
        visit(statement.body);
        if (!catches.length || catches.some(c => !/\brenderDetailError\(/.test(c.block.getText(file)))) offenders.push(statement.name.text);
      }
    }
    expect(offenders).toEqual([]);
  });

  // The inline error stays on screen with its retry button; a toast saying the
  // same thing next to it is the same failure reported twice.
  it('report a failure once: inline, without a toast as well', () => {
    const offenders: string[] = [];
    for (const code of spaScripts()) {
      const file = ts.createSourceFile('spa.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const visit = (node: ts.Node) => {
        if (ts.isCatchClause(node)) {
          const text = node.block.getText(file);
          if (/\brender(Detail|Load)Error\(/.test(text) && /\btoast\(/.test(text)) {
            let fn: ts.Node | undefined = node;
            while (fn && !ts.isFunctionDeclaration(fn)) fn = fn.parent;
            offenders.push((fn as ts.FunctionDeclaration | undefined)?.name?.text ?? '?');
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(offenders).toEqual([]);
  });
});
