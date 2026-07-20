import { PropsWithChildren } from "react";
import { StyleSheet, Text, TextProps } from "react-native";
import { lightTheme } from "@/constants/theme";

type Props = TextProps & PropsWithChildren & {
  variant?: "title" | "subtitle" | "body" | "muted" | "label";
};

export function AppText({ variant = "body", style, children, ...props }: Props) {
  return (
    <Text
      {...props}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
      style={[styles.base, styles[variant], style]}
    >
      {children}
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
