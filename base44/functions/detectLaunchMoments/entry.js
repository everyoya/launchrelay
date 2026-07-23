import { generateDeterministicLaunchClusters } from './launchrelay-core.js';

export async function handler(payload = {}) {
  const activityItems = Array.isArray(payload.activityItems) ? payload.activityItems : [];
  const workspaceId = payload.workspaceId ?? activityItems[0]?.workspace_id ?? null;

  const launchClusters = generateDeterministicLaunchClusters(activityItems, {
    workspaceId,
    targetAudience: payload.targetAudience,
    manualContext: payload.manualContext,
    id: payload.id,
  });

  return {
    ok: true,
    functionName: 'detectLaunchMoments',
    createdFrom: 'backend_function_deterministic',
    count: launchClusters.length,
    launchClusters,
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
