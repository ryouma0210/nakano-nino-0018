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
        overflow-x: hidden;
        position: relative;
      }

      #root * {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }

      [data-nino-symbol],
      [aria-label="rhythm-symbol"] {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        line-height: 1 !important;
        overflow: visible !important;
      }

      [data-nino-defeat-heart] {
        pointer-events: none !important;
        opacity: 0.5 !important;
        overflow: hidden !important;
      }
    </style>
    <script id="nino-desktop-web-sound-guard">
      (() => {
        const WEB_VOLUME_SCALE = 0.55;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
        if (!descriptor?.set || !descriptor?.get || HTMLMediaElement.prototype.__ninoVolumeGuard) return;
        Object.defineProperty(HTMLMediaElement.prototype, "__ninoVolumeGuard", { value: true });
        Object.defineProperty(HTMLMediaElement.prototype, "volume", {
          configurable: true,
          get() {
            return descriptor.get.call(this);
          },
          set(value) {
            descriptor.set.call(this, Math.max(0, Math.min(1, Number(value) * WEB_VOLUME_SCALE)));
          },
        });
      })();
    </script>`;

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
