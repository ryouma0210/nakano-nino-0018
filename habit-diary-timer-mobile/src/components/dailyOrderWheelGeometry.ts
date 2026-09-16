function validateCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 3) {
    throw new RangeError("Wheel item count must be an integer of at least 3.");
  }
}

function normalizeAngle(angle: number): number {
  const remainder = angle % 360;
  if (remainder === 0) return 0;
  return remainder < 0 ? remainder + 360 : remainder;
}

export function getWheelGeometry(count: number, size: number): {
  arcDegrees: number;
  radius: number;
  triangleHalfWidth: number;
} {
  validateCount(count);
  if (!Number.isFinite(size) || size <= 0) {
    throw new RangeError("Wheel size must be a positive finite number.");
  }
  const radius = size / 2;
  return {
    arcDegrees: 360 / count,
    radius,
    triangleHalfWidth: (radius + 1) * Math.tan(Math.PI / count),
  };
}

export function getWheelStopAngle(count: number, index: number): number {
  validateCount(count);
  if (!Number.isSafeInteger(index) || index < 0 || index >= count) {
    throw new RangeError("Wheel item index must be an integer within the item count.");
  }
  // The first sector is centered at the top; positive rotation is clockwise.
  return normalizeAngle(-index * (360 / count));
}

export function getWheelSpinTarget(currentAngle: number, count: number, index: number, turns = 5): number {
  const stopAngle = getWheelStopAngle(count, index);
  if (!Number.isFinite(currentAngle)) {
    throw new RangeError("Current wheel angle must be finite.");
  }
  if (!Number.isSafeInteger(turns) || turns < 0) {
    throw new RangeError("Wheel turns must be a non-negative integer.");
  }
  const remainingAngle = normalizeAngle(stopAngle - normalizeAngle(currentAngle));
  const target = currentAngle + turns * 360 + remainingAngle;
  if (!Number.isFinite(target)) {
    throw new RangeError("Wheel spin target must be finite.");
  }
  return target;
}
