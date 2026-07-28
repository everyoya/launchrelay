import { createGitHubActivityItemsFromPayloads, parseGitHubRepoInput } from './launchrelay-core.js';

const GITHUB_API = 'https://api.github.com';
const GITHUB_SECRET_NAMES = ['LAUNCHRELAY_GITHUB_TOKEN', 'GITHUB_TOKEN'];

export async function handler(payload = {}) {
  const repoInput = payload.repoInput || payload.repoUrl || '';
  const workspaceId = payload.workspaceId || null;
  const sourceConnectionId = payload.sourceConnectionId || null;
  const importedAt = payload.importedAt || new Date().toISOString();
  const parsed = parseGitHubRepoInput(repoInput);

  if (!parsed.isValid) {
    return {
      ok: false,
      error: parsed.error,
      activityItems: [],
    };
  }

  const { repoOwner, repoName, repoUrl } = parsed;
  const injectedPayloads = payload.githubPayloads;
  const githubAuth = payload.githubAccessToken
    ? { mode: 'app_user_connector_token', token: payload.githubAccessToken }
    : getGitHubAuth();
  const githubPayloads = injectedPayloads || await fetchPublicGitHubPayloads(repoOwner, repoName, githubAuth);
  const activityItems = createGitHubActivityItemsFromPayloads(githubPayloads, {
    workspaceId,
    sourceConnectionId,
    repoOwner,
    repoName,
    importedAt,
  });

  return {
    ok: true,
    repo: {
      owner: repoOwner,
      name: repoName,
      url: repoUrl,
      description: githubPayloads.repo?.description || '',
      default_branch: githubPayloads.repo?.default_branch || null,
      stars: githubPayloads.repo?.stargazers_count || 0,
      open_issues: githubPayloads.repo?.open_issues_count || 0,
    },
    importSummary: {
      prs: Array.isArray(githubPayloads.pulls) ? githubPayloads.pulls.length : 0,
      commits: Array.isArray(githubPayloads.commits) ? githubPayloads.commits.length : 0,
      releases: Array.isArray(githubPayloads.releases) ? githubPayloads.releases.length : 0,
      normalized: activityItems.length,
    },
    rateLimit: githubPayloads.rateLimit || null,
    authMode: injectedPayloads ? 'injected_test_payload' : githubAuth.mode,
    activityItems,
  };
}

export async function handleRequest(req) {
  try {
    const payload = await req.json().catch(() => ({}));
    let githubAccessToken = payload.githubAccessToken || null;
    if (!githubAccessToken && payload.githubConnectorId) {
      githubAccessToken = await getCurrentAppUserAccessToken(req, payload.githubConnectorId);
    }
    return Response.json(await handler({ ...payload, githubAccessToken }));
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

if (globalThis.Deno?.serve) {
  Deno.serve(handleRequest);
}

async function fetchPublicGitHubPayloads(owner, repo, githubAuth = getGitHubAuth()) {
  const [repoResponse, pullsResponse, commitsResponse, releasesResponse] = await Promise.all([
    githubJson(`/repos/${owner}/${repo}`, githubAuth),
    githubJson(`/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=20`, githubAuth),
    githubJson(`/repos/${owner}/${repo}/commits?per_page=20`, githubAuth),
    githubJson(`/repos/${owner}/${repo}/releases?per_page=10`, githubAuth),
  ]);

  return {
    repo: repoResponse.data,
    pulls: pullsResponse.data,
    commits: commitsResponse.data,
    releases: releasesResponse.data,
    rateLimit: repoResponse.rateLimit || pullsResponse.rateLimit || commitsResponse.rateLimit || releasesResponse.rateLimit || null,
  };
}

async function githubJson(path, githubAuth = getGitHubAuth()) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'LaunchRelay-public-import',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (githubAuth.token) {
    headers.Authorization = `Bearer ${githubAuth.token}`;
  }

  const response = await fetch(`${GITHUB_API}${path}`, {
    headers,
  });

  const rateLimit = {
    limit: response.headers.get('x-ratelimit-limit'),
    remaining: response.headers.get('x-ratelimit-remaining'),
    reset: response.headers.get('x-ratelimit-reset'),
  };

  if (!response.ok) {
    const body = await response.text();
    const detail = response.status === 404
      ? 'Public GitHub repo not found. Private repos need a later OAuth connection.'
      : response.status === 403 && githubAuth.mode === 'unauthenticated'
        ? 'GitHub API request was rate-limited from the server. Configure a backend GitHub token secret for reliable server-side import.'
      : `GitHub API request failed with ${response.status}.`;
    throw new Error(`${detail} ${body.slice(0, 240)}`);
  }

  return { data: await response.json(), rateLimit };
}

function getGitHubAuth() {
  const token = readSecret(GITHUB_SECRET_NAMES);
  return token
    ? { mode: 'backend_secret_token', token }
    : { mode: 'unauthenticated', token: null };
}

function readSecret(names) {
  for (const name of names) {
    const denoValue = globalThis.Deno?.env?.get?.(name);
    if (denoValue) return denoValue;
    const nodeValue = globalThis.process?.env?.[name];
    if (nodeValue) return nodeValue;
  }
  return null;
}

async function getCurrentAppUserAccessToken(req, connectorId) {
  const sdk = await import('npm:@base44/sdk');
  const base44 = sdk.createClientFromRequest(req);
  const connection = await base44.asServiceRole.connectors.getCurrentAppUserConnection(connectorId);
  return connection?.accessToken || connection?.access_token || null;
}
