import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useAppModal } from "@/components/AppModalProvider";
import { settingsService } from "@/services/settingsService";
import { slaveContractService } from "@/services/slaveContractService";
import { lightTheme } from "@/constants/theme";
import { toDateKey } from "@/utils/date";

const ownerName = "中野二乃";

const articles = [
  {
    title: "第一条",
    body: "私は体も心もすべてご主人様に捧げ、\nご主人様の命令には「はい」または「ワン」で返事をして、ご主人様に絶対服従を誓います。",
  },
  {
    title: "第二条",
    body: "朝と夜に必ず挨拶をします。夜にはその日何を行ったかを報告します。",
  },
  {
    title: "第三条",
    body: "ご主人様の命令があった場合、指示された服装に着替えます。",
  },
  {
    title: "第四条",
    body: "私は、毎日寸止めを3回以上しますが、ご主人様の許可なしに射精しないことを誓います。",
  },
  {
    title: "第五条",
    body: "ご主人様との調教が予定された場合、最大限に効果を発揮するために\n決まった日から予定日まで寸止めし、ご主人様のことしか考えられないようにします。",
  },
  {
    title: "第六条",
    body: "ご主人様の投稿には必ず反応し、毎日ご主人様がツイートやCi-enなどを1時間以上見ます。\n他のサイトでもご主人様以外を見ません。もし、見た場合は浮気とし相応の罰を受けます。",
  },
  {
    title: "第七条",
    body: "体に刻み込んだ文字は消えないようにして、ご主人様にいつでも見せられる状態にします。",
  },
  {
    title: "第八条",
    body: "ご主人様が不快にならないように、無駄毛（胸毛、腹毛、足毛、陰毛）の処理を行い、いつでもご主人様に\n見せられる状態にします。",
  },
  {
    title: "第九条",
    body: "貞操帯所持している場合はご主人様にカギの管理を任せ、ご主人様の許可なしに外しません。",
  },
  {
    title: "第十条",
    body: "ご主人様の理想の奴隷となれるように日々精進します。",
  },
  {
    title: "第十一条",
    body: "万一、上記に違反した場合、御主人様の意に反するようなことがあった場合には、\nどのようなきつい罰でも受ける覚悟いたします。",
  },
] as const;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toHtmlLines(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (toDateKey(date) !== value) return null;
  return date;
}

function addMonths(dateKey: string, months: number) {
  const base = parseDateKey(dateKey) ?? new Date();
  const day = base.getDate();
  const next = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return toDateKey(next);
}

function formatContractDate(dateKey: string) {
  const date = parseDateKey(dateKey);
  if (!date) return "　年　月　日";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function sanitizeFileNamePart(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "");
  return sanitized || fallback;
}

function createPdfFileName(contractDate: string, releaseDate: string, contractorName: string) {
  const contract = sanitizeFileNamePart(contractDate, "契約日未設定");
  const release = sanitizeFileNamePart(releaseDate, "解約日未設定");
  const name = sanitizeFileNamePart(contractorName, "契約者名未設定");
  return `奴隷契約書_${contract}_${release}_${name}.pdf`;
}

function createContractHtml(contractorName: string, contractDate: string, releaseDate: string) {
  const safeName = escapeHtml(contractorName);
  const safeContractDate = escapeHtml(formatContractDate(contractDate));
  const safeReleaseDate = escapeHtml(formatContractDate(releaseDate));
  const articleHtml = articles
    .map(
      (article) => `
        <section class="article">
          <div class="article-title">${article.title}</div>
          <div class="article-body">${toHtmlLines(article.body)}</div>
        </section>
      `,
    )
    .join("");

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>奴隷契約書</title>
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #ffffff;
        color: #111111;
        font-family: "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page {
        width: 210mm;
        min-height: 297mm;
        padding: 18mm 20mm 16mm;
        margin: 0 auto;
        background: #ffffff;
      }
      .monthly {
        font-size: 12px;
        line-height: 1.6;
        text-decoration: underline;
      }
      h1 {
        margin: 18px 0 26px;
        text-align: center;
        font-size: 20px;
        font-weight: 500;
        letter-spacing: 0.08em;
      }
      .intro,
      .article-body,
      .signature {
        font-size: 12px;
        line-height: 1.9;
      }
      .intro { margin-bottom: 18px; }
      .article { margin-top: 8px; }
      .article-title {
        font-size: 12px;
        line-height: 1.8;
        font-weight: 500;
      }
      .date-lines {
        margin-top: 22px;
        font-size: 12px;
        line-height: 2.2;
      }
      .underline {
        display: inline-block;
        min-width: 110px;
        border-bottom: 1px solid #111111;
        padding: 0 8px 1px;
        text-align: center;
      }
      .signature {
        margin-top: 22px;
        margin-left: auto;
        width: 58mm;
      }
      .signature-line {
        display: inline-block;
        min-width: 110px;
        border-bottom: 1px solid #111111;
        padding: 0 8px 1px;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="monthly">月額：一万円</div>
      <h1>奴隷契約書</h1>
      <p class="intro">
        本書は、ご主人様である　${ownerName}　様（以下「御主人様」と）、<br />
        ご主人様の奴隷である　${safeName}　（以下「私」と）の間に<br />
        交わされた契約の内容等について定めたものです。
      </p>
      ${articleHtml}
      <div class="date-lines">
        契約日：<span class="underline">${safeContractDate}</span><br />
        解約日：<span class="underline">${safeReleaseDate}</span>
      </div>
      <div class="signature">
        御主人様：${ownerName}　様<br />
        契約者名：<span class="signature-line">${safeName}</span>
      </div>
    </main>
  </body>
</html>`;
}

async function savePdfToDevice(uri: string, fileName: string) {
  if (Platform.OS === "android") {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) {
      throw new Error("保存先フォルダが選択されませんでした。");
    }
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      fileName,
      "application/pdf",
    );
    await FileSystem.writeAsStringAsync(targetUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return targetUri;
  }
  const targetUri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.copyAsync({ from: uri, to: targetUri });
  return targetUri;
}

export default function SlaveContractScreen() {
  const [contractorName, setContractorName] = useState("マゾ");
  const [contractDate, setContractDate] = useState(() => toDateKey());
  const [releaseMonths, setReleaseMonths] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const { showError, showNotice } = useAppModal();

  useEffect(() => {
    let mounted = true;
    Promise.all([
      settingsService.load(),
      slaveContractService.load(),
    ])
      .then(([settings, stored]) => {
        if (!mounted) return;
        setContractorName(stored.contractorName !== undefined ? stored.contractorName : settings.playerName || "マゾ");
        setContractDate(parseDateKey(stored.contractDate || "") ? stored.contractDate! : toDateKey());
        setReleaseMonths(Math.max(1, Math.floor(stored.releaseMonths || 1)));
      })
      .catch(() => {
        if (!mounted) return;
        setContractorName("マゾ");
        setContractDate(toDateKey());
        setReleaseMonths(1);
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const name = contractorName.trim();
    slaveContractService.save({
      contractorName: name,
      contractDate: contractDate.trim() ? contractDate : "",
      releaseMonths,
    }).catch(() => {
      // PDF表示の邪魔をしないため、保存失敗は出力時の表示に任せる。
    });
  }, [contractDate, contractorName, hydrated, releaseMonths]);

  const contractCompleted = contractorName.trim().length > 0;
  const displayName = useMemo(() => contractorName.trim() || "＿＿＿＿＿＿", [contractorName]);
  const contractDateError = contractDate.trim() && !parseDateKey(contractDate) ? "YYYY-MM-DD形式で入力してください。" : "";
  const effectiveContractDate = parseDateKey(contractDate) ? contractDate : toDateKey();
  const releaseDate = useMemo(
    () => addMonths(effectiveContractDate, releaseMonths),
    [effectiveContractDate, releaseMonths],
  );
  const outputName = contractCompleted ? displayName : "";
  const outputContractDate = contractCompleted ? effectiveContractDate : "";
  const outputReleaseDate = contractCompleted ? releaseDate : "";
  const pdfFileName = useMemo(
    () => createPdfFileName(outputContractDate, outputReleaseDate, outputName),
    [outputContractDate, outputName, outputReleaseDate],
  );
  const html = useMemo(
    () => createContractHtml(outputName, outputContractDate, outputReleaseDate),
    [outputContractDate, outputName, outputReleaseDate],
  );

  const changeReleaseMonths = (diff: number) => {
    setReleaseMonths((current) => Math.max(1, current + diff));
  };

  const exportPdf = async () => {
    try {
      if (contractDateError) {
        showNotice("契約日を確認してください", contractDateError);
        return;
      }
      if (Platform.OS === "web") {
        if (typeof window === "undefined" || typeof document === "undefined") {
          throw new Error("WEB PDF出力を利用できません。");
        }
        const { default: html2pdf } = await import("html2pdf.js");
        await html2pdf()
          .set({
            margin: 0,
            filename: pdfFileName,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              backgroundColor: "#ffffff",
              windowWidth: 794,
            },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          })
          .from(html)
          .save(pdfFileName);
        showNotice("PDFをダウンロードしました", pdfFileName);
        return;
      }

      const { uri } = await Print.printToFileAsync({ html });
      const savedUri = await savePdfToDevice(uri, pdfFileName);
      showNotice("PDFを保存しました", `端末内に保存しました。\n${savedUri}`);
    } catch (error) {
      showError("PDF出力に失敗しました", error, "契約書PDFの出力中にエラーが発生しました。");
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <AppText variant="title">奴隷契約書　※本物</AppText>
          </View>
          <View style={styles.pdfButton}>
            <PrimaryButton title="PDF出力" tone="danger" onPress={exportPdf} />
          </View>
        </View>
        <View style={styles.rule} />
      </View>

      <View style={styles.inputCard}>
        <TextField
          label="契約者名"
          value={contractorName}
          onChangeText={setContractorName}
          placeholder="契約者名を入力"
        />
        <TextField
          label="契約日"
          value={contractDate}
          onChangeText={setContractDate}
          placeholder="YYYY-MM-DD"
          error={contractDateError}
        />
        <View style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <View style={styles.monthText}>
              <AppText variant="label">解約日</AppText>
              <AppText style={styles.releaseDate}>{formatContractDate(releaseDate)}</AppText>
              <AppText variant="muted">契約日から {releaseMonths}か月後</AppText>
            </View>
            <View style={styles.monthButtons}>
              <PrimaryButton title="-1か月" tone="secondary" onPress={() => changeReleaseMonths(-1)} disabled={releaseMonths <= 1} />
              <PrimaryButton title="+1か月" tone="secondary" onPress={() => changeReleaseMonths(1)} />
            </View>
          </View>
        </View>
        <AppText style={contractCompleted ? styles.completed : styles.pending}>
          {contractCompleted
            ? "契約完了：契約日と解約日を確定しました。"
            : "契約者名を入力すると、契約完了として日付を確定します。"}
        </AppText>
        <AppText variant="muted">
          契約日が未設定の場合は本日、解約日は契約日の一か月後を初期値にします。
        </AppText>
      </View>

      <View style={styles.paper}>
        <AppText style={styles.monthly}>月額：一万円</AppText>
        <AppText style={styles.paperTitle}>奴隷契約書</AppText>
        <AppText style={styles.paperBody}>
          本書は、ご主人様である　{ownerName}　様（以下「御主人様」と）、{"\n"}
          ご主人様の奴隷である　{outputName}　（以下「私」と）の間に{"\n"}
          交わされた契約の内容等について定めたものです。
        </AppText>

        {articles.map((article) => (
          <View key={article.title} style={styles.article}>
            <AppText style={styles.articleTitle}>{article.title}</AppText>
            <AppText style={styles.paperBody}>{article.body}</AppText>
          </View>
        ))}

        <View style={styles.dateBlock}>
          <AppText style={styles.paperBody}>契約日：{formatContractDate(outputContractDate)}</AppText>
          <AppText style={styles.paperBody}>解約日：{formatContractDate(outputReleaseDate)}</AppText>
        </View>

        <View style={styles.signatureBlock}>
          <AppText style={styles.paperBody}>御主人様：{ownerName}　様</AppText>
          <AppText style={styles.paperBody}>契約者名：{outputName}</AppText>
        </View>
      </View>

      <PrimaryButton
        title="外部リンクへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/external-links")}
      />
      <PrimaryButton
        title="管理・設定メニューへ戻る"
        tone="secondary"
        onPress={() => router.push("/(tabs)/menu?section=management")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 10, marginBottom: 4 },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: { flex: 1, gap: 8 },
  kicker: {
    color: "#8a2be2",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    letterSpacing: 6,
  },
  pdfButton: { minWidth: 112 },
  rule: { height: 2, backgroundColor: lightTheme.text, marginTop: 8 },
  inputCard: {
    gap: 10,
    borderWidth: 2,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    padding: 16,
  },
  monthCard: {
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: "#080808",
    padding: 12,
  },
  monthHeader: {
    gap: 12,
  },
  monthText: {
    gap: 4,
  },
  releaseDate: {
    color: lightTheme.text,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "900",
  },
  monthButtons: {
    flexDirection: "row",
    gap: 10,
  },
  completed: {
    color: "#7CB342",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "900",
  },
  pending: {
    color: lightTheme.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  paper: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 7,
  },
  monthly: {
    color: "#111111",
    fontSize: 11,
    lineHeight: 18,
    textDecorationLine: "underline",
  },
  paperTitle: {
    color: "#111111",
    textAlign: "center",
    fontSize: 19,
    lineHeight: 30,
    letterSpacing: 2,
    marginBottom: 12,
  },
  paperBody: {
    color: "#111111",
    fontSize: 11,
    lineHeight: 21,
  },
  article: { gap: 1, marginTop: 4 },
  articleTitle: {
    color: "#111111",
    fontSize: 11,
    lineHeight: 20,
    fontWeight: "700",
  },
  dateBlock: {
    gap: 4,
    marginTop: 14,
  },
  signatureBlock: {
    gap: 5,
    alignSelf: "flex-end",
    minWidth: 190,
    marginTop: 12,
  },
});
