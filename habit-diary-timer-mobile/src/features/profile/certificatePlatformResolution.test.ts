import { realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileSystemLookup, ResolutionContext } from "metro-resolver";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const profileDirectory = join(projectRoot, "src/features/profile");
const { resolve } = require("@expo/metro/metro-resolver") as typeof import("metro-resolver");
const { resolver } = require(join(projectRoot, "metro.config.js")) as {
  resolver: { sourceExts: string[]; assetExts: string[]; resolverMainFields: string[] };
};

const fileSystemLookup: FileSystemLookup = (filePath) => {
  try {
    const stat = statSync(filePath);
    return { exists: true, type: stat.isDirectory() ? "d" : "f", realPath: realpathSync(filePath) };
  } catch {
    return { exists: false };
  }
};

function resolveCertificateModule(moduleName: string, platform: "android" | "ios" | "web") {
  const context: ResolutionContext = {
    originModulePath: join(projectRoot, "app/(tabs)/mypage.tsx"),
    sourceExts: resolver.sourceExts,
    assetExts: new Set(resolver.assetExts),
    mainFields: resolver.resolverMainFields,
    // Expo's platform resolver enables .native variants only outside Web.
    preferNativePlatform: platform !== "web",
    fileSystemLookup,
    doesFileExist: (filePath) => {
      const result = fileSystemLookup(filePath);
      return result.exists && result.type === "f";
    },
    // The imports below are local files, with no package/haste redirects.
    getPackageForModule: () => null,
    getPackage: () => null,
    resolveAsset: () => null,
    redirectModulePath: (filePath) => filePath,
    resolveHasteModule: () => null,
    resolveHastePackage: () => null,
    allowHaste: false,
    customResolverOptions: {},
    disableHierarchicalLookup: false,
    extraNodeModules: null,
    dev: false,
    nodeModulesPaths: [],
    unstable_conditionNames: [],
    unstable_conditionsByPlatform: {},
    unstable_enablePackageExports: true,
    unstable_incrementalResolution: false,
    unstable_logWarning: () => undefined,
  };
  return resolve(context, join(profileDirectory, moduleName), platform);
}

describe("certificate platform entry points", () => {
  // Metro checks each source extension before moving to the next one. A generic
  // .ts hook used to shadow .native.tsx and throw the Web fallback on Android/iOS.
  it.each(["android", "ios"] as const)("uses the capture renderer on %s", (platform) => {
    expect(resolveCertificateModule("useCertificateImageRenderer", platform)).toEqual({
      type: "sourceFile",
      filePath: realpathSync(join(profileDirectory, "useCertificateImageRenderer.native.tsx")),
    });
  });

  it("keeps the native capture renderer out of Web", () => {
    expect(resolveCertificateModule("useCertificateImageRenderer", "web")).toEqual({
      type: "sourceFile",
      filePath: realpathSync(join(profileDirectory, "useCertificateImageRenderer.tsx")),
    });
  });

  it.each(["android", "ios", "web"] as const)("selects the correct PNG export helper on %s", (platform) => {
    expect(resolveCertificateModule("certificateImage", platform)).toEqual({
      type: "sourceFile",
      filePath: realpathSync(join(profileDirectory, platform === "web" ? "certificateImage.web.ts" : "certificateImage.ts")),
    });
  });
});
