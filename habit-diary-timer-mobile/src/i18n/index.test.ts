import { describe, expect, it } from "vitest";
import { translateText } from "./index";

describe("translateText", () => {
  it("keeps Japanese as the default language", () => {
    expect(translateText("調教開始", "ja")).toBe("調教開始");
  });

  it("translates fixed labels into English and Korean", () => {
    expect(translateText("調教開始", "en")).toBe("Start Training");
    expect(translateText("調教開始", "ko")).toBe("조련 시작");
  });

  it("translates Japanese fragments around dynamic numbers", () => {
    expect(translateText("所持Pt 500pt", "en")).not.toContain("所持");
    expect(translateText("所持Pt 500pt", "ko")).not.toContain("所持");
  });

  it("keeps a user-entered name and translates the complete home greeting", () => {
    expect(translateText("マゾ。おかえりなさい。今日はどの部屋へ行く？", "en"))
      .toBe("マゾ. Welcome back. Which room would you like to visit today?");
    expect(translateText("マゾ。おかえりなさい。今日はどの部屋へ行く？", "ko"))
      .toBe("マゾ님, 어서 오세요. 오늘은 어느 방으로 가시겠어요?");
  });

  it("translates shared room dialogue as a complete sentence after the saved name", () => {
    expect(translateText("マゾ。あなたの調教記録は、私がここで見守っているわ。", "en"))
      .toBe("マゾ. I'll keep an eye on your training records here.");
    expect(translateText("마조。あなたの調教記録は、私がここで見守っているわ。", "ko"))
      .toBe("마조님, 여기서 훈련 기록을 지켜보겠습니다.");
  });

  it("translates dynamic exchange messages as complete sentences", () => {
    expect(translateText("制服は500ptで交換できます。", "en"))
      .toBe("Uniform can be exchanged for 500pt.");
    expect(translateText("制服を500ptで交換しました。", "ko"))
      .toBe("제복을(를) 500pt로 교환했습니다.");
  });

  it("translates numeric units and indented short JSX labels", () => {
    expect(translateText("5回 / 10回", "en")).toBe("5 times / 10 times");
    expect(translateText("  画像\n", "ko")).toBe("  이미지\n");
  });
});
