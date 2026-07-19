import { Pressable, StyleSheet } from "react-native";
import { AppText } from "./AppText";
import { useAppAudio } from "@/audio/AudioProvider";

type Props = {
  title: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "danger" | "contract";
  disabled?: boolean;
};

export function PrimaryButton({ title, onPress, tone = "primary", disabled }: Props) {
  const { playEffect } = useAppAudio();
  function press() {
    playEffect("button");
    onPress();
  }
  return (
    <Pressable
      disabled={disabled}
      onPress={press}
      style={({ pressed }) => [
        styles.button,
        styles[tone],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <AppText style={[
        styles.text,
        tone === "secondary" && styles.secondaryText,
        tone === "danger" && styles.dangerText,
        tone === "contract" && styles.contractText,
      ]}>{title}</AppText>
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
    borderColor: "#000",
    backgroundColor: "#fff",
  },
  danger: {
    borderColor: "#fff",
    backgroundColor: "#d9202a",
  },
  contract: {
    borderColor: "#fff",
    backgroundColor: "#7b2cbf",
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
    color: "#fff",
  },
  secondaryText: {
    color: "#000",
  },
  contractText: {
    color: "#fff",
  },
});
