import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { spaSource } from './helpers/spa-source.js';

// The formatting helpers run in a child process so TZ can differ per case;
// the parent cuts them out of the SPA source and passes them as argv[1].
const source = spaSource();
const formatCode = source.slice(source.indexOf('function timeAgo('), source.indexOf('function fmtBytes('));

function runFormat(body: string, env: NodeJS.ProcessEnv = process.env): unknown {
  const script = `
    const vm = require('node:vm');
    const ctx = {_lang:'zh', esc:String, t:()=>'-', Date, Intl};
    vm.createContext(ctx); vm.runInContext(process.argv[1], ctx);
    console.log(JSON.stringify(${body}));
  `;
  return JSON.parse(execFileSync(process.execPath, ['-e', script, formatCode], { encoding: 'utf8', env }));
}

// New display contract: explicit instants follow the viewer's zone; legacy
// UTC input must still denote the same instant rather than the viewer's noon.
describe('SPA local time formatting', () => {
  it.each([
    ['UTC', '12:00'], ['Asia/Tokyo', '21:00'],
    ['Asia/Shanghai', '20:00'], ['America/Los_Angeles', '05:00'],
  ])('uses browser timezone %s for all accepted time-point forms', (tz, expected) => {
    const actual = runFormat(
      `['2026-10-04 12:00:00','2026-10-04T12:00:00','2026-10-04T12:00:00Z','2026-10-04 21:00:00+09:00'].map(value=>ctx.shortTime(value))`,
      { ...process.env, TZ: tz },
    );
    expect(actual).toEqual([expected, expected, expected, expected]);
  });

  it('keeps missing, invalid and date-only display values unknown', () => {
    const actual = runFormat(`[null,'','2026-10-04','2026-02-30T00:00:00Z','123','bad time'].map(value=>ctx.fmtTime(value))`);
    expect(actual).toEqual(Array(6).fill('-'));
  });
});
