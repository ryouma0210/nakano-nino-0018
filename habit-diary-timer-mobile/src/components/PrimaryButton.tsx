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
    borderColor: "#fff",
    backgroundColor: "#7cb342",
  },
  order: {
    borderColor: "#fff",
    backgroundColor: "#29b6f6",
  },
  training: {
    borderColor: "#fff",
    backgroundColor: "#6a1b9a",
  },
  management: {
    borderColor: "#fff",
    backgroundColor: "#6a1b9a",
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
    textAlign: "center",
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
  preparationText: { color: "#fff" },
  orderText: { color: "#fff" },
  trainingText: { color: "#fff" },
  managementText: { color: "#fff" },
  recordText: { color: "#fff" },
  rewardText: { color: "#111" },
});
