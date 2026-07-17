import { RoomScreen } from "@/components/RoomScreen";
export default function ReleaseScreen() {
  return <RoomScreen title="射精管理用部屋（貞操帯なし）" characterSource={require("../../assets/characters/release-nino.png")} description="貞操帯を使用しない管理記録のための部屋です。" notices={["実施日時と状態を記録する", "無理のない範囲で体調を確認する"]} />;
}
