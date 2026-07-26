import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('sidebar navigation has breathing room before the first item', () => {
  assert.match(appSource, /aria-label="App navigation"/);
  assert.match(appSource, /flex-1 space-y-1 px-3 pt-6/);
});

test('desktop sidebar can collapse to icon-only mode and expand main content', () => {
  assert.match(appSource, /sidebarCollapsed/);
  assert.match(appSource, /setSidebarCollapsed/);
  assert.match(appSource, /aria-label=\{sidebarCollapsed \? "Expand sidebar" : "Collapse sidebar"\}/);
  assert.match(appSource, /sidebarCollapsed \? "lg:pl-20" : "lg:pl-72"/);
  assert.match(appSource, /sidebarCollapsed \? "lg:w-20" : "lg:w-72"/);
  assert.match(appSource, /sidebarCollapsed \? "justify-center px-2" : "gap-3 px-3"/);
  assert.match(appSource, /<span className=\{sidebarCollapsed \? "sr-only" : ""\}>\{label\}<\/span>/);
});
