import { RoomScreen } from "@/components/RoomScreen";
export default function ChastityScreen() {
  return <RoomScreen title="射精管理用部屋（貞操帯あり）" description="貞操帯を使用する期間と状態を管理する部屋です。" notices={["装着時間と解除予定を確認する", "痛み・しびれ・変色など異常があれば直ちに中止する"]} />;
}
