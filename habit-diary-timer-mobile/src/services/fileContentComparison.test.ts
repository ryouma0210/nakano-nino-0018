import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTENT_COMPARE_CHUNK_SIZE, sameBlobContent, sameNativeFileContent } from "./fileContentComparison";

const native = vi.hoisted(() => ({ info: vi.fn(), read: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: native.info, readAsStringAsync: native.read, EncodingType: { Base64: "base64" },
}));

const chunkSize = CONTENT_COMPARE_CHUNK_SIZE;
let files: Map<string, Buffer>;
beforeEach(() => {
  vi.resetAllMocks();
  files = new Map();
  native.info.mockImplementation(async (uri: string) => files.has(uri)
    ? { exists: true, isDirectory: false, size: files.get(uri)!.length } : { exists: false });
  native.read.mockImplementation(async (uri: string, options: { position: number; length: number }) =>
    files.get(uri)!.subarray(options.position, options.position + options.length).toString("base64"));
});

describe("binary content comparison", () => {
  it("compares blob bytes independently of file names and MIME types", async () => {
    expect(await sameBlobContent(new File(["abc"], "a.wav", { type: "audio/wav" }), new Blob(["abc"]))).toBe(true);
    expect(await sameBlobContent(new Blob(), new Blob())).toBe(true);
  });
  it("checks the final blob byte beyond multiple bounded chunks", async () => {
    const bytes = new Uint8Array(chunkSize * 2 + 1).fill(5);
    const left = new Blob([bytes]);
    const spy = vi.spyOn(left, "slice");
    expect(await sameBlobContent(left, new Blob([bytes]))).toBe(true);
    expect(spy.mock.calls.every(([start, end]) => end! - start! <= chunkSize)).toBe(true);
    bytes[bytes.length - 1] = 6;
    expect(await sameBlobContent(left, new Blob([bytes]))).toBe(false);
  });
  it("does not read blobs with different sizes", async () => {
    const left = new Blob(["a"]);
    const spy = vi.spyOn(left, "slice");
    expect(await sameBlobContent(left, new Blob(["ab"]))).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
  it("rejects failed and incomplete blob reads instead of reporting duplicates", async () => {
    const left = new Blob(["abc"]);
    const unreadable = new Blob(["abc"]);
    vi.spyOn(unreadable, "arrayBuffer").mockRejectedValueOnce(new Error("unreadable"));
    vi.spyOn(left, "slice").mockReturnValueOnce(unreadable);
    await expect(sameBlobContent(left, new Blob(["abc"]))).rejects.toThrow("unreadable");
    vi.spyOn(left, "slice").mockReturnValueOnce(new Blob());
    await expect(sameBlobContent(left, new Blob(["abc"]))).rejects.toThrow("比較できませんでした");
  });
  it("compares every native chunk and detects a change at the end", async () => {
    files.set("left", Buffer.alloc(chunkSize + 3, 7));
    files.set("right", Buffer.from(files.get("left")!));
    expect(await sameNativeFileContent("left", "right")).toBe(true);
    expect(native.read.mock.calls.map(([, options]) => options.length)).toEqual([chunkSize, chunkSize, 3, 3]);
    files.get("right")![chunkSize + 2] = 9;
    expect(await sameNativeFileContent("left", "right")).toBe(false);
  });
  it("rejects different native sizes without reading the content", async () => {
    files.set("left", Buffer.from("a")); files.set("right", Buffer.from("ab"));
    expect(await sameNativeFileContent("left", "right")).toBe(false);
    expect(native.read).not.toHaveBeenCalled();
  });
  it("handles zero-length native files and rejects missing files", async () => {
    files.set("left", Buffer.alloc(0)); files.set("right", Buffer.alloc(0));
    expect(await sameNativeFileContent("left", "right")).toBe(true);
    await expect(sameNativeFileContent("missing", "right")).rejects.toThrow("比較できませんでした");
  });
  it("rejects short native reads and propagates access errors", async () => {
    files.set("left", Buffer.from("abc")); files.set("right", Buffer.from("abc"));
    native.read.mockResolvedValueOnce("");
    await expect(sameNativeFileContent("left", "right")).rejects.toThrow("比較できませんでした");
    native.read.mockResolvedValueOnce("YQ==");
    await expect(sameNativeFileContent("left", "right")).rejects.toThrow("比較できませんでした");
    native.read.mockRejectedValueOnce(new Error("permission denied"));
    await expect(sameNativeFileContent("left", "right")).rejects.toThrow("permission denied");
  });
  it("allows native base64 line endings", async () => {
    files.set("left", Buffer.from("abc")); files.set("right", Buffer.from("abc"));
    native.read.mockResolvedValueOnce("YWJj\r\n");
    expect(await sameNativeFileContent("left", "right")).toBe(true);
  });
  it("rejects a native source that changes size during comparison", async () => {
    files.set("left", Buffer.from("abc")); files.set("right", Buffer.from("abc"));
    native.read.mockImplementation(async () => { files.set("left", Buffer.from("abcd")); return "YWJj"; });
    await expect(sameNativeFileContent("left", "right")).rejects.toThrow("比較できませんでした");
  });
});
