import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('v2 navigation keeps core workflow primary and moves settings to the bottom', () => {
  assert.match(appSource, /const appNav = \[\s*\{ id: "workspace", label: "Workspace", icon: Home \},\s*\{ id: "review", label: "Review", icon: CircleDot \},\s*\{ id: "draft", label: "Draft", icon: PenLine \},\s*\{ id: "library", label: "Library", icon: Library \},\s*\];/s);
  assert.match(appSource, /const secondaryAppNav = \[\s*\{ id: "settings", label: "Settings", icon: Settings \},\s*\];/s);
  assert.match(appSource, /aria-label="Workspace settings navigation"/);
  assert.doesNotMatch(appSource, /\{ id: "sources", label: "Sources"/);
  assert.doesNotMatch(appSource, /\{ id: "opportunities", label: "Opportunities"/);
  assert.doesNotMatch(appSource, /\{ id: "help", label: "Help/);
});

test('v2 onboarding is a centered no-sidebar flow with separate welcome step', () => {
  assert.match(appSource, /function V2Onboarding/);
  assert.match(appSource, /onboardingStep, setOnboardingStep\] = useState\("welcome"\)/);
  assert.match(appSource, /Every great story starts with context\./);
  assert.match(appSource, /Before we can discover Highlights worth sharing/);
  assert.doesNotMatch(appSource, /Placeholder welcome copy/);
  assert.match(appSource, /What are we working on\?/);
  assert.match(appSource, /Tell us about it\./);
  assert.match(appSource, /Where should Product Story learn from\?/);
  assert.match(appSource, /Understanding your product\.\.\./);
  assert.match(appSource, /We found \$\{improvementCount\} meaningful improvements worth reviewing\./);
  assert.match(appSource, /max-w-\[720px\]/);
});

test('v2 workspace is an inbox, not overview/dashboard', () => {
  assert.match(appSource, /function WorkspaceScreen/);
  assert.match(appSource, /Your review queue\./);
  assert.match(appSource, /Check the product changes Product Story found, confirm what matters, and move approved highlights into drafting\./);
  assert.match(appSource, /Highlights to review/);
  assert.match(appSource, /Recently Completed/);
  assert.match(appSource, /Add another product update\./);
  assert.match(appSource, /Add work →/);
  assert.match(appSource, /You're all caught up\./);
  assert.doesNotMatch(appSource, /function Overview/);
  assert.doesNotMatch(appSource, /Continue where you left off/);
  assert.doesNotMatch(appSource, /Statistics cards/);
});

test('sources route is preserved internally but not exposed as primary navigation', () => {
  assert.match(appSource, /hiddenInternalRouteIds = \["sources", "opportunities", "help"\]/);
  assert.match(appSource, /renderedView === "sources"/);
});
