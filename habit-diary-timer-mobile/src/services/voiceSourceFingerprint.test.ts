import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fingerprintVoiceBlob, fingerprintVoiceFile } from "./voiceSourceFingerprint";
const mocks = vi.hoisted(() => ({ info: vi.fn(), read: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({ EncodingType: { Base64: "base64" }, getInfoAsync: mocks.info, readAsStringAsync: mocks.read }));

afterEach(() => vi.resetAllMocks());

describe("original voice fingerprints", () => {
  const bytes = Buffer.from(Array.from({ length: 256 * 1024 + 127 }, (_, i) => i % 256));
  const expected = { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };

  it("hashes complete browser bytes across chunk boundaries", async () => {
    expect(await fingerprintVoiceBlob(new Blob([bytes]))).toEqual(expected);
  });

  it("decodes and hashes complete native base64 chunks identically", async () => {
    mocks.info.mockResolvedValue({ exists: true, isDirectory: false, size: bytes.length });
    mocks.read.mockImplementation(async (_uri: string, options: { position: number; length: number }) =>
      bytes.subarray(options.position, options.position + options.length).toString("base64"));
    expect(await fingerprintVoiceFile("file:///voice.wav")).toEqual(expected);
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });

  it("rejects incomplete native reads rather than saving an incorrect fingerprint", async () => {
    mocks.info.mockResolvedValue({ exists: true, isDirectory: false, size: bytes.length });
    mocks.read.mockResolvedValue("YQ==");
    await expect(fingerprintVoiceFile("file:///voice.wav")).rejects.toThrow("比較できません");
  });
});
