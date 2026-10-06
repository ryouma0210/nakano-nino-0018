import { StyleSheet, View } from "react-native";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { LocalizedPressable } from "@/components/LocalizedPressable";
import { translateText } from "@/i18n";
import type { Board } from "./game";

const COLUMNS = "ABCDEFGH".split("");
const ROWS = Array.from({ length: 8 }, (_, index) => index);

export function moveCoordinate(index: number): string {
  return `${COLUMNS[index % 8]}${Math.floor(index / 8) + 1}`;
}

type Props = {
  board: Board;
  legalMoves: readonly number[];
  temptingMove: number | null;
  lastMove: number | null;
  interactive?: boolean;
  onMove: (index: number) => void;
};

export function OthelloBoard({ board, legalMoves, temptingMove, lastMove, interactive = true, onMove }: Props) {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const t = (value: string) => translateText(value, language);

  return (
    <View testID="othello-board" style={styles.wrapper}>
      <View style={styles.columns}>
        {COLUMNS.map((column) => <AppText key={column} localize={false} style={styles.column}>{column}</AppText>)}
      </View>
      <View style={styles.boardRow}>
        <View style={styles.rows}>
          {ROWS.map((row) => <View key={row} style={styles.rowNumber}><AppText localize={false} style={styles.coordinate}>{row + 1}</AppText></View>)}
        </View>
        <View style={styles.board}>
          {ROWS.map((row) => (
            <View key={row} style={styles.row}>
              {COLUMNS.map((column, col) => {
                const index = row * 8 + col;
                const cell = board[index];
                const legal = legalMoves.includes(index);
                const tempting = legal && temptingMove === index;
                const coordinate = `${column}${row + 1}`;
                const label = [coordinate, t(cell === 1 ? "白石" : cell === -1 ? "紫石" : "空きマス"), legal ? t("打てるマス") : "", tempting ? t("誘惑マス") : ""].filter(Boolean).join(" ");
                return (
                  <LocalizedPressable
                    key={column}
                    testID={`othello-cell-${coordinate}`}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ disabled: !legal || !interactive }}
                    disabled={!legal || !interactive}
                    onPress={() => onMove(index)}
                    style={({ pressed }) => [styles.cell, (row + col) % 2 === 0 && styles.alternateCell, tempting && styles.temptingCell, pressed && legal && styles.pressedCell]}
                  >
                    {cell !== 0 ? <View style={[styles.stone, cell === 1 ? styles.white : styles.purple, lastMove === index && styles.lastStone]} /> : tempting ? (
                      <AppText localize={false} accessible={false} style={styles.temptingMark}>◎</AppText>
                    ) : legal ? <View style={styles.legalDot} /> : null}
                  </LocalizedPressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", maxWidth: 480, alignSelf: "center" },
  columns: { flexDirection: "row", marginLeft: 18, paddingHorizontal: 1, marginBottom: 3 },
  column: { flex: 1, textAlign: "center", color: "#ddd", fontSize: 11, lineHeight: 18 },
  coordinate: { color: "#ddd", fontSize: 11, lineHeight: 18 },
  boardRow: { flexDirection: "row" },
  rows: { width: 18 },
  rowNumber: { flex: 1, justifyContent: "center", alignItems: "center" },
  board: { flex: 1, aspectRatio: 1, borderWidth: 1, borderColor: "#82a38b", backgroundColor: "#1b593b" },
  row: { flex: 1, flexDirection: "row" },
  cell: { flex: 1, minWidth: 0, minHeight: 0, borderWidth: 0.5, borderColor: "#0d3220", alignItems: "center", justifyContent: "center", backgroundColor: "#256d47" },
  alternateCell: { backgroundColor: "#22633f" },
  temptingCell: { backgroundColor: "#653b56", borderWidth: 2, borderColor: "#ff91c7" },
  pressedCell: { opacity: 0.65 },
  stone: { width: "76%", aspectRatio: 1, borderRadius: 100, borderWidth: 1, borderColor: "#555" },
  purple: { backgroundColor: "#a855f7", borderColor: "#e9c8ff" },
  white: { backgroundColor: "#f5f3eb", borderColor: "#d4d4cc" },
  lastStone: { borderWidth: 2, borderColor: "#e8bb5d" },
  legalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#c2e6cb" },
  temptingMark: { color: "#ffb6dc", fontWeight: "800", fontSize: 20, lineHeight: 25 },
});
