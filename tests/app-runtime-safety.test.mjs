import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default || traverseModule;
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const ast = parse(appSource, {
  sourceType: 'module',
  plugins: ['jsx', 'importMeta'],
});

const allowedGlobals = new Set([
  'Array', 'Boolean', 'Date', 'Error', 'JSON', 'Math', 'Number', 'Object', 'Promise', 'Set', 'String',
  'URL', 'URLSearchParams', 'console', 'decodeURIComponent', 'document', 'encodeURIComponent', 'fetch',
  'localStorage', 'sessionStorage', 'setTimeout', 'undefined', 'window',
]);

function isGlobalAllowed(name) {
  return allowedGlobals.has(name);
}

test('App.jsx has no unbound runtime identifiers', () => {
  const unbound = new Set();
  traverse(ast, {
    Identifier(path) {
      if (!path.isReferencedIdentifier()) return;
      const name = path.node.name;
      if (isGlobalAllowed(name)) return;
      if (!path.scope.hasBinding(name)) {
        unbound.add(`${name} at line ${path.node.loc?.start?.line || '?'}`);
      }
    },
    JSXOpeningElement(path) {
      const nameNode = path.node.name;
      if (nameNode.type !== 'JSXIdentifier') return;
      const name = nameNode.name;
      if (!/^[A-Z]/.test(name)) return;
      if (isGlobalAllowed(name)) return;
      if (!path.scope.hasBinding(name)) {
        unbound.add(`${name} JSX at line ${nameNode.loc?.start?.line || '?'}`);
      }
    },
  });
  assert.deepEqual([...unbound].sort(), []);
});

test('V2 primary tabs do not route to removed Library or Settings states', () => {
  assert.doesNotMatch(appSource, /setLibraryTab\("Ready"\)/);
  assert.doesNotMatch(appSource, /setLibraryTab\("Opportunities"\)/);
  assert.doesNotMatch(appSource, /setSettingsTab\(/);
  assert.doesNotMatch(appSource, /settingsTab/);
});

test('Library and Settings components avoid known blank-screen-prone patterns', () => {
  assert.match(appSource, /function formatRelativeDate\(/);
  assert.match(appSource, /function SettingsRow\(/);
  assert.match(appSource, /function SuggestedHighlightCard\(/);
  assert.doesNotMatch(appSource, /<Badge[^>]*className=/);
});
