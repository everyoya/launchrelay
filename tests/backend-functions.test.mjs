import test from 'node:test';
import assert from 'node:assert/strict';

import { handler as normalizeActivity } from '../base44/functions/normalizeActivity/entry.js';
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
