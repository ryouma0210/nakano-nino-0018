import { useState } from "react";
import { StyleSheet, View, type ImageSourcePropType } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import {
  managementRepository,
  type ManagementCycle,
  type ManagementDailyTask,
  type ManagementMode,
} from "@/repositories/roomRepository";
import { formatDateJa } from "@/utils/date";
import { lightTheme } from "@/constants/theme";
import { pointRepository } from "@/repositories/rewardRepository";
import { useAppAudio } from "@/audio/AudioProvider";

export function ManagementRoom({
  mode,
  title,
  characterSource,
  onChangeMode,
}: {
  mode: ManagementMode;
  title: string;
  characterSource: ImageSourcePropType;
  onChangeMode?: () => void;
}) {
  const { settings } = useAppAudio();
  const playerName = settings?.playerName.trim() ?? "";
  const initialCycle = managementRepository.active(mode);
  const [cycle, setCycle] = useState<ManagementCycle | null>(initialCycle);
  const [task, setTask] = useState<ManagementDailyTask | null>(() =>
    initialCycle ? managementRepository.todayTask(initialCycle) : null,
  );
  const [rolling, setRolling] = useState(false);
  const [rerollConfirmation, setRerollConfirmation] = useState(false);
  const [changeModeConfirmation, setChangeModeConfirmation] = useState(false);

  function roll() {
    setRolling(true);
    setTimeout(() => {
      const dice = Math.floor(Math.random() * 6) + 1;
      const next = managementRepository.roll(mode, dice);
      setCycle(next);
      setTask(managementRepository.todayTask(next));
      setRolling(false);
    }, 650);
  }

  function complete() {
    if (!task || !cycle) return;
    managementRepository.complete(task.id);
    pointRepository.award(
      `management-task:${task.id}`,
      10,
      "射精管理の本日の命令を完了",
    );
    setTask({ ...task, completed_at: new Date().toISOString() });
    if (task.instruction === "本日は射精日")
      managementRepository.finish(cycle.id);
  }

  function confirmReroll() {
    if (!cycle || rolling) return;
    setRerollConfirmation(true);
  }

  function reroll() {
    if (!cycle) return;
    const currentCycleId = cycle.id;
    setRolling(true);
    setTimeout(() => {
      const dice = Math.floor(Math.random() * 6) + 1;
      const next = managementRepository.reroll(currentCycleId, mode, dice);
      setCycle(next);
      setTask(managementRepository.todayTask(next));
      setRolling(false);
    }, 650);
  }

  function requestChangeMode() {
    if (rolling) return;
    if (!cycle) {
      onChangeMode?.();
      return;
    }
    setChangeModeConfirmation(true);
  }

  function changeMode() {
    if (cycle) managementRepository.removeCycle(cycle.id);
    setCycle(null);
    setTask(null);
    onChangeMode?.();
  }

  return (
    <Screen>
      <AppText variant="title">{title}</AppText>
      <RoomConversation
        characterSource={characterSource}
        roomName={title}
        lines={[
          { text: "まずサイコロで管理期間を決めるわ。" },
          { text: "最終日までは、毎日違う指示を確認して。" },
        ]}
        contractLines={[
          { text: "契約した奴隷の射精は私の管理下よ。最終日まで勝手なことは禁止♡",},
        ]}
      />
      <Card>
        <AppText variant="label">選択中</AppText>
        <AppText variant="subtitle">
          {mode === "release" ? "貞操帯なし" : "貞操帯あり"}
        </AppText>
        {onChangeMode ? (
          <PrimaryButton
            title="管理方法を選び直す"
            tone="secondary"
            onPress={requestChangeMode}
          />
        ) : null}
      </Card>
      {!cycle ? (
        <Card>
          <AppText variant="subtitle">射精管理期間を決める</AppText>
          <AppText>サイコロの目 × 3日間。最終日が射精日です。</AppText>
          <View style={styles.dice}>
            <AppText style={styles.diceText}>{rolling ? "…" : "🎲"}</AppText>
          </View>
          <PrimaryButton
            title={rolling ? "サイコロを振っています" : "サイコロを振る"}
            disabled={rolling}
            onPress={roll}
          />
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.periodRow}>
              <AppText variant="label">サイコロ</AppText>
              <AppText style={styles.diceResult}>
                {rolling ? "…" : cycle.dice}
              </AppText>
            </View>
            <AppText>管理期間：{cycle.dice * 3}日間</AppText>
            <AppText variant="muted">
              {formatDateJa(cycle.start_date)} ～ {formatDateJa(cycle.end_date)}
            </AppText>
            <PrimaryButton
              title={rolling ? "サイコロを振っています" : "サイコロを振り直す"}
              tone="danger"
              disabled={rolling}
              onPress={confirmReroll}
            />
          </Card>
          <Card>
            <AppText variant="label">本日の調教指示</AppText>
            <AppText style={styles.instruction}>
              {playerName ? `${playerName}、` : ""}
              {task?.instruction ?? "指示を準備中"}よ。
            </AppText>
            <AppText>実施完了次第、完了ボタンを押してね。</AppText>
            <PrimaryButton
              title={task?.completed_at ? "本日は完了済み" : "完了"}
              disabled={Boolean(task?.completed_at)}
              onPress={complete}
            />
          </Card>
        </>
      )}
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
      <ConfirmModal
        visible={changeModeConfirmation}
        title="管理方法を選び直しますか？"
        message="現在選択している管理方法の期間・日別指示・完了記録・獲得ポイントを削除して、管理方法の選択へ戻ります。"
        confirmLabel="削除して選び直す"
        confirmTone="danger"
        onCancel={() => setChangeModeConfirmation(false)}
        onConfirm={() => {
          setChangeModeConfirmation(false);
          changeMode();
        }}
      />
      <ConfirmModal
        visible={rerollConfirmation}
        title="サイコロを振り直しますか？"
        message="現在の管理期間と、この期間に記録された実績・完了記録はすべて削除されます。"
        confirmLabel="削除して振り直す"
        confirmTone="danger"
        onCancel={() => setRerollConfirmation(false)}
        onConfirm={() => {
          setRerollConfirmation(false);
          reroll();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dice: {
    alignItems: "center",
    justifyContent: "center",
    height: 110,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#000",
  },
  diceText: { fontSize: 58, lineHeight: 76 },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  diceResult: {
    color: lightTheme.danger,
    fontSize: 44,
    lineHeight: 60,
    fontWeight: "900",
    paddingVertical: 2,
  },
  instruction: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 34,
  },
});
