/** Server-only: import dynamically inside authenticated server handlers. */
function requireApiKey() {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) throw new Error('Calendar service is not configured');
  return key;
}

export interface AppUserOAuthAuthorizeParams {
  gatewayBaseUrl: string;
  connectorId: string;
  appUserId: string;
  clientAPIKey: string;
  returnUrl: string;
  connectionAPIKey?: string | undefined;
  credentialsConfiguration?: Record<string, unknown>;
}

export async function authorizeAppUserOAuth(params: AppUserOAuthAuthorizeParams) {
  const headers: Record<string, string> = { Authorization: `Bearer ${requireApiKey()}`, 'Content-Type': 'application/json', 'X-Client-Api-Key': params.clientAPIKey };
  if (params.connectionAPIKey) headers['X-Connection-Api-Key'] = params.connectionAPIKey;
  const res = await fetch(`${params.gatewayBaseUrl}/api/v1/app-users/oauth2/authorize`, {
    method: 'POST', headers,
    body: JSON.stringify({ connector_id: params.connectorId, app_user_id: params.appUserId, return_url: params.returnUrl, credentials_configuration: params.credentialsConfiguration }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Calendar connection failed [${res.status}]: ${text}`);
  const body = JSON.parse(text) as { authorization_url?: string; session_id?: string };
  if (!body.authorization_url) throw new Error('Calendar authorization URL is missing');
  return { authorizationUrl: body.authorization_url, sessionId: body.session_id ?? '' };
}

export async function exchangeAppUserOAuthCode(gatewayBaseUrl: string, code: string) {
  const res = await fetch(`${gatewayBaseUrl}/api/v1/app-users/oauth2/exchange`, {
    method: 'POST', headers: { Authorization: `Bearer ${requireApiKey()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Calendar completion failed [${res.status}]: ${text}`);
  const body = JSON.parse(text) as { api_key?: string; connector_id?: string };
  if (!body.api_key || !body.connector_id) throw new Error('Calendar connection could not be completed');
  return { connectionAPIKey: body.api_key, connectorId: body.connector_id };
}

export async function callAsAppUser(params: { gatewayBaseUrl: string; connectionAPIKey: string; connectorId: string; path: string; init?: RequestInit | undefined; requiredScopes?: string[] }) {
  const headers = new Headers(params.init?.headers);
  headers.set('Authorization', `Bearer ${requireApiKey()}`);
  headers.set('X-Connection-Api-Key', params.connectionAPIKey);
  if (params.requiredScopes?.length) headers.set('X-Lovable-Required-Scopes', params.requiredScopes.join(' '));
  return fetch(`${params.gatewayBaseUrl}/${params.connectorId}${params.path.startsWith('/') ? params.path : '/' + params.path}`, { ...params.init, headers });
}

export async function appUserReconnectRequired(res: Response) {
  if (res.status !== 401) return false;
  const body = await res.clone().json().catch(() => null) as { type?: unknown } | null;
  return typeof body?.type === 'string' && body.type.startsWith('credential_');
}

export async function disconnectAppUser(params: { gatewayBaseUrl: string; connectionAPIKey: string; connectorId: string }) {
  const res = await fetch(`${params.gatewayBaseUrl}/api/v1/app-users/connection`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${requireApiKey()}`, 'X-Connection-Api-Key': params.connectionAPIKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ connector_id: params.connectorId }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Calendar disconnect failed [${res.status}]: ${text}`);
}