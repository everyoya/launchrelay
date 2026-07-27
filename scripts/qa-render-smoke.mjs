import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

const sampleCluster = {
  id: 'cluster_1',
  title: 'Faster onboarding for new teams',
  why_it_matters: 'New users understand the next step faster.',
  activity_item_ids: ['activity_1'],
};
const sampleActivity = { id: 'activity_1', title: 'Added onboarding checklist' };
const sampleDraft = {
  id: 'draft_1',
  title: 'LaunchRelay improves onboarding guidance',
  body: 'Draft body',
  status: 'published',
  updated_at: new Date().toISOString(),
};

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const mod = await server.ssrLoadModule('/src/App.jsx');
  const { LibraryScreen, SettingsScreen } = mod.__qa;
  const commonLibraryProps = {
    setLibraryTab: () => {},
    draftRows: [sampleDraft],
    clusters: [sampleCluster],
    activities: [sampleActivity],
    onReview: () => {},
    onDraft: () => {},
    onWorkspace: () => {},
    librarySearch: '',
    setLibrarySearch: () => {},
  };

  for (const libraryTab of ['Drafts', 'Suggested Highlights', 'Published', 'Ready']) {
    const html = renderToString(React.createElement(LibraryScreen, { ...commonLibraryProps, libraryTab }));
    assert.match(html, /Library/);
    assert.doesNotMatch(html, /ReferenceError|TypeError/);
  }

  const settingsHtml = renderToString(React.createElement(SettingsScreen, {
    workspace: { name: 'LaunchRelay' },
    currentUser: { email: 'qa@example.com' },
    demoMode: false,
    onLogout: () => {},
    githubRepoInput: 'everyoya/launchrelay',
    activities: [sampleActivity],
  }));
  assert.match(settingsHtml, /Settings/);
  assert.match(settingsHtml, /Profile|Connected Sources|AI Preferences/);
  console.log('render smoke passed');
} finally {
  await server.close();
}

process.exit(0);
