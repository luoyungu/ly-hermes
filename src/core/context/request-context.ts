export type CoreClient = "desktop" | "web-admin" | "embed" | "server";

export interface CoreUser {
  id: string;
  username?: string;
  displayName?: string;
  role?: string;
  tenantId?: string;
  departmentIds?: string[];
}

export interface RequestContext {
  requestId: string;
  client: CoreClient;
  user?: CoreUser | null;
  source?: string;
}

export function createRequestContext(
  client: CoreClient,
  options: Partial<Omit<RequestContext, "client" | "requestId">> & {
    requestId?: string;
  } = {},
): RequestContext {
  return {
    requestId: options.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    client,
    user: options.user ?? null,
    source: options.source,
  };
}
