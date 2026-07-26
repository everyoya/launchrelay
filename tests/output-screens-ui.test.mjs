import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('opportunities is an extremely simple accepted-moment to ideas flow', () => {
  assert.match(appSource, /function Opportunities/);
  assert.match(appSource, /Selected accepted moment/);
  assert.match(appSource, /Generate ideas/);
  assert.match(appSource, /Save useful ideas/);
  assert.doesNotMatch(appSource, /Promote to draft/);
  assert.doesNotMatch(appSource, /Ignore<\/Button>/);
});

test('library keeps drafts opportunities and published, but removes advanced archive tabs and permanent source banner', () => {
  assert.match(appSource, /const tabs = \["Drafts", "Opportunities", "Published"\]/);
  assert.match(appSource, /function SavedWorkCard/);
  assert.match(appSource, /Saved work/);
  assert.doesNotMatch(appSource, /const tabs = \["Drafts", "Ready", "Published", "Opportunities", "Moments"\]/);
  assert.doesNotMatch(appSource, /Moments: clusters\.map/);
  assert.doesNotMatch(appSource, /Source trail preserved:/);
  assert.doesNotMatch(appSource, /DataTable columns=\{columnsByTab\[libraryTab\]/);
});

test('settings stays as-is per decision', () => {
  assert.match(appSource, /function SettingsScreen/);
  assert.match(appSource, /\["model", "AI model"\]/);
  assert.match(appSource, /\["connections", "Connections"\]/);
  assert.match(appSource, /\["billing", "Account & billing"\]/);
});

test('help is reduced to workflow guide without removed sections', () => {
  assert.match(appSource, /function HelpDocsScreen/);
  assert.match(appSource, /Workflow guide/);
  assert.match(appSource, /Workflow in 5 steps/);
  assert.doesNotMatch(appSource, /Sample workspace vs real workspace/);
  assert.doesNotMatch(appSource, /Current build reality/);
  assert.doesNotMatch(appSource, /Troubleshooting/);
  assert.doesNotMatch(appSource, /Quick actions/);
});
