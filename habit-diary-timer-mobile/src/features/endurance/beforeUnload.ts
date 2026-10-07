/** Browser tab closure is separate from native AppState and navigation events. */
export function attachEnduranceBeforeUnload(platform: string, saveBeforeLeave: () => boolean): () => void {
  const target = typeof window === "undefined" ? undefined : window;
  if (platform !== "web" || typeof target?.addEventListener !== "function"
    || typeof target?.removeEventListener !== "function") return () => {};

  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (saveBeforeLeave()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  target.addEventListener("beforeunload", beforeUnload);
  return () => target.removeEventListener("beforeunload", beforeUnload);
}
