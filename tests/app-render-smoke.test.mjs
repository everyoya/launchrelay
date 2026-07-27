import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Library and Settings render smoke passes in an isolated browser-module process', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-render-smoke.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /render smoke passed/);
});
