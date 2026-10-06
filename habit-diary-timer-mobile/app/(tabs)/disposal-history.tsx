import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { useAppModal } from "@/components/AppModalProvider";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { lightTheme } from "@/constants/theme";
import { selectDisposalRecords } from "@/features/records/search";
import { translateText, translateWeekday } from "@/i18n";
import {
  DISPOSAL_MAX_COUNT,
  DISPOSAL_MAX_NOTE_LENGTH,
  disposalHistoryService,
  getDailyDisposalCounts,
  type DisposalRecord,
} from "@/services/disposalHistoryService";
import { toDateKey } from "@/utils/date";
import { isJapaneseHoliday } from "@/utils/japaneseHoliday";

export default function DisposalHistoryScreen() {
  const { settings } = useAppAudio();
  const { showError } = useAppModal();
  const insets = useSafeAreaInsets();
  const language = settings?.language ?? "ja";
  const locale = language === "en" ? "en-US" : language === "ko" ? "ko-KR" : language === "zh" ? "zh-CN" : "ja-JP";
  const [records, setRecords] = useState<DisposalRecord[]>([]);
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
  const [editing, setEditing] = useState<DisposalRecord | null>(null);
  const [formDate, setFormDate] = useState(toDateKey());
  const [countInput, setCountInput] = useState("1");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<DisposalRecord | null>(null);
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
      const loaded = await disposalHistoryService.load();
      if (!mountedRef.current || !focusedRef.current || version !== loadVersionRef.current) return;
      setRecords(loaded);
    } catch (error) {
      if (!mountedRef.current || !focusedRef.current || version !== loadVersionRef.current) return;
      setLoadFailed(true);
      showError("廃棄記録の読み込みに失敗しました", error);
    } finally {
      if (mountedRef.current && focusedRef.current && version === loadVersionRef.current) setLoading(false);
    }
  }, [showError]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void loadRecords();
    return () => {
      focusedRef.current = false;
      ++loadVersionRef.current;
    };
  }, [loadRecords]));

  const dailyCounts = useMemo(() => getDailyDisposalCounts(records), [records]);
  const displayedRecords = useMemo(
    () => selectDisposalRecords(records, selectedDate, keyword),
    [records, selectedDate, keyword],
  );
  const calendarDays = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const leading = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: count }, (_, index) => toDateKey(new Date(year, month, index + 1))),
    ];
  }, [visibleMonth]);
  const today = toDateKey();
  const selectedTotal = dailyCounts[selectedDate] ?? 0;
  const dateLabel = (date: string) => new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "long", day: "numeric",
  }).format(new Date(`${date}T12:00:00`));

  function changeMonth(delta: number) {
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

  function openForm(record?: DisposalRecord) {
    if (busyRef.current || loading || loadFailed) return;
    setEditing(record ?? null);
    setFormDate(record?.recordDate ?? selectedDate);
    setCountInput(String(record?.count ?? 1));
    setNote(record?.note ?? "");
    setFormError("");
    setFormVisible(true);
  }

  function closeForm() {
    if (!busyRef.current) setFormVisible(false);
  }

  async function save() {
    if (busyRef.current) return;
    const value = countInput.trim();
    const count = Number(value);
    if (!/^\d+$/.test(value) || !Number.isInteger(count) || count < 1 || count > DISPOSAL_MAX_COUNT) {
      setFormError("廃棄回数は1〜9999の整数で入力してください。");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setFormError("");
    ++loadVersionRef.current;
    setLoading(false);
    try {
      const input = { recordDate: formDate, count, note };
      const updated = editing
        ? await disposalHistoryService.update(editing.id, input)
        : await disposalHistoryService.add(input);
      if (!mountedRef.current) return;
      setRecords(updated);
      setLoadFailed(false);
      setFormVisible(false);
    } catch {
      if (mountedRef.current) setFormError("廃棄記録の保存に失敗しました。入力内容を確認して、もう一度お試しください。");
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  async function remove() {
    const target = pendingDelete;
    if (!target || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setPendingDelete(null);
    ++loadVersionRef.current;
    setLoading(false);
    try {
      const updated = await disposalHistoryService.remove(target.id);
      if (mountedRef.current) {
        setRecords(updated);
        setLoadFailed(false);
      }
    } catch (error) {
      if (mountedRef.current && focusedRef.current) showError("廃棄記録の削除に失敗しました", error);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <>
      <Screen desktopLayout="single">
        <AppText variant="title">ゴミ汁廃棄履歴</AppText>
        <TextField
          testID="disposal-search"
          label="検索"
          accessibilityLabel={translateText("検索", language)}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="内容・日付・回数"
        />
        {searching ? <Card>
          <AppText variant="subtitle">検索結果（全期間）</AppText>
          {!loading && !loadFailed ? <AppText testID="disposal-search-count">{`検索結果：${displayedRecords.length}件`}</AppText> : null}
          <PrimaryButton title="検索をクリア" tone="secondary" onPress={() => setKeyword("")} />
          {loading ? <AppText variant="muted">検索結果を読み込み中…</AppText> : loadFailed ? (
            <><AppText>記録を読み込めませんでした。</AppText><PrimaryButton title="再読み込み" tone="tribute" onPress={() => void loadRecords()} /></>
          ) : null}
        </Card> : <Card style={styles.calendarCard}>
          <AppText variant="subtitle" style={styles.calendarText}>廃棄カレンダー</AppText>
          <View style={styles.monthHeader}>
            <PrimaryButton title="‹" tone="secondary" onPress={() => changeMonth(-1)} />
            <AppText localize={false} style={[styles.monthTitle, styles.calendarText]}>
              {new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(visibleMonth)}
            </AppText>
            <PrimaryButton
              title="›"
              tone="secondary"
              disabled={toDateKey(visibleMonth).slice(0, 7) >= today.slice(0, 7)}
              onPress={() => changeMonth(1)}
            />
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
              const count = dailyCounts[date] ?? 0;
              return (
                <Pressable
                  key={date}
                  testID={`disposal-day-${date}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${dateLabel(date)} ${translateText(`${count}回`, language)}`}
                  accessibilityState={{ selected, disabled: future }}
                  disabled={future}
                  onPress={() => setSelectedDate(date)}
                  style={[styles.dayCell, selected && styles.selectedDay, future && styles.futureDay]}
                >
                  <AppText localize={false} style={[
                    styles.dayText,
                    dayOfWeek === 6 && styles.saturdayText,
                    (dayOfWeek === 0 || isJapaneseHoliday(date)) && styles.holidayText,
                    selected && styles.selectedDayText,
                  ]}>
                    {Number(date.slice(-2))}
                  </AppText>
                  <AppText localize={false} numberOfLines={1} adjustsFontSizeToFit style={[styles.dayCount, selected && styles.selectedDayText]}>
                    {future || loading || loadFailed ? " " : count}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText variant="muted" style={styles.calendarHelp}>日付の下の数字は、その日の廃棄回数です。</AppText>
        </Card>}

        {!searching ? <Card>
          <AppText localize={false} variant="subtitle">{dateLabel(selectedDate)}</AppText>
          {loading ? <AppText variant="muted">読み込み中…</AppText> : loadFailed ? (
            <PrimaryButton title="再読み込み" tone="tribute" onPress={() => void loadRecords()} />
          ) : (
            <View style={styles.totalRow}>
              <AppText>この日の合計</AppText>
              <AppText style={styles.totalCount}>{`${selectedTotal}回`}</AppText>
            </View>
          )}
          <PrimaryButton title="この日に追加" tone="tribute" disabled={busy || loading || loadFailed} onPress={() => openForm()} />
        </Card> : null}

        {!loading && !loadFailed && displayedRecords.length === 0 ? (
          <Card><AppText variant="muted">{searching ? "条件に一致する記録はありません。" : "選択した日の記録はありません。"}</AppText></Card>
        ) : null}
        {!loading && !loadFailed ? displayedRecords.map((record) => (
          <View key={record.id} testID={`disposal-record-${record.id}`}>
            <Card>
              {searching ? <AppText localize={false} variant="label">{dateLabel(record.recordDate)}</AppText> : null}
              <AppText variant="subtitle">{`${record.count}回`}</AppText>
              {record.note ? <AppText localize={false}>{record.note}</AppText> : <AppText variant="muted">内容なし</AppText>}
              <View style={styles.actions}>
                <View style={styles.action}><PrimaryButton title="編集" tone="tribute" disabled={busy} onPress={() => openForm(record)} /></View>
                <View style={styles.action}><PrimaryButton title="削除" tone="danger" disabled={busy} onPress={() => setPendingDelete(record)} /></View>
              </View>
              {searching ? <PrimaryButton title="この日を表示" tone="secondary" disabled={busy} onPress={() => showDate(record.recordDate)} /> : null}
            </Card>
          </View>
        )) : null}
        <PrimaryButton title="タスクへ戻る" tone="tribute" onPress={() => router.replace("/(tabs)/tasks")} />
      </Screen>

      <Modal visible={formVisible} animationType="slide" onRequestClose={closeForm}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.formRoot, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
            <AppText variant="title">{editing ? "廃棄記録を編集" : "廃棄記録を追加"}</AppText>
            <AppText localize={false}>{dateLabel(formDate)}</AppText>
            <TextField
              label="廃棄回数"
              accessibilityLabel={translateText("廃棄回数", language)}
              value={countInput}
              onChangeText={setCountInput}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={String(DISPOSAL_MAX_COUNT).length}
              editable={!busy}
            />
            <TextField
              label="内容（任意）"
              accessibilityLabel={translateText("内容（任意）", language)}
              value={note}
              onChangeText={setNote}
              placeholder={"何をオカズにゴミ汁廃棄したのかしら？w\n私にいつでも提出できるように具体的に書きなさい。"}
              multiline
              maxLength={DISPOSAL_MAX_NOTE_LENGTH}
              editable={!busy}
            />
            {formError ? <AppText accessibilityRole="alert" style={styles.error}>{formError}</AppText> : null}
            <View style={styles.actions}>
              <View style={styles.action}><PrimaryButton title="キャンセル" tone="secondary" disabled={busy} onPress={closeForm} /></View>
              <View style={styles.action}><PrimaryButton title={editing ? "変更する" : "追加する"} tone="tribute" disabled={busy} onPress={() => void save()} /></View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <ConfirmModal
        visible={pendingDelete !== null}
        title="記録を削除しますか？"
        message={`${pendingDelete ? `${dateLabel(pendingDelete.recordDate)}\n${translateText(`${pendingDelete.count}回`, language)}\n\n` : ""}${translateText("削除した記録は元に戻せません。", language)}`}
        confirmLabel="削除する"
        confirmTone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void remove()}
      />
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
  dayCell: { width: `${100 / 7}%`, height: 56, paddingHorizontal: 2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d7d7d7", backgroundColor: "#fff" },
  dayText: { color: "#111", fontWeight: "800" },
  dayCount: { color: "#555", fontSize: 12, lineHeight: 18, textAlign: "center", width: "100%" },
  selectedDay: { borderColor: "#fff", backgroundColor: lightTheme.danger },
  selectedDayText: { color: "#fff" },
  futureDay: { opacity: 0.25 },
  saturdayText: { color: "#1667c7" },
  holidayText: { color: "#d92332" },
  calendarHelp: { color: "#555" },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  totalCount: { color: "#ff3b45", fontSize: 22, lineHeight: 30, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minWidth: 0 },
  formRoot: { flex: 1, backgroundColor: lightTheme.background },
  formContent: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 20, gap: 18 },
  error: { color: "#ff3b45" },
});
