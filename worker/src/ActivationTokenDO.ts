import { ActivationToken, Env } from './types';

interface ConsumeRequest {
  token: string;
}

const MAX_TOKEN_CONSUME_BODY_BYTES = 16 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && Number(contentLength) > MAX_TOKEN_CONSUME_BODY_BYTES) {
    return Response.json({ success: false, message: 'Request body is too large' }, { status: 413 });
  }

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_TOKEN_CONSUME_BODY_BYTES) {
      return Response.json({ success: false, message: 'Request body is too large' }, { status: 413 });
    }

    const value = JSON.parse(text) as unknown;
    if (!isObject(value)) {
      return Response.json({ success: false, message: 'Request body must be a JSON object' }, { status: 400 });
    }
    return value;
  } catch {
    return Response.json({ success: false, message: 'Invalid JSON in request body' }, { status: 400 });
  }
}

function isActivationToken(value: unknown): value is ActivationToken {
  return isObject(value)
    && typeof value.token === 'string'
    && typeof value.createdAt === 'number'
    && typeof value.usedCount === 'number'
    && (value.expiresAt === undefined || typeof value.expiresAt === 'number')
    && (value.maxUses === undefined || typeof value.maxUses === 'number')
    && (value.createdBy === undefined || typeof value.createdBy === 'string');
}

export class ActivationTokenDO {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private state: DurableObjectState, private env: Env) {}

  private async withMutex<T>(operation: () => Promise<T>): Promise<T> {
    const previousOperation = this.operationQueue;
    let release!: () => void;
    this.operationQueue = new Promise((resolve) => {
      release = resolve;
    });

    try {
      await previousOperation;
      return await operation();
    } finally {
      release();
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const parsed = await readJsonObject(request);
    if (parsed instanceof Response) return parsed;
    if (typeof parsed.token !== 'string' || parsed.token.trim().length === 0) {
      return Response.json({ success: false, message: 'Missing activation token' }, { status: 400 });
    }
    const { token }: ConsumeRequest = { token: parsed.token };

    return this.withMutex(async () => {
      const tokenStr = await this.env.ACTIVATION_TOKENS.get(`token:${token}`);
      if (!tokenStr) {
        return Response.json({ success: false, message: 'Invalid activation token' }, { status: 401 });
      }

      const activationTokenJson = JSON.parse(tokenStr) as unknown;
      if (!isActivationToken(activationTokenJson)) {
        return Response.json({ success: false, message: 'Activation token record is invalid' }, { status: 500 });
      }
      const activationToken = activationTokenJson;
      if (activationToken.expiresAt !== undefined && activationToken.expiresAt < Date.now()) {
        return Response.json({ success: false, message: 'Activation token has expired' }, { status: 401 });
      }

      if (activationToken.maxUses !== undefined && activationToken.usedCount >= activationToken.maxUses) {
        return Response.json({ success: false, message: 'Activation token has reached maximum uses' }, { status: 401 });
      }

      activationToken.usedCount += 1;
      await this.env.ACTIVATION_TOKENS.put(`token:${token}`, JSON.stringify(activationToken));

      return Response.json({ success: true });
    });
  }
}
