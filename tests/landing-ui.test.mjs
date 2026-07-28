import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('public landing uses the Design Option hero and header actions', () => {
  assert.match(appSource, /Landing page navigation/);
  assert.match(appSource, /Product<\/button>/);
  assert.match(appSource, /How It Works<\/button>/);
  assert.match(appSource, /Pricing<\/button>/);
  assert.match(appSource, /Docs<\/button>/);
  assert.match(appSource, /You built a great app\. We help users understand it\./);
  assert.match(appSource, /LaunchRelay discovers the Highlights hidden in your shipped work/);
  assert.match(appSource, /Get Started/);
  assert.match(appSource, /See How It Works/);
});

test('public landing includes the Design Option page narrative sections', () => {
  assert.match(appSource, /Shipping is only half the job\./);
  assert.match(appSource, /Most of them never become stories\./);
  assert.match(appSource, /How LaunchRelay works/);
  assert.match(appSource, /Connect your work/);
  assert.match(appSource, /Discover Highlights/);
  assert.match(appSource, /Review and publish/);
  assert.match(appSource, /See the workflow, not a fake dashboard\./);
  assert.match(appSource, /Why LaunchRelay/);
  assert.match(appSource, /Never miss important work/);
  assert.match(appSource, /Stay grounded/);
  assert.match(appSource, /Keep your team aligned/);
  assert.match(appSource, /Great products deserve great communication\./);
  assert.match(appSource, /Everything you need to know about LaunchRelay's source-grounded workflow\./);
  assert.match(appSource, /ChevronDown/);
  assert.doesNotMatch(appSource, /Frequently Asked Questions/);
  assert.match(appSource, /summary className="flex min-h-\[80px\].*font-display text-2xl font-bold tracking-\[-0\.035em\] text-\[var\(--lr-text\)\]/);
});

test('public landing uses product-led UI preview instead of generic placeholders', () => {
  assert.match(appSource, /function LandingVisualPlaceholder/);
  assert.match(appSource, /Hero product preview placeholder/);
  assert.match(appSource, /Large LaunchRelay screenshot placeholder/);
  assert.match(appSource, /Launch-worthy highlights/);
  assert.match(appSource, /Review evidence before writing/);
  assert.match(appSource, /Proof card/);
  assert.doesNotMatch(appSource, /function TransformationPlaceholder/);
  assert.doesNotMatch(appSource, /Future visual/);
  assert.doesNotMatch(appSource, /Real LaunchRelay screenshot coming soon\./);
  assert.doesNotMatch(appSource, /Source activity → reviewed moment → draft/);
});

test('public landing applies Design Option visual system tokens', () => {
  assert.match(cssSource, /Space\+Grotesk/);
  assert.match(cssSource, /--lr-canvas: #F8FBFF/);
  assert.match(cssSource, /--lr-orange: #2451D1/);
  assert.match(cssSource, /--lr-blue-tint: #EEF4FF/);
  assert.match(cssSource, /font-family: "Space Grotesk"/);
});

test('public landing removes filler chips and uses text-only section eyebrows', () => {
  assert.doesNotMatch(appSource, /Product-led launch communication/);
  assert.doesNotMatch(appSource, /3<\/span> source types/);
  assert.doesNotMatch(appSource, /Works with the tools your team already uses\./);
  assert.doesNotMatch(appSource, /\["GitHub", "Linear", "Notion", "Jira", "Manual Uploads"\]/);
  assert.match(appSource, /text-xs font-bold uppercase tracking-\[0\.18em\] text-\[var\(--lr-blue-strong\)\]">The problem/);
  assert.match(appSource, /text-xs font-bold uppercase tracking-\[0\.18em\] text-\[var\(--lr-blue-strong\)\]">How LaunchRelay works/);
  assert.doesNotMatch(appSource, /flex h-11 w-11 items-center justify-center rounded-\[14px\] bg-\[var\(--lr-blue-tint\)\]/);
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
