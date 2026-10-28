import { useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { useVoiceLibrary } from "@/audio/VoiceLibraryProvider";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PageTitle } from "@/components/PageTitle";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextField } from "@/components/TextField";
import { VOICE_FOLDER_NAME_LIMIT, VOICE_NAME_LIMIT, voiceDisplayName, voiceFolderName } from "@/features/voices/library";
import { translateText } from "@/i18n";
import type { StoredVoice, VoiceFolder, VoiceScope } from "@/services/voiceStorageService";

type Dialog =
  | { kind: "renameVoice" | "deleteVoice" | "editFolders"; voice: StoredVoice }
  | { kind: "renameFolder" | "deleteFolder"; folder: VoiceFolder }
  | { kind: "reorder"; scope: VoiceScope; scopeName: string; customScopeName: boolean; voices: StoredVoice[] }
  | { kind: "createFolder" | "chooseScope" };

const dialogTitles: Record<Dialog["kind"], string> = {
  renameVoice: "ボイスの名前を変更", deleteVoice: "ボイスを削除", editFolders: "使用するフォルダー",
  createFolder: "フォルダーを作成", renameFolder: "フォルダーの名前を変更", deleteFolder: "フォルダーを削除",
  chooseScope: "再生する範囲を選択", reorder: "順序変更",
};

export default function VoicesScreen() {
  const library = useVoiceLibrary();
  const { settings } = useAppAudio();
  const insets = useSafeAreaInsets();
  const language = settings?.language ?? "ja";
  const t = (text: string) => translateText(text, language);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [name, setName] = useState("");
  const [editingFolderIds, setEditingFolderIds] = useState<string[]>([]);
  const [orderedVoices, setOrderedVoices] = useState<StoredVoice[]>([]);
  const [reorderSourceId, setReorderSourceId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ added: number; failed: number } | null>(null);
  const [working, setWorking] = useState(false);
  const operationPending = useRef(false);
  const locked = library.loading || library.busy || working;
  const current = library.visibleVoices.find((voice) => voice.id === library.currentId);
  const playable = current ?? library.visibleVoices[0];
  const selectedFolder = library.folders.find((folder) => folder.id === library.scope);
  const scopeName = selectedFolder?.name ?? (library.scope === "all" ? "すべてのボイス" : "未分類");
  const folderCounts = new Map<string | null, number>();
  for (const voice of library.voices) {
    const folderIds = voice.folderIds.length > 0 ? voice.folderIds : [null];
    for (const id of folderIds) folderCounts.set(id, (folderCounts.get(id) ?? 0) + 1);
  }
  const editingName = dialog?.kind === "renameVoice" || dialog?.kind === "renameFolder" || dialog?.kind === "createFolder";
  const deleting = dialog?.kind === "deleteVoice" || dialog?.kind === "deleteFolder";
  const foldersChanged = dialog?.kind === "editFolders" && (editingFolderIds.length !== dialog.voice.folderIds.length
    || editingFolderIds.some((id) => !dialog.voice.folderIds.includes(id)));
  const orderChanged = dialog?.kind === "reorder" && orderedVoices.some((voice, index) => voice.id !== dialog.voices[index]?.id);
  const reorderSource = orderedVoices.find((voice) => voice.id === reorderSourceId);

  async function run(action: () => Promise<void>, failure: string, success?: string) {
    if (operationPending.current || library.busy || library.loading) return;
    operationPending.current = true;
    setWorking(true);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
    } catch (error) {
      setActionError(error instanceof Error && error.message ? error.message : failure);
    } finally {
      operationPending.current = false;
      setWorking(false);
    }
  }

  function openDialog(next: Dialog) {
    if (locked) return;
    setActionError(null);
    setName(next.kind === "renameVoice" ? next.voice.name : next.kind === "renameFolder" ? next.folder.name : "");
    if (next.kind === "editFolders") setEditingFolderIds([...next.voice.folderIds]);
    if (next.kind === "reorder") {
      setOrderedVoices([...next.voices]);
      setReorderSourceId(null);
    }
    setDialog(next);
  }

  function selectReorderPosition(id: string) {
    if (locked || dialog?.kind !== "reorder") return;
    if (!reorderSourceId) {
      setReorderSourceId(id);
      return;
    }
    if (reorderSourceId !== id) {
      setOrderedVoices((previous) => {
        const source = previous.find((voice) => voice.id === reorderSourceId);
        const destination = previous.findIndex((voice) => voice.id === id);
        if (!source || destination < 0) return previous;
        const next = previous.filter((voice) => voice.id !== reorderSourceId);
        next.splice(destination, 0, source);
        return next;
      });
    }
    setReorderSourceId(null);
  }

  function closeDialog() {
    if (operationPending.current || library.busy) return;
    setDialog(null);
    setActionError(null);
  }

  function saveName() {
    if (!dialog || !editingName) return;
    let trimmed: string;
    try {
      trimmed = dialog.kind === "renameVoice" ? voiceDisplayName(name) : voiceFolderName(name);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "表示名を入力してください。");
      return;
    }
    if (dialog.kind === "renameVoice") {
      void run(async () => {
        await library.renameVoice(dialog.voice.id, trimmed);
        setDialog(null);
      }, "ボイスの名前を変更できませんでした。もう一度お試しください。", "ボイスの名前を変更しました。");
    } else if (dialog.kind === "renameFolder") {
      void run(async () => {
        await library.renameFolder(dialog.folder.id, trimmed);
        setDialog(null);
      }, "フォルダーの名前を変更できませんでした。もう一度お試しください。", "フォルダーの名前を変更しました。");
    } else if (dialog.kind === "createFolder") {
      void run(async () => {
        await library.createFolder(trimmed);
        setDialog(null);
        setImportResult(null);
      }, "フォルダーを作成できませんでした。もう一度お試しください。", "フォルダーを作成しました。");
    }
  }

  function selectScope(scope: VoiceScope) {
    if (scope === library.scope) {
      closeDialog();
      return;
    }
    void run(async () => {
      await library.selectScope(scope);
      setDialog(null);
      setImportResult(null);
    }, "再生する範囲を変更できませんでした。もう一度お試しください。");
  }

  function confirmDialog() {
    if (!dialog) return;
    if (editingName) saveName();
    else if (dialog.kind === "deleteVoice") void run(async () => {
      await library.removeVoice(dialog.voice.id);
      setDialog(null);
    }, "ボイスを削除できませんでした。もう一度お試しください。", "ボイスを削除しました。");
    else if (dialog.kind === "deleteFolder") void run(async () => {
      await library.removeFolder(dialog.folder.id);
      setDialog(null);
      setImportResult(null);
    }, "フォルダーを削除できませんでした。もう一度お試しください。", "フォルダーを削除しました。ボイスは引き続き使用できます。");
    else if (dialog.kind === "editFolders") void run(async () => {
      await library.setVoiceFolders(dialog.voice.id, editingFolderIds);
      setDialog(null);
    }, "使用するフォルダーを保存できませんでした。もう一度お試しください。", "使用するフォルダーを保存しました。");
    else if (dialog.kind === "reorder" && orderChanged) void run(async () => {
      await library.reorderVoices(orderedVoices.map((voice) => voice.id), dialog.scope);
      setDialog(null);
    }, "ボイスの順番を保存できませんでした。もう一度お試しください。", "ボイスの順番を保存しました。");
  }

  const header = <View style={styles.section}>
    <PageTitle>ボイス格納</PageTitle>
    <AppText variant="muted">音声ファイルを取り込み、すべてのボイスや人別のフォルダーを選んで繰り返し再生できます。</AppText>
    <Card>
      <AppText variant="subtitle">再生する範囲</AppText>
      <View style={styles.heading}>
        <AppText localize={!selectedFolder} style={styles.voiceName} testID="voice-current-scope">{scopeName}</AppText>
        <AppText localize={false} variant="muted">{library.visibleVoices.length}</AppText>
      </View>
      <View style={styles.actions}>
        <VoiceButton label="フォルダーを選択" disabled={locked} onPress={() => openDialog({ kind: "chooseScope" })} testID="voice-scope-picker" />
        <VoiceButton label="フォルダーを作成" disabled={locked} onPress={() => openDialog({ kind: "createFolder" })} testID="voice-folder-create" />
      </View>
      {selectedFolder ? <View style={styles.actions}>
        <VoiceButton label="フォルダーの名前を変更" disabled={locked}
          onPress={() => openDialog({ kind: "renameFolder", folder: selectedFolder })} testID="voice-folder-rename" />
        <VoiceButton label="フォルダーを削除" danger disabled={locked}
          onPress={() => openDialog({ kind: "deleteFolder", folder: selectedFolder })} testID="voice-folder-delete" />
      </View> : null}
      <AppText variant="muted">選択した一覧だけを再生します。範囲を切り替えると再生を停止します。</AppText>
      <AppText variant="muted">同じボイスを複数のフォルダーで使用できます。「すべてのボイス」では重複せず再生します。</AppText>
    </Card>
    <View style={styles.heading}>
      <AppText variant="muted">ボイスの追加先</AppText>
      <AppText localize={!selectedFolder} style={styles.voiceName}>{selectedFolder?.name ?? "未分類"}</AppText>
    </View>
    <PrimaryButton title={locked ? "処理中..." : "ボイスを追加"} tone="save" disabled={locked}
      onPress={() => void run(async () => {
        setImportResult(null);
        const result = await library.importVoices();
        if (result && !result.canceled) setImportResult(result);
      }, "ボイスを取り込めませんでした。もう一度お試しください。")}
      testID="voice-import" />
    <VoiceButton label="順序変更" disabled={locked || library.visibleVoices.length < 2}
      onPress={() => openDialog({ kind: "reorder", scope: library.scope, scopeName, customScopeName: Boolean(selectedFolder), voices: [...library.visibleVoices] })}
      testID="voice-reorder-open" />
    {library.loading ? <ActivityIndicator accessibilityLabel={t("読み込み中…")} color="#9bcbff" /> : null}
    {locked && !library.loading ? <AppText accessibilityLiveRegion="polite" variant="muted">処理中...</AppText> : null}
    {notice ? <AppText accessibilityLiveRegion="polite" style={styles.notice}>{notice}</AppText> : null}
    {importResult ? <Card>
      <View style={styles.heading} accessibilityLiveRegion="polite">
        <AppText>追加したボイス</AppText><AppText localize={false}>{importResult.added}</AppText>
      </View>
      {importResult.failed > 0 ? <>
        <View style={styles.heading}><AppText>取り込めなかったボイス</AppText><AppText localize={false}>{importResult.failed}</AppText></View>
        <AppText style={styles.error}>取り込めなかったファイルをもう一度選択してください。</AppText>
      </> : null}
    </Card> : null}
    {actionError && !dialog ? <AppText accessibilityRole="alert" style={styles.error}>{actionError}</AppText> : null}
    {library.error ? <AppText accessibilityRole="alert" style={styles.error}>{library.error}</AppText> : null}
    <Card>
      <AppText variant="subtitle">再生モード</AppText>
      <View style={styles.actions} accessibilityRole="radiogroup" accessibilityLabel={t("再生モード")}>
        <VoiceButton label="1曲をループ" selected={library.mode === "one"} radio disabled={locked}
          onPress={() => void run(() => library.setMode("one"), "再生モードを保存できませんでした。もう一度お試しください。")}
          testID="voice-mode-one" />
        <VoiceButton label="順番にループ" selected={library.mode === "all"} radio disabled={locked}
          onPress={() => void run(() => library.setMode("all"), "再生モードを保存できませんでした。もう一度お試しください。")}
          testID="voice-mode-all" />
      </View>
      <AppText variant="muted">「順番にループ」は選択中の一覧を最後まで再生すると、先頭に戻ります。</AppText>
      <AppText variant="label">{library.playing ? "再生中" : current ? "一時停止中" : "停止中"}</AppText>
      {playable ? <AppText localize={false} style={styles.voiceName}>{playable.name}</AppText> : <AppText variant="muted">再生するボイスを追加してください。</AppText>}
      <View style={styles.actions}>
        <VoiceButton label="前のボイス" equalWidth disabled={locked || !current || library.visibleVoices.length < 2} onPress={library.previous} testID="voice-previous" />
        <VoiceButton label={library.playing ? "一時停止" : "再生"} equalWidth disabled={locked || !playable}
          onPress={() => library.playing ? library.pause() : playable && library.play(playable.id)} testID="voice-play-pause" />
        <VoiceButton label="次のボイス" equalWidth disabled={locked || !current || library.visibleVoices.length < 2} onPress={library.next} testID="voice-next" />
      </View>
      <VoiceButton label="停止" danger disabled={!current} onPress={library.stop} testID="voice-stop" />
      <AppText variant="muted">画面を移動しても再生は続きます。止めるときは「停止」を押してください。</AppText>
    </Card>
    <View style={styles.heading}>
      <AppText variant="subtitle">格納したボイス</AppText>
      <AppText localize={false} variant="muted">{library.visibleVoices.length}</AppText>
    </View>
  </View>;

  return <View style={[styles.root, { paddingTop: Math.max(12, insets.top) }]}>
    <FlatList data={library.visibleVoices} keyExtractor={(voice) => voice.id} contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled" initialNumToRender={12} ListHeaderComponent={header}
      extraData={{ locked, currentId: library.currentId, playing: library.playing, folders: library.folders }}
      ListEmptyComponent={!library.loading ? <Card><AppText variant="muted">{library.scope === "all" ? "ボイスはまだ格納されていません。" : "この一覧にボイスはありません。ボイスを追加するか、「使用するフォルダー」を変更してください。"}</AppText></Card> : null}
      renderItem={({ item: voice, index }) => {
        const active = voice.id === library.currentId;
        const voiceFolders = library.folders.filter((folder) => voice.folderIds.includes(folder.id));
        return <Card style={active ? styles.active : undefined}>
          <View style={styles.heading}>
            <AppText localize={false} variant="muted">{index + 1}</AppText>
            <AppText localize={false} style={styles.voiceName}>{voice.name}</AppText>
            {active ? <AppText variant="muted">{library.playing ? "再生中" : "一時停止中"}</AppText> : null}
          </View>
          <View style={styles.folderLabels}>
            {voiceFolders.length > 0 ? voiceFolders.map((folder) => <AppText key={folder.id} localize={false} variant="muted" style={styles.folderLabel}>{folder.name}</AppText>)
              : <AppText variant="muted" style={styles.folderLabel}>未分類</AppText>}
          </View>
          <AppText localize={false} variant="muted">{voice.originalName}</AppText>
          <AppText localize={false} variant="muted">{formatVoiceSize(voice.size)}</AppText>
          <View style={styles.actions}>
            <VoiceButton label={active && library.playing ? "一時停止" : "再生"}
              accessibilityLabel={`${t(active && library.playing ? "一時停止" : "再生")}: ${voice.name}`} disabled={locked}
              onPress={() => active && library.playing ? library.pause() : library.play(voice.id)} testID={`voice-play-${voice.id}`} />
            <VoiceButton label="名前を変更" accessibilityLabel={`${t("名前を変更")}: ${voice.name}`} disabled={locked}
              onPress={() => openDialog({ kind: "renameVoice", voice })} testID={`voice-rename-${voice.id}`} />
            <VoiceButton label="削除" danger accessibilityLabel={`${t("削除")}: ${voice.name}`} disabled={locked}
              onPress={() => openDialog({ kind: "deleteVoice", voice })} testID={`voice-delete-${voice.id}`} />
          </View>
          <VoiceButton label="使用するフォルダー" accessibilityLabel={`${t("使用するフォルダー")}: ${voice.name}`} disabled={locked}
            onPress={() => openDialog({ kind: "editFolders", voice })} testID={`voice-folders-edit-${voice.id}`} />
        </Card>;
      }}
      ListFooterComponent={<View style={styles.section}>
        <VoiceButton label="管理・設定メニューへ戻る" onPress={() => router.replace("/(tabs)/menu?section=management")} />
        <VoiceButton label="ホームへ戻る" onPress={() => router.replace("/(tabs)")} />
      </View>} />
    <VoiceDialog visible={Boolean(dialog)} onClose={closeDialog}>
      <PageTitle>{dialog ? dialogTitles[dialog.kind] : ""}</PageTitle>
      {editingName ? <TextField label={dialog?.kind === "renameVoice" ? "表示名" : "フォルダー名"}
        accessibilityLabel={t(dialog?.kind === "renameVoice" ? "表示名" : "フォルダー名")} value={name} onChangeText={setName}
        editable={!locked} maxLength={dialog?.kind === "renameVoice" ? VOICE_NAME_LIMIT : VOICE_FOLDER_NAME_LIMIT} autoFocus returnKeyType="done" onSubmitEditing={saveName}
        testID={dialog?.kind === "renameVoice" ? "voice-name-input" : "voice-folder-name-input"} /> : null}
      {dialog?.kind === "createFolder" ? <AppText variant="muted">人の名前などでフォルダーを作成できます。作成すると、そのフォルダーを選択して再生を停止します。</AppText> : null}
      {dialog?.kind === "deleteVoice" ? <>
        <AppText localize={false} style={styles.voiceName}>{dialog.voice.name}</AppText>
        <AppText>格納したボイスを削除します。取り込み元のファイルは削除しません。</AppText>
        <AppText>削除すると、使用するすべてのフォルダーから取り除かれます。</AppText>
      </> : null}
      {dialog?.kind === "deleteFolder" ? <>
        <AppText localize={false} style={styles.voiceName}>{dialog.folder.name}</AppText>
        <AppText>フォルダーを削除します。ボイスと他のフォルダーでの使用設定は残ります。使用先がなくなるボイスだけ未分類に表示します。</AppText>
        <View style={styles.heading}><AppText variant="muted">このフォルダーのボイス</AppText><AppText localize={false}>{folderCounts.get(dialog.folder.id) ?? 0}</AppText></View>
        <View style={styles.heading}><AppText variant="muted">未分類になるボイス</AppText><AppText localize={false}>{library.voices.filter((voice) => voice.folderIds.length === 1 && voice.folderIds.includes(dialog.folder.id)).length}</AppText></View>
      </> : null}
      {dialog?.kind === "chooseScope" ? <>
        <AppText variant="muted">すべてのボイス、未分類、またはフォルダーを選択してください。</AppText>
        <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={t("再生する範囲")}>
          <FolderChoice label={t("すべてのボイス")} count={library.voices.length} selected={library.scope === "all"}
            disabled={locked} onPress={() => selectScope("all")} testID="voice-scope-all" />
          <FolderChoice label={t("未分類")} count={folderCounts.get(null) ?? 0} selected={library.scope === "unfiled"}
            disabled={locked} onPress={() => selectScope("unfiled")} testID="voice-scope-unfiled" />
          {library.folders.map((folder) => <FolderChoice key={folder.id} label={folder.name} count={folderCounts.get(folder.id) ?? 0}
            selected={library.scope === folder.id} disabled={locked} onPress={() => selectScope(folder.id)} testID={`voice-scope-${folder.id}`} />)}
        </View>
      </> : null}
      {dialog?.kind === "editFolders" ? <>
        <AppText localize={false} style={styles.voiceName}>{dialog.voice.name}</AppText>
        <AppText variant="muted">使用するフォルダーを複数選べます。選択をすべて解除すると未分類に表示します。</AppText>
        <View style={styles.choices}>
          {library.folders.map((folder) => <FolderChoice key={folder.id} label={folder.name} count={folderCounts.get(folder.id) ?? 0}
            multiple selected={editingFolderIds.includes(folder.id)} disabled={locked}
            onPress={() => setEditingFolderIds((previous) => previous.includes(folder.id) ? previous.filter((id) => id !== folder.id) : [...previous, folder.id])}
            testID={`voice-membership-${folder.id}`} />)}
        </View>
        <VoiceButton label="すべて解除" disabled={locked || editingFolderIds.length === 0} onPress={() => setEditingFolderIds([])} testID="voice-folders-clear" />
        {editingFolderIds.length === 0 ? <AppText variant="muted" accessibilityLiveRegion="polite">未分類</AppText> : null}
        <AppText variant="muted">複数のフォルダーを選んでも、ボイスの使用容量は増えません。「保存」で変更を反映します。</AppText>
        {library.folders.length === 0 ? <AppText variant="muted">フォルダーがありません。画面上部の「フォルダーを作成」から追加できます。</AppText> : null}
      </> : null}
      {dialog?.kind === "reorder" ? <>
        <View style={styles.heading}>
          <AppText variant="muted">再生する範囲</AppText>
          <AppText localize={!dialog.customScopeName} style={styles.voiceName} testID="voice-reorder-scope">{dialog.scopeName}</AppText>
        </View>
        <AppText variant="muted">順番を変えるボイスを選び、次に移動先の番号を選んでください。同じボイスをもう一度選ぶと選択を解除します。</AppText>
        <AppText variant="muted">順番はすべてのフォルダーで共通です。「保存」で反映し、キャンセルで変更を破棄します。</AppText>
        <View style={styles.reorderStatus} accessibilityLiveRegion="polite">
          <AppText variant="label">{reorderSource ? "移動先の位置を選択" : "移動するボイスを選択"}</AppText>
          {reorderSource ? <AppText localize={false} style={styles.voiceName}>{reorderSource.name}</AppText> : null}
        </View>
        <View style={styles.choices} testID="voice-reorder-list">
          {orderedVoices.map((voice, index) => {
            const selected = voice.id === reorderSourceId;
            return <Pressable key={voice.id} accessibilityRole="button"
              accessibilityLabel={`${t(selected ? "選択を解除" : reorderSource ? "この位置へ移動" : "移動するボイスを選択")}: ${index + 1}, ${voice.name}`}
              accessibilityState={{ selected, disabled: locked }} aria-pressed={selected} disabled={locked}
              onPress={() => selectReorderPosition(voice.id)} testID={`voice-reorder-row-${voice.id}`}
              style={({ pressed }) => [styles.choice, reorderSource && !selected && styles.reorderDestination, selected && styles.selectedButton,
                locked && styles.disabled, pressed && !locked && styles.pressed]}>
              <AppText localize={false} style={styles.reorderPosition} testID={`voice-reorder-position-${voice.id}`}>{index + 1}</AppText>
              <AppText localize={false} style={styles.voiceName}>{voice.name}</AppText>
              <AppText localize={false} style={styles.choiceMark} accessible={false}>{selected ? "●" : reorderSource ? "→" : "○"}</AppText>
            </Pressable>;
          })}
        </View>
      </> : null}
      {actionError ? <AppText accessibilityRole="alert" style={styles.error}>{actionError}</AppText> : null}
      <View style={styles.actions}>
        <VoiceButton label={dialog?.kind === "chooseScope" ? "閉じる" : "キャンセル"} disabled={locked} onPress={closeDialog} />
        {dialog && dialog.kind !== "chooseScope" ? <VoiceButton
          label={locked ? "処理中..." : deleting ? "削除" : dialog.kind === "createFolder" ? "作成" : "保存"}
          danger={deleting} disabled={locked || (dialog.kind === "editFolders" && !foldersChanged) || (dialog.kind === "reorder" && !orderChanged)}
          onPress={confirmDialog} testID="voice-dialog-confirm" /> : null}
      </View>
    </VoiceDialog>
  </View>;
}

function FolderChoice({ label, count, selected, disabled, onPress, testID, multiple = false }: {
  label: string; count: number; selected: boolean; disabled: boolean; onPress: () => void; testID: string; multiple?: boolean;
}) {
  return <Pressable accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityLabel={`${label}: ${count}`}
    accessibilityState={{ checked: selected, disabled }} aria-checked={selected} disabled={disabled} onPress={onPress} testID={testID}
    style={({ pressed }) => [styles.choice, selected && styles.selectedButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <AppText localize={false} style={styles.choiceMark} accessible={false}>{multiple ? selected ? "☑" : "☐" : selected ? "●" : "○"}</AppText>
    <AppText localize={false} style={styles.voiceName}>{label}</AppText>
    <AppText localize={false} variant="muted">{count}</AppText>
  </Pressable>;
}

function VoiceButton({ label, onPress, disabled = false, selected = false, radio = false, danger = false, equalWidth = false, accessibilityLabel, testID }: {
  label: string; onPress: () => void; disabled?: boolean; selected?: boolean; radio?: boolean; danger?: boolean; equalWidth?: boolean;
  accessibilityLabel?: string; testID?: string;
}) {
  const { settings } = useAppAudio();
  return <Pressable accessibilityRole={radio ? "radio" : "button"}
    accessibilityLabel={accessibilityLabel ?? translateText(label, settings?.language ?? "ja")}
    accessibilityState={{ disabled, ...(radio ? { checked: selected } : {}) }} aria-checked={radio ? selected : undefined} disabled={disabled} testID={testID} onPress={onPress}
    style={({ pressed }) => [styles.button, equalWidth && styles.equalWidthButton, selected && styles.selectedButton, danger && styles.dangerButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <AppText style={styles.buttonText}>{label}</AppText>
  </Pressable>;
}

function VoiceDialog({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.dialogContainer, {
        paddingTop: Math.max(24, insets.top), paddingBottom: Math.max(24, insets.bottom),
      }]}>
        <View style={styles.dialog} accessibilityViewIsModal onAccessibilityEscape={onClose}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

function formatVoiceSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  content: { width: "100%", maxWidth: 900, alignSelf: "center", gap: 14, padding: 16, paddingBottom: 24 },
  section: { gap: 14 },
  heading: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  voiceName: { flexGrow: 1, flexShrink: 1, color: "#fff", fontWeight: "800", minWidth: 0 },
  folderLabels: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  folderLabel: { flexShrink: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#52728e", borderRadius: 4, backgroundColor: "#102334" },
  active: { borderColor: "#9bcbff", backgroundColor: "#102334" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choices: { gap: 8 },
  reorderStatus: { minHeight: 44, gap: 4 },
  reorderDestination: { borderStyle: "dashed", borderColor: "#9bcbff" },
  reorderPosition: { minWidth: 28, fontWeight: "800", textAlign: "center", color: "#9bcbff" },
  choice: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, padding: 12, borderWidth: 1, borderColor: "#aaa", borderRadius: 4, backgroundColor: "#151515" },
  choiceMark: { color: "#9bcbff", fontSize: 18 },
  button: { flexGrow: 1, minHeight: 46, minWidth: 88, justifyContent: "center", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#aaa", borderRadius: 4, backgroundColor: "#151515" },
  equalWidthButton: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  buttonText: { color: "#fff", fontWeight: "800", textAlign: "center" },
  selectedButton: { borderColor: "#9bcbff", backgroundColor: "#194770" },
  dangerButton: { borderColor: "#ff7777", backgroundColor: "#5c1720" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  notice: { color: "#9fe1a2" },
  error: { color: "#ff9292" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)" },
  dialogContainer: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  dialog: { width: "100%", maxWidth: 460, gap: 16, borderWidth: 1, borderColor: "#fff", backgroundColor: "#080808", padding: 20 },
});
