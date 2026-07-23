const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = path.join(root, "habit-diary-timer-mobile", "assets");
const destination = path.join(root, "nino-room-windows", "public", "assets");

if (!fs.existsSync(source)) throw new Error(`共通アセットが見つかりません: ${source}`);
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
console.log(`共通アセットを同期しました: ${source} -> ${destination}`);
