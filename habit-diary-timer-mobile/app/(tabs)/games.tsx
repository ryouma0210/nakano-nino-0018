import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { roomMessages } from "@/constants/messages";
import { lightTheme } from "@/constants/theme";
import { RESUMABLE_GAMES, type ResumableGame } from "@/features/games/progress";
import { loadGameProgress, type GameProgressResult } from "@/services/gameProgressSummaryService";

const gameEntries = {
  sugoroku: { title: "すごろく", route: "/(tabs)/sugoroku" },
  othello: { title: "オセロ", route: "/(tabs)/othello" },
  endurance: { title: "勃起我慢", route: "/(tabs)/endurance" },
} as const;
type ProgressState = GameProgressResult | { status: "loading" };

export default function GamesScreen() {
  const [progress, setProgress] = useState<Record<ResumableGame, ProgressState>>({
    sugoroku: { status: "loading" }, othello: { status: "loading" }, endurance: { status: "loading" },
  });
  const focused = useRef(false);
  const versions = useRef<Record<ResumableGame, number>>({ sugoroku: 0, othello: 0, endurance: 0 });
  const refreshGame = useCallback(async (game: ResumableGame) => {
    const version = ++versions.current[game];
    setProgress((previous) => ({ ...previous, [game]: { status: "loading" } }));
    const result = await loadGameProgress(game);
    if (focused.current && versions.current[game] === version) {
      setProgress((previous) => ({ ...previous, [game]: result }));
    }
  }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    for (const game of RESUMABLE_GAMES) void refreshGame(game);
    return () => {
      focused.current = false;
      for (const game of RESUMABLE_GAMES) versions.current[game] += 1;
    };
  }, [refreshGame]));

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">ゲーム部屋</AppText>
        <View style={styles.rule} />
      </View>

      <RoomConversation
        characterSource={require("../../assets/characters/home-nino.png")}
        roomName="ゲーム部屋"
        lines={roomMessages.games.lines}
        contractLines={roomMessages.games.contractLines}
      />

      <Card style={styles.gameCard}>
        {RESUMABLE_GAMES.map((game) => {
          const entry = gameEntries[game];
          const state = progress[game];
          const summary = state.status === "ready" ? state.summary : null;
          return (
            <View key={game} style={styles.gameEntry} testID={`games-${game}`}>
              <PrimaryButton title={entry.title} tone="defeat" onPress={() => router.push(entry.route)} />
              {state.status === "loading" ? <AppText variant="muted">読み込み中…</AppText> : null}
              {state.status === "error" ? (
                <View style={styles.progress} testID={`games-error-${game}`}>
                  <AppText variant="muted">進行状況を読み込めませんでした。再試行してください。</AppText>
                  <PrimaryButton title="再試行" tone="secondary" onPress={() => void refreshGame(game)} />
                </View>
              ) : null}
              {summary ? (
                <View style={styles.progress} testID={`games-progress-${game}`}>
                  <AppText variant="subtitle">保存中のゲーム</AppText>
                  {summary.details.map((detail, index) => <AppText key={index} variant="muted">{detail}</AppText>)}
                  {summary.progress ? (
                    <View style={styles.progressRow}>
                      <AppText variant="muted">{summary.progress.label}</AppText>
                      <AppText localize={false}>{`${summary.progress.current} / ${summary.progress.total}`}</AppText>
                    </View>
                  ) : null}
                  <View testID={`games-continue-${game}`}>
                    <PrimaryButton title="続きから" tone="secondary" onPress={() => router.push({ pathname: entry.route, params: { resumeId: summary.id } })} />
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <PrimaryButton title="部屋から出る" tone="secondary" onPress={() => router.replace("/(tabs)/rooms")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 4 },
  rule: { height: 1, backgroundColor: lightTheme.text },
  gameCard: { width: "100%", maxWidth: 680, alignSelf: "center", gap: 16 },
  gameEntry: { gap: 8 },
  progress: { gap: 6, paddingHorizontal: 8, paddingBottom: 8 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  artwork: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    borderRadius: 4,
    backgroundColor: "#121d2b",
  },
  track: { flexDirection: "row", gap: 8 },
  square: { width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: "#c7ddf7", backgroundColor: "#25394f" },
  goalSquare: { borderColor: "#f2c94c", backgroundColor: "#f2c94c" },
});
