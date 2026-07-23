/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const source = path.resolve(projectRoot, "..", "shared");
const destination = path.resolve(projectRoot, "src", "shared");

if (!fs.existsSync(source)) {
  throw new Error(`共通ソースが見つかりません: ${source}`);
}

fs.mkdirSync(destination, { recursive: true });
for (const fileName of ["messages.ts", "date.ts", "contract.ts"]) {
  fs.copyFileSync(
    path.join(source, fileName),
    path.join(destination, fileName),
  );
}

console.log(`共通ソースを同期しました: ${source} -> ${destination}`);
