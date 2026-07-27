import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('public landing is a single calm doorway with one hero action', () => {
  assert.match(appSource, /function TransformationPlaceholder/);
  assert.match(appSource, /LaunchRelay turns shipped product work into source-grounded product education\./);
  assert.match(appSource, /Source activity → reviewed moment → draft/);
  assert.match(appSource, /Start with your product/);
  assert.match(appSource, /LaunchRelay helps you review meaningful improvements before drafting\./);
});

test('public landing removes product-tour sections and sample workspace CTA', () => {
  assert.doesNotMatch(appSource, /const publicNav = \[/);
  assert.doesNotMatch(appSource, /Explore a sample workspace/);
  assert.doesNotMatch(appSource, /<SourceToStoryPreview \/>/);
  assert.doesNotMatch(appSource, /<PillarCard title="Launch Detection"/);
  assert.doesNotMatch(appSource, /<PillarCard title="1\. Normalize source activity"/);
  assert.doesNotMatch(appSource, /<PillarCard title="Devrel"/);
});
