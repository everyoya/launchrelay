const USER_VALUE_HINTS = [
  {
    pattern: /onboarding|setup|signup|welcome|activation|account creation/i,
    impact: 'Possible onboarding/user activation impact.',
    clusterTitle: 'Faster onboarding for new teams',
    why: 'These changes help users get started with less confusion and reach value faster.',
    userValue: 'Less setup friction for new users.',
  },
  {
    pattern: /dashboard|report|export|analytics|insight/i,
    impact: 'Possible reporting/workflow visibility impact.',
    clusterTitle: 'Clearer product visibility and reporting',
    why: 'These changes help users understand product activity and make decisions faster.',
    userValue: 'More visible progress and easier reporting.',
  },
  {
    pattern: /integration|api|webhook|sync|connect/i,
    impact: 'Possible integration/workflow automation impact.',
    clusterTitle: 'Smoother connected workflow',
    why: 'These changes make it easier to connect LaunchRelay with the tools teams already use.',
    userValue: 'Less manual workflow coordination.',
  },
  {
    pattern: /fix|bug|error|reliability|crash/i,
    impact: 'Possible reliability/friction reduction impact.',
    clusterTitle: 'More reliable product experience',
    why: 'These changes remove friction and make the product experience more dependable.',
    userValue: 'Fewer interruptions and smoother usage.',
  },
];

export function parseGitHubRepoInput(repoInput) {
  const input = String(repoInput || '').trim().replace(/\.git$/, '');

  const urlMatch = input.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)\/?$/i);
  const shorthandMatch = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  const match = urlMatch || shorthandMatch;

  if (!match) {
    return {
      repoOwner: null,
      repoName: null,
      repoUrl: null,
      isValid: false,
      error: 'Please enter a valid GitHub repo URL or owner/repo shorthand.',
    };
  }

  const repoOwner = match[1];
  const repoName = match[2];

  return {
    repoOwner,
    repoName,
    repoUrl: `https://github.com/${repoOwner}/${repoName}`,
    isValid: true,
    error: null,
  };
}

export function createManualActivityItemsFromText(pastedText, options = {}) {
  const importedAt = options.importedAt || new Date().toISOString();
  const workspaceId = options.workspaceId || null;
  const lines = String(pastedText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sourceLines = lines.length ? lines : [String(pastedText || '').trim()].filter(Boolean);

  return sourceLines.map((line, index) => {
    const { label, title } = splitLabel(line);
    const textForImpact = `${label} ${title}`;

    return {
      id: options.idPrefix ? `${options.idPrefix}_${index + 1}` : undefined,
      workspace_id: workspaceId,
      source_connection_id: options.sourceConnectionId || null,
      source_type: sourceTypeFromLabel(label),
      source_id: null,
      source_url: null,
      title,
      body: line,
      author: options.author || 'manual',
      occurred_at: options.occurredAt || importedAt,
      imported_at: importedAt,
      tags: inferTags(textForImpact),
      product_area: inferProductArea(textForImpact),
      impact_hint: inferImpactHint(textForImpact),
      status: 'active',
      raw_payload: line,
      dedupe_key: null,
    };
  });
}

export function generateDeterministicLaunchClusters(activityItems, options = {}) {
  const items = Array.isArray(activityItems) ? activityItems.filter(Boolean) : [];
  if (!items.length) return [];

  const scoredThemes = USER_VALUE_HINTS.map((theme) => {
    const matches = items.filter((item) => theme.pattern.test(`${item.title || ''} ${item.body || ''} ${item.impact_hint || ''}`));
    return { theme, matches };
  }).sort((a, b) => b.matches.length - a.matches.length);

  const best = scoredThemes.find((theme) => theme.matches.length >= 2) || scoredThemes.find((theme) => theme.matches.length > 0);
  const selectedItems = best ? best.matches : items.slice(0, Math.min(items.length, 5));
  const theme = best?.theme || {
    clusterTitle: 'Launch-worthy product update',
    why: 'These changes appear related and may be worth explaining to users.',
    userValue: 'A clearer explanation of shipped product value.',
  };

  return [
    {
      id: options.id || undefined,
      workspace_id: options.workspaceId || null,
      title: theme.clusterTitle,
      summary: summarizeItems(selectedItems),
      why_it_matters: theme.why,
      audience: options.targetAudience || 'Product users',
      user_value: theme.userValue,
      confidence_label: selectedItems.length >= 3 ? 'high' : 'medium',
      priority_label: selectedItems.length >= 3 ? 'high' : 'medium',
      status: 'suggested',
      detection_reason: `Grouped ${selectedItems.length} related source items using deterministic keyword matching fallback.`,
      positioning_notes: options.manualContext || '',
      created_from: 'deterministic_fallback',
      activity_item_ids: selectedItems.map((item) => item.id).filter(Boolean),
    },
  ];
}

export function generateDeterministicOpportunities(cluster, options = {}) {
  const workspaceId = cluster.workspace_id || options.workspaceId || null;
  const clusterId = cluster.id || options.clusterId || null;
  const title = cluster.title || 'this launch moment';
  const userValue = cluster.user_value || 'the user value behind this shipped work';

  return [
    {
      workspace_id: workspaceId,
      launch_cluster_id: clusterId,
      title: `How to get value from ${title}`,
      angle: 'Practical walkthrough',
      audience: cluster.audience || 'New and existing users',
      format: 'tutorial',
      why_it_matters: `Turns ${userValue} into a concrete step-by-step teaching asset users can follow.`,
      suggested_next_step: 'Create a short tutorial with screenshots and a clear before/after.',
      source_reasoning: `Derived from the accepted cluster: ${title}.`,
      status: 'suggested',
    },
    {
      workspace_id: workspaceId,
      launch_cluster_id: clusterId,
      title: `FAQ for ${title}`,
      angle: 'Objection and confusion removal',
      audience: 'Support, success, and self-serve users',
      format: 'faq',
      why_it_matters: `Transforms ${userValue} into answers that reduce repeated explanation work for the team.`,
      suggested_next_step: 'Draft five likely user questions and answer them from the source changes.',
      source_reasoning: `Derived from the accepted cluster: ${title}.`,
      status: 'suggested',
    },
    {
      workspace_id: workspaceId,
      launch_cluster_id: clusterId,
      title: `Docs update for ${title}`,
      angle: 'Documentation improvement',
      audience: 'Users learning the product through docs',
      format: 'docs',
      why_it_matters: `Makes ${userValue} discoverable after the launch moment has passed.`,
      suggested_next_step: 'Add a concise docs page or update an existing guide with source-linked context.',
      source_reasoning: `Derived from the accepted cluster: ${title}.`,
      status: 'suggested',
    },
    {
      workspace_id: workspaceId,
      launch_cluster_id: clusterId,
      title: `Customer use case for ${title}`,
      angle: 'User-value narrative',
      audience: 'Prospects and evaluators',
      format: 'use_case',
      why_it_matters: `Connects ${userValue} to a real-world workflow so buyers understand why the change matters.`,
      suggested_next_step: 'Write a short scenario showing before, after, and outcome.',
      source_reasoning: `Derived from the accepted cluster: ${title}.`,
      status: 'suggested',
    },
    {
      workspace_id: workspaceId,
      launch_cluster_id: clusterId,
      title: `Internal enablement note for ${title}`,
      angle: 'Team alignment',
      audience: 'Sales, support, success, and product teams',
      format: 'enablement',
      why_it_matters: `Helps the whole team explain ${userValue} consistently across customer conversations.`,
      suggested_next_step: 'Create a one-page enablement brief with message, source evidence, and talking points.',
      source_reasoning: `Derived from the accepted cluster: ${title}.`,
      status: 'suggested',
    },
  ];
}

function splitLabel(line) {
  const match = line.match(/^([A-Za-z ]{2,24}):\s*(.+)$/);
  if (!match) return { label: 'Note', title: line };
  return { label: match[1].trim(), title: match[2].trim() };
}

function sourceTypeFromLabel(label) {
  if (/pr|pull request|release|feature/i.test(label)) return 'manual_release_note';
  return 'manual_note';
}

function inferImpactHint(text) {
  return USER_VALUE_HINTS.find((hint) => hint.pattern.test(text))?.impact || 'Needs human review for user-facing value.';
}

function inferTags(text) {
  const tags = [];
  if (/onboarding|setup|signup|welcome/i.test(text)) tags.push('onboarding');
  if (/dashboard|report|export|analytics/i.test(text)) tags.push('analytics');
  if (/integration|api|webhook|sync/i.test(text)) tags.push('integration');
  if (/fix|bug|error/i.test(text)) tags.push('reliability');
  return tags;
}

function inferProductArea(text) {
  return inferTags(text)[0] || null;
}

function summarizeItems(items) {
  const titles = items.map((item) => item.title).filter(Boolean).slice(0, 3);
  return titles.length ? `Related shipped work: ${titles.join('; ')}.` : 'Related shipped work selected for review.';
}
