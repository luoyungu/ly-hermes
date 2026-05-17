import * as jsYaml from "js-yaml";

export function parse(text: string): Record<string, unknown> {
  const result = jsYaml.load(text);
  if (typeof result === "object" && result !== null && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return {};
}
