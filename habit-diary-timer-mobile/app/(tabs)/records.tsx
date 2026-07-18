import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { lightTheme } from "@/constants/theme";
import { journalRepository } from "@/repositories/journalRepository";
import { journalFormSchema, type JournalFormValues } from "@/schemas/forms";
import type { Journal } from "@/types/models";
import { formatDateJa, parseTags, toDateKey } from "@/utils/date";

export default function RecordsScreen() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [keyword, setKeyword] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Journal | null>(null);
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
    setJournals(journalRepository.list(keyword));
  }, [keyword]);

  useEffect(load, [load]);

  const markedDates = useMemo(() => {
    const set = new Set(journals.slice(0, 60).map((journal) => journal.record_date.slice(5)));
    return Array.from(set).slice(0, 12);
  }, [journals]);

  function openCreate() {
    setEditing(null);
    form.reset({
      title: "",
      body: "",
      rating: 3,
      recordType: "diary",
      isFavorite: false,
      tags: "",
      recordDate: toDateKey(),
    });
    setFormVisible(true);
  }

  function openEdit(journal: Journal) {
    setEditing(journal);
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
      journalRepository.update(editing.id, values);
    } else {
      journalRepository.create(values);
    }
    setFormVisible(false);
    load();
  }

  function remove(journal: Journal) {
    Alert.alert("削除確認", `${journal.title}を削除しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          journalRepository.remove(journal.id);
          load();
        },
      },
    ]);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">調教日記部屋</AppText>
        <PrimaryButton title="登録" onPress={openCreate} />
      </View>

      <RoomConversation characterSource={require("../../assets/characters/diary-nino.png")} roomName="調教日記部屋" lines={[{ text: "今日あったことを、ここに残して。" }, { text: "気持ちも評価も、正直に書けばいいわ。", event: "DIARY TIME" }, { text: "過去の記録は、いつでも読み返せるわよ。" }]} />

      <TextField label="検索" value={keyword} onChangeText={setKeyword} placeholder="タイトル・本文・タグ" />

      <Card>
        <AppText variant="subtitle">記録カレンダー</AppText>
        <View style={styles.markGrid}>
          {markedDates.length ? markedDates.map((date) => (
            <View key={date} style={styles.mark}>
              <AppText variant="label">{date}</AppText>
            </View>
          )) : <AppText variant="muted">記録日はまだありません。</AppText>}
        </View>
      </Card>

      {journals.length === 0 ? (
        <Card><AppText variant="muted">記録はまだありません。</AppText></Card>
      ) : null}

      {journals.map((journal, index) => (
        <View key={journal.id} style={styles.dateGroup}>
          {index === 0 || journals[index - 1].record_date !== journal.record_date ? <AppText style={styles.dateHeading}>{formatDateJa(journal.record_date)}</AppText> : null}
        <Card>
          <View style={styles.journalHeader}>
            <View style={styles.grow}>
              <AppText variant="subtitle">{journal.title}</AppText>
              <AppText variant="muted">{formatDateJa(journal.record_date)} / 評価 {journal.rating ?? "-"}</AppText>
            </View>
            <AppText style={styles.typeBadge}>{journal.record_type}</AppText>
          </View>
          <AppText numberOfLines={4}>{journal.body}</AppText>
          <View style={styles.tagRow}>
            {parseTags(journal.tags ?? "").map((tag) => (
              <AppText key={tag} style={styles.tag}>#{tag}</AppText>
            ))}
          </View>
          <View style={styles.actions}>
            <PrimaryButton title="編集" tone="secondary" onPress={() => openEdit(journal)} />
            <PrimaryButton title="削除" tone="danger" onPress={() => remove(journal)} />
          </View>
        </Card>
        </View>
      ))}

      <PrimaryButton title="ホームへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)")} />

      <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet">
        <Screen>
          <AppText variant="title">{editing ? "記録編集" : "記録登録"}</AppText>
          <Controller
            control={form.control}
            name="recordDate"
            render={({ field, fieldState }) => (
              <TextField label="日付" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
            )}
          />
          <Controller
            control={form.control}
            name="title"
            render={({ field, fieldState }) => (
              <TextField label="タイトル" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
            )}
          />
          <Controller
            control={form.control}
            name="body"
            render={({ field, fieldState }) => (
              <TextField label="本文" value={field.value} onChangeText={field.onChange} multiline error={fieldState.error?.message} />
            )}
          />
          <Controller
            control={form.control}
            name="rating"
            render={({ field }) => (
              <TextField label="評価 1-5" value={String(field.value ?? 3)} onChangeText={field.onChange} keyboardType="number-pad" />
            )}
          />
          <Controller
            control={form.control}
            name="tags"
            render={({ field }) => (
              <TextField label="タグ" value={field.value} onChangeText={field.onChange} placeholder="仕事, 体調, 学び" />
            )}
          />
          <View style={styles.actions}>
            <PrimaryButton title="キャンセル" tone="secondary" onPress={() => setFormVisible(false)} />
            <PrimaryButton title="保存" onPress={form.handleSubmit(save)} />
          </View>
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  markGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mark: {
    borderWidth: 1,
    borderColor: lightTheme.primary,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
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
  dateGroup: { gap: 8 },
  dateHeading: { borderBottomWidth: 1, borderBottomColor: "#fff", paddingBottom: 6, fontSize: 18, fontWeight: "900" },
});
