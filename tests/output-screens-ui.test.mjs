import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('opportunities is an extremely simple accepted-moment to ideas flow', () => {
  assert.match(appSource, /function Opportunities/);
  assert.match(appSource, /Selected accepted moment/);
  assert.match(appSource, /Generate ideas/);
  assert.match(appSource, /Save useful ideas/);
  assert.match(appSource, /Promote to Draft/);
  assert.match(appSource, /Ignore<\/Button>/);
});

test('library uses Drafts Suggested Highlights and Published without saved-work metadata', () => {
  assert.match(appSource, /const tabs = \["Drafts", "Suggested Highlights", "Published"\]/);
  assert.match(appSource, /function DraftLibraryCard/);
  assert.match(appSource, /function SuggestedHighlightCard/);
  assert.match(appSource, /function PublishedCard/);
  assert.match(appSource, /Search Library/);
  assert.match(appSource, /Continue Editing →/);
  assert.match(appSource, /Review Highlight →/);
  assert.match(appSource, /Published content stays here as a receipt/);
  assert.doesNotMatch(appSource, /const tabs = \["Drafts", "Ready", "Published", "Opportunities", "Moments"\]/);
  assert.doesNotMatch(appSource, /Moments: clusters\.map/);
  assert.doesNotMatch(appSource, /Source trail preserved:/);
  assert.doesNotMatch(appSource, /DataTable columns=\{columnsByTab\[libraryTab\]/);
  assert.doesNotMatch(appSource, /SavedWorkCard/);
});

test('settings is a lightweight control panel, not a tabbed configuration dashboard', () => {
  assert.match(appSource, /function SettingsScreen/);
  assert.match(appSource, /Connected Sources/);
  assert.match(appSource, /AI Preferences/);
  assert.match(appSource, /Publishing/);
  assert.match(appSource, /Notifications/);
  assert.match(appSource, /Sign Out/);
  assert.match(appSource, /function SettingsRow/);
  assert.doesNotMatch(appSource, /\["model", "AI model"\]/);
  assert.doesNotMatch(appSource, /AI model connection/);
  assert.doesNotMatch(appSource, /Base44-supported model/);
  assert.doesNotMatch(appSource, /Deterministic generation/);
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
