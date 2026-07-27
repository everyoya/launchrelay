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

const draftScreenSource = sliceBetween('function DraftScreen', 'function Opportunities');
const draftEditorSource = sliceBetween('function DraftHighlightContext', 'function OpportunityCard');

test('draft page uses Draft and Based on Highlight framing instead of Story Studio hero', () => {
  assert.match(draftScreenSource, /function DraftScreen/);
  assert.match(draftScreenSource, /title="Draft"/);
  assert.match(draftScreenSource, /Based on Highlight/);
  assert.match(draftScreenSource, /max-w-\[960px\]/);
  assert.doesNotMatch(draftScreenSource, /Page title="Story Studio"/);
  assert.doesNotMatch(draftScreenSource, /eyebrow="Focused editor"/);
  assert.doesNotMatch(draftScreenSource, /Edit and save one source-grounded draft\./);
});

test('draft replaces accepted-moment card with highlight context and visible evidence', () => {
  assert.match(draftEditorSource, /function DraftHighlightContext/);
  assert.match(draftEditorSource, /Highlight/);
  assert.match(draftEditorSource, /Why it matters/);
  assert.match(draftEditorSource, /Based on/);
  assert.match(draftEditorSource, /visibleEvidence = sourceItems\.slice\(0, 4\)/);
  assert.match(draftEditorSource, /moreEvidenceCount > 0/);
  assert.doesNotMatch(draftEditorSource, /Accepted moment/);
  assert.doesNotMatch(draftEditorSource, /View source brief/);
  assert.doesNotMatch(draftEditorSource, /View sources and checks/);
});

test('draft editor keeps editor controls simple with autosave, publish, and save draft', () => {
  assert.match(draftEditorSource, /autoSaveLabel/);
  assert.match(draftEditorSource, /Saving\.\.\./);
  assert.match(draftEditorSource, /Saved/);
  assert.match(draftEditorSource, />Publish</);
  assert.match(draftEditorSource, />Save Draft</);
  assert.doesNotMatch(draftEditorSource, /Large editor surface/);
  assert.doesNotMatch(draftEditorSource, /source-grounded/);
  assert.doesNotMatch(draftEditorSource, /wordCount\(draft\?\.body\)/);
  assert.doesNotMatch(draftEditorSource, /Open Library/);
  assert.doesNotMatch(draftEditorSource, /Rewrite|Expand|Shorten|Change Tone|Generate Again|Variants/);
});
