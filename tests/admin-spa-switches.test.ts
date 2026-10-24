import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { spaFiles, spaScripts } from './helpers/spa-source.js';

// A checkbox flips the moment it is clicked. When the save behind it fails and
// the handler only shows a toast, the switch keeps claiming a state the server
// never took, and the next look at the list is a lie.
describe('admin SPA switches', () => {
  it('reload what the server holds when their save fails', () => {
    const handlers = new Set<string>();
    for (const path of spaFiles().filter(p => p.endsWith('.html') || p.endsWith('.js'))) {
      const text = readFileSync(resolve(process.cwd(), 'src/public', path), 'utf8');
      // <input type="checkbox" … data-on-change="name"> in markup, ${on('change', 'name', …)} in templates
      for (const m of text.matchAll(/type=\\?"checkbox\\?"[^>]*?(?:data-on-change="|on\('change',\s*')(\w+)/g)) handlers.add(m[1]);
      // toggleSwitch(checked, on('change', 'name', …), label)
      for (const m of text.matchAll(/toggleSwitch\([^;]*?on\('change',\s*'(\w+)'/g)) handlers.add(m[1]);
    }
    // Select-all boxes only tick other boxes; nothing is saved.
    for (const name of [...handlers]) if (/^toggleAll/.test(name)) handlers.delete(name);
    expect(handlers.size).toBeGreaterThan(5);

    const offenders: string[] = [];
    const found = new Set<string>();
    for (const code of spaScripts()) {
      const file = ts.createSourceFile('spa.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      for (const s of file.statements) {
        if (!ts.isFunctionDeclaration(s) || !s.name || !s.body || !handlers.has(s.name.text)) continue;
        found.add(s.name.text);
        const catches: string[] = [];
        const visit = (n: ts.Node) => { if (ts.isCatchClause(n)) catches.push(n.block.getText(file)); ts.forEachChild(n, visit); };
        visit(s.body);
        if (!catches.length || catches.some(c => !/\b(load|refresh)\w*\(|\.checked\s*=/.test(c))) offenders.push(s.name.text);
      }
    }
    expect([...handlers].filter(h => !found.has(h)), 'handlers without a declaration').toEqual([]);
    expect(offenders).toEqual([]);
  });
});
