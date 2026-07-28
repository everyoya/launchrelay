import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const sourceSetupSource = appSource.slice(appSource.indexOf('function SourceSetupFlow'), appSource.indexOf('function ProductProfileStep'));

test('sources is a guided setup flow with one active job, not tabs and rails', () => {
  assert.match(appSource, /function SourceSetupFlow/);
  assert.match(appSource, /Step 1: Product Profile/);
  assert.match(appSource, /Step 2: Add Source Activity/);
  assert.match(appSource, /Step 3: Continue to Launch Moments/);
  assert.match(appSource, /<div className="w-full space-y-5">/);
  assert.doesNotMatch(appSource, /mx-auto w-full max-w-7xl space-y-5/);
  assert.doesNotMatch(appSource, /SourceSummaryRail/);
  assert.doesNotMatch(appSource, /role="tablist" aria-label="Sources sections"/);
  assert.doesNotMatch(appSource, /xl:grid-cols-\[minmax\(0,1fr\)_340px\]/);
});

test('sources step buttons can reopen product profile after activity exists', () => {
  assert.match(appSource, /sourceTab === "profile"/);
  assert.match(appSource, /\["profile", "Step 1: Product Profile", \(\) => setSourceTab\("profile"\)\]/);
  assert.match(appSource, /\["continue", "Step 3: Continue to Launch Moments", \(\) => activities\.length > 0 && setSourceTab\("continue"\)\]/);
});

test('sources combines GitHub and manual notes as source input choices', () => {
  assert.match(appSource, /function SourceActivityStep/);
  assert.match(appSource, /Choose one way to add activity/);
  assert.match(appSource, /GitHub repository/);
  assert.match(appSource, /Manual notes/);
  assert.match(appSource, /Import GitHub activity/);
  assert.match(appSource, /Normalize notes/);
});

test('source receipts are hidden until requested and detection is gated', () => {
  assert.match(appSource, /View imported activity/);
  assert.match(appSource, /<details/);
  assert.match(appSource, /activities\.length > 0 && currentStep === "continue" && <ContinueToMomentsStep/);
  assert.doesNotMatch(sourceSetupSource, /Recent receipts/);
  assert.doesNotMatch(sourceSetupSource, /Source setup/);
  assert.doesNotMatch(sourceSetupSource, /Sources review pass later/);
});

test('sources supports app-user connectors for GitHub and Google Drive', () => {
  assert.match(appSource, /Connect GitHub account/);
  assert.match(appSource, /Import with connected GitHub/);
  assert.match(appSource, /Google Drive/);
  assert.match(appSource, /Connect Google Drive/);
  assert.match(appSource, /Import Google Drive docs/);
  assert.match(appSource, /Linear · Notion · Slack/);
});
