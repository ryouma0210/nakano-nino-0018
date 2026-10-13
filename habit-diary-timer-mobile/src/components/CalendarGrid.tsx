import { Children, type PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

/** Fixed rows keep rounding and selected borders from pushing a day into the next week. */
export function CalendarGrid({ children, columns = 7, testID }: PropsWithChildren<{
  columns?: 3 | 7;
  testID?: string;
}>) {
  const cells = Children.toArray(children);
  return <View testID={testID}>
    {Array.from({ length: Math.ceil(cells.length / columns) }, (_, row) => (
      <View key={row} style={styles.row}>
        {Array.from({ length: columns }, (_, column) => (
          <View key={column} style={styles.cell}>
            {cells[row * columns + column] ?? null}
          </View>
        ))}
      </View>
    ))}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  cell: { flex: 1, minWidth: 0 },
});
