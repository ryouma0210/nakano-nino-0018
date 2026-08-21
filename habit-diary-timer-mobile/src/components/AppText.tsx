import { Children, isValidElement, PropsWithChildren, type ReactNode } from "react";
import { StyleSheet, Text, TextProps } from "react-native";
import { lightTheme } from "@/constants/theme";
import { useAppAudio } from "@/audio/AudioProvider";
import { translateText } from "@/i18n";

type Props = TextProps & PropsWithChildren & {
  variant?: "title" | "subtitle" | "body" | "muted" | "label";
};

export function AppText({ variant = "body", style, children, ...props }: Props) {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const translatedChildren = translateChildren(children, language);
  return (
    <Text
      {...props}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
      style={[styles.base, styles[variant], style]}
    >
      {translatedChildren}
    </Text>
  );
}

function translateChildren(children: ReactNode, language: "ja" | "en" | "ko"): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") return translateText(child, language);
    if (Array.isArray(child)) return translateChildren(child, language);
    if (isValidElement(child)) return child;
    return child;
  });
}

const styles = StyleSheet.create({
  base: {
    color: lightTheme.text,
    includeFontPadding: true,
  },
  title: {
    fontSize: 24,
    lineHeight: 34,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "800",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  muted: {
    color: lightTheme.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  label: {
    color: lightTheme.primaryDark,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "800",
  },
});
