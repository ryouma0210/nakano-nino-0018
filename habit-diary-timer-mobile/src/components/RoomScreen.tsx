import { router } from "expo-router";
import type { ImageSourcePropType } from "react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import {
  RoomConversation,
  type ConversationLine,
} from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";

export function RoomScreen({
  title,
  description,
  notices,
  lines,
  contractLines,
  characterSource,
}: {
  title: string;
  description: string;
  notices: string[];
  lines?: ConversationLine[];
  contractLines?: ConversationLine[];
  characterSource?: ImageSourcePropType;
}) {
  return (
    <Screen>
      <AppText variant="title">{title}</AppText>
      <RoomConversation
        roomName={title}
        lines={lines}
        contractLines={contractLines}
        characterSource={characterSource}
      />
      <Card>
        <AppText>{description}</AppText>
      </Card>
      {notices.map((notice) => (
        <Card key={notice}>
          <AppText>{notice}</AppText>
        </Card>
      ))}
      <PrimaryButton
        title="ホームへ戻る"
        onPress={() => router.replace("/(tabs)")}
        tone="secondary"
      />
    </Screen>
  );
}
