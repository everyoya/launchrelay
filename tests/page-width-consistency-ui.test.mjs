import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('app pages use the Page container width for content below the top panel', () => {
  assert.match(appSource, /function Page\(/);
  assert.match(appSource, /<div className="mx-auto max-w-\[1500px\] lr-soft-enter">/);

  const narrowedPageContentWrappers = [
    /<div className="mx-auto max-w-5xl space-y-5">/,
    /<div className="mx-auto w-full max-w-7xl space-y-5">/,
    /<div className="mx-auto max-w-4xl space-y-5">/,
  ];

  for (const pattern of narrowedPageContentWrappers) {
    assert.doesNotMatch(appSource, pattern);
  }

  assert.match(appSource, /<div className="w-full space-y-5">/);
});
