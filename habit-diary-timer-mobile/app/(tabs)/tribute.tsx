import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { roomMessages } from "@/constants/messages";
import { lightTheme } from "@/constants/theme";
import {
  tributeRepository,
  type TributeIncomeRecord,
  type TributeRecord,
} from "@/repositories/tributeRepository";
import { useAppModal } from "@/components/AppModalProvider";
import { formatDateJa, toDateKey } from "@/utils/date";

function formatYen(value: number) {
  return `${Math.max(0, Math.floor(value)).toLocaleString("ja-JP")}円`;
}

function formatMinusYen(value: number) {
  return `-${formatYen(value)}♡`;
}

function parseAmount(value: string) {
  const normalized = value.replace(/[,\s円]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.floor(amount) : 0;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${Number(year)}年${Number(monthNumber)}月`;
}

function shiftMonth(month: string, diff: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + diff, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const tributeComments = [
  "ニ乃様にお貢ぎ♡",
  "他の女にお貢ぎ♡",
  "その他（雑費）♡",
] as const;

export default function TributeScreen() {
  const { showNotice } = useAppModal();
  const [selectedMonth, setSelectedMonth] = useState(toDateKey().slice(0, 7));
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [incomeInput, setIncomeInput] = useState("");
  const [recordDate, setRecordDate] = useState(toDateKey());
  const [amountInput, setAmountInput] = useState("");
  const [comment, setComment] = useState<string>(tributeComments[0]);
  const [commentOpen, setCommentOpen] = useState(false);
  const [incomeDate, setIncomeDate] = useState(toDateKey());
  const [incomeAddInput, setIncomeAddInput] = useState("");
  const [incomeComment, setIncomeComment] = useState("");
  const [records, setRecords] = useState<TributeRecord[]>([]);
  const [incomeRecords, setIncomeRecords] = useState<TributeIncomeRecord[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<TributeRecord | null>(null);
  const [deleteIncomeTarget, setDeleteIncomeTarget] =
    useState<TributeIncomeRecord | null>(null);

  const total = useMemo(
    () => records.reduce((sum, record) => sum + record.amount, 0),
    [records],
  );
  const additionalIncome = useMemo(
    () => incomeRecords.reduce((sum, record) => sum + record.amount, 0),
    [incomeRecords],
  );
  const incomeTotal = monthlyIncome + additionalIncome;
  const remaining = incomeTotal - total;

  const load = useCallback(() => {
    const income = tributeRepository.monthlyIncome(selectedMonth);
    setMonthlyIncome(income);
    setIncomeInput(income ? String(income) : "");
    setRecords(tributeRepository.list(selectedMonth));
    setIncomeRecords(tributeRepository.incomeList(selectedMonth));
  }, [selectedMonth]);

  useFocusEffect(load);

  function changeMonth(diff: number) {
    const nextMonth = shiftMonth(selectedMonth, diff);
    setSelectedMonth(nextMonth);
    setRecordDate(`${nextMonth}-01`);
    setIncomeDate(`${nextMonth}-01`);
  }

  function saveIncome() {
    const amount = parseAmount(incomeInput);
    if (amount <= 0) {
      showNotice("入力エラー", "今月の収入を1円以上で入力してください。");
      return;
    }
    tributeRepository.saveMonthlyIncome(amount, selectedMonth);
    load();
    showNotice("保存しました", `${monthLabel(selectedMonth)}の基本収入を保存しました。`);
  }

  function addIncome() {
    const amount = parseAmount(incomeAddInput);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incomeDate)) {
      showNotice("入力エラー", "日付はYYYY-MM-DD形式で入力してください。");
      return;
    }
    if (!incomeDate.startsWith(selectedMonth)) {
      showNotice("入力エラー", `日付は${monthLabel(selectedMonth)}内で入力してください。`);
      return;
    }
    if (amount <= 0) {
      showNotice("入力エラー", "追加収入を1円以上で入力してください。");
      return;
    }
    tributeRepository.addIncome({
      recordDate: incomeDate,
      amount,
      comment: incomeComment,
    });
    setIncomeAddInput("");
    setIncomeComment("");
    load();
    showNotice("保存しました", "追加収入を保存しました。");
  }

  function addRecord() {
    const amount = parseAmount(amountInput);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
      showNotice("入力エラー", "日付はYYYY-MM-DD形式で入力してください。");
      return;
    }
    if (!recordDate.startsWith(selectedMonth)) {
      showNotice("入力エラー", `日付は${monthLabel(selectedMonth)}内で入力してください。`);
      return;
    }
    if (amount <= 0) {
      showNotice("入力エラー", "お貢ぎ金額を1円以上で入力してください。");
      return;
    }
    tributeRepository.add({
      recordDate,
      amount,
      comment,
    });
    setAmountInput("");
    setComment(tributeComments[0]);
    setCommentOpen(false);
    load();
    showNotice("保存しました", "お貢ぎ履歴を保存しました。");
  }

  function removeRecord() {
    if (!deleteTarget) return;
    tributeRepository.remove(deleteTarget.id);
    setDeleteTarget(null);
    load();
    showNotice("削除しました", "選択したお貢ぎ履歴を削除しました。");
  }

  function removeIncomeRecord() {
    if (!deleteIncomeTarget) return;
    tributeRepository.removeIncome(deleteIncomeTarget.id);
    setDeleteIncomeTarget(null);
    load();
    showNotice("削除しました", "選択した追加収入を削除しました。");
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText style={styles.kicker}>TRIBUTE</AppText>
        <AppText variant="title">お貢ぎ履歴</AppText>
        <View style={styles.rule} />
      </View>
      <Card style={styles.summary}>
        <View style={styles.monthHeader}>
          <PrimaryButton title="前月" tone="secondary" onPress={() => changeMonth(-1)} />
          <View style={styles.monthTitleWrap}>
            <AppText variant="label">対象月</AppText>
            <AppText variant="subtitle">{monthLabel(selectedMonth)}</AppText>
          </View>
          <PrimaryButton title="翌月" tone="secondary" onPress={() => changeMonth(1)} />
        </View>
        <View style={styles.summaryTotalTop}>
          <AppText style={styles.remainingLabel}>集計金額（残りお貢ぎ可能額）</AppText>
          <AppText
            style={[
              styles.remaining,
              remaining < 0 && styles.remainingOver,
            ]}
          >
            {remaining < 0 ? `-${formatYen(Math.abs(remaining))}` : formatYen(remaining)}
          </AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText>基本収入</AppText>
          <AppText style={styles.summaryValue}>{formatYen(monthlyIncome)}</AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText>追加収入</AppText>
          <AppText style={styles.incomeSummaryValue}>+{formatYen(additionalIncome)}</AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText>お貢ぎ済み</AppText>
          <AppText style={styles.spendingSummaryValue}>{formatMinusYen(total)}</AppText>
        </View>
      </Card>
      <RoomConversation
        characterSource={require("../../assets/characters/settings-nino.png")}
        roomName="お貢ぎ履歴"
        lines={roomMessages.tribute.lines}
        contractLines={roomMessages.tribute.contractLines}
      />

      <Card>
        <AppText variant="subtitle">{monthLabel(selectedMonth)}の収入入力・変更</AppText>
        <TextField
          label="今月の基本収入"
          value={incomeInput}
          onChangeText={setIncomeInput}
          keyboardType="number-pad"
          placeholder="例：250000"
        />
        <PrimaryButton title="収入を保存" onPress={saveIncome} />
      </Card>

      <Card>
        <AppText variant="subtitle">追加収入を登録</AppText>
        <AppText variant="muted">借金や臨時収入など、今月使える金額を追加できます。</AppText>
        <TextField
          label="日付"
          value={incomeDate}
          onChangeText={setIncomeDate}
          placeholder="YYYY-MM-DD"
        />
        <TextField
          label="追加収入"
          value={incomeAddInput}
          onChangeText={setIncomeAddInput}
          keyboardType="number-pad"
          placeholder="例：10000"
        />
        <TextField
          label="コメント"
          value={incomeComment}
          onChangeText={setIncomeComment}
          placeholder="例：借金♡"
        />
        <PrimaryButton title="追加収入を登録" onPress={addIncome} />
      </Card>

      <Card>
        <AppText variant="subtitle">お貢ぎを登録</AppText>
        <TextField
          label="日付"
          value={recordDate}
          onChangeText={setRecordDate}
          placeholder="YYYY-MM-DD"
        />
        <TextField
          label="金額"
          value={amountInput}
          onChangeText={setAmountInput}
          keyboardType="number-pad"
          placeholder="例：5000"
        />
        <View style={styles.dropdownWrap}>
          <AppText variant="label">コメント</AppText>
          <Pressable
            style={styles.dropdown}
            onPress={() => setCommentOpen((current) => !current)}
          >
            <AppText style={styles.dropdownText}>{comment}</AppText>
            <AppText style={styles.dropdownArrow}>{commentOpen ? "▲" : "▼"}</AppText>
          </Pressable>
          {commentOpen ? (
            <View style={styles.dropdownList}>
              {tributeComments.map((item) => (
                <Pressable
                  key={item}
                  style={[
                    styles.dropdownItem,
                    item === comment && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    setComment(item);
                    setCommentOpen(false);
                  }}
                >
                  <AppText
                    style={[
                      styles.dropdownItemText,
                      item === comment && styles.dropdownItemTextActive,
                    ]}
                  >
                    {item}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        <PrimaryButton title="お貢ぎを登録" onPress={addRecord} />
      </Card>

      <Card>
        <AppText variant="subtitle">{monthLabel(selectedMonth)}のお貢ぎ履歴</AppText>
        {records.length === 0 ? (
          <AppText variant="muted">今月のお貢ぎ履歴はまだありません。</AppText>
        ) : (
          records.map((record) => (
            <View key={record.id} style={styles.recordRow}>
              <View style={styles.recordContent}>
                <AppText style={styles.recordDate}>
                  {formatDateJa(record.record_date)}
                </AppText>
                <AppText style={styles.recordAmount}>
                  {formatMinusYen(record.amount)}
                </AppText>
                {record.comment ? (
                  <AppText variant="muted">{record.comment}</AppText>
                ) : null}
              </View>
              <Pressable
                style={styles.deleteButton}
                onPress={() => setDeleteTarget(record)}
              >
                <AppText style={styles.deleteText}>削除</AppText>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <Card>
        <AppText variant="subtitle">{monthLabel(selectedMonth)}の追加収入履歴</AppText>
        {incomeRecords.length === 0 ? (
          <AppText variant="muted">今月の追加収入はまだありません。</AppText>
        ) : (
          incomeRecords.map((record) => (
            <View key={record.id} style={styles.recordRow}>
              <View style={styles.recordContent}>
                <AppText style={styles.recordDate}>
                  {formatDateJa(record.record_date)}
                </AppText>
                <AppText style={styles.incomeAmount}>
                  +{formatYen(record.amount)}
                </AppText>
                {record.comment ? (
                  <AppText variant="muted">{record.comment}</AppText>
                ) : null}
              </View>
              <Pressable
                style={styles.deleteButton}
                onPress={() => setDeleteIncomeTarget(record)}
              >
                <AppText style={styles.deleteText}>削除</AppText>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <Card style={styles.summary}>
        <AppText variant="subtitle">{monthLabel(selectedMonth)}の内訳</AppText>
        <View style={styles.summaryRow}>
          <AppText>基本収入</AppText>
          <AppText style={styles.summaryValue}>{formatYen(monthlyIncome)}</AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText>追加収入</AppText>
          <AppText style={styles.incomeSummaryValue}>+{formatYen(additionalIncome)}</AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText>今月使える金額</AppText>
          <AppText style={styles.summaryValue}>{formatYen(incomeTotal)}</AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText>お貢ぎ済み</AppText>
          <AppText style={styles.spendingSummaryValue}>{formatMinusYen(total)}</AppText>
        </View>
        <View style={styles.summaryTotal}>
          <AppText style={styles.remainingLabel}>残りお貢ぎ可能額</AppText>
          <AppText
            style={[
              styles.remaining,
              remaining < 0 && styles.remainingOver,
            ]}
          >
            {remaining < 0 ? `-${formatYen(Math.abs(remaining))}` : formatYen(remaining)}
          </AppText>
        </View>
      </Card>

      <PrimaryButton
        title="記録・管理メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
      <ConfirmModal
        visible={deleteTarget !== null}
        title="お貢ぎ履歴を削除しますか？"
        message={
          deleteTarget
            ? `${formatDateJa(deleteTarget.record_date)}\n${formatYen(deleteTarget.amount)}\n\nこの履歴を削除します。`
            : ""
        }
        confirmLabel="削除を実行"
        confirmTone="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={removeRecord}
      />
      <ConfirmModal
        visible={deleteIncomeTarget !== null}
        title="追加収入を削除しますか？"
        message={
          deleteIncomeTarget
            ? `${formatDateJa(deleteIncomeTarget.record_date)}\n+${formatYen(deleteIncomeTarget.amount)}\n\nこの追加収入を削除します。`
            : ""
        }
        confirmLabel="削除を実行"
        confirmTone="danger"
        onCancel={() => setDeleteIncomeTarget(null)}
        onConfirm={removeIncomeRecord}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 12 },
  kicker: {
    color: "#f2c94c",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
  },
  rule: { height: 1, backgroundColor: "#fff" },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  monthTitleWrap: { flex: 1, alignItems: "center", gap: 2 },
  summaryTotalTop: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#f2c94c",
    paddingTop: 14,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingVertical: 12,
  },
  recordContent: { flex: 1, gap: 4 },
  recordDate: { color: lightTheme.text, fontWeight: "900" },
  recordAmount: {
    color: lightTheme.danger,
    fontSize: 24,
    fontWeight: "900",
  },
  incomeAmount: {
    color: "#7cb342",
    fontSize: 24,
    fontWeight: "900",
  },
  dropdownWrap: { gap: 6 },
  dropdown: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderColor: lightTheme.border,
    borderRadius: 4,
    paddingHorizontal: 12,
    backgroundColor: "#080808",
  },
  dropdownText: { fontWeight: "900" },
  dropdownArrow: { color: "#f2c94c", fontWeight: "900" },
  dropdownList: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#f2c94c",
    borderRadius: 4,
    backgroundColor: "#080808",
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  dropdownItemActive: { backgroundColor: "#f2c94c" },
  dropdownItemText: { color: lightTheme.text, fontWeight: "900" },
  dropdownItemTextActive: { color: "#111" },
  deleteButton: {
    borderWidth: 1,
    borderColor: lightTheme.danger,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteText: { color: lightTheme.danger, fontWeight: "900" },
  summary: { borderColor: "#f2c94c" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingVertical: 10,
  },
  summaryValue: { fontWeight: "900" },
  incomeSummaryValue: { color: "#7cb342", fontWeight: "900" },
  spendingSummaryValue: { color: lightTheme.danger, fontWeight: "900" },
  summaryTotal: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#f2c94c",
    paddingTop: 14,
  },
  remainingLabel: { color: "#f2c94c", fontWeight: "900" },
  remaining: {
    color: "#f2c94c",
    fontSize: 34,
    fontWeight: "900",
  },
  remainingOver: { color: lightTheme.danger },
});
