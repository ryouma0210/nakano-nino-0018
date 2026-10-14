import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { Disclosure } from "@/components/Disclosure";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextField } from "@/components/TextField";
import { translateText } from "@/i18n";

type AddResult = { addedName: string } | { error: string };

type Props = {
  title: string;
  label: string;
  emptyMessage: string;
  successMessage: string;
  onAdd: (name: string) => AddResult | Promise<AddResult>;
  disabled?: boolean;
  testID: string;
};

export function ManualEntryField({ title, label, emptyMessage, successMessage, onAdd, disabled = false, testID }: Props) {
  const { settings } = useAppAudio();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [addedName, setAddedName] = useState("");
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);

  async function add() {
    if (disabled || addingRef.current) return;
    const name = value.trim();
    setAddedName("");
    if (!name) {
      setError(emptyMessage);
      return;
    }
    if (name.length > 100) {
      setError("100文字以内で入力してください。");
      return;
    }
    addingRef.current = true;
    setAdding(true);
    try {
      const result = await onAdd(name);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      setAddedName(result.addedName);
      setValue("");
    } catch (error) {
      console.error("Could not save a profile candidate", error);
      setError("候補を保存できませんでした。もう一度追加してください。");
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }

  return <Disclosure title={title} testID={`${testID}-toggle`}>
    <TextField label={label} accessibilityLabel={translateText(label, settings?.language ?? "ja")}
      value={value} onChangeText={(text) => { setValue(text); setError(""); setAddedName(""); }}
      editable={!disabled && !adding} maxLength={100} autoCorrect={false} autoCapitalize="none"
      submitBehavior="submit" onSubmitEditing={add} testID={`${testID}-name`} />
    <View testID={`${testID}-button`}>
      <PrimaryButton title={adding ? "保存中..." : "追加する"} disabled={disabled || adding} onPress={add} />
    </View>
    <AppText variant="muted">追加した候補はすぐ保存されます。選択と順位は「完了」で保存されます。</AppText>
    {error || addedName ? <View testID={`${testID}-feedback`} accessibilityLiveRegion="polite">
      {error ? <AppText style={styles.error}>{error}</AppText> : <>
        <AppText>{successMessage}</AppText>
        <AppText localize={false}>{addedName}</AppText>
      </>}
    </View> : null}
  </Disclosure>;
}

const styles = StyleSheet.create({ error: { color: "#ffb5bd" } });
