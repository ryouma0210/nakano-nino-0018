import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const requireModule = createRequire(import.meta.url);
const requireExpo = createRequire(requireModule.resolve("expo/package.json"));

type ParsedAsset = { name: string; type: string; resolution: number };
const { parse } = requireModule("metro/private/node-haste/lib/AssetPaths") as {
  parse: (filePath: string, platforms: Set<string>) => ParsedAsset;
};
const { getAssetLocalPath } = requireExpo("@expo/cli/build/src/export/metroAssetLocalPath") as {
  getAssetLocalPath: (
    asset: ParsedAsset & { httpServerLocation: string },
    options: { platform: string; scale: number },
  ) => string;
};

const registryPath = fileURLToPath(new URL("./images.ts", import.meta.url));
const assetDirectory = fileURLToPath(new URL("../../../assets/sugoroku/", import.meta.url));
const imageFiles = readdirSync(assetDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(?:jpe?g|png|webp|gif)$/i.test(entry.name))
  .map((entry) => entry.name);

describe("sugoroku image assets", () => {
  it("gives every image a distinct Android resource path using the installed bundler", () => {
    const outputs = new Map<string, string[]>();
    for (const fileName of imageFiles) {
      const asset = parse(join(assetDirectory, fileName), new Set(["android", "ios", "native", "web"]));
      const output = getAssetLocalPath({ ...asset, httpServerLocation: "/assets/assets/sugoroku" }, {
        platform: "android",
        scale: asset.resolution,
      });
      outputs.set(output, [...(outputs.get(output) ?? []), fileName]);
    }

    expect(imageFiles.length).toBeGreaterThan(0);
    expect([...outputs].filter(([, files]) => files.length > 1)).toEqual([]);
  });

  it("references the images actually present in the asset directory", () => {
    const source = readFileSync(registryPath, "utf8");
    const referencedPaths = [...source.matchAll(/require\(["']([^"']+)["']\)/g)]
      .map((match) => resolve(dirname(registryPath), match[1]));

    expect(referencedPaths.sort()).toEqual(imageFiles.map((fileName) => join(assetDirectory, fileName)).sort());
  });
});
