import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseGitHubRepoInput,
  createGitHubActivityItemsFromPayloads,
  createManualActivityItemsFromText,
  generateDeterministicLaunchClusters,
  generateDeterministicOpportunities,
} from '../src/core/launchrelay-core.mjs';
import {
  applyContentGuardrails,
  createGuardrailedDraft,
  evaluateContentReadiness,
  findGuardrailViolations,
  selectPsychologicalDriver,
} from '../src/core/content-guardrails.mjs';

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

test('createGitHubActivityItemsFromPayloads normalizes PRs, commits, and releases with dedupe keys', () => {
  const items = createGitHubActivityItemsFromPayloads({
    pulls: [{ number: 12, title: 'Improve onboarding setup', body: 'welcome flow', html_url: 'https://github.com/everyoya/launchrelay/pull/12', user: { login: 'everyoya' }, updated_at: '2026-07-23T00:00:00Z' }],
    commits: [{ sha: 'abc123', html_url: 'https://github.com/everyoya/launchrelay/commit/abc123', commit: { message: 'fix signup redirect after account creation', author: { name: 'Yotam', date: '2026-07-23T01:00:00Z' } }, author: { login: 'everyoya' } }],
    releases: [{ id: 7, tag_name: 'v0.1.0', name: 'LaunchRelay v0.1.0', body: 'First release', html_url: 'https://github.com/everyoya/launchrelay/releases/tag/v0.1.0', author: { login: 'everyoya' }, published_at: '2026-07-23T02:00:00Z' }],
  }, {
    workspaceId: 'workspace_1',
    sourceConnectionId: 'connection_1',
    repoOwner: 'everyoya',
    repoName: 'launchrelay',
    importedAt: '2026-07-23T03:00:00.000Z',
  });

  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.source_type), ['github_pr', 'github_commit', 'manual_release_note']);
  assert.ok(items.every((item) => item.dedupe_key.startsWith('github:everyoya/launchrelay:')));
  assert.equal(items[0].workspace_id, 'workspace_1');
  assert.equal(items[0].source_connection_id, 'connection_1');
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

test('applyContentGuardrails strips common AI slop phrases', () => {
  const cleaned = applyContentGuardrails('Teams can leverage onboarding changes instead of using a game-changing, seamless workflow.');

  assert.doesNotMatch(cleaned, /game-changing|seamless|leverage/i);
  assert.match(cleaned, /use onboarding/i);
});

test('evaluateContentReadiness asks interview questions when critical context is missing', () => {
  const readiness = evaluateContentReadiness({ cluster: {}, workspace: {}, sources: [] });

  assert.equal(readiness.ready, false);
  assert.ok(readiness.missing.includes('source_evidence'));
  assert.equal(readiness.interview_questions.length, 2);
});

test('selectPsychologicalDriver maps reliability work to safety', () => {
  const driver = selectPsychologicalDriver('fix backend fallback error and improve reliability');

  assert.equal(driver.label, 'Safety & Compliance');
});

test('createGuardrailedDraft creates source-grounded draft metadata without banned phrases', () => {
  const draft = createGuardrailedDraft({
    workspace: { target_audience: 'Product educators' },
    cluster: {
      title: 'Faster onboarding for new teams',
      why_it_matters: 'These changes help users get started with less confusion.',
      user_value: 'Less setup friction for new users.',
      audience: 'New workspace admins',
    },
    sources: [{ title: 'Added onboarding checklist', body: 'welcome flow' }],
  });

  assert.match(draft.body, /Source trail/);
  assert.equal(draft.template_label, 'Feature Launch Story');
  assert.deepEqual(findGuardrailViolations(draft.body), []);
});
