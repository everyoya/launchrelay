import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('launch moments is a two-area review inbox without timeline column or high-confidence filter', () => {
  assert.match(appSource, /function LaunchMomentReviewDesk/);
  assert.match(appSource, /Candidate queue/);
  assert.match(appSource, /Review selected candidate/);
  assert.match(appSource, /Accept moment/);
  assert.doesNotMatch(appSource, /\["high-confidence", "High confidence"\]/);
  assert.doesNotMatch(appSource, /title="Source timeline"/);
  assert.doesNotMatch(appSource, /xl:grid-cols-\[300px_minmax\(0,1fr\)_360px\]/);
});

test('launch moment evidence is inside the selected review desk and confidence is quiet', () => {
  assert.match(appSource, /Evidence used/);
  assert.match(appSource, /Confidence and reasoning/);
  assert.match(appSource, /<details/);
  assert.doesNotMatch(appSource, /Evidence panel/);
  assert.doesNotMatch(appSource, /<Badge tone="green">\{cluster\.confidence_label/);
});

test('story studio is editor-first with context and proof collapsed', () => {
  assert.match(appSource, /function StoryEditorWorkspace/);
  assert.match(appSource, /Accepted moment/);
  assert.match(appSource, /Large editor surface/);
  assert.match(appSource, /View source brief/);
  assert.match(appSource, /View sources and checks/);
  assert.doesNotMatch(appSource, /xl:grid-cols-\[300px_minmax\(0,1fr\)_340px\]/);
  assert.doesNotMatch(appSource, /<AssistantPanel/);
  assert.doesNotMatch(appSource, /title="Story foundation"/);
});
