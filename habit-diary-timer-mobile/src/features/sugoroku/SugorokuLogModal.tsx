import { FlatList, Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SUGOROKU_TILES, type SugorokuGame, type SugorokuLogEffect, type SugorokuLogEntry } from "./game";

const ACTION_LABELS: Record<SugorokuLogEntry["kind"], string> = {
  roll: "サイコロ", "penalty-roll": "ペナルティの出目", event: "命令完了",
  route: "コース選択", retire: "リタイア", fail: "失敗", finish: "ゲーム終了",
};
const EFFECT_LABELS: Record<SugorokuLogEffect, string> = {
  "negative-zone": "マイナスゾーン：強制1マス移動",
  "minus-two": "出た目 −2",
  "minus-three": "ハードモード：出た目 −3",
  "one-until-branch": "25マス目まで強制1マス移動",
  "one-until-end": "ゲーム終了まで強制1マス移動",
};

function tileName(id: string): string {
  return SUGOROKU_TILES.find((tile) => tile.id === id)?.label ?? id;
}

function LogRow({ entry }: { entry: SugorokuLogEntry }) {
  return (
    <View testID="sugoroku-log-entry" style={styles.entry}>
      <View style={styles.row}>
        <AppText localize={false} style={styles.number}>{`#${entry.sequence}`}</AppText>
        <AppText style={styles.action}>{ACTION_LABELS[entry.kind]}</AppText>
      </View>
      {entry.dice !== null ? <>
        <View style={styles.row}>
          <AppText>出目</AppText><AppText localize={false}>{entry.dice}</AppText>
          <AppText localize={false}>→</AppText><AppText>補正後</AppText><AppText localize={false}>{entry.adjustedDice}</AppText>
        </View>
        <AppText variant="muted">{entry.rule === "forced-one" ? "強制1マス移動" : entry.rule === "minus-two" ? "出た目 −2" : entry.rule === "minus-three" ? "出た目 −3" : "補正なし"}</AppText>
      </> : null}
      <View style={styles.row}>
        <AppText>{tileName(entry.fromTileId)}</AppText><AppText localize={false}>→</AppText><AppText>{tileName(entry.toTileId)}</AppText>
      </View>
      {entry.forcedStop ? <AppText style={styles.stop}>強制ストップ</AppText> : null}
      {entry.kind === "event" && entry.movement !== 0 ? <AppText variant="muted">マスのルールによる移動</AppText> : null}
      {entry.effectsAdded.length > 0 ? <View style={styles.effects}>
        <AppText variant="muted">付与された効果</AppText>
        {entry.effectsAdded.map((effect) => <AppText key={effect} style={styles.added}>{EFFECT_LABELS[effect]}</AppText>)}
      </View> : null}
      {entry.effectsRemoved.length > 0 ? <View style={styles.effects}>
        <AppText variant="muted">解除された効果</AppText>
        {entry.effectsRemoved.map((effect) => <AppText key={effect}>{EFFECT_LABELS[effect]}</AppText>)}
      </View> : null}
    </View>
  );
}

export function SugorokuLogModal({ game, onClose }: { game: SugorokuGame | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!game) return null;
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={[
        styles.modal,
        { paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(12, insets.bottom), paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) },
      ]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <AppText variant="subtitle" accessibilityRole="header" style={styles.title}>進行ログ</AppText>
            <PrimaryButton title="閉じる" tone="secondary" onPress={onClose} />
          </View>
          <AppText variant="muted">最新100件を新しい順に表示します。</AppText>
          <FlatList
            testID="sugoroku-progress-log"
            style={styles.list}
            data={[...(game.logs ?? [])].reverse()}
            keyExtractor={(entry) => String(entry.sequence)}
            renderItem={({ item }) => <LogRow entry={item} />}
            ListEmptyComponent={<AppText variant="muted">{game.logs === undefined
              ? game.phase === "finished" ? "このゲームの進行ログはありません。" : "旧セーブの過去の操作は記録されていません。次の操作から追加します。"
              : "まだ進行ログはありません。"}</AppText>}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: "#080d14" },
  content: { flex: 1, width: "100%", maxWidth: 640, alignSelf: "center", gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  title: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  entry: { paddingVertical: 16, gap: 8, borderTopWidth: 1, borderTopColor: "#444" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  number: { color: "#b6c8de", fontVariant: ["tabular-nums"] },
  action: { fontWeight: "800" },
  stop: { color: "#ff6767", fontWeight: "700" },
  effects: { gap: 4 },
  added: { color: "#f1d89b" },
});
