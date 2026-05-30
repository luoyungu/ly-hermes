export function createLyHermesSessionId(profileName: string): string {
  const safeProfile = (profileName || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `lyh-${safeProfile}-${uuid}`;
}

export function getLyHermesSessionProfilePrefix(profileName: string): string {
  const safeProfile = (profileName || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `lyh-${safeProfile}-`;
}

export function isLyHermesSessionForProfile(sessionId: string, profileName: string): boolean {
  return sessionId.startsWith(getLyHermesSessionProfilePrefix(profileName));
}
