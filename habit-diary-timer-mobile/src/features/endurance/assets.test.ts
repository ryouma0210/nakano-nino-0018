import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { hasCompleteEnduranceAssets } from "./media";
import type { EndurancePreset } from "./game";

const registryPath = fileURLToPath(new URL("./assets.ts", import.meta.url));
const registryModule = { exports: {} as { enduranceAssets: Record<Exclude<EndurancePreset, "custom">, { id: string; label: string; kind: "image" | "video"; source: string }[]> } };
// Evaluate only the registry, resolving static asset requires to filenames rather than decoding media.
runInNewContext(ts.transpileModule(readFileSync(registryPath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, {
  module: registryModule, exports: registryModule.exports,
  require: (path: string) => path === "./media" ? { hasCompleteEnduranceAssets } : resolve(dirname(registryPath), path),
});
const registry = registryModule.exports.enduranceAssets;

describe("registered endurance assets", () => {
  it("uses the supplied four image files in numeric order in each preset", () => {
    for (let game = 1; game <= 5; game += 1) {
      const assets = registry[`game-${game}` as keyof typeof registry];
      expect(assets.map((asset) => basename(asset.source))).toEqual(
        [1, 2, 3, 4].map((number) => `bokkigamann_${game}_${number}.${game === 5 ? "jpg" : "jpeg"}`),
      );
      expect(assets.map((asset) => asset.label)).toEqual(["1", "2", "3", "4"]);
      expect(assets.every((asset) => asset.kind === "image")).toBe(true);
    }
  });

  it("references existing nonempty media and exactly one video for preset six", () => {
    const assets = Object.values(registry).flat();
    expect(assets).toHaveLength(21);
    expect(new Set(assets.map((asset) => asset.source)).size).toBe(21);
    expect(new Set(assets.map((asset) => asset.id)).size).toBe(21);
    for (const asset of assets) {
      expect(statSync(asset.source).isFile()).toBe(true);
      expect(statSync(asset.source).size).toBeGreaterThan(0);
    }
    expect(registry["game-6"]).toHaveLength(1);
    expect(registry["game-6"][0].kind).toBe("video");
    expect(basename(registry["game-6"][0].source)).toBe("○○我慢ゲーム⑥(ファイナル).mp4");
  });

  it("maps all assets to distinct valid Android resource paths", () => {
    const requireModule = createRequire(import.meta.url);
    const requireExpo = createRequire(requireModule.resolve("expo/package.json"));
    const { parse } = requireModule("metro/private/node-haste/lib/AssetPaths");
    const { getAssetLocalPath } = requireExpo("@expo/cli/build/src/export/metroAssetLocalPath");
    const outputs = Object.entries(registry).flatMap(([preset, assets]) => assets.map((asset) => {
      const parsed = parse(asset.source, new Set(["android", "ios", "native", "web"]));
      return getAssetLocalPath({ ...parsed, httpServerLocation: `/assets/assets/endurance/${preset}` }, { platform: "android", scale: parsed.resolution });
    }));
    expect(new Set(outputs).size).toBe(21);
    for (const output of outputs) expect(output.replace(/\\/g, "/")).toMatch(/^(?:drawable|raw)(?:-[a-z0-9]+)?\/[a-z0-9_]+\.[a-z0-9]+$/);
  });
});
