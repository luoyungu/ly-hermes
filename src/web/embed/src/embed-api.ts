export interface HealthResult {
  ok: boolean;
  requestId?: string;
  error?: string;
}

export async function checkHealth(): Promise<HealthResult> {
  try {
    const response = await fetch("/api/health", { credentials: "include" });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return await response.json() as HealthResult;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
