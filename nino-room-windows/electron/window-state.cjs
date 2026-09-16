const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2;

function normalizeZoom(value) {
  return Number.isFinite(value) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) : 1;
}

function normalizeWindowState(value, workArea) {
  const saved = value && typeof value === "object" ? value : {};
  const dimension = (size, fallback, minimum, available) => Math.min(
    available, Math.max(minimum, Number.isFinite(size) && size > 0 ? Math.round(size) : fallback),
  );
  const width = dimension(saved.width, 1280, 390, workArea.width);
  const height = dimension(saved.height, 860, 640, workArea.height);
  const coordinate = (position, origin, available, size) => Math.min(
    origin + available - size,
    Math.max(origin, Number.isFinite(position) ? Math.round(position) : origin + Math.round((available - size) / 2)),
  );
  return {
    width,
    height,
    x: coordinate(saved.x, workArea.x, workArea.width, width),
    y: coordinate(saved.y, workArea.y, workArea.height, height),
    maximized: saved.maximized === true,
    fullScreen: saved.fullScreen === true,
    zoom: normalizeZoom(saved.zoom),
  };
}

function windowShortcut(input) {
  if (input.type !== "keyDown" || input.isComposing || input.alt) return null;
  if (input.key === "F11" && !input.control && !input.meta && !input.shift) return "fullscreen";
  if (!input.control && !input.meta) return null;
  if (["=", "+"].includes(input.key) || input.code === "NumpadAdd") return "zoom-in";
  if (input.key === "-" || input.code === "NumpadSubtract") return "zoom-out";
  if (input.key === "0") return "zoom-reset";
  return null;
}

module.exports = { normalizeWindowState, normalizeZoom, windowShortcut };
