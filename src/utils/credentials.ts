export const MAX_CREDENTIAL_FILE_BYTES = 4096;

export interface CredentialBackup {
  format: 'calendrier-credentials';
  version: 1;
  serverUrl: string;
  userId: string;
  sessionToken: string;
}

export function parseCredentials(text: string, serverUrl: string): CredentialBackup {
  if (new TextEncoder().encode(text).length > MAX_CREDENTIAL_FILE_BYTES) {
    throw new Error('Invalid credential file');
  }
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid credential file');
  }
  const data = value as Record<string, unknown>;
  if (data.format !== 'calendrier-credentials' || data.version !== 1 ||
      typeof data.serverUrl !== 'string' || data.serverUrl.replace(/\/$/, '') !== serverUrl.replace(/\/$/, '') ||
      typeof data.userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.userId) ||
      typeof data.sessionToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.sessionToken)) {
    throw new Error('Invalid credential file');
  }
  return { format: 'calendrier-credentials', version: 1, serverUrl: data.serverUrl, userId: data.userId, sessionToken: data.sessionToken };
}
