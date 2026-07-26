import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('sources page is reframed as a source setup workspace with a summary rail', () => {
  assert.match(appSource, /function SourceSetupPath/);
  assert.match(appSource, /function SourceSummaryRail/);
  assert.match(appSource, /Source setup/);
  assert.match(appSource, /Sources review pass later/);
  assert.doesNotMatch(appSource, /title="Structured activity records"/);
});

test('product context form uses essential and voice zones with a why-this-matters panel', () => {
  assert.match(appSource, /Essential context/);
  assert.match(appSource, /Voice and positioning/);
  assert.match(appSource, /Why this matters/);
});

test('connections keeps import primary and only shows detect after source records exist', () => {
  assert.match(appSource, /Source connection card/);
  assert.match(appSource, /Import timeline/);
  assert.match(appSource, /activities\.length > 0 &&/);
  assert.doesNotMatch(appSource, /\$0/);
});

test('manual notes support separate note blocks instead of one pasted blob', () => {
  assert.match(appSource, /manualNotes/);
  assert.match(appSource, /Add another note/);
  assert.match(appSource, /NoteBlock/);
  assert.match(appSource, /compileManualNotes/);
});

test('source receipts are available as compact tooltip-style objects', () => {
  assert.match(appSource, /SourceReceiptTooltip/);
  assert.match(appSource, /View receipt/);
  assert.match(appSource, /group-hover:visible/);
});
