export type AttachmentKind = "image" | "text-file" | "path-ref";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  dataUrl?: string;
  text?: string;
  path?: string;
}

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_BYTES = 256 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export const ALLOWED_IMAGE_MIMES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export const ALLOWED_TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  "md",
  "markdown",
  "txt",
  "text",
  "log",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "env",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "sql",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "py",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "go",
  "rs",
  "c",
  "cc",
  "cpp",
  "cxx",
  "h",
  "hpp",
  "java",
  "kt",
  "kts",
  "rb",
  "php",
  "swift",
  "scala",
  "lua",
  "r",
  "pl",
  "vue",
  "svelte",
  "dockerfile",
  "makefile",
  "gitignore",
  "editorconfig",
]);

export function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return name.toLowerCase();
  return name.slice(dot + 1).toLowerCase();
}

export function isImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIMES.has(mime.toLowerCase());
}

export function isTextFile(mime: string, name: string): boolean {
  if (mime.toLowerCase().startsWith("text/")) return true;
  return ALLOWED_TEXT_EXTENSIONS.has(getFileExtension(name));
}

export function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
