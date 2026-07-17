import { Pressable, StyleSheet } from "react-native";
import { AppText } from "./AppText";

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
      <AppText style={[styles.text, tone === "danger" && styles.dangerText]}>{title}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 4,
    paddingHorizontal: 16,
  },
  primary: {
    backgroundColor: "#000",
  },
  secondary: {
    backgroundColor: "#000",
  },
  danger: {
    backgroundColor: "#000",
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
  dangerText: {
    color: "#ff3b45",
  },
});
