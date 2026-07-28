const SUPPORTED_PROVIDERS = new Set(['openai', 'openrouter', 'anthropic', 'gemini', 'custom_openai']);
const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  gemini: 'gemini-1.5-flash',
  custom_openai: 'gpt-4o-mini',
};
const MAX_OUTPUT_TOKENS = 1600;

export async function handler(payload = {}) {
  const provider = normalizeProvider(payload.provider || payload.aiConnection?.provider || 'openai');
  const apiKey = String(payload.apiKey || payload.aiConnection?.apiKey || '').trim();

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return { ok: false, code: 'unsupported_ai_provider', message: `Unsupported AI provider: ${provider}`, billedTo: 'none' };
  }

  if (!apiKey) {
    return {
      ok: false,
      code: 'user_ai_key_required',
      message: 'Connect your own AI provider key in Settings before using AI generation.',
      billedTo: 'none',
    };
  }

  const task = normalizeTask(payload.task);
  const model = String(payload.model || payload.aiConnection?.model || DEFAULT_MODELS[provider]).trim();
  const maxOutputTokens = clampNumber(payload.maxOutputTokens, 200, MAX_OUTPUT_TOKENS, task === 'opportunities' ? 1200 : 1000);
  const prompt = buildPrompt({ task, workspace: payload.workspace, cluster: payload.cluster, sources: payload.sources, extraInstructions: payload.extraInstructions });

  try {
    const providerResult = await callProvider({
      provider,
      apiKey,
      model,
      prompt,
      maxOutputTokens,
      endpointUrl: payload.endpointUrl || payload.aiConnection?.endpointUrl,
    });
    return {
      ok: true,
      functionName: 'runUserAiGeneration',
      provider,
      model,
      task,
      billedTo: 'user_provider_key',
      output: providerResult.output,
      usage: providerResult.usage || null,
      safety: {
        sourceGrounded: true,
        appOwnedAiKeyUsed: false,
        maxOutputTokens,
      },
    };
  } catch (error) {
    return {
      ok: false,
      code: 'user_ai_generation_failed',
      message: error instanceof Error ? error.message : String(error),
      billedTo: 'user_provider_key',
      provider,
      model,
      task,
    };
  }
}

function normalizeProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (value === 'custom' || value === 'openai-compatible') return 'custom_openai';
  return value;
}

function normalizeTask(task) {
  const value = String(task || '').trim().toLowerCase();
  if (['detect', 'draft', 'opportunities'].includes(value)) return value;
  return 'draft';
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function buildPrompt({ task, workspace = {}, cluster = {}, sources = [], extraInstructions = '' }) {
  const compactSources = (Array.isArray(sources) ? sources : []).slice(0, 12).map((source, index) => ({
    index: index + 1,
    id: source.id,
    type: source.source_type,
    title: source.title,
    body: source.body,
    impact_hint: source.impact_hint,
    source_url: source.source_url,
  }));

  const system = [
    'You are LaunchRelay, an AI-first product education assistant.',
    'Use only the provided source activity and workspace context.',
    'Do not invent shipped work, metrics, users, integrations, or publishing channels.',
    'Return valid JSON only. No markdown fences.',
  ].join(' ');

  const taskInstructions = {
    detect: 'Find 1-3 launch-worthy Highlights. Return {"launchClusters":[{"title","summary","why_it_matters","user_value","audience","confidence_label","detection_reason","activity_item_ids":[]}]}',
    draft: 'Write an editable product education draft. Return {"title","body","source_summary"}. The body should include what changed, why users care, and how to explain it.',
    opportunities: 'Suggest 5 follow-up product education opportunities. Return {"opportunities":[{"title","angle","audience","format","why_it_matters","suggested_next_step","source_reasoning","status"}]}',
  };

  const user = JSON.stringify({
    task,
    instructions: taskInstructions[task],
    workspace: pick(workspace, ['name', 'description', 'target_audience', 'positioning_notes', 'terminology_notes', 'style_guidance', 'primary_channels']),
    cluster: pick(cluster, ['id', 'title', 'summary', 'why_it_matters', 'user_value', 'audience', 'detection_reason', 'activity_item_ids']),
    sources: compactSources,
    extraInstructions,
  }, null, 2);

  return { system, user };
}

function pick(object = {}, keys = []) {
  return keys.reduce((result, key) => {
    if (object?.[key] !== undefined && object?.[key] !== null && object?.[key] !== '') result[key] = object[key];
    return result;
  }, {});
}

async function callProvider({ provider, apiKey, model, prompt, maxOutputTokens, endpointUrl }) {
  if (provider === 'anthropic') return callAnthropic({ apiKey, model, prompt, maxOutputTokens });
  if (provider === 'gemini') return callGemini({ apiKey, model, prompt, maxOutputTokens });
  return callOpenAiCompatible({ provider, apiKey, model, prompt, maxOutputTokens, endpointUrl });
}

async function callOpenAiCompatible({ provider, apiKey, model, prompt, maxOutputTokens, endpointUrl }) {
  const url = provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : provider === 'custom_openai'
      ? normalizeEndpoint(endpointUrl)
      : 'https://api.openai.com/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://launchrelay.app', 'X-Title': 'LaunchRelay' } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.35,
      max_tokens: maxOutputTokens,
      response_format: { type: 'json_object' },
    }),
  });
  const data = await readJsonResponse(response);
  const content = data?.choices?.[0]?.message?.content;
  return { output: parseJsonContent(content), usage: data?.usage || null };
}

async function callAnthropic({ apiKey, model, prompt, maxOutputTokens }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxOutputTokens,
      temperature: 0.35,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    }),
  });
  const data = await readJsonResponse(response);
  const content = data?.content?.map((block) => block?.text || '').join('\n');
  return { output: parseJsonContent(content), usage: data?.usage || null };
}

async function callGemini({ apiKey, model, prompt, maxOutputTokens }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: { temperature: 0.35, maxOutputTokens, responseMimeType: 'application/json' },
      contents: [{ role: 'user', parts: [{ text: `${prompt.system}\n\n${prompt.user}` }] }],
    }),
  });
  const data = await readJsonResponse(response);
  const content = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('\n');
  return { output: parseJsonContent(content), usage: data?.usageMetadata || null };
}

function normalizeEndpoint(endpointUrl) {
  const value = String(endpointUrl || '').trim();
  if (!value) throw new Error('Custom OpenAI-compatible endpoint URL is required.');
  return value.endsWith('/chat/completions') ? value : `${value.replace(/\/$/, '')}/chat/completions`;
}

async function readJsonResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `AI provider request failed with ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function parseJsonContent(content) {
  const text = String(content || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  if (!text) throw new Error('AI provider returned an empty response.');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('AI provider did not return valid JSON.');
  }
}

export async function handleRequest(req) {
  try {
    const payload = await req.json().catch(() => ({}));
    return Response.json(await handler(payload));
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

if (globalThis.Deno?.serve) {
  Deno.serve(handleRequest);
}
