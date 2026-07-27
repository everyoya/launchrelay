import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

function sliceBetween(start, end) {
  const startIndex = appSource.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = appSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return appSource.slice(startIndex, endIndex);
}

const librarySource = sliceBetween('function LibraryScreen', 'function HelpDocsScreen');
const settingsSource = sliceBetween('function SettingsScreen', 'function SourceSetupFlow');

test('library uses V2 tabs and search without saved-work hero or metadata', () => {
  assert.match(librarySource, /const tabs = \["Drafts", "Suggested Highlights", "Published"\]/);
  assert.match(librarySource, /placeholder="Search Library"/);
  assert.match(librarySource, /grid gap-4 sm:grid-cols-2 xl:grid-cols-3/);
  assert.doesNotMatch(librarySource, /Saved work/);
  assert.doesNotMatch(librarySource, /Drafts saved work/);
  assert.doesNotMatch(librarySource, /Linked Moment|Linked moment|Status/);
  assert.doesNotMatch(librarySource, /feature_launch/);
  assert.doesNotMatch(librarySource, /Ready<\/Badge>/);
  assert.doesNotMatch(librarySource, /Opportunities/);
});

test('library cards are simplified and suggested highlights open Review', () => {
  assert.match(appSource, /function DraftLibraryCard/);
  assert.match(appSource, /Continue Editing →/);
  assert.match(appSource, /function SuggestedHighlightCard/);
  assert.match(appSource, /Review Highlight →/);
  assert.match(appSource, /Based on \{cluster\.activity_item_ids\?\.length \|\| sources\.length \|\| 0\} sources/);
  assert.match(appSource, /onReview\(cluster\)/);
  assert.match(appSource, /function PublishedCard/);
  assert.match(appSource, /View →/);
});

test('settings is a lightweight control panel with ordered card sections', () => {
  assert.match(settingsSource, /function SettingsScreen/);
  assert.match(settingsSource, /Profile/);
  assert.match(settingsSource, /Connected Sources/);
  assert.match(settingsSource, /AI Preferences/);
  assert.match(settingsSource, /Publishing/);
  assert.match(settingsSource, /Workspace/);
  assert.match(settingsSource, /Notifications/);
  assert.match(settingsSource, /Account/);
  assert.match(settingsSource, /Sign Out/);
  assert.doesNotMatch(settingsSource, /AI model connection/);
  assert.doesNotMatch(settingsSource, /Base44-supported model/);
  assert.doesNotMatch(settingsSource, /Deterministic generation/);
  assert.doesNotMatch(settingsSource, /Account & billing/);
});

test('settings rows stay simple and avoid advanced AI controls', () => {
  assert.match(settingsSource, /function SettingsRow/);
  assert.match(settingsSource, /Automatically detect new Highlights/);
  assert.match(settingsSource, /Notify me when new Highlights are found/);
  assert.match(settingsSource, /Theme/);
  assert.match(settingsSource, /Start on/);
  assert.match(settingsSource, /GitHub/);
  assert.match(settingsSource, /Manual Uploads/);
  assert.doesNotMatch(settingsSource, /prompts|models|temperature|tokens/i);
});
