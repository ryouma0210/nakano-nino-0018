import { RoomScreen } from "@/components/RoomScreen";
export default function PreparationScreen() {
  return <RoomScreen title="準備部屋" characterSource={require("../../assets/characters/preparation-nino.png")} description="これから行う内容と目標を整理する部屋です。" notices={["今日の予定を決める", "必要な道具と時間を確認する"]} />;
}
