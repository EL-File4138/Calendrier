import { ActivationToken, Env } from './types';

interface ConsumeRequest {
  token: string;
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

    const { token } = await request.json() as ConsumeRequest;
    if (!token) {
      return Response.json({ success: false, message: 'Missing activation token' }, { status: 400 });
    }

    return this.withMutex(async () => {
      const tokenStr = await this.env.ACTIVATION_TOKENS.get(`token:${token}`);
      if (!tokenStr) {
        return Response.json({ success: false, message: 'Invalid activation token' }, { status: 401 });
      }

      const activationToken: ActivationToken = JSON.parse(tokenStr);
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
