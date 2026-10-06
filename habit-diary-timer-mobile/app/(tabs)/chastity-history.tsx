import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { useAppModal } from "@/components/AppModalProvider";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { lightTheme } from "@/constants/theme";
import { roomMessages } from "@/constants/messages";
import { getDailyChastityStatuses, selectChastityRecords } from "@/features/chastity/history";
import { translateText, translateWeekday } from "@/i18n";
import {
  CHASTITY_MAX_NOTE_LENGTH, CHASTITY_STATUSES, CHASTITY_STATUS_ICONS, CHASTITY_STATUS_LABELS,
  chastityHistoryService, type ChastityHistorySnapshot, type ChastityRecord, type ChastityStatus,
} from "@/services/chastityHistoryService";
import { toDateKey } from "@/utils/date";
import { isJapaneseHoliday } from "@/utils/japaneseHoliday";

export default function ChastityHistoryScreen() {
  const { settings } = useAppAudio();
  const { showError } = useAppModal();
  const insets = useSafeAreaInsets();
  const language = settings?.language ?? "ja";
  const locale = language === "en" ? "en-US" : language === "ko" ? "ko-KR" : language === "zh" ? "zh-CN" : "ja-JP";
  const [snapshot, setSnapshot] = useState<ChastityHistorySnapshot>({ records: [], photos: {}, calendarDisplay: "icons" });
  const [keyword, setKeyword] = useState("");
  const searching = keyword.trim().length > 0;
  const [selectedDate, setSelectedDate] = useState(toDateKey());
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<ChastityRecord | null>(null);
  const [formDate, setFormDate] = useState(toDateKey());
  const [status, setStatus] = useState<ChastityStatus>("locked");
  const [statusOpen, setStatusOpen] = useState(false);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ChastityRecord | null>(null);
  const [pendingPhotoDelete, setPendingPhotoDelete] = useState<string | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(() => new Set());
  const mountedRef = useRef(true);
  const focusedRef = useRef(false);
  const busyRef = useRef(false);
  const loadVersionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadRecords = useCallback(async () => {
    if (busyRef.current) return;
    const version = ++loadVersionRef.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const loaded = await chastityHistoryService.load();
      if (!mountedRef.current || !focusedRef.current || version !== loadVersionRef.current) return;
      setSnapshot(loaded);
      setFailedImages(new Set());
    } catch (error) {
      if (!mountedRef.current || !focusedRef.current || version !== loadVersionRef.current) return;
      setLoadFailed(true);
      showError("貞操帯管理記録の読み込みに失敗しました", error);
    } finally {
      if (mountedRef.current && focusedRef.current && version === loadVersionRef.current) setLoading(false);
    }
  }, [showError]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void loadRecords();
    return () => { focusedRef.current = false; ++loadVersionRef.current; };
  }, [loadRecords]));

  const dailyStatuses = useMemo(() => getDailyChastityStatuses(snapshot.records), [snapshot.records]);
  const displayedRecords = useMemo(() => {
    const names = Object.fromEntries(CHASTITY_STATUSES.map((value) => [value, [
      CHASTITY_STATUS_LABELS[value], translateText(CHASTITY_STATUS_LABELS[value], language), CHASTITY_STATUS_ICONS[value],
    ]])) as Record<ChastityStatus, string[]>;
    return selectChastityRecords(snapshot.records, selectedDate, keyword, names);
  }, [snapshot.records, selectedDate, keyword, language]);
  const calendarDays = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    return [
      ...Array.from({ length: new Date(year, month, 1).getDay() }, () => null),
      ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => toDateKey(new Date(year, month, index + 1))),
    ];
  }, [visibleMonth]);
  const today = toDateKey();
  const selectedPhoto = snapshot.photos[selectedDate];
  const previewPhoto = previewDate ? snapshot.photos[previewDate] : undefined;
  const disabled = busy || loading || loadFailed;
  const dateLabel = (date: string) => new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "long", day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
  const statusLabel = (value: ChastityStatus) => `${CHASTITY_STATUS_ICONS[value]} ${translateText(CHASTITY_STATUS_LABELS[value], language)}`;
  const renderStatusLabel = (value: ChastityStatus) => <>
    <Text style={value === "ejaculation" ? styles.ejaculationIcon : undefined}>{CHASTITY_STATUS_ICONS[value]}</Text>
    {` ${translateText(CHASTITY_STATUS_LABELS[value], language)}`}
  </>;

  function changeMonth(delta: number) {
    if (busyRef.current) return;
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + delta, 1);
    const firstDay = toDateKey(next);
    if (firstDay > today) return;
    setVisibleMonth(next);
    setSelectedDate(firstDay.slice(0, 7) === today.slice(0, 7) ? today : firstDay);
  }

  function showDate(date: string) {
    const [year, month] = date.split("-").map(Number);
    setSelectedDate(date);
    setVisibleMonth(new Date(year, month - 1, 1));
    setKeyword("");
  }

  function openForm(record?: ChastityRecord) {
    if (busyRef.current || loading || loadFailed) return;
    setEditing(record ?? null);
    setFormDate(record?.recordDate ?? selectedDate);
    setStatus(record?.status ?? "locked");
    setStatusOpen(false);
    setNote(record?.note ?? "");
    setFormError("");
    setFormVisible(true);
  }

  function closeForm() {
    if (busyRef.current) return;
    if (statusOpen) setStatusOpen(false);
    else setFormVisible(false);
  }

  function beginMutation() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    ++loadVersionRef.current;
    setLoading(false);
    return true;
  }

  function endMutation() {
    busyRef.current = false;
    if (mountedRef.current) setBusy(false);
  }

  async function save() {
    if (!beginMutation()) return;
    setFormError("");
    try {
      const input = { recordDate: formDate, status, note };
      const updated = editing ? await chastityHistoryService.update(editing.id, input) : await chastityHistoryService.add(input);
      if (!mountedRef.current) return;
      setSnapshot(updated);
      setLoadFailed(false);
      setFormVisible(false);
    } catch {
      if (mountedRef.current) setFormError("貞操帯管理記録の保存に失敗しました。入力内容を確認して、もう一度お試しください。");
    } finally { endMutation(); }
  }

  async function remove() {
    const target = pendingDelete;
    if (!target || !beginMutation()) return;
    setPendingDelete(null);
    try {
      const updated = await chastityHistoryService.remove(target.id);
      if (mountedRef.current) { setSnapshot(updated); setLoadFailed(false); }
    } catch (error) {
      if (mountedRef.current && focusedRef.current) showError("貞操帯管理記録の削除に失敗しました", error);
    } finally { endMutation(); }
  }

  async function pickPhoto() {
    if (disabled || !beginMutation()) return;
    try {
      // Call the picker in this press handler so web retains its user gesture.
      const updated = await chastityHistoryService.pickPhoto(selectedDate);
      if (updated && mountedRef.current) { setSnapshot(updated); setLoadFailed(false); }
    } catch (error) {
      if (mountedRef.current && focusedRef.current) showError("画像の保存に失敗しました", error);
    } finally { endMutation(); }
  }

  async function removePhoto() {
    const date = pendingPhotoDelete;
    if (!date || !beginMutation()) return;
    setPendingPhotoDelete(null);
    try {
      const updated = await chastityHistoryService.removePhoto(date);
      if (mountedRef.current) { setSnapshot(updated); setLoadFailed(false); }
    } catch (error) {
      if (mountedRef.current && focusedRef.current) showError("画像の削除に失敗しました", error);
    } finally { endMutation(); }
  }

  async function setCalendarDisplay(mode: "icons" | "photos") {
    if (disabled || snapshot.calendarDisplay === mode || !beginMutation()) return;
    try {
      const updated = await chastityHistoryService.setCalendarDisplay(mode);
      if (mountedRef.current) setSnapshot(updated);
    } catch (error) {
      if (mountedRef.current && focusedRef.current) showError("表示設定の保存に失敗しました", error);
    } finally { endMutation(); }
  }

  function imageFailed(uri: string) {
    setFailedImages((previous) => previous.has(uri) ? previous : new Set([...previous, uri]));
  }

  return (
    <>
      <Screen>
        <AppText variant="title">貞操帯管理記録</AppText>
        <PrimaryButton title="記録・交換メニューへ戻る" tone="secondary" disabled={busy}
          onPress={() => router.replace("/(tabs)/menu?section=record")} />
        <RoomConversation
          characterSource={require("../../assets/characters/chastity-nino.png")}
          roomName="貞操帯管理記録"
          lines={roomMessages.chastityHistory.lines}
          contractLines={roomMessages.chastityHistory.contractLines}
        />
        <TextField testID="chastity-search" label="検索" accessibilityLabel={translateText("検索", language)}
          value={keyword} onChangeText={setKeyword} placeholder="内容・日付・状態" editable={!busy} />
        {searching ? <Card>
          <AppText variant="subtitle">検索結果（全期間）</AppText>
          {!loading && !loadFailed ? <AppText testID="chastity-search-count">{`検索結果：${displayedRecords.length}件`}</AppText> : null}
          <PrimaryButton title="検索をクリア" tone="secondary" disabled={busy} onPress={() => setKeyword("")} />
          {loading ? <AppText variant="muted">検索結果を読み込み中…</AppText> : loadFailed ? <>
            <AppText>記録を読み込めませんでした。</AppText>
            <PrimaryButton title="再読み込み" tone="secondary" onPress={() => void loadRecords()} />
          </> : null}
        </Card> : <Card style={styles.calendarCard}>
          <AppText variant="subtitle" style={styles.calendarText}>貞操帯管理カレンダー</AppText>
          <View style={styles.actions} accessibilityRole="radiogroup" accessibilityLabel={translateText("カレンダー表示", language)}>
            {(["icons", "photos"] as const).map((mode) => (
              <Pressable key={mode} testID={`chastity-display-${mode}`} accessibilityRole="radio"
                accessibilityLabel={translateText(mode === "icons" ? "アイコン表示" : "画像表示", language)}
                aria-checked={snapshot.calendarDisplay === mode} aria-disabled={disabled}
                accessibilityState={{ checked: snapshot.calendarDisplay === mode, disabled }} disabled={disabled}
                onPress={() => void setCalendarDisplay(mode)}
                style={[styles.displayOption, snapshot.calendarDisplay === mode && styles.displaySelected, disabled && styles.disabled]}>
                <AppText style={[styles.displayText, snapshot.calendarDisplay === mode && styles.displaySelectedText]}>
                  {mode === "icons" ? "アイコン表示" : "画像表示"}
                </AppText>
              </Pressable>
            ))}
          </View>
          <View style={styles.monthHeader}>
            <PrimaryButton title="‹" tone="secondary" disabled={busy} onPress={() => changeMonth(-1)} />
            <AppText localize={false} style={[styles.monthTitle, styles.calendarText]}>
              {new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(visibleMonth)}
            </AppText>
            <PrimaryButton title="›" tone="secondary" disabled={busy || toDateKey(visibleMonth).slice(0, 7) >= today.slice(0, 7)} onPress={() => changeMonth(1)} />
          </View>
          <View style={styles.weekRow}>
            {Array.from({ length: 7 }, (_, index) => (
              <AppText key={index} localize={false} style={[styles.weekDay, index === 0 && styles.holidayText, index === 6 && styles.saturdayText]}>
                {translateWeekday(index, language)}
              </AppText>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {calendarDays.map((date, index) => {
              if (!date) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const future = date > today;
              const selected = date === selectedDate;
              const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
              const statuses = dailyStatuses[date] ?? [];
              const photo = snapshot.photos[date];
              const showPhoto = snapshot.calendarDisplay === "photos" && photo && !failedImages.has(photo.uri);
              return (
                <Pressable key={date} testID={`chastity-day-${date}`} accessibilityRole="button"
                  accessibilityLabel={`${dateLabel(date)} ${statuses.map(statusLabel).join(" ")}${photo ? ` ${translateText("画像あり", language)}` : ""}`}
                  aria-selected={selected} aria-disabled={future || busy}
                  accessibilityState={{ selected, disabled: future || busy }} disabled={future || busy}
                  onPress={() => setSelectedDate(date)} style={[styles.dayCell, selected && styles.selectedDay, future && styles.futureDay]}>
                  <AppText localize={false} style={[styles.dayText, dayOfWeek === 6 && styles.saturdayText,
                    (dayOfWeek === 0 || isJapaneseHoliday(date)) && styles.holidayText]}>
                    {Number(date.slice(-2))}
                  </AppText>
                  <View style={styles.dayMarkers}>
                    {!future && !loading && !loadFailed ? showPhoto ? (
                      <Image testID={`chastity-day-photo-${date}`} source={{ uri: photo.uri }} style={styles.dayPhoto} resizeMode="cover"
                        accessible={false} onError={() => imageFailed(photo.uri)} />
                    ) : statuses.map((value) => (
                      <AppText key={value} localize={false} style={[styles.dayIcon,
                        value === "ejaculation" && styles.ejaculationIcon]}>
                        {CHASTITY_STATUS_ICONS[value]}
                      </AppText>
                    )) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.legend}>
            {CHASTITY_STATUSES.map((value) => <AppText key={value} localize={false} style={styles.legendText}>{renderStatusLabel(value)}</AppText>)}
          </View>
          <AppText variant="muted" style={styles.calendarHelp}>画像がない日はアイコンを表示します。</AppText>
        </Card>}

        {!searching ? <Card>
          <AppText localize={false} variant="subtitle">{dateLabel(selectedDate)}</AppText>
          {loading ? <AppText variant="muted">読み込み中…</AppText> : loadFailed ? (
            <PrimaryButton title="再読み込み" tone="secondary" onPress={() => void loadRecords()} />
          ) : <View style={styles.totalRow}>
            <AppText>記録件数</AppText><AppText localize={false} style={styles.totalCount}>{displayedRecords.length}</AppText>
          </View>}
          <PrimaryButton title="記録する" tone="secondary" disabled={disabled} onPress={() => openForm()} />
          <AppText variant="subtitle">この日の画像</AppText>
          <AppText variant="muted">画像は1日1枚です。同じ日のすべての記録で共有します。</AppText>
          {selectedPhoto && !loading && !loadFailed ? <>
            {failedImages.has(selectedPhoto.uri) ? <AppText>画像を表示できませんでした</AppText> : (
              <Pressable testID="chastity-photo-preview" accessibilityRole="button" accessibilityLabel={translateText("画像を拡大", language)}
                disabled={busy} onPress={() => setPreviewDate(selectedDate)} style={styles.photoPressable}>
                <Image source={{ uri: selectedPhoto.uri }} resizeMode="contain" style={styles.photo} accessible={false} onError={() => imageFailed(selectedPhoto.uri)} />
                <AppText style={styles.expandBadge}>拡大</AppText>
              </Pressable>
            )}
            <View style={styles.actions}>
              <View style={styles.action}><PrimaryButton title="画像を変更" tone="secondary" disabled={disabled} onPress={() => void pickPhoto()} /></View>
              <View style={styles.action}><PrimaryButton title="画像を削除" tone="secondary" disabled={disabled} onPress={() => setPendingPhotoDelete(selectedDate)} /></View>
            </View>
          </> : <PrimaryButton title="画像を添付" tone="secondary" disabled={disabled} onPress={() => void pickPhoto()} />}
        </Card> : null}

        {!loading && !loadFailed && displayedRecords.length === 0 ? <Card>
          <AppText variant="muted">{searching ? "条件に一致する記録はありません。" : "選択した日の記録はありません。"}</AppText>
        </Card> : null}
        {!loading && !loadFailed ? displayedRecords.map((record) => (
          <View key={record.id} testID={`chastity-record-${record.id}`}>
            <Card>
              {searching ? <AppText localize={false} variant="label">{dateLabel(record.recordDate)}</AppText> : null}
              <AppText localize={false} variant="subtitle">{renderStatusLabel(record.status)}</AppText>
              {record.note ? <AppText localize={false}>{record.note}</AppText> : <AppText variant="muted">内容なし</AppText>}
              <View style={styles.actions}>
                <View style={styles.action}><PrimaryButton title="編集" tone="secondary" disabled={busy} onPress={() => openForm(record)} /></View>
                <View style={styles.action}><PrimaryButton title="削除" tone="secondary" disabled={busy} onPress={() => setPendingDelete(record)} /></View>
              </View>
              {searching ? <PrimaryButton title="この日を表示" tone="secondary" disabled={busy} onPress={() => showDate(record.recordDate)} /> : null}
            </Card>
          </View>
        )) : null}
        <PrimaryButton title="タスクへ戻る" tone="order" disabled={busy} onPress={() => router.replace("/(tabs)/tasks")} />
      </Screen>

      <Modal visible={formVisible} animationType="slide" onRequestClose={closeForm}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.formRoot, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
            <AppText variant="title">{editing ? "貞操帯管理記録を編集" : "貞操帯管理記録を追加"}</AppText>
            <AppText localize={false}>{dateLabel(formDate)}</AppText>
            <View style={styles.statusField}>
              <AppText variant="label">状態</AppText>
              <Pressable testID="chastity-status-dropdown" accessibilityRole="button"
                accessibilityLabel={`${translateText("状態", language)} ${statusLabel(status)}`}
                aria-expanded={statusOpen} aria-disabled={busy}
                accessibilityState={{ expanded: statusOpen, disabled: busy }} disabled={busy}
                onPress={() => setStatusOpen((previous) => !previous)} style={styles.statusButton}>
                <AppText localize={false} style={styles.statusText}>{renderStatusLabel(status)}</AppText>
                <AppText localize={false} style={styles.statusText}>{statusOpen ? "▲" : "▼"}</AppText>
              </Pressable>
              {statusOpen ? <View style={styles.statusOptions} accessibilityRole="radiogroup" accessibilityLabel={translateText("状態", language)}>
                {CHASTITY_STATUSES.map((value) => (
                  <Pressable key={value} testID={`chastity-status-${value}`} accessibilityRole="radio"
                    accessibilityLabel={statusLabel(value)} accessibilityState={{ checked: status === value, disabled: busy }} disabled={busy}
                    aria-checked={status === value} aria-disabled={busy}
                    onPress={() => { setStatus(value); setStatusOpen(false); }} style={[styles.statusOption, status === value && styles.statusSelected]}>
                    <AppText localize={false} style={styles.statusText}>{renderStatusLabel(value)}</AppText>
                    {status === value ? <AppText localize={false} style={styles.statusText}>✓</AppText> : null}
                  </Pressable>
                ))}
              </View> : null}
            </View>
            <TextField testID="chastity-note" label="内容（任意）" accessibilityLabel={translateText("内容（任意）", language)}
              value={note} onChangeText={setNote} multiline maxLength={CHASTITY_MAX_NOTE_LENGTH} editable={!busy} />
            {formError ? <AppText accessibilityRole="alert" style={styles.error}>{formError}</AppText> : null}
            <View style={styles.actions}>
              <View style={styles.action}><PrimaryButton title="キャンセル" tone="secondary" disabled={busy} onPress={() => { setStatusOpen(false); setFormVisible(false); }} /></View>
              <View style={styles.action}><PrimaryButton title={editing ? "変更する" : "追加する"} tone="secondary" disabled={busy} onPress={() => void save()} /></View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={previewPhoto !== undefined} animationType="fade" onRequestClose={() => setPreviewDate(null)}>
        <View testID="chastity-image-modal" style={[styles.previewRoot, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
          {previewDate ? <AppText localize={false} variant="subtitle">{dateLabel(previewDate)}</AppText> : null}
          {previewPhoto ? failedImages.has(previewPhoto.uri) ? (
            <View style={styles.previewImage}><AppText>画像を表示できませんでした</AppText></View>
          ) : <Image source={{ uri: previewPhoto.uri }} resizeMode="contain" style={styles.previewImage}
            accessibilityLabel={translateText("この日の画像", language)} onError={() => imageFailed(previewPhoto.uri)} /> : null}
          <PrimaryButton title="閉じる" tone="secondary" onPress={() => setPreviewDate(null)} />
        </View>
      </Modal>
      <ConfirmModal visible={pendingDelete !== null} title="記録を削除しますか？"
        message={<>
          {pendingDelete ? <>{`${dateLabel(pendingDelete.recordDate)}\n`}{renderStatusLabel(pendingDelete.status)}{"\n\n"}</> : null}
          {translateText("削除した記録は元に戻せません。", language)}
        </>}
        confirmLabel="削除する" confirmTone="secondary" onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()} />
      <ConfirmModal visible={pendingPhotoDelete !== null} title="画像を削除しますか？"
        message={`${pendingPhotoDelete ? `${dateLabel(pendingPhotoDelete)}\n\n` : ""}${translateText("この日の共有画像を削除します。記録と内容は残ります。", language)}`}
        confirmLabel="削除する" confirmTone="secondary" onCancel={() => setPendingPhotoDelete(null)} onConfirm={() => void removePhoto()} />
    </>
  );
}

const styles = StyleSheet.create({
  calendarCard: { backgroundColor: "#fff", borderColor: "#fff" },
  calendarText: { color: "#111" },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  monthTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "900" },
  weekRow: { flexDirection: "row" },
  weekDay: { width: `${100 / 7}%`, color: "#111", textAlign: "center", fontSize: 12, fontWeight: "800" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, height: 64, paddingHorizontal: 2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d7d7d7", backgroundColor: "#fff" },
  dayText: { color: "#111", fontWeight: "800" },
  dayMarkers: { width: "100%", height: 32, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", alignContent: "center" },
  dayIcon: { color: "#111", width: "50%", maxWidth: 17, textAlign: "center", fontSize: 12, lineHeight: 15 },
  ejaculationIcon: { color: "#d9202a", fontWeight: "900" },
  dayPhoto: { width: "100%", height: 30, maxWidth: 54, borderRadius: 2 },
  selectedDay: { borderColor: "#1667c7", borderWidth: 3 },
  futureDay: { opacity: 0.25 },
  saturdayText: { color: "#1667c7" },
  holidayText: { color: "#d92332" },
  calendarHelp: { color: "#555" },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 },
  legendText: { color: "#333", fontSize: 12, lineHeight: 18 },
  displayOption: { flex: 1, minHeight: 40, padding: 8, justifyContent: "center", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#000", borderRadius: 4 },
  displaySelected: { borderWidth: 3 },
  displayText: { color: "#000", fontSize: 14, textAlign: "center" },
  displaySelectedText: { fontWeight: "800" },
  disabled: { opacity: 0.5 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  totalCount: { color: "#ff3b45", fontSize: 22, lineHeight: 30, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minWidth: 0 },
  photoPressable: { backgroundColor: "#000", borderWidth: 1, borderColor: "#777", borderRadius: 4, overflow: "hidden" },
  photo: { height: 180, width: "100%" },
  expandBadge: { position: "absolute", bottom: 8, right: 8, paddingVertical: 2, paddingHorizontal: 8, backgroundColor: "rgba(0,0,0,0.75)", fontSize: 12 },
  formRoot: { flex: 1, backgroundColor: lightTheme.background },
  formContent: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, gap: 18 },
  statusField: { gap: 6 },
  statusButton: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: "#000", borderRadius: 4, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff" },
  statusOptions: { borderWidth: 1, borderColor: "#000", borderRadius: 4, overflow: "hidden" },
  statusOption: { minHeight: 48, paddingHorizontal: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff" },
  statusSelected: { borderWidth: 2, borderColor: "#000" },
  statusText: { color: "#000" },
  previewRoot: { flex: 1, paddingHorizontal: 16, gap: 12, backgroundColor: lightTheme.background },
  previewImage: { flex: 1, width: "100%", minHeight: 0 },
  error: { color: "#ff3b45" },
});
