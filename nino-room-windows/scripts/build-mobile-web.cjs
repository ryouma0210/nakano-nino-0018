const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const windowsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(windowsRoot, "..");
const mobileRoot = path.join(repoRoot, "habit-diary-timer-mobile");
const outputDirectory = path.join(windowsRoot, "dist-web");

execFileSync("npm", ["run", "sync:shared"], {
  cwd: mobileRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

execFileSync(
  "npx",
  ["expo", "export", "--platform", "web", "--output-dir", outputDirectory],
  {
    cwd: mobileRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

const indexPath = path.join(outputDirectory, "index.html");
const indexHtml = fs.readFileSync(indexPath, "utf8");
const mobileShellStyle = `
    <style id="nino-desktop-mobile-shell">
      html,
      body {
        background: #050505;
      }

      body {
        display: flex;
        justify-content: center;
      }

      #root {
        width: min(100vw, 430px);
        max-width: 430px;
        min-height: 100%;
        background: #050505;
      }
    </style>`;

if (!indexHtml.includes("nino-desktop-mobile-shell")) {
  fs.writeFileSync(
    indexPath,
    indexHtml.replace("</head>", `${mobileShellStyle}\n  </head>`),
  );
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

for (const filePath of listFiles(outputDirectory)) {
  if (path.extname(filePath) !== ".js") continue;

  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes("Sync operation timeout")) continue;

  const patched = source
    .replaceAll("A>1e6", "A>1e9")
    .replaceAll("i>1e6", "i>1e9")
    .replaceAll("i > 1_000_000", "i > 1000_000_000");

  if (patched !== source) {
    fs.writeFileSync(filePath, patched);
  }
}
