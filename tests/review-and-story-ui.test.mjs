import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('review is a single-highlight page without hero filters or queue', () => {
  assert.match(appSource, /function HighlightReview/);
  assert.match(appSource, /max-w-\[960px\]/);
  assert.match(appSource, /eyebrow="Highlight"/);
  assert.doesNotMatch(appSource, /Page title="Launch Moments"/);
  assert.doesNotMatch(appSource, /Review inbox/);
  assert.doesNotMatch(appSource, /Detect new moments/);
  assert.doesNotMatch(appSource, /role="tablist" aria-label="Launch moment filters"/);
  assert.doesNotMatch(appSource, /Candidate queue/);
  assert.doesNotMatch(appSource, /function MomentCandidate/);
});

test('review uses Highlight terminology and reordered content', () => {
  assert.match(appSource, /Based on/);
  assert.match(appSource, /Continue to Draft →/);
  assert.match(appSource, /visibleEvidence = sources\.slice\(0, 4\)/);
  assert.match(appSource, /moreEvidenceCount > 0/);
  assert.doesNotMatch(appSource, /Accepted moment candidate/);
  assert.doesNotMatch(appSource, /Evidence used/);
  assert.doesNotMatch(appSource, /Confidence and reasoning/);
  assert.doesNotMatch(appSource, /Accept moment/);
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
