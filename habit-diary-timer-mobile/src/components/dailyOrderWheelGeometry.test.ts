import { describe, expect, it } from "vitest";
import { getWheelGeometry, getWheelSpinTarget, getWheelStopAngle } from "./dailyOrderWheelGeometry";

function expectWholeTurns(angle: number): void {
  expect(angle / 360).toBeCloseTo(Math.round(angle / 360), 10);
}

describe("daily order wheel geometry", () => {
  it("sizes triangles to cover their complete sector through the one-pixel rim", () => {
    for (const count of [3, 4, 7, 28, 64]) {
      for (const size of [216, 320]) {
        const geometry = getWheelGeometry(count, size);
        expect(geometry.radius * 2).toBe(size);
        expect(geometry.arcDegrees * count).toBeCloseTo(360);
        const triangleAngle = 2 * Math.atan(geometry.triangleHalfWidth / (geometry.radius + 1));
        expect(triangleAngle * 180 / Math.PI).toBeCloseTo(geometry.arcDegrees);
      }
    }
    expect(getWheelGeometry(4, 200).triangleHalfWidth).toBeCloseTo(101);
  });

  it("aligns all 28 item centers with the top pointer and supports other item counts", () => {
    for (const count of [3, 7, 28, 64]) {
      for (let index = 0; index < count; index += 1) {
        const stopAngle = getWheelStopAngle(count, index);
        expect(stopAngle).toBeGreaterThanOrEqual(0);
        expect(stopAngle).toBeLessThan(360);
        expectWholeTurns(index * 360 / count + stopAngle);
      }
    }
    expect(getWheelStopAngle(4, 0)).toBe(0);
    expect(getWheelStopAngle(4, 1)).toBe(270);
  });

  it("keeps repeated spins clockwise for at least five full turns and stops on the chosen item", () => {
    for (const count of [7, 28]) {
      let currentAngle = -45.5;
      for (const index of [0, count - 1, 2, 2, 0]) {
        const target = getWheelSpinTarget(currentAngle, count, index);
        expect(target - currentAngle).toBeGreaterThanOrEqual(5 * 360 - 1e-9);
        expect(target - currentAngle).toBeLessThan(6 * 360 + 1e-9);
        expectWholeTurns(target + index * 360 / count);
        currentAngle = target;
      }
    }
  });

  it("supports a requested turn count and needs no extra rotation when already aligned", () => {
    expect(getWheelSpinTarget(270, 4, 1, 2)).toBe(990);
    expect(getWheelSpinTarget(270, 4, 1, 0)).toBe(270);
    expect(getWheelSpinTarget(350, 4, 0, 0)).toBe(360);
    expect(getWheelSpinTarget(-90, 4, 1, 1)).toBe(270);
  });

  it("rejects invalid dimensions, item positions, and animation inputs", () => {
    for (const count of [0, 2, 3.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => getWheelGeometry(count, 200)).toThrow(RangeError);
      expect(() => getWheelStopAngle(count, 0)).toThrow(RangeError);
      expect(() => getWheelSpinTarget(0, count, 0)).toThrow(RangeError);
    }
    for (const size of [0, -1, NaN, Infinity]) {
      expect(() => getWheelGeometry(28, size)).toThrow(RangeError);
    }
    for (const index of [-1, 28, 0.5, NaN, Infinity]) {
      expect(() => getWheelStopAngle(28, index)).toThrow(RangeError);
      expect(() => getWheelSpinTarget(0, 28, index)).toThrow(RangeError);
    }
    for (const currentAngle of [NaN, Infinity, -Infinity]) {
      expect(() => getWheelSpinTarget(currentAngle, 28, 0)).toThrow(RangeError);
    }
    for (const turns of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => getWheelSpinTarget(0, 28, 0, turns)).toThrow(RangeError);
    }
  });
});
