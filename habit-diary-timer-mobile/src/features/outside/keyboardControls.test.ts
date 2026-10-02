import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachOutsideKeyboardControls } from "./keyboardControls";

class FocusElement extends EventTarget {
  constructor(
    readonly tagName: string,
    readonly attributes: Record<string, string> = {},
    readonly parentElement: FocusElement | null = null,
  ) { super(); }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
}

function setup(onAdvance?: () => void) {
  const view = new EventTarget();
  const document = Object.assign(new EventTarget(), { activeElement: null as FocusElement | null, defaultView: view });
  const subscriptions = vi.spyOn(document, "addEventListener");
  const controls = { enabled: true, onMove: vi.fn(), onAdvance };
  const detach = attachOutsideKeyboardControls(document as unknown as Document, () => controls);
  const dispatch = (type: string, key: string, properties: Partial<KeyboardEvent> = {}) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { key, repeat: false }, properties);
    document.dispatchEvent(event);
    return event;
  };
  const press = (key: string, properties: Partial<KeyboardEvent> = {}) => dispatch("keydown", key, properties);
  const release = (key = "Enter") => dispatch("keyup", key);
  return { document, view, subscriptions, controls, detach, press, release };
}

beforeEach(() => { vi.stubGlobal("Element", FocusElement); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("outside keyboard movement", () => {
  it("moves once in each arrow direction, reserving scrolling only for arrows", () => {
    const { controls, press } = setup();
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(press(key).defaultPrevented).toBe(true);
    }
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(controls.onMove.mock.calls).toEqual([["up"], ["down"], ["left"], ["right"]]);
  });

  it("limits a held arrow using native repeats while keeping fresh presses immediate", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const { controls, press } = setup();
    press("ArrowUp");
    for (const time of [30, 60, 139, 140, 170, 279, 280]) {
      clock.mockReturnValue(time);
      expect(press("ArrowUp", { repeat: true }).defaultPrevented).toBe(true);
    }
    expect(controls.onMove).toHaveBeenCalledTimes(3);
    clock.mockReturnValue(281);
    press("ArrowUp");
    press("ArrowLeft");
    expect(controls.onMove).toHaveBeenCalledTimes(5);
    expect(controls.onMove).toHaveBeenLastCalledWith("left");
  });

  it.each(["altKey", "ctrlKey", "metaKey", "shiftKey", "isComposing"])("leaves %s gestures alone", (property) => {
    const onAdvance = vi.fn();
    const { controls, press } = setup(onAdvance);
    expect(press("ArrowRight", { [property]: true }).defaultPrevented).toBe(false);
    expect(press("Enter", { [property]: true }).defaultPrevented).toBe(false);
    expect(controls.onMove).not.toHaveBeenCalled();
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it("respects earlier handlers and legacy composition events", () => {
    const onAdvance = vi.fn();
    const { document, controls, press } = setup(onAdvance);
    for (const key of ["ArrowUp", "Enter"]) {
      const event = Object.assign(new Event("keydown", { cancelable: true }), { key });
      event.preventDefault();
      document.dispatchEvent(event);
      expect(press(key, { keyCode: 229 }).defaultPrevented).toBe(false);
    }
    expect(controls.onMove).not.toHaveBeenCalled();
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it.each([
    ["INPUT", {}], ["TEXTAREA", {}], ["SELECT", {}], ["VIDEO", {}], ["AUDIO", {}],
    ["DIV", { contenteditable: "true" }], ["DIV", { contenteditable: "" }],
    ["DIV", { contenteditable: "plaintext-only" }], ["DIV", { role: "slider" }],
    ["DIALOG", {}], ["DIV", { role: "dialog" }], ["DIV", { role: "alertdialog" }],
  ] as const)("preserves keys for focus within %s %j", (tag, attributes) => {
    const onAdvance = vi.fn();
    const { document, controls, press } = setup(onAdvance);
    document.activeElement = new FocusElement("SPAN", {}, new FocusElement(tag, attributes));
    expect(press("ArrowDown").defaultPrevented).toBe(false);
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(controls.onMove).not.toHaveBeenCalled();
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it("checks the event target even when active focus has already changed", () => {
    const { document, controls } = setup();
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "ArrowUp" });
    Object.defineProperty(event, "target", { value: new FocusElement("INPUT") });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(controls.onMove).not.toHaveBeenCalled();
  });

  it("allows ordinary game buttons and noneditable elements to move", () => {
    const { document, controls, press } = setup();
    document.activeElement = new FocusElement("BUTTON", {}, new FocusElement("DIV", { contenteditable: "false" }));
    expect(press("ArrowLeft").defaultPrevented).toBe(true);
    expect(controls.onMove).toHaveBeenCalledWith("left");
  });

  it("uses the latest enabled state and callback, and removes movement on cleanup", () => {
    const { controls, detach, press } = setup();
    const firstMove = controls.onMove;
    press("ArrowUp");
    controls.enabled = false;
    expect(press("ArrowUp", { repeat: true }).defaultPrevented).toBe(false);
    expect(firstMove).toHaveBeenCalledOnce();
    controls.onMove = vi.fn();
    controls.enabled = true;
    press("ArrowDown");
    expect(controls.onMove).toHaveBeenCalledExactlyOnceWith("down");
    expect(firstMove).toHaveBeenCalledOnce();
    detach();
    expect(press("ArrowRight").defaultPrevented).toBe(false);
    expect(controls.onMove).toHaveBeenCalledOnce();
  });
});

describe("outside Enter message advancement", () => {
  it.each(["Enter", "NumpadEnter"])("advances with %s when movement is disabled and consumes native activation", (code) => {
    const onAdvance = vi.fn();
    const { controls, subscriptions, press, release } = setup(onAdvance);
    controls.enabled = false;
    const down = press("Enter", { code });
    const up = release();
    expect(onAdvance).toHaveBeenCalledOnce();
    expect(controls.onMove).not.toHaveBeenCalled();
    expect(down.defaultPrevented).toBe(true);
    expect(down.cancelBubble).toBe(true);
    expect(up.defaultPrevented).toBe(true);
    expect(up.cancelBubble).toBe(true);
    expect(subscriptions).toHaveBeenCalledWith("keydown", expect.any(Function), { capture: true });
    expect(subscriptions).toHaveBeenCalledWith("keyup", expect.any(Function), { capture: true });
  });

  it("consumes a held Enter after its callback disappears or focus moves to an action", () => {
    const onAdvance = vi.fn();
    const { document, controls, press, release } = setup(onAdvance);
    press("Enter");
    controls.onAdvance = undefined;
    document.activeElement = new FocusElement("BUTTON");
    const repeat = press("Enter", { repeat: true });
    expect(repeat.defaultPrevented).toBe(true);
    expect(repeat.cancelBubble).toBe(true);
    expect(release().defaultPrevented).toBe(true);
    expect(onAdvance).toHaveBeenCalledOnce();
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(release().defaultPrevented).toBe(false);
  });

  it("waits for release before another advance, including when the callback changes", () => {
    const firstAdvance = vi.fn();
    const nextAdvance = vi.fn();
    const { controls, press, release } = setup(firstAdvance);
    press("Enter");
    controls.onAdvance = nextAdvance;
    press("Enter", { repeat: true });
    press("Enter");
    release("ArrowUp");
    press("Enter", { repeat: true });
    expect(firstAdvance).toHaveBeenCalledOnce();
    expect(nextAdvance).not.toHaveBeenCalled();
    release();
    press("Enter");
    expect(nextAdvance).toHaveBeenCalledOnce();
  });

  it("never advances from an initial native repeat, such as after a focus change", () => {
    const onAdvance = vi.fn();
    const { press, release } = setup(onAdvance);
    expect(press("Enter", { repeat: true }).defaultPrevented).toBe(true);
    expect(onAdvance).not.toHaveBeenCalled();
    release();
    press("Enter");
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("resets a held Enter on window blur and removes all handlers on cleanup", () => {
    const onAdvance = vi.fn();
    const { view, controls, press, release, detach } = setup(onAdvance);
    const removeBlur = vi.spyOn(view, "removeEventListener");
    press("Enter");
    view.dispatchEvent(new Event("blur"));
    expect(release().defaultPrevented).toBe(false);
    press("Enter");
    expect(onAdvance).toHaveBeenCalledTimes(2);
    detach();
    expect(press("Enter", { repeat: true }).defaultPrevented).toBe(false);
    expect(release().defaultPrevented).toBe(false);
    expect(press("ArrowDown").defaultPrevented).toBe(false);
    expect(onAdvance).toHaveBeenCalledTimes(2);
    expect(controls.onMove).not.toHaveBeenCalled();
    expect(removeBlur).toHaveBeenCalledWith("blur", expect.any(Function));
  });

  it.each([
    ["BUTTON", {}], ["A", { href: "/" }], ["DIV", { role: "button" }],
    ["SPAN", { role: "link" }], ["SUMMARY", {}], ["DIV", { role: "checkbox" }],
  ] as const)("preserves Enter on an unrelated %s %j", (tag, attributes) => {
    const onAdvance = vi.fn();
    const { document, press, release } = setup(onAdvance);
    document.activeElement = new FocusElement("SPAN", {}, new FocusElement(tag, attributes));
    const down = press("Enter");
    expect(down.defaultPrevented).toBe(false);
    expect(down.cancelBubble).toBe(false);
    expect(release().defaultPrevented).toBe(false);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it.each(["data-outside-advance", "data-outside-movement"])("allows Enter on the marked %s control", (marker) => {
    const onAdvance = vi.fn();
    const { document, controls } = setup(onAdvance);
    const button = new FocusElement("BUTTON", { [marker]: "true" });
    document.activeElement = button;
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "Enter" });
    Object.defineProperty(event, "target", { value: new FocusElement("SPAN", {}, button) });
    document.dispatchEvent(event);
    expect(onAdvance).toHaveBeenCalledOnce();
    expect(controls.onMove).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(event.cancelBubble).toBe(true);
  });

  it("does not let markers override dialog or input protection", () => {
    const onAdvance = vi.fn();
    const { document, press } = setup(onAdvance);
    document.activeElement = new FocusElement("INPUT", { "data-outside-advance": "true" });
    expect(press("Enter").defaultPrevented).toBe(false);
    document.activeElement = new FocusElement("BUTTON", { "data-outside-advance": "true" }, new FocusElement("DIALOG"));
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it("checks unrelated event targets even if active focus changed", () => {
    const onAdvance = vi.fn();
    const { document } = setup(onAdvance);
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "Enter" });
    Object.defineProperty(event, "target", { value: new FocusElement("A", { href: "/" }) });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it("leaves Enter and its release alone when there is no message callback", () => {
    const { press, release } = setup();
    const down = press("Enter");
    expect(down.defaultPrevented).toBe(false);
    expect(down.cancelBubble).toBe(false);
    expect(release().defaultPrevented).toBe(false);
  });
});
