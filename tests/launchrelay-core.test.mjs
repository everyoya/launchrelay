import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseGitHubRepoInput,
  createManualActivityItemsFromText,
  generateDeterministicLaunchClusters,
  generateDeterministicOpportunities,
} from '../src/core/launchrelay-core.mjs';

test('parseGitHubRepoInput accepts full GitHub repo URLs', () => {
  assert.deepEqual(parseGitHubRepoInput('https://github.com/base44/launchrelay'), {
    repoOwner: 'base44',
    repoName: 'launchrelay',
    repoUrl: 'https://github.com/base44/launchrelay',
    isValid: true,
    error: null,
  });
});

test('parseGitHubRepoInput accepts owner/repo shorthand', () => {
  assert.deepEqual(parseGitHubRepoInput('everyoya/launchrelay'), {
    repoOwner: 'everyoya',
    repoName: 'launchrelay',
    repoUrl: 'https://github.com/everyoya/launchrelay',
    isValid: true,
    error: null,
  });
});

test('parseGitHubRepoInput rejects unsupported input with clear error', () => {
  const result = parseGitHubRepoInput('not a repo');
  assert.equal(result.isValid, false);
  assert.match(result.error, /GitHub repo/i);
});

test('createManualActivityItemsFromText turns labeled lines into normalized activity items', () => {
  const items = createManualActivityItemsFromText(`PR: Added onboarding checklist\nCommit: fixed signup redirect\nNote: users were confused after account creation`, {
    workspaceId: 'workspace_1',
    importedAt: '2026-07-23T10:00:00.000Z',
  });

  assert.equal(items.length, 3);
  assert.equal(items[0].source_type, 'manual_release_note');
  assert.equal(items[1].source_type, 'manual_note');
  assert.equal(items[2].impact_hint, 'Possible onboarding/user activation impact.');
  assert.equal(items[0].workspace_id, 'workspace_1');
});

test('generateDeterministicLaunchClusters creates source-linked launch clusters with user value', () => {
  const activities = [
    { id: 'a1', title: 'Added onboarding checklist', body: '', impact_hint: 'Possible onboarding/user activation impact.' },
    { id: 'a2', title: 'Fixed signup redirect', body: '', impact_hint: 'Possible onboarding/user activation impact.' },
    { id: 'a3', title: 'Updated welcome screen', body: '', impact_hint: 'Possible onboarding/user activation impact.' },
  ];

  const clusters = generateDeterministicLaunchClusters(activities, {
    workspaceId: 'workspace_1',
    targetAudience: 'Product educators',
  });

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].workspace_id, 'workspace_1');
  assert.deepEqual(clusters[0].activity_item_ids, ['a1', 'a2', 'a3']);
  assert.equal(clusters[0].status, 'suggested');
  assert.match(clusters[0].why_it_matters, /users/i);
});

test('generateDeterministicOpportunities creates five useful follow-up ideas from one cluster', () => {
  const opportunities = generateDeterministicOpportunities({
    id: 'cluster_1',
    workspace_id: 'workspace_1',
    title: 'Faster onboarding for new teams',
    user_value: 'Less setup confusion after signup',
  });

  assert.equal(opportunities.length, 5);
  assert.equal(opportunities[0].workspace_id, 'workspace_1');
  assert.equal(opportunities[0].launch_cluster_id, 'cluster_1');
  assert.ok(opportunities.every((item) => item.why_it_matters.length > 20));
});
