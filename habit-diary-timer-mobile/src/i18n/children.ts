import { Children, type ReactNode } from "react";
import { translateText, type AppLanguage } from "./index";

export function translateChildren(children: ReactNode, language: AppLanguage): ReactNode {
  if (language === "ja") return children;
  const translated: ReactNode[] = [];
  let text = "";
  const flush = () => {
    if (text) translated.push(translateText(text, language));
    text = "";
  };
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      text += String(child);
    } else if (child !== null && child !== undefined && typeof child !== "boolean") {
      flush();
      translated.push(child);
    }
  });
  flush();
  return translated;
}
