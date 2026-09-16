import { useCallback, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { DailyOrderWheel } from "@/components/DailyOrderWheel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import {
  dailyOrderMessages,
  findDailyOrderMessage,
  formatConfiguredMessage,
  roomMessages,
} from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { dailyOrderService, type DailyOrder } from "@/services/gameRoomService";
import { formatDateJa, toDateKey } from "@/utils/date";
import { useAppAudio } from "@/audio/AudioProvider";
import { useAppModal } from "@/components/AppModalProvider";

type OrderSnapshot = {
  date: string;
  order: DailyOrder | null;
  completedTexts: string[];
};

export default function OrdersScreen() {
  const { settings } = useAppAudio();
  const { showError } = useAppModal();
  const playerName = settings?.playerName.trim() ?? "";
  const [snapshot, setSnapshot] = useState<OrderSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phase, setPhase] = useState<"idle" | "drawing" | "spinning" | "saving">("idle");
  const [spinId, setSpinId] = useState(0);
  const loadVersion = useRef(0);
  const focused = useRef(false);
  const actionBusy = useRef(false);
  const pendingOperation = useRef<Promise<DailyOrder> | null>(null);

  const refresh = useCallback(async function refreshOrders() {
    const version = ++loadVersion.current;
    setSnapshot(null);
    setLoadError(false);
    setPhase("idle");
    try {
      await pendingOperation.current?.catch(() => undefined);
      if (!focused.current || version !== loadVersion.current) return;
      const date = toDateKey();
      const [order, completedTexts] = await Promise.all([
        dailyOrderService.load(date),
        dailyOrderService.completedTexts(),
      ]);
      if (!focused.current || version !== loadVersion.current) return;
      if (date !== toDateKey()) return void refreshOrders();
      setSnapshot({ date, order, completedTexts });
    } catch {
      if (focused.current && version === loadVersion.current) setLoadError(true);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    let nextDayTimer: ReturnType<typeof setTimeout> | null = null;
    function clearNextDayTimer() {
      if (nextDayTimer !== null) clearTimeout(nextDayTimer);
      nextDayTimer = null;
    }
    function refreshAndSchedule() {
      if (!focused.current || AppState.currentState === "background" || AppState.currentState === "inactive") return;
      void refresh();
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
        setSnapshot(null);
        setPhase("idle");
      }
    });
    refreshAndSchedule();
    return () => {
      focused.current = false;
      loadVersion.current += 1;
      clearNextDayTimer();
      subscription.remove();
      setSnapshot(null);
      setPhase("idle");
    };
  }, [refresh]));

  async function act(action: "draw" | "complete") {
    if (!snapshot || actionBusy.current || phase !== "idle") return;
    if (snapshot.date !== toDateKey()) {
      void refresh();
      return;
    }
    if (action === "draw" && snapshot.order) return;
    if (action === "complete" && (!snapshot.order || snapshot.order.completed)) return;
    actionBusy.current = true;
    const version = loadVersion.current;
    setPhase(action === "draw" ? "drawing" : "saving");
    const operation = action === "draw"
      ? dailyOrderService.draw(snapshot.date)
      : dailyOrderService.complete(snapshot.order!);
    pendingOperation.current = operation;
    try {
      const next = await operation;
      if (!focused.current || version !== loadVersion.current) return;
      if (next.date !== toDateKey()) {
        void refresh();
        return;
      }
      setSnapshot((current) => current ? {
        ...current,
        order: next,
        completedTexts: next.completed
          ? [...new Set([...current.completedTexts, next.text])]
          : current.completedTexts,
      } : current);
      if (action === "draw" && dailyOrderMessages.some((message) => message.text === next.text)) {
        setSpinId((current) => current + 1);
        setPhase("spinning");
      } else {
        setPhase("idle");
      }
    } catch (error) {
      if (focused.current && version === loadVersion.current) {
        setPhase("idle");
        showError(action === "draw" ? "本日の命令の抽選に失敗しました" : "本日の命令の保存に失敗しました", error);
      }
    } finally {
      if (pendingOperation.current === operation) pendingOperation.current = null;
      actionBusy.current = false;
    }
  }

  const order = snapshot?.order ?? null;
  const completedTexts = new Set(snapshot?.completedTexts ?? []);
  const completedIndices = dailyOrderMessages.flatMap((message, index) => completedTexts.has(message.text) ? [index] : []);
  const selectedIndex = order ? dailyOrderMessages.findIndex((message) => message.text === order.text) : -1;
  const spinning = phase === "spinning";
  const configuredOrder = order ? findDailyOrderMessage(order.text) : undefined;

  return (
    <Screen>
      <AppText variant="title">本日の命令部屋</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/orders-nino.png")}
        roomName="本日の命令部屋"
        lines={roomMessages.orders.lines}
        contractLines={roomMessages.orders.contractLines}
      />
      <Card style={styles.rouletteCard}>
        <AppText variant="label">{formatDateJa(snapshot?.date ?? toDateKey())}</AppText>
        <AppText variant="subtitle">命令ルーレット</AppText>
        {loadError ? (
          <>
            <AppText>本日の命令を読み込めませんでした。</AppText>
            <PrimaryButton title="再読み込み" tone="secondary" onPress={() => void refresh()} />
          </>
        ) : !snapshot ? (
          <AppText variant="muted">読み込み中...</AppText>
        ) : (
          <>
            <DailyOrderWheel
              count={dailyOrderMessages.length}
              completedIndices={completedIndices}
              selectedIndex={selectedIndex >= 0 ? selectedIndex : null}
              spinning={spinning}
              spinId={spinId}
              onSpinEnd={() => setPhase((current) => current === "spinning" ? "idle" : current)}
            />
            {spinning || !order ? (
              <>
                <PrimaryButton
                  title={phase === "drawing" || spinning ? "抽選中..." : "ルーレットを回す"}
                  tone="order"
                  disabled={phase !== "idle"}
                  onPress={() => void act("draw")}
                />
                <AppText variant="muted" style={styles.centered}>抽選は1日1回です。</AppText>
              </>
            ) : (
              <View style={[styles.result, order.completed && styles.completedResult]} accessibilityLiveRegion="polite">
                <View style={styles.resultHeading}>
                  <AppText variant="subtitle">本日の命令</AppText>
                  {selectedIndex >= 0 ? <AppText style={styles.orderNumber} localize={false}>No. {selectedIndex + 1}</AppText> : null}
                </View>
                <AppText>{configuredOrder ? formatConfiguredMessage(configuredOrder, playerName) : order.text}</AppText>
                <PrimaryButton
                  title={phase === "saving" ? "保存中..." : order.completed ? "完了済み" : "命令完了"}
                  disabled={order.completed || phase !== "idle"}
                  onPress={() => void act("complete")}
                />
              </View>
            )}
          </>
        )}
      </Card>
      {snapshot ? (
        <Card>
          <AppText variant="subtitle">命令一覧</AppText>
          <AppText variant="muted">{`実施済み：${completedIndices.length}/${dailyOrderMessages.length}種類`}</AppText>
          <AppText variant="muted">未実施の命令は「???」で表示されます。命令を完了すると、一覧に内容が表示されます。</AppText>
          {dailyOrderMessages.map((message, index) => {
            const completed = completedTexts.has(message.text);
            return (
              <View key={message.text} style={[styles.catalogRow, completed && styles.completedRow]}>
                <AppText style={[styles.catalogNumber, completed && styles.completedText]} localize={false}>{index + 1}</AppText>
                <AppText style={[styles.catalogText, !completed && styles.unknownText, completed && styles.completedText]}>
                  {completed ? formatConfiguredMessage(message, playerName) : "???"}
                </AppText>
              </View>
            );
          })}
        </Card>
      ) : null}
      <PrimaryButton
        title="廊下に戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/rooms")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  rouletteCard: { borderColor: "#a9d5f2", backgroundColor: "#13121b", gap: 14 },
  centered: { textAlign: "center" },
  result: { padding: 12, gap: 12, borderRadius: 8, borderWidth: 1, borderColor: "#a9d5f2", backgroundColor: "#1c2431" },
  completedResult: { borderColor: "#a7d5b2", backgroundColor: "#18291e" },
  resultHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  orderNumber: { color: "#f4c979", fontWeight: "800" },
  catalogRow: { flexDirection: "row", gap: 12, alignItems: "center", minHeight: 44, padding: 10, borderRadius: 6, backgroundColor: "#24212b" },
  completedRow: { backgroundColor: "#dcefe0" },
  catalogNumber: { minWidth: 26, color: "#c6dced", fontWeight: "800", textAlign: "center" },
  catalogText: { flex: 1 },
  unknownText: { color: "#ada9b5", letterSpacing: 3 },
  completedText: { color: "#245335" },
});
