const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'application/json']);

export async function handler(payload = {}) {
  const workspaceId = payload.workspaceId || null;
  const sourceConnectionId = payload.sourceConnectionId || null;
  const importedAt = payload.importedAt || new Date().toISOString();
  const injectedPayloads = payload.drivePayloads;
  const accessToken = payload.googleDriveAccessToken || payload.accessToken || null;

  if (!injectedPayloads && !accessToken) {
    return {
      ok: false,
      source: 'google_drive',
      error: 'Google Drive is not connected for this user. Connect Google Drive first, then import docs.',
      activityItems: [],
      authMode: 'missing_app_user_connector_token',
    };
  }

  const drivePayloads = injectedPayloads || await fetchDrivePayloads(accessToken, payload.query);
  const files = Array.isArray(drivePayloads.files) ? drivePayloads.files : [];
  const activityItems = files.slice(0, 12).map((file, index) => driveFileToActivityItem(file, {
    workspaceId,
    sourceConnectionId,
    importedAt,
    index,
  }));

  return {
    ok: true,
    source: 'google_drive',
    authMode: injectedPayloads ? 'injected_test_payload' : 'app_user_connector_token',
    importSummary: {
      files: files.length,
      normalized: activityItems.length,
    },
    activityItems,
  };
}

export async function handleRequest(req) {
  try {
    const payload = await req.json().catch(() => ({}));
    let googleDriveAccessToken = payload.googleDriveAccessToken || payload.accessToken || null;
    if (!googleDriveAccessToken && payload.googleDriveConnectorId) {
      googleDriveAccessToken = await getCurrentAppUserAccessToken(req, payload.googleDriveConnectorId);
    }
    return Response.json(await handler({ ...payload, googleDriveAccessToken }));
  } catch (error) {
    return Response.json({ ok: false, source: 'google_drive', error: error instanceof Error ? error.message : String(error), activityItems: [] }, { status: 400 });
  }
}

if (globalThis.Deno?.serve) {
  Deno.serve(handleRequest);
}

async function fetchDrivePayloads(accessToken, query) {
  const params = new URLSearchParams({
    pageSize: '12',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,description,owners(displayName,emailAddress))',
    q: query || "trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'text/markdown')",
  });
  const listResponse = await fetch(`${GOOGLE_DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listResponse.ok) {
    const body = await listResponse.text();
    throw new Error(`Google Drive import failed with ${listResponse.status}. ${body.slice(0, 240)}`);
  }
  const listPayload = await listResponse.json();
  const files = await Promise.all((listPayload.files || []).map(async (file) => ({
    ...file,
    text: await fetchDriveFileText(file, accessToken),
  })));
  return { files };
}

async function fetchDriveFileText(file, accessToken) {
  try {
    if (file.mimeType === GOOGLE_DOC_MIME) {
      const response = await fetch(`${GOOGLE_DRIVE_API}/files/${encodeURIComponent(file.id)}/export?mimeType=text/plain`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) return (await response.text()).slice(0, 1800);
      return '';
    }
    if (TEXT_MIME_TYPES.has(file.mimeType)) {
      const response = await fetch(`${GOOGLE_DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) return (await response.text()).slice(0, 1800);
    }
  } catch (_error) {
    return '';
  }
  return '';
}

function driveFileToActivityItem(file, { workspaceId, sourceConnectionId, importedAt, index }) {
  const owner = Array.isArray(file.owners) && file.owners[0]
    ? file.owners[0].displayName || file.owners[0].emailAddress || 'Google Drive'
    : 'Google Drive';
  const body = [
    file.description,
    file.text,
  ].filter(Boolean).join('\n\n').trim() || `Recent Google Drive document: ${file.name}`;
  return {
    id: `drive_activity_${index + 1}`,
    workspace_id: workspaceId,
    source_connection_id: sourceConnectionId,
    source_type: 'google_drive_doc',
    source_id: file.id,
    source_url: file.webViewLink || '',
    title: file.name || `Google Drive document ${index + 1}`,
    body,
    author: owner,
    occurred_at: file.modifiedTime || importedAt,
    imported_at: importedAt,
    tags: ['google_drive', file.mimeType === GOOGLE_DOC_MIME ? 'google_doc' : 'drive_file'],
    product_area: 'Documentation',
    impact_hint: 'Product truth or launch context from connected Google Drive.',
    status: 'active',
    raw_payload: JSON.stringify({ id: file.id, name: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime, webViewLink: file.webViewLink }),
    dedupe_key: `google_drive:${file.id}:${file.modifiedTime || ''}`,
  };
}

async function getCurrentAppUserAccessToken(req, connectorId) {
  const sdk = await import('npm:@base44/sdk');
  const base44 = sdk.createClientFromRequest(req);
  const connection = await base44.asServiceRole.connectors.getCurrentAppUserConnection(connectorId);
  return connection?.accessToken || connection?.access_token || null;
}
