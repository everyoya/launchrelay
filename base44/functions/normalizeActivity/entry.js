import { createManualActivityItemsFromText } from './launchrelay-core.js';

export async function handler(payload = {}) {
  const activityText = payload.activityText ?? payload.text ?? '';
  const workspaceId = payload.workspaceId ?? null;
  const sourceConnectionId = payload.sourceConnectionId ?? null;
  const importedAt = payload.importedAt ?? new Date().toISOString();

  const activityItems = createManualActivityItemsFromText(activityText, {
    workspaceId,
    sourceConnectionId,
    importedAt,
    idPrefix: payload.idPrefix,
    dedupePrefix: payload.dedupePrefix ?? workspaceId ?? 'manual',
    author: payload.author ?? 'manual',
  });

  return {
    ok: true,
    functionName: 'normalizeActivity',
    createdFrom: 'backend_function_deterministic',
    count: activityItems.length,
    activityItems,
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
