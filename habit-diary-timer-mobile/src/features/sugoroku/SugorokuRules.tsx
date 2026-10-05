import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";

const sections = [
  {
    heading: "■すごろくルール",
    paragraphs: [
      "①サイコロを振って、出た目によって進み\n画像内の命令に従う。\n命令が完了次第、\n『命令完了』ボタンをタップして\n次のサイコロ振ってね。",
      "②逝くのはもちろん【ゴール】するまで禁止",
      "③もし限界になった場合は、リタイア(途中でゲーム終了)することも可能です。\n『リタイア』ボタンをタップして\nリタイアしてね。",
      "④途中で【お漏らし】した場合、\n【ゲーム終了】となります。\n『失敗』ボタンをタップして\n罰ゲーム受けてね。",
    ],
  },
  {
    heading: "■あると便利道具",
    paragraphs: [
      "･油性ペン ※命令に使用",
      "･お尻に入れる玩具があるなら装着した状態でやること。",
    ],
  },
  {
    heading: "■マスの色について",
    paragraphs: [
      "･青 : 危険マス",
      "･赤 : 強制ストップマス",
      "･白 : 基本マス ※罠マスもあり",
      "※マイナスゾーンマスは\nサイコロを振っても『1マス』ずつしか進めないから気を付けてね。",
    ],
  },
] as const;

export function SugorokuRules() {
  return (
    <View style={styles.sections}>
      {sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <AppText variant="subtitle" accessibilityRole="header">{section.heading}</AppText>
          {section.paragraphs.map((paragraph) => (
            <AppText key={paragraph} variant="muted" style={styles.paragraph}>{paragraph}</AppText>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sections: { gap: 20 },
  section: { gap: 10 },
  paragraph: { lineHeight: 22 },
});
