type WebApiHandler = (...args: unknown[]) => unknown | Promise<unknown>;

const handlers = new Map<string, WebApiHandler>();

export function registerWebApiChannel(channel: string, handler: WebApiHandler): void {
  handlers.set(channel, handler);
}

export async function invokeWebApiChannel(channel: string, args: unknown[] = []): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`未支持的接口: ${channel}`);
  }
  return handler(...args);
}

export function hasWebApiChannel(channel: string): boolean {
  return handlers.has(channel);
}
