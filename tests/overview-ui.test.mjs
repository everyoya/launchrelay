import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('overview uses one current-work command surface instead of separate workflow and queue panels', () => {
  assert.match(appSource, /function CurrentWorkCommand/);
  assert.match(appSource, /Recommended next move/);
  assert.match(appSource, /New-user guidance/);
  assert.doesNotMatch(appSource, /<WorkflowProgress steps=\{workflow\}/);
  assert.doesNotMatch(appSource, /title="Moments needing review"/);
  assert.doesNotMatch(appSource, /title="Recent drafts"/);
});

test('overview metrics are product-specific and right rail is removed for now', () => {
  assert.match(appSource, /label="Source receipts"/);
  assert.match(appSource, /label="Moments awaiting review"/);
  assert.match(appSource, /label="Library items"/);
  assert.doesNotMatch(appSource, /xl:grid-cols-\[1fr_340px\]/);
  assert.doesNotMatch(appSource, /<aside className="space-y-5">/);
  assert.doesNotMatch(appSource, /<MicroHelp title="What does the workflow mean\?"/);
});

test('overview keeps an explicit later-review marker for the worksheet decision', () => {
  assert.match(appSource, /Overview review pass later/);
});
