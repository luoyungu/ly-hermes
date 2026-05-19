const fs = require("node:fs");
const path = require("node:path");

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

exports.default = async function afterPack(context) {
  cleanMetadata(context.appOutDir);
};
