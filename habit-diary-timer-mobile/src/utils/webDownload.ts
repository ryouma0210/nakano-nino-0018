export async function downloadUriOnWeb(uri: string, fileName: string) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("WEBダウンロードを利用できません。");
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`ファイルを取得できませんでした。(${response.status})`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
