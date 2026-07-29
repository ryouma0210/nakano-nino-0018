import { useEffect, useRef, useState } from "react";
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
import { formatDateJa, toDateKey } from "@/utils/date";
import { lightTheme } from "@/constants/theme";
import { pointRepository } from "@/repositories/rewardRepository";
import { useAppAudio } from "@/audio/AudioProvider";
import {
  findManagementMessage,
  formatConfiguredMessage,
  roomMessages,
} from "@/constants/messages";
import { formatError } from "@/utils/error";

function managementModeLabel(mode: ManagementMode) {
  return mode === "release" ? "貞操帯なし" : "貞操帯あり";
}

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
  const initialCycle = managementRepository.active(mode);
  const [cycle, setCycle] = useState<ManagementCycle | null>(initialCycle);
  const [task, setTask] = useState<ManagementDailyTask | null>(() =>
    initialCycle ? managementRepository.todayTask(initialCycle) : null,
  );
  const [tasks, setTasks] = useState<ManagementDailyTask[]>(() =>
    initialCycle ? managementRepository.tasks(initialCycle) : [],
  );
  const [rolling, setRolling] = useState(false);
  const [rerollConfirmation, setRerollConfirmation] = useState(false);
  const [changeModeConfirmation, setChangeModeConfirmation] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const rollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    },
    [],
  );

  function roll() {
    if (rolling) return;
    setRolling(true);
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = setTimeout(() => {
      try {
        const dice = Math.floor(Math.random() * 6) + 1;
        const next = managementRepository.roll(mode, dice);
        setCycle(next);
        setTask(managementRepository.todayTask(next));
        setTasks(managementRepository.tasks(next));
      } catch (error) {
        console.error("Failed to roll management dice", error);
        setErrorMessage(formatError(error));
      } finally {
        rollTimerRef.current = null;
        setRolling(false);
      }
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
    setTasks(managementRepository.tasks(cycle));
    if (task.record_date >= cycle.end_date)
      managementRepository.finish(cycle.id);
  }

  function confirmReroll() {
    if (!cycle || rolling) return;
    setRerollConfirmation(true);
  }

  function reroll() {
    if (!cycle || rolling) return;
    const currentCycleId = cycle.id;
    setRolling(true);
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = setTimeout(() => {
      try {
        const dice = Math.floor(Math.random() * 6) + 1;
        const next = managementRepository.reroll(currentCycleId, mode, dice);
        setCycle(next);
        setTask(managementRepository.todayTask(next));
        setTasks(managementRepository.tasks(next));
      } catch (error) {
        console.error("Failed to reroll management dice", error);
        setErrorMessage(formatError(error));
      } finally {
        rollTimerRef.current = null;
        setRolling(false);
      }
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
    setTasks([]);
    onChangeMode?.();
  }

  const today = toDateKey();

  return (
    <Screen>
      <AppText variant="title">{title}</AppText>
      <RoomConversation
        characterSource={characterSource}
        roomName={title}
        lines={roomMessages.managementSession.lines}
        contractLines={roomMessages.managementSession.contractLines}
      />
      <Card>
        <AppText variant="label">選択中</AppText>
        <AppText variant="subtitle">
          {managementModeLabel(mode)}
        </AppText>
        <AppText style={styles.activeStatus}>
          現在：{managementModeLabel(mode)}
          {cycle ? "を実施中です。" : "で開始待ちです。"}
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
            <ManagementBoard
              cycle={cycle}
              tasks={tasks}
              today={today}
              playerName={settings?.playerName.trim() ?? ""}
            />
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
              {task?.instruction
                ? formatManagementInstruction(
                    task.instruction,
                    settings?.playerName.trim() ?? "",
                  )
                : "指示を準備中"}
              よ。
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
      <ConfirmModal
        visible={Boolean(errorMessage)}
        title="射精管理の保存に失敗しました"
        message={`サイコロ処理中にエラーが発生しました。\n\n${errorMessage}`}
        confirmLabel="閉じる"
        showCancel={false}
        onCancel={() => setErrorMessage("")}
        onConfirm={() => setErrorMessage("")}
      />
    </Screen>
  );
}

function formatManagementInstruction(text: string, playerName: string) {
  const message = findManagementMessage(text);
  return message ? formatConfiguredMessage(message, playerName) : text;
}

function ManagementBoard({
  cycle,
  tasks,
  today,
  playerName,
}: {
  cycle: ManagementCycle;
  tasks: ManagementDailyTask[];
  today: string;
  playerName: string;
}) {
  return (
    <View style={styles.board}>
      <View style={styles.boardHeader}>
        <AppText style={styles.boardTitle}>管理すごろく</AppText>
        <AppText style={styles.boardHelp}>
          未来日の命令は当日まで？？？よ。
        </AppText>
      </View>
      <View style={styles.boardGrid}>
        <View style={[styles.boardCell, styles.startCell]}>
          <AppText style={styles.cellDate}>START</AppText>
          <AppText style={styles.cellText}>管理開始</AppText>
        </View>
        {tasks.map((item, index) => {
          const isToday = item.record_date === today;
          const isPast = item.record_date < today;
          const isFuture = item.record_date > today;
          const isFinal = item.record_date >= cycle.end_date;
          const revealed = isPast || isToday;
          const instruction = revealed
            ? formatManagementInstruction(item.instruction, playerName)
            : "？？？";
          return (
            <View
              key={item.id}
              style={[
                styles.boardCell,
                isFinal && styles.finalCell,
                isToday && styles.todayCell,
                item.completed_at && styles.completedCell,
              ]}
            >
              <AppText style={styles.cellDate}>
                {index + 1}日目 / {formatDateJa(item.record_date)}
              </AppText>
              <AppText style={styles.cellStatus}>
                {isFinal ? "射精日" : isFuture ? "未開放" : item.completed_at ? "完了" : isToday ? "本日" : "未完了"}
              </AppText>
              <AppText
                style={[
                  styles.cellText,
                  isFuture && styles.hiddenText,
                  isFinal && styles.finalText,
                ]}
              >
                {instruction}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activeStatus: {
    color: "#ff9bc7",
    fontWeight: "900",
    lineHeight: 24,
  },
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
  board: {
    gap: 10,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#555",
    paddingTop: 12,
  },
  boardHeader: { gap: 3 },
  boardTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  boardHelp: {
    color: lightTheme.muted,
    fontSize: 11,
    lineHeight: 18,
  },
  boardGrid: { gap: 8 },
  boardCell: {
    gap: 5,
    borderWidth: 1,
    borderColor: "#5b2a33",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#21040a",
  },
  startCell: {
    borderColor: "#fff",
    backgroundColor: "#000",
  },
  todayCell: {
    borderColor: "#fff",
    backgroundColor: "#4a1020",
  },
  finalCell: {
    borderColor: lightTheme.danger,
    backgroundColor: "#2a0308",
  },
  completedCell: {
    borderColor: "#7cb342",
  },
  cellDate: {
    color: lightTheme.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  cellStatus: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  cellText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 20,
  },
  hiddenText: {
    color: lightTheme.muted,
    fontSize: 18,
    letterSpacing: 3,
  },
  finalText: {
    color: "#ff8a92",
  },
});
