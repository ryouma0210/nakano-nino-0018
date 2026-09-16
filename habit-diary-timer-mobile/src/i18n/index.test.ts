import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { translateText, translateWeekday, translateWithValues } from "./index";
import { translateChildren } from "./children";
import { translationTemplates } from "./templates";

const languages = ["en", "ko", "zh"] as const;
const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

describe("translateText", () => {
  it("leaves Japanese and its spacing unchanged", () => {
    const value = "\n調教開始\n1回 / 5回\n契約日から 1か月後";
    expect(translateText(value, "ja")).toBe(value);
  });

  it("translates fixed labels in all supported languages", () => {
    expect(translateText("調教開始", "en")).toBe("Start Training");
    expect(translateText("調教開始", "ko")).toBe("조련 시작");
    expect(translateText("調教開始", "zh")).toBe("开始调教");
  });

  it("keeps names while translating a complete greeting", () => {
    expect(translateText("マゾ。おかえりなさい。今日はどの部屋へ行く？", "en"))
      .toBe("マゾ, Welcome back. Which room would you like to visit today?");
    expect(translateText("마조。あなたの調教記録は、私がここで見守っているわ。", "ko"))
      .toBe("마조, 네 조련 기록은 내가 여기서 지켜보고 있어.");
    for (const language of languages) {
      const translated = translateText("記録。画像。おかえりなさい。今日はどの部屋へ行く？", language);
      expect(translated).toMatch(/^記録。画像[,，]/);
      expect(translated.slice("記録。画像".length)).not.toMatch(language === "zh" ? kana : japanese);
    }
  });

  it("uses natural word order for exchanges and keeps the amount", () => {
    expect(translateText("制服は500ptで交換できます。", "en"))
      .toBe("You can unlock Uniform for 500pt.");
    expect(translateText("制服を500ptで交換しました。", "ko"))
      .toBe("500pt로 제복 의상을 교환했습니다.");
    expect(translateText("制服は500ptで交換できます。", "zh"))
      .toBe("可花费500pt兑换制服。");
  });

  it("formats counts, durations and currency without losing spacing", () => {
    expect(translateText("選択した1件を削除", "en")).toBe("Delete 1 file");
    expect(translateText("選択した3件のファイルを削除します。", "en")).toBe("This will delete 3 files.");
    expect(translateText("1件のファイルを削除しました。", "en")).toBe("Deleted 1 file.");
    expect(translateText("削除中：2/3件", "ko")).toBe("파일 삭제 중: 2/3");
    expect(translateText("1件のファイルを格納しました。", "en")).toBe("Saved 1 file.");
    expect(translateText("3件のファイルを格納できませんでした。", "en")).toBe("Could not save 3 files.");
    expect(translateText("1回 / 10回", "en")).toBe("1 time / 10 times");
    expect(translateText("5回 / 10回", "zh")).toBe("5次 / 10次");
    expect(translateText("1,200円", "en")).toBe("1,200 yen");
    expect(translateText("1,200円", "ko")).toBe("1,200엔");
    expect(translateText("1,200円", "zh")).toBe("1,200日元");
    expect(translateText("現在値：1体 / 10体", "en")).toBe("Current progress: 1 defeated / 10 defeated");
    expect(translateText("現在値：1体 / 10体", "ko")).toBe("현재 진행도: 1마리 / 10마리");
    expect(translateText("現在値：1体 / 10体", "zh")).toBe("当前进度：1只 / 10只");
    expect(translateText("  画像\n", "ko")).toBe("  이미지\n");
  });

  it("distinguishes calendar months and weekdays from durations", () => {
    expect(translateText("2026年9月14日（月）", "en")).toBe("September 14, 2026 (Mon)");
    expect(translateText("2026年9月14日（月）", "ko")).toBe("2026년 9월 14일 (월)");
    expect(translateText("2026年9月14日（月）", "zh")).toBe("2026年9月14日（周一）");
    expect(translateText("2026年9月", "en")).toBe("September 2026");
    expect(translateText("9月", "ko")).toBe("9월");
    expect(translateText("契約日から 1か月後", "en")).toBe("1 month after the contract date");
    expect(translateText("契約日から 2か月後", "ko")).toBe("계약일로부터 2개월 후");
    expect(Array.from({ length: 7 }, (_, day) => translateWeekday(day, "zh")))
      .toEqual(["周日", "周一", "周二", "周三", "周四", "周五", "周六"]);
  });

  it("does not mistake the first sentence of a guide for a player's name", () => {
    const messages = [
      "一度見た敗北シーンは無料で再生できます。\n未閲覧シーンは各500Ptで解放できます。\n回想ではレベル・Pt・状態異常は変化しません。",
      "上の森ではサキュバスと遭遇します。\n右のエリアでレベルを上げて強くすること。\nHPとMPを確認し、必要なら左の水辺で回復してから進んでください。",
      "2026-09-14\n\n準備・調教・お仕置きなどを削除します。\n敗北部屋、本日の命令、射精管理の固定記録は削除されません。\n\nこの操作は元に戻せません。",
      "\n  衣装を選ぶと控え室の二ノ様に反映されます。\n  未交換の衣装は300ptで交換できます。\n",
    ];
    for (const language of languages) {
      for (const message of messages) {
        expect(translateText(message, language)).not.toMatch(language === "zh" ? kana : japanese);
      }
    }
  });

  it("preserves the line break before a conditional status notice", () => {
    const message = "浄化の水辺に入った。\nHPとMPが全回復し、状態異常も解除されました。\n※奴隷契約による服従は解除されません。";
    for (const language of languages) {
      const translated = translateText(message, language);
      expect(translated.split("\n")).toHaveLength(3);
      expect(translated).not.toMatch(language === "zh" ? kana : japanese);
    }
  });

  it("translates reset notices after the modal expands escaped newlines", () => {
    const message = "次のデータをすべて削除します。\n\n・調教日記と準備・敗北記録\n・本日の命令\n・お仕置きと射精管理の履歴\n・実績・ポイント・獲得済みご褒美\n・契約書と契約ルール\n・名前とサウンド設定\n・格納ファイル\n\nこの操作は元に戻せません。";
    for (const language of languages) {
      const translated = translateText(message, language);
      expect(translated).not.toMatch(language === "zh" ? kana : japanese);
      expect(translated).toContain("\n\n");
    }
  });

  it("keeps user content, filenames, URLs and prototype-like text verbatim", () => {
    const filename = "奴隷契約書_2026-09-14_2026-10-14_秘密のご褒美♡.pdf";
    for (const language of languages) {
      for (const value of [filename, `file:///documents/${filename}`, `content://media/${filename}`, `C:\\new\\${filename}`, "constructor", "toString", "__proto__"]) {
        expect(translateText(value, language)).toBe(value);
      }
      expect(translateText("これから「画像  1 times {0}」と呼びます。", language)).toContain("画像  1 times {0}");
      expect(translateText("契約者名：画像", language)).toContain("画像");
    }
  });

  it("renders every dynamic template without leaked source text or lost values", () => {
    for (const entry of translationTemplates) {
      const slots = [...new Set(entry[0].match(/\{\d+\}/g) ?? [])];
      const valueFor = (slot: string) => String(137 + Number(slot.slice(1, -1)) * 101);
      const source = entry[0].replace(/\{\d+\}/g, valueFor);
      for (const language of languages) {
        const translated = translateText(source, language);
        expect(translated, `${language}: ${entry[0]}`).not.toMatch(language === "zh" ? kana : japanese);
        for (const slot of slots) expect(translated, `${language}: ${entry[0]}`).toContain(valueFor(slot));
      }
    }
  });

  it("inserts raw names once, including empty and placeholder-like names", () => {
    const source = translationTemplates.find(([key]) => key.startsWith("本書は"))![0];
    for (const language of languages) {
      expect(translateWithValues(source, ["中野二乃", "調教。<&\"{0}"], language)).toContain("調教。<&\"{0}");
      const blank = translateWithValues(source, ["中野二乃", ""], language);
      expect(blank).not.toMatch(/\{\d+\}/);
      expect(blank).not.toMatch(language === "zh" ? kana : japanese);
    }
  });
});

describe("translated text children", () => {
  it("joins adjacent JSX text and values before translating", () => {
    expect(translateChildren(["契約日から ", 1, "か月後"], "en"))
      .toEqual(["1 month after the contract date"]);
    expect(translateChildren([2026, "年", 9, "月"], "en")).toEqual(["September 2026"]);
    expect(translateChildren(["消費：", 300, "pt／未獲得： ", 5, "種類"], "en"))
      .toEqual(["Cost: 300pt / 5 left to collect"]);
    expect(translateChildren(["画像", "・動画", "を保存できます。"], "en"))
      .toEqual(["You can save images and videos."]);
  });

  it("keeps styled child elements intact and preserves Japanese children", () => {
    const emphasis = createElement("strong", { key: "name" }, "Nino");
    const children = ["画像", emphasis, "動画"];
    const translated = translateChildren(children, "en") as unknown[];
    expect(translated).toHaveLength(3);
    expect(translated[1]).toBe(emphasis);
    expect(translateChildren(children, "ja")).toBe(children);
  });
});
