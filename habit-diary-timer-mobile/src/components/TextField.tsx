import { StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { AppText } from "./AppText";
import { lightTheme } from "@/constants/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({ label, error, style, ...props }: Props) {
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        placeholderTextColor="#777"
        {...props}
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[styles.input, props.multiline && styles.multiline, style]}
      />
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: lightTheme.border,
    borderRadius: 4,
    paddingHorizontal: 12,
    backgroundColor: "#080808",
    color: lightTheme.text,
    fontSize: 15,
  },
  multiline: {
    minHeight: 110,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  error: {
    color: lightTheme.danger,
    fontSize: 12,
    fontWeight: "700",
  },
});
