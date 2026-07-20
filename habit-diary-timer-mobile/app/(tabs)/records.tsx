import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RoomConversation } from "@/components/RoomConversation";
import {
  defeatChecklistMessages,
  preparationChecklistMessages,
  roomMessages,
} from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { lightTheme } from "@/constants/theme";
import { journalRepository } from "@/repositories/journalRepository";
import { journalFormSchema, type JournalFormValues } from "@/schemas/forms";
import type { Journal } from "@/types/models";
import { formatDateJa, parseTags, toDateKey } from "@/utils/date";
import { isJapaneseHoliday } from "@/utils/japaneseHoliday";
import { dailyOrderService } from "@/services/gameRoomService";
import {
  defeatRepository,
  managementRepository,
  preparationRepository,
} from "@/repositories/roomRepository";

export default function RecordsScreen() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedDate, setSelectedDate] = useState(toDateKey());
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Journal | null>(null);
  const [additionalChecklistItem, setAdditionalChecklistItem] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Journal | null>(null);
  const [pendingDateDelete, setPendingDateDelete] = useState(false);
  const form = useForm<JournalFormValues>({
    resolver: zodResolver(journalFormSchema) as never,
    defaultValues: {
      title: "",
      body: "",
      rating: 3,
      recordType: "diary",
      isFavorite: false,
      tags: "",
      recordDate: toDateKey(),
    },
  });

  const load = useCallback(() => {
    managementRepository.syncCompletedJournals();
    dailyOrderService
      .syncCompletedJournals()
      .finally(() => setJournals(journalRepository.list(keyword)));
  }, [keyword]);

  useEffect(load, [load]);

  const markedDates = useMemo(
    () => new Set(journals.map((journal) => journal.record_date)),
    [journals],
  );
  const displayedJournals = useMemo(
    () => journals
      .filter((journal) => journal.record_date === selectedDate)
      .sort((left, right) => {
        const priority = (journal: Journal) => {
          if (journal.tags?.includes("敗北部屋")) return 0;
          if (journal.tags?.includes("準備部屋")) return 1;
          if (journal.tags?.includes("本日の命令")) return 2;
          if (journal.tags?.includes("射精管理")) return 3;
          if (journal.tags?.includes("調教") || journal.tags?.includes("射精記録")) return 4;
          if (journal.tags?.includes("お仕置き")) return 5;
          return 6;
        };
        return priority(left) - priority(right)
          || left.record_time.localeCompare(right.record_time)
          || left.id - right.id;
      }),
    [journals, selectedDate],
  );
  const calendarDays = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const leading = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: count }, (_, index) =>
        toDateKey(new Date(year, month, index + 1)),
      ),
    ];
  }, [visibleMonth]);

  function openCreate() {
    setEditing(null);
    setAdditionalChecklistItem("");
    form.reset({
      title: "",
      body: "",
      rating: 3,
      recordType: "diary",
      isFavorite: false,
      tags: "",
      recordDate: selectedDate,
    });
    setFormVisible(true);
  }

  function openEdit(journal: Journal) {
    setEditing(journal);
    setAdditionalChecklistItem("");
    form.reset({
      title: journal.title,
      body: journal.body,
      rating: journal.rating ?? 3,
      recordType: journal.record_type,
      isFavorite: Boolean(journal.is_favorite),
      tags: journal.tags ?? "",
      recordDate: journal.record_date,
    });
    setFormVisible(true);
  }

  function save(values: JournalFormValues) {
    if (editing) {
      if (isProtectedChecklist(editing)) {
        const existingChecks = checklistItemsInBody(editing.body);
        const additions = additionalChecklistItem
          .split("\n")
          .map((item) => item.trim().replace(/^✅\s*/, ""))
          .filter(Boolean);
        const checks = Array.from(new Set([...existingChecks, ...additions]));
        if (editing.tags?.includes("敗北部屋")) {
          defeatRepository.save(checks, editing.record_date);
        } else {
          preparationRepository.save(checks, editing.record_date);
        }
      } else {
        journalRepository.update(editing.id, values);
      }
    } else {
      journalRepository.create(values);
    }
    setFormVisible(false);
    load();
  }

  function remove(journal: Journal) {
    setPendingDelete(journal);
  }

  function isProtectedChecklist(journal: Journal | null) {
    return Boolean(
      journal?.tags?.includes("敗北部屋") || journal?.tags?.includes("準備部屋"),
    );
  }

  function isImmutableRecord(journal: Journal | null) {
    return Boolean(
      journal?.tags?.includes("本日の命令") || journal?.tags?.includes("射精管理"),
    );
  }

  function journalCardStyle(journal: Journal) {
    const tags = journal.tags ?? "";
    if (tags.includes("敗北部屋")) return styles.defeatRecordCard;
    if (tags.includes("準備部屋")) return styles.preparationRecordCard;
    if (tags.includes("本日の命令")) return styles.orderRecordCard;
    if (tags.includes("射精管理")) return styles.managementRecordCard;
    if (tags.includes("お仕置き")) return styles.punishmentRecordCard;
    if (tags.includes("調教") || tags.includes("射精記録")) {
      return styles.trainingRecordCard;
    }
    return undefined;
  }

  function checklistItemsInBody(body: string) {
    return body
      .split("\n")
      .filter((line) => line.startsWith("✅ "))
      .map((line) => line.slice(2).trim());
  }

  function checklistOptions(journal: Journal | null) {
    if (journal?.tags?.includes("敗北部屋")) return [...defeatChecklistMessages];
    if (journal?.tags?.includes("準備部屋")) {
      return preparationChecklistMessages.map((item) => item.text);
    }
    return [];
  }

  const registeredChecklistItems = editing
    ? checklistItemsInBody(editing.body)
    : [];
  const availableChecklistItems = checklistOptions(editing).filter(
    (item) => !registeredChecklistItems.includes(item),
  );
  const selectedChecklistItems = additionalChecklistItem
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  function toggleAdditionalChecklistItem(item: string) {
    const next = selectedChecklistItems.includes(item)
      ? selectedChecklistItems.filter((selected) => selected !== item)
      : [...selectedChecklistItems, item];
    setAdditionalChecklistItem(next.join("\n"));
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">調教日記部屋</AppText>
        <PrimaryButton title="登録" onPress={openCreate} />
      </View>

      <RoomConversation
        characterSource={require("../../assets/characters/diary-nino.png")}
        roomName="調教日記部屋"
        lines={roomMessages.records.lines}
        contractLines={roomMessages.records.contractLines}
      />

      <TextField
        label="検索"
        value={keyword}
        onChangeText={setKeyword}
        placeholder="タイトル・本文・タグ"
      />

      <Card style={styles.calendarCard}>
        <AppText variant="subtitle" style={styles.calendarTitle}>記録カレンダー</AppText>
        <View style={styles.monthHeader}>
          <PrimaryButton
            title="‹"
            tone="secondary"
            onPress={() =>
              setVisibleMonth(
                (month) =>
                  new Date(month.getFullYear(), month.getMonth() - 1, 1),
              )
            }
          />
          <AppText style={[styles.monthTitle, styles.calendarText]}>
            {visibleMonth.getFullYear()}年{visibleMonth.getMonth() + 1}月
          </AppText>
          <PrimaryButton
            title="›"
            tone="secondary"
            disabled={
              visibleMonth.getFullYear() === new Date().getFullYear() &&
              visibleMonth.getMonth() === new Date().getMonth()
            }
            onPress={() =>
              setVisibleMonth(
                (month) =>
                  new Date(month.getFullYear(), month.getMonth() + 1, 1),
              )
            }
          />
        </View>
        <View style={styles.weekRow}>
          {["日", "月", "火", "水", "木", "金", "土"].map((day, index) => (
            <AppText key={day} style={[styles.weekDay, index === 0 && styles.holidayText, index === 6 && styles.saturdayText]}>
              {day}
            </AppText>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {calendarDays.map((date, index) => {
            if (!date)
              return <View key={`blank-${index}`} style={styles.dayCell} />;
            const future = date > toDateKey();
            const selected = date === selectedDate;
            const marked = markedDates.has(date);
            const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
            const holiday = isJapaneseHoliday(date);
            return (
              <Pressable
                key={date}
                disabled={future}
                onPress={() => setSelectedDate(date)}
                style={[
                  styles.dayCell,
                  selected && styles.selectedDay,
                  future && styles.futureDay,
                ]}
              >
                <AppText
                  style={[
                    styles.dayText,
                    dayOfWeek === 6 && styles.saturdayText,
                    (dayOfWeek === 0 || holiday) && styles.holidayText,
                    selected && styles.selectedDayText,
                  ]}
                >
                  {Number(date.slice(-2))}
                </AppText>
                {marked ? (
                  <View
                    style={[
                      styles.recordDot,
                      selected && styles.selectedRecordDot,
                    ]}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <AppText style={styles.calendarHelp}>
          選択中：{formatDateJa(selectedDate)}{"\n"}
          ●は記録のある日です。
        </AppText>
      </Card>

      <View style={styles.dateHeadingRow}>
        <AppText style={styles.dateHeading}>{formatDateJa(selectedDate)}</AppText>
        <PrimaryButton
          title="この日を削除"
          tone="danger"
          onPress={() => setPendingDateDelete(true)}
        />
      </View>

      {displayedJournals.length === 0 ? (
        <Card>
          <AppText variant="muted">選択した日の記録はありません。</AppText>
        </Card>
      ) : null}

      {displayedJournals.map((journal) => (
        <View key={journal.id} style={styles.dateGroup}>
          <Card style={journalCardStyle(journal)}>
            <View style={styles.journalHeader}>
              <View style={styles.grow}>
                <AppText variant="subtitle">{journal.title}</AppText>
                <AppText variant="muted">
                  {formatDateJa(journal.record_date)} / 評価{" "}
                  {journal.rating ?? "-"}
                </AppText>
              </View>
              <AppText style={styles.typeBadge}>{journal.record_type}</AppText>
            </View>
            <AppText
              numberOfLines={
                isProtectedChecklist(journal) || isImmutableRecord(journal) ? undefined : 4
              }
            >
              {journal.body}
            </AppText>
            <View style={styles.tagRow}>
              {parseTags(journal.tags ?? "").map((tag) => (
                <AppText key={tag} style={styles.tag}>
                  #{tag}
                </AppText>
              ))}
            </View>
            <View style={styles.actions}>
              {!isImmutableRecord(journal) ? (
                <PrimaryButton
                  title="編集"
                  tone="secondary"
                  onPress={() => openEdit(journal)}
                />
              ) : (
                <AppText variant="muted">内容固定・削除不可</AppText>
              )}
              {!isProtectedChecklist(journal) && !isImmutableRecord(journal) ? (
                <PrimaryButton
                  title="削除"
                  tone="danger"
                  onPress={() => remove(journal)}
                />
              ) : null}
            </View>
          </Card>
        </View>
      ))}

      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />

      <Modal
        visible={formVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <Screen>
          <AppText variant="title">{editing ? "記録編集" : "記録登録"}</AppText>
          <Controller
            control={form.control}
            name="recordDate"
            render={({ field, fieldState }) => (
              <TextField
                label="日付"
                value={field.value}
                onChangeText={field.onChange}
                editable={!isProtectedChecklist(editing)}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="title"
            render={({ field, fieldState }) => (
              <TextField
                label="タイトル"
                value={field.value}
                onChangeText={field.onChange}
                editable={!isProtectedChecklist(editing)}
                error={fieldState.error?.message}
              />
            )}
          />
          {isProtectedChecklist(editing) ? (
            <Card>
              <AppText variant="label">登録済みの✅項目（変更・削除不可）</AppText>
              <AppText>{editing?.body}</AppText>
              <AppText variant="label">追加できる✅項目</AppText>
              {availableChecklistItems.length === 0 ? (
                <AppText variant="muted">
                  画面上のすべての項目がチェック済みです。
                </AppText>
              ) : (
                availableChecklistItems.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => toggleAdditionalChecklistItem(item)}
                    style={styles.checklistChoice}
                  >
                    <AppText style={styles.checklistChoiceMark}>
                      {selectedChecklistItems.includes(item) ? "✅" : "□"}
                    </AppText>
                    <AppText style={styles.grow}>{item}</AppText>
                  </Pressable>
                ))
              )}
            </Card>
          ) : (
            <Controller
              control={form.control}
              name="body"
              render={({ field, fieldState }) => (
                <TextField
                  label="本文"
                  value={field.value}
                  onChangeText={field.onChange}
                  multiline
                  error={fieldState.error?.message}
                />
              )}
            />
          )}
          {!isProtectedChecklist(editing) ? (
            <>
              <Controller
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <TextField
                    label="評価 1-5"
                    value={String(field.value ?? 3)}
                    onChangeText={field.onChange}
                    keyboardType="number-pad"
                  />
                )}
              />
              <Controller
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <TextField
                    label="タグ"
                    value={field.value}
                    onChangeText={field.onChange}
                    placeholder="仕事, 体調, 学び"
                  />
                )}
              />
            </>
          ) : null}
          <View style={styles.actions}>
            <PrimaryButton
              title="キャンセル"
              tone="secondary"
              onPress={() => setFormVisible(false)}
            />
            <PrimaryButton
              title="保存"
              disabled={
                isProtectedChecklist(editing) &&
                selectedChecklistItems.length === 0
              }
              onPress={form.handleSubmit(save)}
            />
          </View>
        </Screen>
      </Modal>
      <ConfirmModal
        visible={pendingDateDelete}
        title="この日のデータをすべて削除しますか？"
        message={`${formatDateJa(selectedDate)}\n\n準備・調教・お仕置きなどを削除します。\n敗北部屋、本日の命令、射精管理の固定記録は削除されません。\n\nこの操作は元に戻せません。`}
        confirmLabel="すべて削除"
        confirmTone="danger"
        onCancel={() => setPendingDateDelete(false)}
        onConfirm={async () => {
          setPendingDateDelete(false);
          journalRepository.removeDate(selectedDate);
          load();
        }}
      />
      <ConfirmModal
        visible={pendingDelete !== null}
        title="記録を削除しますか？"
        message={`${pendingDelete?.title ?? ""}\n\n削除した記録は元に戻せません。`}
        confirmLabel="削除する"
        confirmTone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const journal = pendingDelete;
          setPendingDelete(null);
          if (!journal) return;
          journalRepository.remove(journal.id);
          load();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  monthTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "900" },
  calendarCard: { backgroundColor: "#fff", borderColor: "#fff" },
  calendarTitle: { color: "#111" },
  calendarText: { color: "#111" },
  weekRow: { flexDirection: "row" },
  weekDay: {
    width: `${100 / 7}%`,
    color: "#111",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d7d7d7",
    backgroundColor: "#fff",
  },
  selectedDay: { borderColor: "#fff", backgroundColor: lightTheme.danger },
  futureDay: { opacity: 0.25 },
  dayText: { color: "#111", fontWeight: "800" },
  saturdayText: { color: "#1667c7" },
  holidayText: { color: "#d92332" },
  selectedDayText: { color: "#fff" },
  calendarHelp: { color: "#555" },
  recordDot: {
    position: "absolute",
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: lightTheme.danger,
  },
  selectedRecordDot: { backgroundColor: "#fff" },
  journalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  grow: {
    flex: 1,
  },
  typeBadge: {
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: lightTheme.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: lightTheme.primaryDark,
    fontWeight: "800",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    color: lightTheme.primaryDark,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  checklistChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#666",
    paddingVertical: 12,
  },
  checklistChoiceMark: { width: 30, fontSize: 20, lineHeight: 28 },
  dateGroup: { gap: 8 },
  defeatRecordCard: { borderWidth: 2, borderColor: "#ff69b4" },
  preparationRecordCard: { borderWidth: 2, borderColor: "#7cb342" },
  orderRecordCard: { borderWidth: 2, borderColor: "#29b6f6" },
  managementRecordCard: { borderWidth: 2, borderColor: "#ff9800" },
  trainingRecordCard: { borderWidth: 2, borderColor: "#b388ff" },
  punishmentRecordCard: { borderWidth: 2, borderColor: "#ff3b45" },
  dateHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateHeading: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#fff",
    paddingBottom: 6,
    fontSize: 18,
    fontWeight: "900",
  },
});
