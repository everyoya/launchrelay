export const BANNED_AI_SLOP_PATTERNS = [
  /\bseamless\b/gi,
  /\brobust\b/gi,
  /\bleverage\b/gi,
  /\bdelve\b/gi,
  /\btransform\b/gi,
  /\bgame-changing\b/gi,
  /\bcutting-edge\b/gi,
  /\bsupercharge\b/gi,
  /\belevate\b/gi,
  /\bunlock\b/gi,
  /\brevolutionize\b/gi,
  /\bstate-of-the-art\b/gi,
  /\bparadigm shift\b/gi,
  /\bholistic\b/gi,
  /\btapestry\b/gi,
  /\brealm\b/gi,
  /\bbespoke\b/gi,
  /in today's fast-paced[^.]*\.?/gi,
  /we (are|'re) thrilled to announce[^.]*\.?/gi,
  /it is worth noting that\s*/gi,
  /let'?s dive in\.?/gi,
  /\bfurthermore\b/gi,
  /\bmoreover\b/gi,
  /\bin conclusion\b/gi,
  /\bconsequently\b/gi,
  /\butilization\b/gi,
  /\bfacilitation\b/gi,
];

const REPLACEMENTS = [
  [/\bleverage\b/gi, 'use'],
  [/\bdelve\b/gi, 'dig into'],
  [/\bsupercharge\b/gi, 'speed up'],
  [/\bfacilitate\b/gi, 'help'],
  [/\bfacilitation\b/gi, 'help'],
  [/\butilization\b/gi, 'use'],
  [/\bseamless\b/gi, 'smooth'],
  [/\brobust\b/gi, 'reliable'],
  [/\bgame-changing\b/gi, 'useful'],
  [/\bcutting-edge\b/gi, 'new'],
  [/\belevate\b/gi, 'improve'],
  [/\bunlock\b/gi, 'open'],
  [/\brevolutionize\b/gi, 'change'],
  [/\bfurthermore\b/gi, 'Also'],
  [/\bmoreover\b/gi, 'Also'],
  [/\bconsequently\b/gi, 'So'],
  [/\bin conclusion\b/gi, 'To wrap up'],
];

export const PSYCHOLOGICAL_DRIVERS = [
  {
    id: 'order_efficiency',
    label: 'Order & Efficiency',
    pattern: /onboarding|setup|speed|slow|manual|dashboard|timeline|organize|workflow|batch|export|report/i,
    useWhen: 'The update reduces chaos, saves time, clarifies steps, or makes a workflow easier to complete.',
  },
  {
    id: 'safety_compliance',
    label: 'Safety & Compliance',
    pattern: /security|permission|backup|risk|error|bug|reliability|crash|fallback|recover|audit/i,
    useWhen: 'The update prevents mistakes, reduces risk, or makes the product more dependable.',
  },
  {
    id: 'being_helpful',
    label: 'Being Helpful',
    pattern: /docs|faq|tutorial|share|team|support|enablement|guide|explain/i,
    useWhen: 'The update helps users teach teammates or reduce repeated explanation work.',
  },
  {
    id: 'status',
    label: 'Status',
    pattern: /advanced|power user|pro|early|expert|insight|control/i,
    useWhen: 'The update helps users feel capable, informed, or ahead of their team.',
  },
  {
    id: 'novelty',
    label: 'Novelty',
    pattern: /new|first|launch|introduce|preview|beta/i,
    useWhen: 'The update introduces a new capability or an unexpected way to do a familiar task.',
  },
];

export const CONTENT_TEMPLATES = [
  {
    id: 'feature_launch_story',
    label: 'Feature Launch Story',
    structure: ['The friction', 'The shift', 'The solution in action', 'Key benefits', 'Next step'],
  },
  {
    id: 'tutorial_walkthrough',
    label: 'Tutorial / Walkthrough',
    structure: ['Goal and prerequisites', 'Step-by-step instructions', 'Visual placeholders', 'Pro tips / edge cases', 'Verification step'],
  },
  {
    id: 'customer_use_case',
    label: 'Customer Use Case / Impact Post',
    structure: ['Scenario / persona', 'Bottleneck', 'Workflow transformation', 'Measurable impact', 'Implementation note'],
  },
  {
    id: 'developer_deep_dive',
    label: 'Developer / Tech Deep Dive',
    structure: ['Technical problem', 'System design approach', 'Code or schema snippets', 'Performance / reliability outcome', 'Developer resources'],
  },
  {
    id: 'social_launch_post',
    label: 'Social Launch Post',
    structure: ['Hook', '2–3 highlights', 'Visual callout', 'CTA'],
  },
];

export function evaluateContentReadiness({ cluster = {}, workspace = {}, sources = [] } = {}) {
  const sourceText = sources.map((source) => `${source.title || ''} ${source.body || ''} ${source.impact_hint || ''}`).join('\n');
  const combined = `${cluster.title || ''}\n${cluster.summary || ''}\n${cluster.why_it_matters || ''}\n${cluster.user_value || ''}\n${workspace.target_audience || ''}\n${workspace.positioning_notes || ''}\n${sourceText}`;

  const missing = [];
  if (!workspace.target_audience && !cluster.audience) missing.push('target_audience');
  if (!cluster.user_value && !/user|customer|team|developer|founder|support|educator/i.test(combined)) missing.push('clear_user_outcome');
  if (!cluster.why_it_matters && !workspace.positioning_notes) missing.push('specific_problem_solved');
  if (!sources.length) missing.push('source_evidence');

  return {
    ready: missing.length === 0,
    missing,
    interview_questions: generateInterviewQuestions(missing),
  };
}

export function generateInterviewQuestions(missing = []) {
  const questions = [];
  if (missing.includes('target_audience')) questions.push('Who is this update mainly for?');
  if (missing.includes('clear_user_outcome')) questions.push('What concrete user outcome should this story promise?');
  if (missing.includes('specific_problem_solved')) questions.push('What pain or workaround did this update remove?');
  if (missing.includes('source_evidence')) questions.push('Which PR, commit, screenshot, or note proves this change?');
  return questions.slice(0, 2);
}

export function selectPsychologicalDriver(input = '') {
  const text = String(input || '');
  return PSYCHOLOGICAL_DRIVERS.find((driver) => driver.pattern.test(text)) || PSYCHOLOGICAL_DRIVERS[0];
}

export function applyContentGuardrails(text = '') {
  let cleaned = String(text || '');

  cleaned = cleaned
    .replace(/We (are|'re) thrilled to announce[^.]*\.?\s*/gi, '')
    .replace(/In today's fast-paced[^.]*\.?\s*/gi, '')
    .replace(/Let'?s dive in\.?\s*/gi, '')
    .replace(/It is worth noting that\s*/gi, '');

  for (const [pattern, replacement] of REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  cleaned = cleaned
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return cleaned;
}

export function findGuardrailViolations(text = '') {
  const source = String(text || '');
  return BANNED_AI_SLOP_PATTERNS
    .map((pattern) => source.match(pattern) || [])
    .flat()
    .map((match) => match.trim())
    .filter(Boolean);
}

export function createGuardrailedDraft({ workspace = {}, cluster = {}, sources = [], templateId = 'feature_launch_story' } = {}) {
  const sourceTitles = sources.map((source) => source.title).filter(Boolean);
  const readiness = evaluateContentReadiness({ cluster, workspace, sources });
  const driver = selectPsychologicalDriver(`${cluster.title || ''} ${cluster.summary || ''} ${cluster.why_it_matters || ''} ${cluster.user_value || ''} ${sourceTitles.join(' ')}`);
  const template = CONTENT_TEMPLATES.find((item) => item.id === templateId) || CONTENT_TEMPLATES[0];
  const audience = cluster.audience || workspace.target_audience || 'users';
  const title = cluster.title || 'Launch-worthy product update';
  const userValue = cluster.user_value || 'a clearer path to value';
  const why = cluster.why_it_matters || 'This update removes friction from a real product workflow.';

  const body = applyContentGuardrails(`# ${title}

This update helps ${audience} ${lowercaseFirst(userValue)}.

## The friction
Before this change, users needed extra guidance or workarounds to finish the workflow confidently.

## What changed
${sourceTitles.length ? sourceTitles.map((sourceTitle) => `- ${sourceTitle}`).join('\n') : '- Source evidence needs one more human note before publishing.'}

## Why it matters
${why}

## How to use this story
Lead with the user problem, show the shipped change, then point readers to the next step.

## Content harness
- Template: ${template.label}
- Psychological driver: ${driver.label}
- Driver use: ${driver.useWhen}
- Readiness: ${readiness.ready ? 'ready to draft' : `needs context: ${readiness.missing.join(', ')}`}

## Source trail
${sourceTitles.length ? sourceTitles.map((sourceTitle) => `- ${sourceTitle}`).join('\n') : '- Add source links or notes before publishing.'}`);

  return {
    title,
    body,
    template_id: template.id,
    template_label: template.label,
    psychological_driver: driver.label,
    readiness,
    guardrail_violations: findGuardrailViolations(body),
  };
}

function lowercaseFirst(value) {
  const text = String(value || '').trim();
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}
