import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useAppModal } from "@/components/AppModalProvider";
import { formatConfiguredMessage } from "@/constants/messages";
import {
  commandCategoryLabels, customCommandService, CUSTOM_COMMAND_MAX_LENGTH,
  type CommandCategory, type CustomCommand,
} from "@/services/customCommandService";
import { dailyOrderService } from "@/services/gameRoomService";

type Catalog = ReturnType<typeof customCommandService.catalog>;
const categories: CommandCategory[] = ["daily", "chastity", "release"];

export default function CustomOrdersScreen() {
  const { settings } = useAppAudio();
  const { showError } = useAppModal();
  const [category, setCategory] = useState<CommandCategory>("daily");
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [catalog, setCatalog] = useState<Catalog>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<CustomCommand | null>(null);
  const [formError, setFormError] = useState("");
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CustomCommand | null>(null);
  const loadVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      await dailyOrderService.seenTexts();
      if (version !== loadVersion.current) return;
      customCommandService.syncCompletedManagement();
      setCommands(customCommandService.list(category));
      setCatalog(customCommandService.catalog(category));
    } catch (error) {
      if (version !== loadVersion.current) return;
      setLoadFailed(true);
      showError("追加命令を読み込めませんでした", error);
    } finally { if (version === loadVersion.current) setLoading(false); }
  }, [category, showError]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { loadVersion.current += 1; };
  }, [refresh]));

  function clearForm() { setEditing(null); setText(""); setFormError(""); }

  function save() {
    if (loading || loadFailed) return;
    try {
      if (editing) customCommandService.update(editing.id, text);
      else customCommandService.add(category, text);
      setCommands(customCommandService.list(category));
      clearForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "追加命令を保存できませんでした。");
    }
  }

  function remove() {
    if (!pendingDelete || loading || loadFailed) return;
    try {
      customCommandService.remove(pendingDelete.id);
      setCommands(customCommandService.list(category));
      if (editing?.id === pendingDelete.id) clearForm();
      setPendingDelete(null);
    } catch (error) {
      setPendingDelete(null);
      showError("追加命令を削除できませんでした", error);
    }
  }

  return (
    <Screen>
      <AppText variant="title">命令追加</AppText>
      <Card>
        <AppText variant="subtitle">追加先</AppText>
        {categories.map((value) => (
          <PrimaryButton
            key={value} title={commandCategoryLabels[value]} tone={category === value ? "order" : "secondary"}
            onPress={() => { setCategory(value); clearForm(); setCatalogVisible(false); setPendingDelete(null); }}
          />
        ))}
        <AppText variant="muted">追加した命令は翻訳せず、入力した文章のまま表示します。</AppText>
        <AppText variant="muted">既存の命令は変更できません。一度表示された命令だけ閲覧できます。</AppText>
        {category !== "daily" ? <AppText variant="muted">追加した命令は、次に開始する管理期間の日次命令の候補になります。最終日の命令は変わりません。</AppText> : null}
      </Card>
      {loading ? <AppText variant="muted">読み込み中...</AppText> : loadFailed ? (
        <PrimaryButton title="再読み込み" tone="secondary" onPress={() => void refresh()} />
      ) : (
        <>
          <Card>
            <AppText variant="subtitle">{editing ? "追加命令を編集" : "新しい命令"}</AppText>
            <TextField label="命令の内容" value={text} onChangeText={setText} multiline maxLength={CUSTOM_COMMAND_MAX_LENGTH} error={formError} />
            <View style={styles.actions}>
              {editing ? <View style={styles.action}><PrimaryButton title="キャンセル" tone="secondary" onPress={clearForm} /></View> : null}
              <View style={styles.action}><PrimaryButton title={editing ? "変更を保存" : "命令を追加"} tone="order" onPress={save} /></View>
            </View>
          </Card>
          <Card>
            <AppText variant="subtitle">追加した命令</AppText>
            {commands.length === 0 ? <AppText variant="muted">追加した命令はありません。</AppText> : commands.map((command) => (
              <View key={command.id} style={styles.command}>
                <AppText localize={false}>{command.text}</AppText>
                <View style={styles.actions}>
                  <View style={styles.action}><PrimaryButton title="編集" tone="secondary" onPress={() => { setEditing(command); setText(command.text); setFormError(""); }} /></View>
                  <View style={styles.action}><PrimaryButton title="削除" tone="danger" onPress={() => setPendingDelete(command)} /></View>
                </View>
              </View>
            ))}
          </Card>
          <PrimaryButton title={catalogVisible ? "既存命令を閉じる" : "既存命令を確認"} tone="secondary" onPress={() => setCatalogVisible((value) => !value)} />
          {catalogVisible ? (
            <Card>
              <AppText variant="subtitle">既存命令（閲覧のみ）</AppText>
              {catalog.map((command, index) => (
                <View key={command.id} style={styles.command}>
                  <View style={styles.commandHeading}>
                    <AppText variant="label" localize={false}>No. {index + 1}</AppText>
                    {command.finalDay ? <AppText variant="muted">最終日</AppText> : null}
                  </View>
                  <AppText>{command.message ? formatConfiguredMessage(command.message, settings?.playerName.trim() ?? "") : "???"}</AppText>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      )}
      <PrimaryButton title="管理・設定メニューへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)/menu?section=management")} />
      <ConfirmModal
        visible={!!pendingDelete} title="追加命令を削除" message="この追加命令を削除しますか？抽選済みの命令には影響しません。"
        confirmLabel="削除" confirmTone="danger" onConfirm={remove} onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  command: { gap: 10, borderTopWidth: 1, borderTopColor: "#555", paddingTop: 12, marginTop: 4 },
  commandHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
});
