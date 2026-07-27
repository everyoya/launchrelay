import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('public landing uses the V2 narrative hero and header actions', () => {
  assert.match(appSource, /Landing page navigation/);
  assert.match(appSource, /Product<\/button>/);
  assert.match(appSource, /How It Works<\/button>/);
  assert.match(appSource, /Pricing<\/button>/);
  assert.match(appSource, /Docs<\/button>/);
  assert.match(appSource, /Your team ships great work\. Make sure people understand it\./);
  assert.match(appSource, /LaunchRelay discovers the Highlights hidden in your shipped work/);
  assert.match(appSource, /Get Started/);
  assert.match(appSource, /See How It Works/);
});

test('public landing includes the V2 page narrative sections', () => {
  assert.match(appSource, /Works with the tools your team already uses\./);
  assert.match(appSource, /Shipping is only half the job\./);
  assert.match(appSource, /Most of them never become stories\./);
  assert.match(appSource, /How LaunchRelay works/);
  assert.match(appSource, /Connect your work/);
  assert.match(appSource, /Discover Highlights/);
  assert.match(appSource, /Review and publish/);
  assert.match(appSource, /Why LaunchRelay/);
  assert.match(appSource, /Never miss important work/);
  assert.match(appSource, /Stay grounded/);
  assert.match(appSource, /Keep your team aligned/);
  assert.match(appSource, /Great products deserve great communication\./);
});

test('public landing uses real-screenshot placeholders until final visuals arrive', () => {
  assert.match(appSource, /function LandingVisualPlaceholder/);
  assert.match(appSource, /Hero product preview placeholder/);
  assert.match(appSource, /Large LaunchRelay screenshot placeholder/);
  assert.match(appSource, /Real LaunchRelay screenshot coming soon\./);
  assert.match(appSource, /This space is reserved for the actual product preview Yotam will provide\./);
  assert.doesNotMatch(appSource, /function TransformationPlaceholder/);
  assert.doesNotMatch(appSource, /Future visual/);
  assert.doesNotMatch(appSource, /Source activity → reviewed moment → draft/);
});

test('public landing avoids old validation copy and generic AI cliches', () => {
  assert.doesNotMatch(appSource, /LaunchRelay turns shipped product work into source-grounded product education\./);
  assert.doesNotMatch(appSource, /Tell LaunchRelay what product this is, add source activity/);
  assert.doesNotMatch(appSource, /Start with your product/);
  assert.doesNotMatch(appSource, /AI-powered/);
  assert.doesNotMatch(appSource, /Supercharge/);
  assert.doesNotMatch(appSource, /10x/);
  assert.doesNotMatch(appSource, /Next generation/);
});
