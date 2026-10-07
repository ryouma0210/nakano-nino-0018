import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import type { QuestView } from "./quests";

export function QuestList({ quests, onClaim }: { quests: readonly QuestView[]; onClaim: (id: string) => void }) {
  return <>{quests.map((quest) => {
    const disabled = Boolean(quest.locked || !quest.completed || quest.claimed);
    const action = quest.claimed ? "受取済み" : quest.locked ? "未解放" : quest.completed ? `${quest.reward}Ptを受け取る` : "挑戦中";
    return <View key={quest.id} style={[styles.card, quest.locked && styles.locked]}>
      <AppText style={styles.title}>{quest.title}</AppText>
      <AppText style={styles.condition}>{quest.locked ? "前の段階を達成して報酬を受け取ると解放" : quest.condition}</AppText>
      <AppText style={styles.progress}>{quest.locked ? "未解放" : `${quest.current} / ${quest.target}`}</AppText>
      <PrimaryButton title={action} tone="record" disabled={disabled} onPress={() => onClaim(quest.id)} />
    </View>;
  })}</>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: "#5ad2ff", backgroundColor: "#101010", padding: 12, gap: 6 },
  locked: { opacity: 0.55 },
  title: { color: "#fff", fontSize: 16, fontWeight: "900" },
  condition: { color: "#e7e7e7", fontSize: 14, lineHeight: 20 },
  progress: { color: "#35c7ff", fontSize: 15, fontWeight: "900" },
});
