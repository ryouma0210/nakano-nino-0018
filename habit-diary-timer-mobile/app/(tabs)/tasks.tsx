import { useCallback, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { managementDeadlineLabel } from "@/components/managementTime";
import { homeSummaryService, type HomeSummary } from "@/services/homeSummaryService";
import { useDesktopLayout } from "@/hooks/useDesktopLayout";
import { formatDateJa, toDateKey } from "@/utils/date";

export default function TasksScreen() {
  const { isDesktop } = useDesktopLayout();
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [displayDate, setDisplayDate] = useState(() => toDateKey());
  const loadVersion = useRef(0);

  const refreshSummary = useCallback(() => {
    const version = ++loadVersion.current;
    const today = toDateKey();
    setDisplayDate(today);
    setSummary(null);
    setSummaryError(false);
    homeSummaryService.load(today).then((next) => {
      if (version === loadVersion.current) setSummary(next);
    }).catch((error) => {
      console.error("Task summary could not be loaded", error);
      if (version === loadVersion.current) setSummaryError(true);
    });
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    let nextDayTimer: ReturnType<typeof setTimeout> | null = null;

    function clearNextDayTimer() {
      if (nextDayTimer !== null) clearTimeout(nextDayTimer);
      nextDayTimer = null;
    }

    function refreshAndSchedule() {
      if (!active || AppState.currentState === "background" || AppState.currentState === "inactive") return;
      refreshSummary();
      clearNextDayTimer();
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      nextDayTimer = setTimeout(refreshAndSchedule, tomorrow.getTime() - now.getTime() + 100);
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshAndSchedule();
      else {
        clearNextDayTimer();
        loadVersion.current += 1;
      }
    });
    refreshAndSchedule();
    return () => {
      active = false;
      clearNextDayTimer();
      subscription.remove();
      loadVersion.current += 1;
    };
  }, [refreshSummary]));

  const pendingTasks = summary?.tasks.filter((task) => task.eligible && !task.completed) ?? [];
  const visibleTasks = summary?.tasks ?? [];

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">タスク</AppText>
        <View style={styles.rule} />
      </View>
      <Card style={styles.summaryCard}>
        <AppText style={styles.summaryDate} testID="tasks-date">{formatDateJa(displayDate)}</AppText>
        <AppText variant="subtitle">本日の状況</AppText>
        {summaryError ? (
          <>
            <AppText>本日の状況を読み込めませんでした。</AppText>
            <PrimaryButton title="再読み込み" tone="secondary" onPress={refreshSummary} />
          </>
        ) : !summary ? (
          <AppText variant="muted">読み込み中...</AppText>
        ) : (
          <>
            <View style={styles.summaryMetrics}>
              <View style={styles.summaryMetric}>
                <AppText variant="muted">所持Pt</AppText>
                <AppText style={styles.pointsValue} localize={false} numberOfLines={1} adjustsFontSizeToFit>{summary.availablePoints.toLocaleString()} Pt</AppText>
              </View>
              <View style={styles.summaryMetric}>
                <AppText variant="muted">本日の獲得Pt</AppText>
                <AppText style={[styles.pointsValue, styles.earnedPointsValue]} localize={false} numberOfLines={1} adjustsFontSizeToFit>{summary.todayEarnedPoints.toLocaleString()} Pt</AppText>
              </View>
            </View>
            <View style={styles.progressHeader}>
              <AppText style={styles.progressLabel}>今日の達成状況</AppText>
              <AppText style={styles.progressValue} localize={false}>{summary.completedCount} / {summary.eligibleCount}</AppText>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${summary.eligibleCount > 0 ? (summary.completedCount / summary.eligibleCount) * 100 : 0}%` }]} />
            </View>
            {visibleTasks.length ? (
              <>
                <AppText variant="label">今日の項目</AppText>
                <View style={[styles.taskList, isDesktop && styles.desktopTaskList]}>
                {visibleTasks.map((task) => {
                  const completed = task.eligible && task.completed;
                  const pending = task.eligible && !task.completed;
                  const stateText = completed ? styles.completedText : pending ? styles.pendingText : undefined;
                  return (
                    <Pressable
                      key={task.id}
                      accessibilityRole="button"
                      onPress={() => router.push(task.href)}
                      style={({ pressed }) => [
                        styles.taskRow,
                        isDesktop && styles.desktopTaskRow,
                        task.management && styles.managementTaskRow,
                        completed && styles.completedTask,
                        pending && styles.pendingTask,
                        !task.eligible && styles.inactiveTask,
                        pressed && (completed ? styles.completedTaskPressed : pending ? styles.pendingTaskPressed : styles.inactiveTaskPressed),
                      ]}
                    >
                      <View style={[styles.taskBody, task.management && styles.managementTaskBody, !task.eligible && styles.inactiveTaskBody]}>
                        <AppText style={[styles.taskTitle, stateText]}>{task.title}</AppText>
                        {task.dayProgress ? (
                          <AppText style={[styles.taskProgress, stateText]}>{task.dayProgress.currentDay}/{task.dayProgress.totalDays}日目</AppText>
                        ) : null}
                        {task.management ? (
                          <View style={styles.managementDetails}>
                            <AppText variant="muted" style={stateText}>{`モード：${task.management.mode === "chastity" ? "貞操帯あり" : task.management.mode === "release" ? "貞操帯なし" : "未設定"}`}</AppText>
                            <AppText variant="muted" style={stateText}>{`射精許可日：${task.management.deadlineAt ? managementDeadlineLabel(task.management.deadlineAt) : "未設定"}`}</AppText>
                            <AppText variant="muted" style={stateText}>{`ルーレット：${task.management.rouletteSpins}/${task.management.rouletteRequired}回`}</AppText>
                          </View>
                        ) : null}
                        <View style={styles.taskDetail}>
                          {!task.management && task.detail ? (
                            <AppText variant="muted" style={stateText}>{task.detail}</AppText>
                          ) : null}
                          <AppText variant="muted" style={stateText} localize={false} testID={`task-points-${task.id}`}>
                            {task.pointProgress.earned}/{task.pointProgress.limit}pt
                          </AppText>
                        </View>
                      </View>
                      <View style={[styles.taskAction, task.management && styles.managementTaskAction]}>
                        <AppText style={[styles.taskStatus, stateText, !task.eligible && styles.inactiveText]}>{completed ? "実施済" : task.status}</AppText>
                        <AppText style={[styles.taskLink, stateText, !task.eligible && styles.inactiveText]}>確認する →</AppText>
                      </View>
                    </Pressable>
                  );
                })}
                </View>
              </>
            ) : null}
            {pendingTasks.length === 0 ? (
              <AppText style={styles.allCompleted}>今日の対象項目はすべて完了しました。</AppText>
            ) : null}
          </>
        )}
      </Card>
      <PrimaryButton
        title="調教日記"
        tone="record"
        onPress={() => router.push("/(tabs)/records")}
      />
      <PrimaryButton
        title="貞操帯管理記録"
        tone="training"
        onPress={() => router.push("/(tabs)/chastity-history")}
      />
      <PrimaryButton
        title="ゴミ汁廃棄履歴"
        tone="tribute"
        onPress={() => router.push("/(tabs)/disposal-history")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 12 },
  rule: { height: 1, backgroundColor: "#fff" },
  summaryCard: { gap: 12, borderColor: "#a9d5f2", backgroundColor: "#160f14" },
  summaryDate: { color: "#e8dce4", fontSize: 16, lineHeight: 24, fontWeight: "700" },
  summaryMetrics: { flexDirection: "row", gap: 12 },
  summaryMetric: { flex: 1, minWidth: 0, gap: 3, justifyContent: "space-between" },
  pointsValue: { color: "#f4c979", fontSize: 24, lineHeight: 32, fontWeight: "800" },
  earnedPointsValue: { color: "#b8e1bd" },
  progressHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  progressLabel: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: "700", color: "#cbb4c0" },
  progressValue: { color: "#ffc5db", fontSize: 20, lineHeight: 28, fontWeight: "800" },
  progressTrack: { height: 6, backgroundColor: "#36232d", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#dd7ca2" },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, minHeight: 58, borderRadius: 6 },
  taskList: { gap: 12 },
  desktopTaskList: { flexDirection: "row", flexWrap: "wrap" },
  desktopTaskRow: { width: "48%", flexGrow: 1, minHeight: 76, padding: 16 },
  pendingTask: { backgroundColor: "#f7dfe1" },
  pendingTaskPressed: { backgroundColor: "#ecc5c9" },
  pendingText: { color: "#702e36" },
  completedTask: { backgroundColor: "#dcefe0" },
  completedTaskPressed: { backgroundColor: "#c6dfcc" },
  completedText: { color: "#245335" },
  inactiveTask: { backgroundColor: "#1b181c" },
  inactiveTaskPressed: { backgroundColor: "#392434" },
  inactiveTaskBody: { opacity: 0.55 },
  inactiveText: { color: "#aaa0a6" },
  taskBody: { flex: 1, minWidth: 0, gap: 2 },
  taskDetail: { flexDirection: "row", flexWrap: "wrap", columnGap: 6 },
  managementTaskRow: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  managementTaskBody: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" },
  managementDetails: { gap: 3, paddingVertical: 3 },
  managementTaskAction: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", maxWidth: "100%" },
  taskTitle: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  taskProgress: { color: "#f4c979", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  taskAction: { alignItems: "flex-end", maxWidth: "40%", gap: 3 },
  taskStatus: { color: "#cbb4c0", fontSize: 11, lineHeight: 16, textAlign: "right" },
  taskLink: { color: "#ffbdd7", fontSize: 12, lineHeight: 18, textAlign: "right" },
  allCompleted: { color: "#b8e1bd", fontWeight: "700" },
});
