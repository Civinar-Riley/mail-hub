import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { spaScripts, spaSource } from './helpers/spa-source.js';

// A key the dictionaries lack renders as the raw key ("common.no_match") on
// screen, and an undeclared custom property silently drops the declaration
// that used it. Both slip past review because nothing errors.
const source = spaSource();

function dictionaryKeys(lang: 'zh' | 'en'): Set<string> {
  const start = source.indexOf(`\n${lang}: {`);
  expect(start, `${lang} dictionary`).toBeGreaterThan(-1);
  const end = source.indexOf('\n}', start + 1);
  return new Set([...source.slice(start, end).matchAll(/'([a-z0-9_.]+)':/g)].map(m => m[1]));
}

describe('admin SPA references resolve', () => {
  it('every statically referenced i18n key exists in both dictionaries', () => {
    const used = new Set([
      ...[...source.matchAll(/\bt\('([a-z0-9_.]+)'/g)].map(m => m[1]),
      ...[...source.matchAll(/data-i18n(?:-ph|-html|-title)?="([a-z0-9_.]+)"/g)].map(m => m[1]),
    ]);
    // `t('theme.switched.' + mode)` and friends build the key at runtime.
    const literal = [...used].filter(key => !key.endsWith('.') && !key.endsWith('_'));
    for (const lang of ['zh', 'en'] as const) {
      const keys = dictionaryKeys(lang);
      expect(literal.filter(key => !keys.has(key)), `missing from ${lang}`).toEqual([]);
    }
  });

  it('every var(--x) without a fallback is declared', () => {
    const declared = new Set([...source.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
    const used = new Set([...source.matchAll(/var\((--[a-z0-9-]+)\s*\)/g)].map(m => m[1]));
    expect([...used].filter(name => !declared.has(name))).toEqual([]);
  });

  it('declares each top-level script name once across all SPA scripts', () => {
    // Classic scripts share one global scope: a name declared twice resolves to
    // whichever file loads last, so moving code between files changes behaviour.
    const counts = new Map<string, number>();
    for (const code of spaScripts()) {
      const file = ts.createSourceFile('spa.js', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
      for (const statement of file.statements) {
        const names = ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)
          ? [statement.name?.text]
          : ts.isVariableStatement(statement)
            ? statement.declarationList.declarations.map(d => (ts.isIdentifier(d.name) ? d.name.text : undefined))
            : [];
        for (const name of names) if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    expect([...counts].filter(([, n]) => n > 1).map(([name]) => name)).toEqual([]);
  });
});
