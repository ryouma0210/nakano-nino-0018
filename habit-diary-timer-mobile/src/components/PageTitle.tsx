import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type TextStyle } from "react-native";
import { AppText } from "./AppText";

type Props = {
  children: ReactNode;
  titleStyle?: StyleProp<TextStyle>;
  action?: ReactNode;
};

/** Main-screen heading; dialogs and cards keep their own title styles. */
export function PageTitle({ children, titleStyle, action }: Props) {
  const title = (
    <AppText variant="title" accessibilityRole="header" style={[action ? styles.titleWithAction : undefined, titleStyle]}>
      {children}
    </AppText>
  );

  return (
    <View style={styles.header}>
      {action ? <View style={styles.row}>{title}{action}</View> : title}
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  titleWithAction: { flex: 1, minWidth: 0 },
  rule: { height: 1, backgroundColor: "#fff" },
});
