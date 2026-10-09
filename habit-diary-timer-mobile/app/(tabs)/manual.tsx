import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { PageTitle } from "@/components/PageTitle";
import { LocalizedPressable as Pressable } from "@/components/LocalizedPressable";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { manualSections } from "@/features/manual/content";
import { searchManual } from "@/features/manual/search";
import { TextField } from "@/components/TextField";
import { translateText } from "@/i18n";

export default function ManualScreen() {
  const { playEffect, settings } = useAppAudio();
  const [keyword, setKeyword] = useState("");
  const [sectionId, setSectionId] = useState(manualSections[0].id);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const section = manualSections.find((item) => item.id === sectionId) ?? manualSections[0];
  const searching = keyword.trim().length > 0;
  const results = searching
    ? searchManual(manualSections, keyword, (text) => translateText(text, settings?.language ?? "ja"))
    : section.entries.map((entry) => ({ section, entry }));

  return (
    <Screen desktopLayout="single">
      <View style={styles.content}>
        <PageTitle>マニュアル</PageTitle>
        <AppText variant="muted">確認したい項目を選ぶと、使い方を表示します。</AppText>
        <TextField testID="manual-search" label="マニュアルを検索" value={keyword}
          onChangeText={(value) => { setKeyword(value); setExpandedId(null); }}
          placeholder="機能名・説明文をすべて検索" accessibilityLabel={translateText("マニュアルを検索", settings?.language ?? "ja")} />
        {searching ? <View style={styles.searchSummary}>
          <AppText accessibilityLiveRegion="polite">{`検索結果：${results.length}件`}</AppText>
          <PrimaryButton title="検索をクリア" tone="secondary" onPress={() => { setKeyword(""); setExpandedId(null); }} />
        </View> : null}

        {!searching ? <View style={styles.categories}>
          {manualSections.map((item) => (
            <Pressable
              key={item.id}
              testID={`manual-category-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              accessibilityState={{ selected: item.id === section.id }}
              aria-pressed={item.id === section.id}
              onPress={() => {
                playEffect("button");
                setSectionId(item.id);
                setExpandedId(null);
              }}
              style={({ pressed }) => [
                styles.category,
                item.id === section.id && styles.categorySelected,
                pressed && styles.pressed,
              ]}
            >
              <AppText style={[styles.categoryText, item.id === section.id && styles.categorySelectedText]}>
                {item.title}
              </AppText>
            </Pressable>
          ))}
        </View> : null}

        {!searching ? <AppText variant="subtitle" accessibilityRole="header">{section.title}</AppText> : null}
        {searching && results.length === 0 ? <AppText variant="muted">該当する説明がありません。別の言葉で検索してください。</AppText> : null}
        {results.map(({ section: entrySection, entry }) => {
          const expanded = expandedId === entry.id;
          return (
            <View key={entry.id} style={[styles.entry, expanded && styles.entryExpanded]}>
              <Pressable
                testID={`manual-entry-${entry.id}`}
                accessibilityRole="button"
                accessibilityLabel={entry.title}
                accessibilityHint={expanded ? "説明を閉じる" : "説明を開く"}
                accessibilityState={{ expanded }}
                aria-expanded={expanded}
                onPress={() => {
                  playEffect("button");
                  setExpandedId(expanded ? null : entry.id);
                }}
                style={({ pressed }) => [styles.entryHeading, pressed && styles.pressed]}
              >
                {searching ? <AppText variant="muted">{entrySection.title}</AppText> : null}
                <View style={styles.titleRow}>
                  <AppText variant="subtitle" style={styles.entryTitle}>{entry.title}</AppText>
                  <AppText localize={false} style={styles.indicator}>{expanded ? "−" : "+"}</AppText>
                </View>
                {entry.summary ? <AppText variant="muted">{entry.summary}</AppText> : null}
                {searching && !expanded ? <AppText variant="muted">{entry.details.find((detail) => searchManual([{ ...entrySection, entries: [{ ...entry, title: "", summary: "", details: [detail] }] }], keyword, (text) => translateText(text, settings?.language ?? "ja")).length > 0) ?? entry.details[0]}</AppText> : null}
              </Pressable>
              {expanded ? (
                <View style={styles.details} testID={`manual-details-${entry.id}`}>
                  {entry.details.map((detail, index) => (
                    <View key={index} style={styles.detailRow}>
                      <AppText localize={false}>・</AppText>
                      <AppText style={styles.detailText}>{detail}</AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}

        <PrimaryButton
          title="管理・設定メニューへ戻る"
          tone="secondary"
          onPress={() => router.replace("/(tabs)/menu?section=management")}
        />
        <PrimaryButton
          title="ホームへ戻る"
          tone="secondary"
          onPress={() => router.replace("/(tabs)")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: "100%", maxWidth: 900, alignSelf: "center", gap: 14 },
  searchSummary: { gap: 8 },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  category: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  categorySelected: { backgroundColor: "#1f5fae" },
  categoryText: { color: "#111", fontWeight: "800", textAlign: "center" },
  categorySelectedText: { color: "#fff" },
  entry: { borderWidth: 1, borderColor: "#777", borderRadius: 4, backgroundColor: "#080808", overflow: "hidden" },
  entryExpanded: { borderColor: "#7db7ff" },
  entryHeading: { padding: 14, gap: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  entryTitle: { flex: 1, minWidth: 0 },
  indicator: { color: "#7db7ff", fontSize: 24, lineHeight: 28, fontWeight: "800" },
  details: { padding: 14, gap: 12, borderTopWidth: 1, borderTopColor: "#555" },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  detailText: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.75 },
});
