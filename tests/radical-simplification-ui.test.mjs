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

test('app shell keeps four workflow destinations primary and settings secondary', () => {
  assert.match(appSource, /\{ id: "workspace", label: "Workspace", icon: Home \}/);
  assert.match(appSource, /\{ id: "review", label: "Review", icon: CircleDot \}/);
  assert.match(appSource, /\{ id: "draft", label: "Draft", icon: PenLine \}/);
  assert.match(appSource, /\{ id: "library", label: "Library", icon: Library \}/);
  assert.match(appSource, /const secondaryAppNav = \[/);
  assert.match(appSource, /\{ id: "settings", label: "Settings", icon: Settings \}/);
  assert.match(appSource, /hiddenInternalRouteIds = \["sources", "opportunities", "help"\]/);
  assert.doesNotMatch(appSource, /\{ id: "sources", label: "Sources"/);
  assert.doesNotMatch(appSource, /\{ id: "opportunities", label: "Opportunities"/);
  assert.doesNotMatch(appSource, /Active workspace/);
});

test('workspace replaces overview next-step framing', () => {
  assert.match(appSource, /function WorkspaceScreen/);
  assert.match(appSource, /Highlights to review/);
  assert.match(appSource, /Recently Completed/);
  assert.match(appSource, /You're all caught up\./);
  assert.doesNotMatch(appSource, /function ContinueWhereLeftOff/);
  assert.doesNotMatch(appSource, /Continue where you left off/);
  assert.doesNotMatch(appSource, /Profile → Sources → Moments → Draft → Library/);
  assert.doesNotMatch(appSource, /Workspace command center/);
  assert.doesNotMatch(appSource, /MetricCard label="Source receipts"/);
  assert.doesNotMatch(appSource, /ExpertOnboardingPanel/);
});
