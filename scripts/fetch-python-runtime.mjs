import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { chmod, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RELEASE = "20260510";
const PYTHON_VERSION = "3.11.15";
const FLAVOR = "install_only_stripped";
const BASE_URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}`;

const TARGETS = {
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "win-x64": "x86_64-pc-windows-msvc",
  "linux-x64": "x86_64-unknown-linux-gnu",
};

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(rootDir, "build", "runtime", "python");

function currentTarget() {
  const platform =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "win32"
        ? "win"
        : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${platform}-${arch}`;
}

function parseTargets() {
  const arg = process.argv.find((value) => value.startsWith("--platform="));
  const value = arg?.split("=")[1] || currentTarget();
  if (value === "all") return Object.keys(TARGETS);
  const requested = value.split(",").map((item) => item.trim()).filter(Boolean);
  for (const target of requested) {
    if (!TARGETS[target]) {
      throw new Error(`Unknown platform "${target}". Valid values: ${Object.keys(TARGETS).join(", ")}, all`);
    }
  }
  return requested;
}

function artifactName(target) {
  return `cpython-${PYTHON_VERSION}+${RELEASE}-${TARGETS[target]}-${FLAVOR}.tar.gz`;
}

function download(url, dest) {
  return new Promise((resolveDownload, rejectDownload) => {
    const request = httpsGet(url, { headers: { "User-Agent": "lyhermes-runtime-fetch" } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        download(response.headers.location, dest).then(resolveDownload, rejectDownload);
        return;
      }
      if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
        rejectDownload(new Error(`Download failed: HTTP ${response.statusCode}`));
        return;
      }
      mkdirSync(dirname(dest), { recursive: true });
      const file = createWriteStream(dest);
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolveDownload();
      });
      file.on("error", rejectDownload);
    });
    request.on("error", rejectDownload);
  });
}

async function extract(archive, targetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  const result = spawnSync("tar", ["-xzf", archive, "--strip-components=1", "-C", targetDir], {
    stdio: "inherit",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`tar extraction failed for ${archive}`);
  }
}

async function removeByName(root, predicate) {
  if (!existsSync(root)) return;
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (predicate(entry.name, path)) {
      await rm(path, { recursive: true, force: true });
      return;
    }
    if (entry.isDirectory()) {
      await removeByName(path, predicate);
    }
  }));
}

async function trimRuntime(targetDir) {
  await removeByName(targetDir, (name) => name === ".DS_Store" || name.startsWith("._"));

  const libDir = join(targetDir, "lib");
  const stdlibDir = join(libDir, "python3.11");
  const sitePackagesDir = join(stdlibDir, "site-packages");
  const removePaths = [
    join(targetDir, "bin", "2to3"),
    join(targetDir, "bin", "2to3-3.11"),
    join(targetDir, "bin", "idle3"),
    join(targetDir, "bin", "idle3.11"),
    join(targetDir, "bin", "pip"),
    join(targetDir, "bin", "pip3"),
    join(targetDir, "bin", "pip3.11"),
    join(stdlibDir, "idlelib"),
    join(stdlibDir, "lib2to3"),
    join(stdlibDir, "tkinter"),
    join(stdlibDir, "turtledemo"),
    join(sitePackagesDir, "pip"),
    join(sitePackagesDir, "setuptools"),
    join(sitePackagesDir, "_distutils_hack"),
    join(sitePackagesDir, "distutils-precedence.pth"),
  ];
  for (const path of removePaths) {
    await rm(path, { recursive: true, force: true });
  }
  await removeByName(sitePackagesDir, (name) => name.startsWith("pip-") || name.startsWith("setuptools-"));
  await removeByName(libDir, (name) => /^tcl|^tk|tk.*\.dylib$/.test(name) || name.includes("tcl") && name.endsWith(".dylib"));
}

async function verify(target, targetDir) {
  const python = target.startsWith("win-")
    ? join(targetDir, "python.exe")
    : join(targetDir, "bin", "python3");
  if (!existsSync(python)) {
    throw new Error(`Python executable not found: ${python}`);
  }
  if (!target.startsWith("win-")) {
    await chmod(python, 0o755);
  }
  if (target === currentTarget()) {
    const version = spawnSync(python, ["--version"], { encoding: "utf-8" });
    const output = `${version.stdout || ""}${version.stderr || ""}`.trim();
    if (version.status !== 0 || !output.includes("Python 3.11")) {
      throw new Error(`Runtime verification failed for ${target}: ${output}`);
    }
    const ensurepip = spawnSync(python, ["-m", "ensurepip", "--version"], { encoding: "utf-8" });
    if (ensurepip.status !== 0) {
      throw new Error(`ensurepip verification failed for ${target}`);
    }
  }
  return python;
}

async function writeManifest(targets) {
  const manifestPath = join(runtimeDir, "manifest.json");
  const existing = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, "utf-8"))
    : {};
  const next = {
    ...existing,
    source: "astral-sh/python-build-standalone",
    release: RELEASE,
    pythonVersion: PYTHON_VERSION,
    flavor: FLAVOR,
    targets: {
      ...(existing.targets || {}),
    },
  };
  for (const target of targets) {
    next.targets[target] = {
      artifact: artifactName(target),
      distribution: TARGETS[target],
    };
  }
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`, "utf-8"),
  );
}

async function main() {
  const targets = parseTargets();
  const tempRoot = await mkdtemp(join(tmpdir(), "lyhermes-python-"));
  try {
    for (const target of targets) {
      const name = artifactName(target);
      const url = `${BASE_URL}/${encodeURIComponent(name)}`;
      const archive = join(tempRoot, name);
      const targetDir = join(runtimeDir, target);
      console.log(`Downloading ${target}: ${name}`);
      await download(url, archive);
      console.log(`Extracting to ${targetDir}`);
      await extract(archive, targetDir);
      await trimRuntime(targetDir);
      const python = await verify(target, targetDir);
      await removeByName(targetDir, (name) => name === ".DS_Store" || name.startsWith("._"));
      console.log(`Ready: ${python}`);
    }
    await writeManifest(targets);
    await removeByName(runtimeDir, (name) => name === ".DS_Store" || name.startsWith("._"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
