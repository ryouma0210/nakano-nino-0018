import type { EndurancePreset } from "./game";

/** Randomize once per custom game; saved slide state then keeps this order. */
export function orderEnduranceMedia<T>(preset: EndurancePreset, media: readonly T[], random = Math.random): T[] {
  const ordered = [...media];
  if (preset !== "custom") return ordered;
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  }
  return ordered;
}
