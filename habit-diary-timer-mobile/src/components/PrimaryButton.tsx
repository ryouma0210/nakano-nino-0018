import { Pressable, StyleSheet } from "react-native";
import { AppText } from "./AppText";
import { lightTheme } from "@/constants/theme";

type Props = {
  title: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
};

export function PrimaryButton({ title, onPress, tone = "primary", disabled }: Props) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[tone],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <AppText style={styles.text}>{title}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  primary: {
    backgroundColor: lightTheme.primary,
  },
  secondary: {
    backgroundColor: lightTheme.accent,
  },
  danger: {
    backgroundColor: lightTheme.danger,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  text: {
    color: "#fff",
    fontWeight: "800",
  },
});
