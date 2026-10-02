import type { Direction } from "./gameLogic";

type Controls = { enabled: boolean; onMove: (direction: Direction) => void; onAdvance?: () => void };

const arrowDirections = new Map<string, Direction>([
  ["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"],
]);
const repeatIntervalMs = 140;
const arrowKeyTags = new Set(["INPUT", "TEXTAREA", "SELECT", "VIDEO", "AUDIO", "DIALOG"]);
const arrowKeyRoles = new Set(["slider", "textbox", "combobox", "spinbutton", "listbox", "dialog", "alertdialog"]);
const enterKeyTags = new Set(["BUTTON", "A", "SUMMARY", "FORM"]);
const enterKeyRoles = new Set(["button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "treeitem"]);

function keepsArrowKeys(target: EventTarget | null) {
  for (let element = target instanceof Element ? target : null; element; element = element.parentElement) {
    const editable = element.getAttribute("contenteditable");
    if (arrowKeyTags.has(element.tagName) || arrowKeyRoles.has(element.getAttribute("role") ?? "")
      || (editable !== null && editable !== "false")) return true;
  }
  return false;
}

function keepsEnter(target: EventTarget | null) {
  for (let element = target instanceof Element ? target : null; element; element = element.parentElement) {
    if (element.getAttribute("data-outside-advance") === "true"
      || element.getAttribute("data-outside-movement") === "true") return false;
    if (enterKeyTags.has(element.tagName) || enterKeyRoles.has(element.getAttribute("role") ?? "")) return true;
  }
  return false;
}

function ignoresShortcut(event: KeyboardEvent, document: Document) {
  return event.defaultPrevented || event.isComposing || event.keyCode === 229
    || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
    || keepsArrowKeys(event.target) || keepsArrowKeys(document.activeElement);
}

/** Read current controls for every event so a modal or encounter stops a held key immediately. */
export function attachOutsideKeyboardControls(document: Document, readControls: () => Controls) {
  const capture = { capture: true };
  let lastMoveAt = -Infinity;
  let enterHeld = false;
  const consumeEnter = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const handleEnter = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    // Keep owning the key until release, even if advancing removed the current message.
    if (enterHeld) { consumeEnter(event); return; }
    const { onAdvance } = readControls();
    if (!onAdvance || ignoresShortcut(event, document)
      || keepsEnter(event.target) || keepsEnter(document.activeElement)) return;
    enterHeld = true;
    consumeEnter(event);
    if (!event.repeat) onAdvance();
  };
  const releaseEnter = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || !enterHeld) return;
    consumeEnter(event);
    enterHeld = false;
  };
  const clearHeldEnter = () => { enterHeld = false; };
  const handleKey = (event: KeyboardEvent) => {
    const { enabled, onMove } = readControls();
    const direction = arrowDirections.get(event.key);
    if (!enabled || !direction || ignoresShortcut(event, document)) return;

    // Suppress scrolling for all handled repeats, including ones skipped by the movement limit.
    event.preventDefault();
    const now = performance.now();
    if (event.repeat && now - lastMoveAt < repeatIntervalMs) return;
    lastMoveAt = now;
    onMove(direction);
  };

  // Capture Enter before React Native Web's PressResponder can activate a focused control.
  document.addEventListener("keydown", handleEnter, capture);
  document.addEventListener("keyup", releaseEnter, capture);
  document.addEventListener("keydown", handleKey);
  document.defaultView?.addEventListener("blur", clearHeldEnter);
  return () => {
    clearHeldEnter();
    document.removeEventListener("keydown", handleEnter, capture);
    document.removeEventListener("keyup", releaseEnter, capture);
    document.removeEventListener("keydown", handleKey);
    document.defaultView?.removeEventListener("blur", clearHeldEnter);
  };
}
