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
    | "punishment"
    | "defeat"
    | "defeatRoom"
    | "contract"
    | "preparation"
    | "order"
    | "training"
    | "management"
    | "record"
    | "collection"
    | "reward"
    | "tribute"
    | "battleAttack"
    | "battleDefense"
    | "battleSpecial";
  disabled?: boolean;
};

export function PrimaryButton({ title, onPress, tone = "primary", disabled }: Props) {
  const { playEffect } = useAppAudio();
  const darkNavigation = title === "ホームへ戻る" || title === "スタート画面に移動";
  const activeSubmit =
    !disabled &&
    !darkNavigation &&
    tone !== "danger" &&
    (
      title.includes("保存") ||
      title.includes("登録") ||
      title.includes("命令完了") ||
      title === "完了" ||
      title.startsWith("準備完了")
    );
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
        darkNavigation && styles.darkNavigation,
        activeSubmit && styles.activeSubmit,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <AppText style={[
        styles.text,
        tone === "secondary" && styles.secondaryText,
        tone === "danger" && styles.dangerText,
        tone === "punishment" && styles.punishmentText,
        tone === "defeat" && styles.defeatText,
        tone === "defeatRoom" && styles.defeatRoomText,
        tone === "contract" && styles.contractText,
        tone === "preparation" && styles.preparationText,
        tone === "order" && styles.orderText,
        tone === "training" && styles.trainingText,
        tone === "management" && styles.managementText,
        tone === "record" && styles.recordText,
        tone === "collection" && styles.collectionText,
        tone === "reward" && styles.rewardText,
        tone === "tribute" && styles.tributeText,
        darkNavigation && styles.darkNavigationText,
        activeSubmit && styles.activeSubmitText,
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
  punishment: {
    borderColor: "#ff3b45",
    backgroundColor: "#7b2cbf",
  },
  defeat: {
    borderColor: "#fff",
    backgroundColor: "#ff69b4",
  },
  defeatRoom: {
    borderColor: "#ff3b45",
    backgroundColor: "#ff3b45",
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
    backgroundColor: "#7b2cbf",
  },
  management: {
    borderColor: "#fff",
    backgroundColor: "#7b2cbf",
  },
  record: {
    borderColor: "#fff",
    backgroundColor: "#1f5fae",
  },
  collection: {
    borderColor: "#fff",
    backgroundColor: "#f28c28",
  },
  reward: {
    borderColor: "#fff",
    backgroundColor: "#f2c94c",
  },
  tribute: {
    borderColor: "#fff",
    backgroundColor: "#000",
  },
  battleAttack: { borderColor: "#fff", backgroundColor: "#f28c28" },
  battleDefense: { borderColor: "#fff", backgroundColor: "#2374d8" },
  battleSpecial: { borderColor: "#fff", backgroundColor: "#e84d9b" },
  darkNavigation: {
    borderColor: "#fff",
    backgroundColor: "#000",
  },
  activeSubmit: {
    borderColor: "#fff",
    backgroundColor: "#7cb342",
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
  punishmentText: {
    color: "#ff3b45",
  },
  defeatText: { color: "#fff" },
  defeatRoomText: { color: "#fff" },
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
  collectionText: { color: "#fff" },
  rewardText: { color: "#111" },
  tributeText: { color: "#ff3b45" },
  darkNavigationText: { color: "#fff" },
  activeSubmitText: { color: "#fff" },
});
