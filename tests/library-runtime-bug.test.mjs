import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('library date formatting helper exists for draft and published cards', () => {
  assert.match(appSource, /formatRelativeDate\(draft\.updated_at \|\| draft\.created_at\)/);
  assert.match(appSource, /function formatRelativeDate\(/);
});

test('removed Ready tab is not selected after marking a draft ready', () => {
  assert.doesNotMatch(appSource, /setLibraryTab\("Ready"\)/);
});
