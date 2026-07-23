import { createGitHubActivityItemsFromPayloads, parseGitHubRepoInput } from './launchrelay-core.js';

const GITHUB_API = 'https://api.github.com';

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
  const githubPayloads = injectedPayloads || await fetchPublicGitHubPayloads(repoOwner, repoName);
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
    activityItems,
  };
}

async function fetchPublicGitHubPayloads(owner, repo) {
  const [repoResponse, pullsResponse, commitsResponse, releasesResponse] = await Promise.all([
    githubJson(`/repos/${owner}/${repo}`),
    githubJson(`/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=20`),
    githubJson(`/repos/${owner}/${repo}/commits?per_page=20`),
    githubJson(`/repos/${owner}/${repo}/releases?per_page=10`),
  ]);

  return {
    repo: repoResponse.data,
    pulls: pullsResponse.data,
    commits: commitsResponse.data,
    releases: releasesResponse.data,
    rateLimit: repoResponse.rateLimit || pullsResponse.rateLimit || commitsResponse.rateLimit || releasesResponse.rateLimit || null,
  };
}

async function githubJson(path) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'LaunchRelay-public-import',
    },
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
      : `GitHub API request failed with ${response.status}.`;
    throw new Error(`${detail} ${body.slice(0, 240)}`);
  }

  return { data: await response.json(), rateLimit };
}
