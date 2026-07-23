import test from 'node:test';
import assert from 'node:assert/strict';

import { handler as normalizeActivity } from '../base44/functions/normalizeActivity/entry.js';
import { handler as importPublicGitHubActivity } from '../base44/functions/importPublicGitHubActivity/entry.js';
import { handler as detectLaunchMoments } from '../base44/functions/detectLaunchMoments/entry.js';
import { handler as expandOpportunities } from '../base44/functions/expandOpportunities/entry.js';

test('normalizeActivity backend function returns normalized activity records', async () => {
  const result = await normalizeActivity({
    workspaceId: 'workspace_1',
    activityText: 'PR: Added onboarding checklist\nCommit: fixed signup redirect after account creation',
    importedAt: '2026-07-23T00:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.functionName, 'normalizeActivity');
  assert.equal(result.count, 2);
  assert.equal(result.activityItems[0].workspace_id, 'workspace_1');
  assert.deepEqual(result.activityItems[0].tags, ['onboarding']);
});

test('importPublicGitHubActivity backend function normalizes injected GitHub payloads', async () => {
  const result = await importPublicGitHubActivity({
    workspaceId: 'workspace_1',
    sourceConnectionId: 'connection_1',
    repoInput: 'everyoya/launchrelay',
    importedAt: '2026-07-23T00:00:00.000Z',
    githubPayloads: {
      repo: { description: 'LaunchRelay test repo', default_branch: 'main', stargazers_count: 1, open_issues_count: 0 },
      pulls: [{ number: 1, title: 'Add onboarding import flow', body: '', html_url: 'https://github.com/everyoya/launchrelay/pull/1', user: { login: 'everyoya' }, updated_at: '2026-07-23T00:00:00Z' }],
      commits: [{ sha: 'def456', html_url: 'https://github.com/everyoya/launchrelay/commit/def456', commit: { message: 'wire backend functions', author: { name: 'Yotam', date: '2026-07-23T01:00:00Z' } }, author: { login: 'everyoya' } }],
      releases: [],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.repo.owner, 'everyoya');
  assert.equal(result.repo.name, 'launchrelay');
  assert.equal(result.importSummary.normalized, 2);
  assert.deepEqual(result.activityItems.map((item) => item.source_type), ['github_pr', 'github_commit']);
});

test('detectLaunchMoments backend function creates launch clusters from normalized activity', async () => {
  const normalized = await normalizeActivity({
    workspaceId: 'workspace_1',
    activityText: 'PR: Added onboarding checklist\nCommit: fixed signup redirect after account creation\nFeature: added welcome screen',
    importedAt: '2026-07-23T00:00:00.000Z',
    idPrefix: 'activity',
  });

  const result = await detectLaunchMoments({
    workspaceId: 'workspace_1',
    activityItems: normalized.activityItems,
    targetAudience: 'Founders and product teams',
  });

  assert.equal(result.ok, true);
  assert.equal(result.functionName, 'detectLaunchMoments');
  assert.equal(result.count, 1);
  assert.equal(result.launchClusters[0].title, 'Faster onboarding for new teams');
  assert.equal(result.launchClusters[0].confidence_label, 'high');
});

test('expandOpportunities backend function creates five follow-up opportunities', async () => {
  const result = await expandOpportunities({
    workspaceId: 'workspace_1',
    cluster: {
      id: 'cluster_1',
      workspace_id: 'workspace_1',
      title: 'Faster onboarding for new teams',
      user_value: 'Less setup friction for new users.',
      audience: 'Founders and product teams',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.functionName, 'expandOpportunities');
  assert.equal(result.count, 5);
  assert.deepEqual(result.opportunities.map((item) => item.format), ['tutorial', 'faq', 'docs', 'use_case', 'enablement']);
});
