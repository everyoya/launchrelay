import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('workspace is a focused inbox instead of an overview dashboard', () => {
  assert.match(appSource, /function WorkspaceScreen/);
  assert.match(appSource, /Your review queue\./);
  assert.match(appSource, /Check the product changes Product Story found, confirm what matters, and move approved highlights into drafting\./);
  assert.match(appSource, /Highlights to review/);
  assert.match(appSource, /Recently Completed/);
  assert.match(appSource, /Add another product update\./);
  assert.match(appSource, /Add work →/);
  assert.doesNotMatch(appSource, /function Overview/);
  assert.doesNotMatch(appSource, /Continue where you left off/);
  assert.doesNotMatch(appSource, /Workspace command center/);
  assert.doesNotMatch(appSource, /ExpertOnboardingPanel/);
});

test('workspace removes dashboard metrics for the V2 reset', () => {
  assert.doesNotMatch(appSource, /MetricCard/);
  assert.doesNotMatch(appSource, /label="Source receipts"/);
  assert.doesNotMatch(appSource, /label="Moments awaiting review"/);
  assert.doesNotMatch(appSource, /label="Library items"/);
  assert.doesNotMatch(appSource, /Overview review pass later/);
});
