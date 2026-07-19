import { Pressable, StyleSheet } from "react-native";
import { AppText } from "./AppText";
import { useAppAudio } from "@/audio/AudioProvider";

type Props = {
  title: string;
  onPress: () => void;
  tone?:
    | "primary"
    | "secondary"
    | "danger"
    | "contract"
    | "preparation"
    | "order"
    | "training"
    | "management"
    | "record"
    | "reward";
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
        tone === "preparation" && styles.preparationText,
        tone === "order" && styles.orderText,
        tone === "training" && styles.trainingText,
        tone === "management" && styles.managementText,
        tone === "record" && styles.recordText,
        tone === "reward" && styles.rewardText,
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
  preparation: {
    borderColor: "#2f9e58",
    backgroundColor: "#071b10",
  },
  order: {
    borderColor: "#245a9a",
    backgroundColor: "#071426",
  },
  training: {
    borderColor: "#c93678",
    backgroundColor: "#220815",
  },
  management: {
    borderColor: "#8c2338",
    backgroundColor: "#23070d",
  },
  record: {
    borderColor: "#fff",
    backgroundColor: "#1f5fae",
  },
  reward: {
    borderColor: "#fff",
    backgroundColor: "#f2c94c",
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
  preparationText: { color: "#7ee2a0" },
  orderText: { color: "#7fb8ff" },
  trainingText: { color: "#ff8fbe" },
  managementText: { color: "#e56b82" },
  recordText: { color: "#fff" },
  rewardText: { color: "#111" },
});
