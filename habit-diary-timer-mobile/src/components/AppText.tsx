import { PropsWithChildren } from "react";
import { StyleSheet, Text, TextProps } from "react-native";
import { lightTheme } from "@/constants/theme";
import { useAppAudio } from "@/audio/AudioProvider";
import { translateChildren } from "@/i18n/children";

type Props = TextProps & PropsWithChildren & {
  variant?: "title" | "subtitle" | "body" | "muted" | "label";
  localize?: boolean;
};

export function AppText({ variant = "body", localize = true, style, children, ...props }: Props) {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const translatedChildren = localize ? translateChildren(children, language) : children;
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
