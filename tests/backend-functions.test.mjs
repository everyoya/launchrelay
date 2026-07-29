import test from 'node:test';
import assert from 'node:assert/strict';

import { handler as normalizeActivity } from '../base44/functions/normalizeActivity/entry.js';
import { handler as importPublicGitHubActivity } from '../base44/functions/importPublicGitHubActivity/entry.js';
import { handler as importConnectedGoogleDriveActivity } from '../base44/functions/importConnectedGoogleDriveActivity/entry.js';
import { handler as detectLaunchMoments } from '../base44/functions/detectLaunchMoments/entry.js';
import { handler as expandOpportunities } from '../base44/functions/expandOpportunities/entry.js';
import { handler as runUserAiGeneration } from '../base44/functions/runUserAiGeneration/entry.js';

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
      repo: { description: 'Product Story test repo', default_branch: 'main', stargazers_count: 1, open_issues_count: 0 },
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

test('importPublicGitHubActivity uses backend GitHub token secret for server fetches', async () => {
  const originalFetch = globalThis.fetch;
  const tokenEnvName = ['LAUNCHRELAY', 'GITHUB', 'TOKEN'].join('_');
  const originalToken = process.env[tokenEnvName];
  const calls = [];

  process.env[tokenEnvName] = 'fixture_token';
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, headers: options.headers });
    const path = String(url).replace('https://api.github.com', '');
    const payload = path.includes('/pulls')
      ? [{ number: 3, title: 'Add guided source import', body: 'helps onboarding', html_url: 'https://github.com/everyoya/launchrelay/pull/3', user: { login: 'everyoya' }, updated_at: '2026-07-23T00:00:00Z' }]
      : path.includes('/commits') || path.includes('/releases')
        ? []
        : { description: 'Product Story test repo', default_branch: 'main', stargazers_count: 1, open_issues_count: 0 };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999' },
    });
  };

  try {
    const result = await importPublicGitHubActivity({
      workspaceId: 'workspace_1',
      repoInput: 'everyoya/launchrelay',
      importedAt: '2026-07-23T00:00:00.000Z',
    });

    assert.equal(result.ok, true);
    assert.equal(result.authMode, 'backend_secret_token');
    assert.equal(result.importSummary.normalized, 1);
    assert.equal(calls.length, 4);
    assert.ok(calls.every((call) => call.headers.Authorization === 'Bearer fixture_token'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env[tokenEnvName];
    else process.env[tokenEnvName] = originalToken;
  }
});

test('importPublicGitHubActivity can use a connected app-user GitHub token without backend owner secret', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers || {} });
    const path = String(url).replace('https://api.github.com', '');
    const payload = path.includes('/pulls') || path.includes('/commits') || path.includes('/releases')
      ? []
      : { description: 'Private repo', default_branch: 'main', stargazers_count: 0, open_issues_count: 0 };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await importPublicGitHubActivity({
      workspaceId: 'workspace_1',
      repoInput: 'private/repo',
      githubAccessToken: 'fixture-user-token',
    });
    assert.equal(result.ok, true);
    assert.equal(result.authMode, 'app_user_connector_token');
    assert.ok(calls.every((call) => call.headers.Authorization === 'Bearer fixture-user-token'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('importConnectedGoogleDriveActivity normalizes Google Drive docs into activity items', async () => {
  const result = await importConnectedGoogleDriveActivity({
    workspaceId: 'workspace_1',
    sourceConnectionId: 'connection_drive',
    drivePayloads: {
      files: [
        {
          id: 'doc_1',
          name: 'Release notes draft',
          mimeType: 'application/vnd.google-apps.document',
          modifiedTime: '2026-07-28T12:00:00.000Z',
          webViewLink: 'https://docs.google.com/document/d/doc_1',
          text: 'Added onboarding guardrails and clearer launch moment review copy.',
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, 'google_drive');
  assert.equal(result.activityItems.length, 1);
  assert.equal(result.activityItems[0].source_type, 'google_drive_doc');
  assert.match(result.activityItems[0].body, /onboarding guardrails/);
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

test('runUserAiGeneration refuses to use app-owned AI credentials when user key is missing', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called without a user API key');
  };

  try {
    const result = await runUserAiGeneration({
      task: 'draft',
      provider: 'openai',
      model: 'gpt-4o-mini',
      workspace: { name: 'Product Story' },
      cluster: { title: 'Faster onboarding' },
      sources: [],
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'user_ai_key_required');
    assert.equal(result.billedTo, 'none');
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runUserAiGeneration calls OpenAI with the user supplied key and structured JSON prompt', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            title: 'Faster onboarding for new teams',
            body: 'Source-grounded draft body.',
            source_summary: 'Generated from 2 source receipts.',
          }),
        },
      }],
      usage: { total_tokens: 321 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await runUserAiGeneration({
      task: 'draft',
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'user-owned-openai-key',
      workspace: { name: 'Product Story', target_audience: 'Product educators' },
      cluster: { title: 'Faster onboarding', user_value: 'Less setup friction.' },
      sources: [{ id: 'activity_1', title: 'PR: Added onboarding checklist' }],
      maxOutputTokens: 1200,
    });

    assert.equal(result.ok, true);
    assert.equal(result.billedTo, 'user_provider_key');
    assert.equal(result.provider, 'openai');
    assert.equal(result.output.title, 'Faster onboarding for new teams');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer user-owned-openai-key');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.response_format.type, 'json_object');
    assert.match(body.messages[1].content, /PR: Added onboarding checklist/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
