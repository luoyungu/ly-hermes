const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");

function cleanMetadata(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === ".DS_Store" || entry.name.startsWith("._")) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      continue;
    }
    if (entry.isDirectory()) {
      cleanMetadata(fullPath);
    }
  }
}

function getElectronVersion(context) {
  if (context.electronVersion) return context.electronVersion;
  try {
    return require(path.join(projectRoot, "node_modules", "electron", "package.json")).version;
  } catch {
    return "39.8.10";
  }
}

function installWindowsBetterSqlitePrebuild(context) {
  if (context.electronPlatformName !== "win32") return;

  const appDir = path.join(context.appOutDir, "resources", "app");
  const betterSqliteDir = path.join(appDir, "node_modules", "better-sqlite3");
  const prebuildBin = path.join(projectRoot, "node_modules", "prebuild-install", "bin.js");
  if (!fs.existsSync(betterSqliteDir)) {
    throw new Error(`better-sqlite3 not found in packaged app: ${betterSqliteDir}`);
  }
  if (!fs.existsSync(prebuildBin)) {
    throw new Error(`prebuild-install not found: ${prebuildBin}`);
  }

  const releaseDir = path.join(betterSqliteDir, "build", "Release");
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  execFileSync(
    process.execPath,
    [
      prebuildBin,
      "--runtime",
      "electron",
      "--target",
      getElectronVersion(context),
      "--platform",
      "win32",
      "--arch",
      "x64",
    ],
    {
      cwd: betterSqliteDir,
      stdio: "inherit",
      env: {
        ...process.env,
        npm_config_platform: "win32",
        npm_config_arch: "x64",
      },
    },
  );

  const nativePath = path.join(releaseDir, "better_sqlite3.node");
  const magic = fs.readFileSync(nativePath).subarray(0, 2).toString("ascii");
  if (magic !== "MZ") {
    throw new Error(`Invalid Windows better-sqlite3 native module: ${nativePath}`);
  }
}

exports.default = async function afterPack(context) {
  installWindowsBetterSqlitePrebuild(context);
  cleanMetadata(context.appOutDir);
};
