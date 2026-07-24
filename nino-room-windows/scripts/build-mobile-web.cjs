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
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? process.env.NINO_APP_ENV ?? "stg";
const mobileShellStyle = `
    <script id="nino-desktop-env">
      window.__NINO_APP_ENV__ = ${JSON.stringify(appEnv)};
    </script>
    <style id="nino-desktop-mobile-shell">
      html,
      body {
        background: #050505;
        height: 100%;
        overflow: hidden;
      }

      body {
        display: flex;
        justify-content: center;
      }

      #root {
        width: min(100vw, 430px);
        max-width: 430px;
        height: 100vh;
        background: #050505;
        overflow-x: hidden;
        position: relative;
      }

      #root > * {
        max-width: 430px;
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
        min-width: 42px !important;
        min-height: 42px !important;
        font-size: 22px !important;
        overflow: visible !important;
      }

      [data-nino-defeat-heart] {
        pointer-events: none !important;
        opacity: 0.5 !important;
        overflow: hidden !important;
        left: 50% !important;
        right: auto !important;
        transform: translateX(-50%) !important;
        max-width: 430px !important;
      }
    </style>
    <script id="nino-desktop-web-sound-guard">
      (() => {
        if (!window.ninoDesktop) {
          const FILES_KEY = "nino-room-web-files-v1";
          const readFiles = () => {
            try {
              return JSON.parse(localStorage.getItem(FILES_KEY) || "[]");
            } catch {
              return [];
            }
          };
          const writeFiles = (files) => localStorage.setItem(FILES_KEY, JSON.stringify(files));
          const chooseFiles = () =>
            new Promise((resolve) => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.accept = "image/*,video/*,audio/*";
              input.style.display = "none";
              document.body.appendChild(input);
              input.addEventListener("change", async () => {
                const existing = readFiles();
                const selected = Array.from(input.files || []);
                const added = await Promise.all(
                  selected.map(
                    (file) =>
                      new Promise((fileResolve) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                          fileResolve({
                            name: file.name,
                            path: "web:" + Date.now() + ":" + file.name,
                            url: String(reader.result || ""),
                            size: file.size,
                          });
                        };
                        reader.onerror = () => fileResolve(null);
                        reader.readAsDataURL(file);
                      }),
                  ),
                );
                const files = [...existing, ...added.filter(Boolean)];
                writeFiles(files);
                input.remove();
                resolve(files);
              });
              input.addEventListener("cancel", () => {
                input.remove();
                resolve(readFiles());
              });
              input.click();
            });
          window.ninoDesktop = {
            getWindowState: async () => ({ zoom: 1, fullScreen: false }),
            setZoom: async () => undefined,
            toggleFullScreen: async () => undefined,
            onZoomChanged: () => () => undefined,
            listFiles: async () => readFiles(),
            pickFiles: chooseFiles,
            removeFile: async (filePath) => {
              const files = readFiles().filter((file) => file.path !== filePath);
              writeFiles(files);
              return files;
            },
          };
        }

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

        const tuneRhythmMarks = () => {
          document.querySelectorAll("div, span").forEach((element) => {
            const text = element.textContent?.trim();
            if (text !== "Q" && text !== "シコ") return;
            element.style.display = "inline-flex";
            element.style.alignItems = "center";
            element.style.justifyContent = "center";
            element.style.textAlign = "center";
            element.style.lineHeight = "1";
            element.style.fontWeight = "900";
            element.style.fontSize = text === "Q" ? "24px" : "16px";
            element.style.minWidth = text === "Q" ? "44px" : "48px";
            element.style.minHeight = text === "Q" ? "44px" : "48px";
            element.style.overflow = "visible";
          });
        };

        const tuneVideos = () => {
          document.querySelectorAll("video").forEach((video) => {
            video.muted = true;
            video.defaultMuted = true;
            video.playsInline = true;
            video.loop = true;
            video.autoplay = true;
            video.removeAttribute("controls");
            if (video.paused) {
              video.play().catch(() => {});
            }
          });
        };

        const tune = () => {
          tuneRhythmMarks();
          tuneVideos();
        };
        window.addEventListener("load", tune);
        window.addEventListener("pointerdown", () => setTimeout(tune, 50), true);
        setInterval(tune, 1000);
        new MutationObserver(tune).observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
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
