export interface SecretStore {
  encode(value: unknown): string;
  decode(value: unknown): string;
}

export class PlainSecretStore implements SecretStore {
  encode(value: unknown): string {
    const text = String(value || "");
    if (!text || text.startsWith("plain:v1:")) return text;
    return `plain:v1:${Buffer.from(text, "utf-8").toString("base64")}`;
  }

  decode(value: unknown): string {
    const text = String(value || "");
    if (!text) return "";
    if (!text.startsWith("plain:v1:")) return text;
    try {
      return Buffer.from(text.slice("plain:v1:".length), "base64").toString("utf-8");
    } catch {
      return "";
    }
  }
}
