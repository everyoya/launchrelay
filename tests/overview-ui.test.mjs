import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('overview is a next-step screen instead of a command center dashboard', () => {
  assert.match(appSource, /function ContinueWhereLeftOff/);
  assert.match(appSource, /Continue where you left off/);
  assert.match(appSource, /Here is where you are and the next thing to do\./);
  assert.match(appSource, /Profile → Sources → Moments → Draft → Library/);
  assert.doesNotMatch(appSource, /Workspace command center/);
  assert.doesNotMatch(appSource, /Recommended next move/);
  assert.doesNotMatch(appSource, /New-user guidance/);
  assert.doesNotMatch(appSource, /ExpertOnboardingPanel/);
});

test('overview removes dashboard metrics for the radical reset', () => {
  assert.doesNotMatch(appSource, /MetricCard/);
  assert.doesNotMatch(appSource, /label="Source receipts"/);
  assert.doesNotMatch(appSource, /label="Moments awaiting review"/);
  assert.doesNotMatch(appSource, /label="Library items"/);
  assert.doesNotMatch(appSource, /Overview review pass later/);
});
