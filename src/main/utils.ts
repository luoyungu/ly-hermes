import { Notification, nativeImage } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import zlib from "zlib";
import * as jsYaml from "js-yaml";
import type { BrowserWindow } from "electron";

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function safeWriteFile(filePath: string, content: string): void {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, content, "utf-8");
}

export function yamlStringify(obj: Record<string, unknown>): string {
  return jsYaml.dump(obj, { indent: 2, lineWidth: -1, noRefs: true });
}

export function createTrayIcon(): Electron.NativeImage {
  const candidates = [
    join(process.resourcesPath || "", "tray-icon.png"),
    join(__dirname, "../../build/tray-icon.png"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          const resized = img.resize({ width: 22, height: 22 });
          if (process.platform === "darwin") resized.setTemplateImage(true);
          return resized;
        }
      } catch { /* fall through */ }
    }
  }
  const size = 16;
  const raw: number[] = [];
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2 + 0.5;
      const dy = y - size / 2 + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < size / 2 - 1) {
        raw.push(0, 0, 0, 255);
      } else if (dist < size / 2) {
        raw.push(0, 0, 0, 128);
      } else {
        raw.push(0, 0, 0, 0);
      }
    }
  }
  const compressed = zlib.deflateSync(Buffer.from(raw));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      let cc = n;
      for (let k = 0; k < 8; k++)
        cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1;
      t[n] = cc;
    }
    for (let i = 0; i < buf.length; i++)
      c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const tb = Buffer.from(type, "ascii");
    const cb = Buffer.concat([tb, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cb));
    return Buffer.concat([len, tb, data, crc]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return nativeImage.createFromBuffer(png);
}

export function showChatNotification(
  title: string,
  body: string,
  mainWindow: BrowserWindow | null,
): void {
  if (!Notification.isSupported()) return;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) return;
  const notif = new Notification({ title, body });
  notif.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  notif.show();
}
