const assert = require("node:assert/strict");
const { test } = require("node:test");
const { normalizeWindowState, normalizeZoom, windowShortcut } = require("./window-state.cjs");

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

test("new windows use a centered desktop size", () => {
  assert.deepEqual(normalizeWindowState(null, workArea), {
    x: 320, y: 90, width: 1280, height: 860, zoom: 1, maximized: false, fullScreen: false,
  });
});

test("existing normal bounds, zoom, maximized and full-screen preferences survive restoration", () => {
  const saved = { x: 100, y: 120, width: 520, height: 900, zoom: 1.25, maximized: true, fullScreen: true };
  assert.deepEqual(normalizeWindowState(saved, workArea), saved);
  assert.deepEqual(normalizeWindowState({ ...saved, x: -1700 }, { ...workArea, x: -1920 }), { ...saved, x: -1700 });
});

test("smaller or disconnected displays keep the whole normal window reachable", () => {
  assert.deepEqual(normalizeWindowState({}, { x: 0, y: 0, width: 800, height: 600 }), {
    x: 0, y: 0, width: 800, height: 600, zoom: 1, maximized: false, fullScreen: false,
  });
  assert.deepEqual(normalizeWindowState({ x: 5000, y: 3000 }, workArea), {
    x: 640, y: 180, width: 1280, height: 860, zoom: 1, maximized: false, fullScreen: false,
  });
});

test("invalid saved values cannot produce invalid Electron bounds or zoom", () => {
  assert.deepEqual(normalizeWindowState({ width: -1, height: "huge", x: NaN, y: Infinity, zoom: NaN, maximized: "true", fullScreen: "true" }, workArea),
    normalizeWindowState({}, workArea));
  assert.equal(normalizeZoom(0.1), 0.75);
  assert.equal(normalizeZoom(3), 2);
  assert.equal(normalizeZoom(1.25), 1.25);
  assert.equal(normalizeZoom(Infinity), 1);
});

test("window shortcuts leave Escape, typing and composed input to the page", () => {
  const key = (value, rest = {}) => ({ type: "keyDown", key: value, ...rest });
  assert.equal(windowShortcut(key("F11")), "fullscreen");
  assert.equal(windowShortcut(key("+", { control: true, shift: true })), "zoom-in");
  assert.equal(windowShortcut(key("-", { control: true })), "zoom-out");
  assert.equal(windowShortcut(key("0", { control: true })), "zoom-reset");
  assert.equal(windowShortcut(key("Add", { control: true, code: "NumpadAdd" })), "zoom-in");
  for (const input of [key("Escape"), key("="), key("0"), key("F11", { type: "keyUp" }), key("+", { control: true, alt: true }), key("+", { control: true, isComposing: true })]) {
    assert.equal(windowShortcut(input), null);
  }
});
