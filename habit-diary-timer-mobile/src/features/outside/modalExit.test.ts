import { describe, expect, it, vi } from "vitest";
import { createModalExitController } from "./modalExit";

function setup() {
  let active = true;
  let nextId = 0;
  const frames = new Map<number, () => void>();
  const navigate = vi.fn();
  const requestFrame = vi.fn((callback: () => void) => {
    const id = ++nextId;
    frames.set(id, callback);
    return id;
  });
  const cancelFrame = vi.fn((id: number) => { frames.delete(id); });
  const controller = createModalExitController({ requestFrame, cancelFrame, canNavigate: () => active, navigate });
  return {
    controller, navigate, requestFrame, cancelFrame,
    setActive(value: boolean) { active = value; },
    step() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    },
  };
}

describe("quest crystal modal exit", () => {
  it("waits for the close signal and two separate frames before replacing the route", () => {
    const test = setup();
    expect(test.controller.request()).toBe(true);
    test.step();
    expect(test.requestFrame).not.toHaveBeenCalled();
    expect(test.navigate).not.toHaveBeenCalled();
    test.controller.modalClosed();
    test.step();
    expect(test.navigate).not.toHaveBeenCalled();
    test.step();
    expect(test.navigate).toHaveBeenCalledOnce();
    expect(test.controller.isPending()).toBe(false);
  });

  it("coalesces rapid taps and repeated dismissal events into one navigation", () => {
    const test = setup();
    expect(test.controller.request()).toBe(true);
    expect(test.controller.request()).toBe(false);
    test.controller.modalClosed();
    test.controller.modalClosed();
    expect(test.requestFrame).toHaveBeenCalledTimes(1);
    test.step();
    test.controller.modalClosed();
    test.step();
    test.controller.modalClosed();
    test.step();
    expect(test.navigate).toHaveBeenCalledOnce();
  });

  it.each([0, 1])("cancels a queued exit on back, blur, or unmount after %s frames", (elapsedFrames) => {
    const test = setup();
    test.controller.request();
    test.controller.modalClosed();
    if (elapsedFrames) test.step();
    test.controller.cancel();
    test.step(); test.step();
    expect(test.cancelFrame).toHaveBeenCalledOnce();
    expect(test.navigate).not.toHaveBeenCalled();
    expect(test.controller.isPending()).toBe(false);
  });

  it("ignores a late cancelled frame even after another exit request begins", () => {
    const test = setup();
    test.controller.request();
    test.controller.modalClosed();
    const cancelledCallback = test.requestFrame.mock.calls[0][0];
    test.controller.cancel();
    test.controller.request();
    test.controller.modalClosed();
    cancelledCallback();
    test.step(); test.step();
    expect(test.navigate).toHaveBeenCalledOnce();
    expect(test.requestFrame).toHaveBeenCalledTimes(3);
  });

  it("does not navigate if focus or app activity is lost before a queued frame runs", () => {
    const test = setup();
    test.setActive(false);
    expect(test.controller.request()).toBe(false);
    test.setActive(true);
    test.controller.request();
    test.controller.modalClosed();
    test.step();
    test.setActive(false);
    test.step();
    expect(test.navigate).not.toHaveBeenCalled();
  });

  it("allows its own navigation's beforeRemove cancellation without repeating the exit", () => {
    const test = setup();
    test.navigate.mockImplementation(() => {
      expect(test.controller.isPending()).toBe(false);
      test.controller.cancel();
    });
    test.controller.request();
    test.controller.modalClosed();
    test.step(); test.step(); test.step();
    expect(test.navigate).toHaveBeenCalledOnce();
  });

  it("does nothing when the modal is closed normally or its exit was cancelled before dismissal", () => {
    const test = setup();
    test.controller.modalClosed();
    test.controller.request();
    test.controller.cancel();
    test.controller.modalClosed();
    test.step(); test.step();
    expect(test.requestFrame).not.toHaveBeenCalled();
    expect(test.navigate).not.toHaveBeenCalled();
  });
});
