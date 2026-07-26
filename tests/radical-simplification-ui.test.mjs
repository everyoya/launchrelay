import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('sign in is a centered auth card without onboarding proof content', () => {
  assert.match(appSource, /<main className="mx-auto grid min-h-\[calc\(100vh-73px\)\] max-w-md/);
  assert.match(appSource, /<h1 className="text-3xl font-semibold tracking-\[-0\.035em\]">Sign in to LaunchRelay<\/h1>/);
  assert.doesNotMatch(appSource, /Real workspace sign in/);
  assert.doesNotMatch(appSource, /SignInProof/);
  assert.doesNotMatch(appSource, /source trail saved/);
  assert.doesNotMatch(appSource, /LaunchRelay is a normal product workspace/);
});

test('app shell is a quiet workflow rail and keeps opportunities', () => {
  assert.match(appSource, /\{ id: "opportunities", label: "Opportunities", icon: Lightbulb \}/);
  assert.doesNotMatch(appSource, /Active workspace/);
  assert.doesNotMatch(appSource, /<Plus className="mr-2 h-4 w-4" \/>/);
  assert.doesNotMatch(appSource, /onClick=\{\(\) => goApp\("sources"\)\} className="hidden rounded-xl bg-\[var\(--lr-orange\)\]/);
  assert.match(appSource, /function Sidebar/);
  assert.match(appSource, /Workspace settings/);
  assert.match(appSource, /Help & docs/);
});

test('overview is a next-step screen without dashboard metrics or command-center framing', () => {
  assert.match(appSource, /function ContinueWhereLeftOff/);
  assert.match(appSource, /Continue where you left off/);
  assert.match(appSource, /Profile → Sources → Moments → Draft → Library/);
  assert.doesNotMatch(appSource, /Workspace command center/);
  assert.doesNotMatch(appSource, /MetricCard label="Source receipts"/);
  assert.doesNotMatch(appSource, /MetricCard label="Moments awaiting review"/);
  assert.doesNotMatch(appSource, /MetricCard label="Library items"/);
  assert.doesNotMatch(appSource, /ExpertOnboardingPanel/);
});
