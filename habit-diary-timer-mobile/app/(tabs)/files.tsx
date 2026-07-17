import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { fileStorageService, formatBytes, type StoredFile } from "@/services/fileStorageService";

export default function FilesScreen() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const load = useCallback(() => { fileStorageService.list().then(setFiles); }, []);
  useEffect(load, [load]);
  useFocusEffect(load);

  async function upload() {
    if (await fileStorageService.pickAndStore()) load();
  }

  function remove(file: StoredFile) {
    Alert.alert("ファイル削除", `${file.name}を削除しますか？`, [
      { text: "キャンセル", style: "cancel" },
      { text: "削除", style: "destructive", onPress: async () => { await fileStorageService.remove(file.uri); load(); } },
    ]);
  }

  return (
    <Screen>
      <AppText variant="title">ファイル格納部屋</AppText>
      <RoomConversation roomName="ファイル格納部屋" lines={[{ text: "残しておきたいファイルは、ここへ格納して。" }, { text: "不要になったものは選んで削除できるわ。", event: "FILE STORAGE" }]} />
      <PrimaryButton title="ファイルを格納" onPress={upload} />
      <AppText variant="muted">使用量 {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}</AppText>
      {files.length === 0 ? <Card><AppText variant="muted">格納されたファイルはありません。</AppText></Card> : null}
      {files.map((file) => (
        <Card key={file.uri}>
          <View style={styles.row}>
            <View style={styles.grow}><AppText>{file.name}</AppText><AppText variant="muted">{formatBytes(file.size)}</AppText></View>
            <PrimaryButton title="削除" tone="danger" onPress={() => remove(file)} />
          </View>
        </Card>
      ))}
      <PrimaryButton title="ホームへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)")} />
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: 12 }, grow: { flex: 1 } });
