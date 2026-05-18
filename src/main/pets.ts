import { ipcMain } from "electron";
import path from "path";
import fs from "fs";
import https from "https";
import { APP_DATA_DIR } from "./config";
import { ensureDir as ensureDirUtil } from "./utils";

const PETDEX_MANIFEST_URL = "https://petdex.crafter.run/api/manifest";
const PETS_DIR = path.join(APP_DATA_DIR, "pets");
const MANIFEST_CACHE_PATH = path.join(PETS_DIR, "manifest.json");
const MANIFEST_TTL = 24 * 60 * 60 * 1000;

export interface PetInfo {
  slug: string;
  name: string;
  spritesheetUrl: string;
  tags?: string[];
  vibes?: string[];
  kind?: string;
  frameWidth?: number;
  frameHeight?: number;
  states?: string[];
}

interface ManifestEntry {
  slug: string;
  displayName?: string;
  name?: string;
  spritesheetUrl?: string;
  spritesheet?: string;
  tags?: string[];
  vibes?: string[];
  kind?: string;
  frameWidth?: number;
  frameHeight?: number;
  states?: string[];
}

function ensurePetsDir(): void {
  ensureDirUtil(PETS_DIR);
}

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const doRequest = (reqUrl: string) => {
      https.get(reqUrl, { timeout: 15000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", reject)
        .on("timeout", function (this: import("http").IncomingMessage) { this.destroy(); reject(new Error("timeout")); });
    };
    doRequest(url);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureDirUtil(path.dirname(dest));
    const file = fs.createWriteStream(dest);
    const doRequest = (reqUrl: string) => {
      https.get(reqUrl, { timeout: 30000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
      }).on("error", (e) => {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        reject(e);
      });
    };
    doRequest(url);
  });
}

function readCachedManifest(): ManifestEntry[] | null {
  try {
    if (!fs.existsSync(MANIFEST_CACHE_PATH)) return null;
    const stat = fs.statSync(MANIFEST_CACHE_PATH);
    if (Date.now() - stat.mtimeMs > MANIFEST_TTL) return null;
    const raw = fs.readFileSync(MANIFEST_CACHE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getManifest(): Promise<ManifestEntry[]> {
  const cached = readCachedManifest();
  if (cached) {
    return cached;
  }

  try {
    const data = await fetchJson(PETDEX_MANIFEST_URL) as { pets?: ManifestEntry[] };
    const pets = data.pets || (Array.isArray(data) ? data : []);
    ensurePetsDir();
    fs.writeFileSync(MANIFEST_CACHE_PATH, JSON.stringify(pets, null, 2), "utf-8");
    return pets;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

function petDir(slug: string): string {
  return path.join(PETS_DIR, slug);
}

function petSpritesheetPath(slug: string): string {
  return path.join(petDir(slug), "spritesheet.webp");
}

async function ensureSpritesheet(slug: string, url: string): Promise<string> {
  const local = petSpritesheetPath(slug);
  if (fs.existsSync(local)) return local;
  ensurePetsDir();
  await downloadFile(url, local);
  return local;
}

export function registerPetsIpc(): void {
  ipcMain.handle("pets:list", async () => {
    try {
      const manifest = await getManifest();
      return manifest.map((p): PetInfo => ({
        slug: p.slug,
        name: p.displayName || p.name || p.slug,
        spritesheetUrl: p.spritesheetUrl || p.spritesheet || "",
        tags: p.tags,
        vibes: p.vibes,
        kind: p.kind,
        frameWidth: p.frameWidth,
        frameHeight: p.frameHeight,
        states: p.states,
      }));
    } catch {
      return [];
    }
  });

  ipcMain.handle("pets:get-spritesheet", async (_, slug: string) => {
    try {
      let local = petSpritesheetPath(slug);
      if (!fs.existsSync(local)) {
        const manifest = await getManifest();
        const entry = manifest.find((p) => p.slug === slug);
        const spriteUrl = entry?.spritesheetUrl || entry?.spritesheet;
        if (!spriteUrl) return null;
        local = await ensureSpritesheet(slug, spriteUrl);
      }
      const buf = fs.readFileSync(local);
      const base64 = buf.toString("base64");
      return `data:image/webp;base64,${base64}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle("pets:refresh-manifest", async () => {
    try {
      if (fs.existsSync(MANIFEST_CACHE_PATH)) {
        fs.unlinkSync(MANIFEST_CACHE_PATH);
      }
      const manifest = await getManifest();
      return manifest.map((p): PetInfo => ({
        slug: p.slug,
        name: p.displayName || p.name || p.slug,
        spritesheetUrl: p.spritesheetUrl || p.spritesheet || "",
        tags: p.tags,
        vibes: p.vibes,
        kind: p.kind,
        frameWidth: p.frameWidth,
        frameHeight: p.frameHeight,
        states: p.states,
      }));
    } catch {
      return [];
    }
  });
}
