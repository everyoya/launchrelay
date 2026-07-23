import { generateDeterministicOpportunities } from './launchrelay-core.js';

export async function handler(payload = {}) {
  const cluster = payload.cluster ?? {};
  const opportunities = generateDeterministicOpportunities(cluster, {
    workspaceId: payload.workspaceId,
    clusterId: payload.clusterId,
  });

  return {
    ok: true,
    functionName: 'expandOpportunities',
    createdFrom: 'backend_function_deterministic',
    count: opportunities.length,
    opportunities,
  };
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
