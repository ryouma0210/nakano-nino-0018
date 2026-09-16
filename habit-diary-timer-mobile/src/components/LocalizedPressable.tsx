import { type ComponentProps } from "react";
import { Pressable } from "react-native";
import { useAppAudio } from "@/audio/AudioProvider";
import { translateText } from "@/i18n";

export function LocalizedPressable({ accessibilityLabel, accessibilityHint, ...props }: ComponentProps<typeof Pressable>) {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  return <Pressable
    {...props}
    accessibilityLabel={accessibilityLabel ? translateText(accessibilityLabel, language) : undefined}
    accessibilityHint={accessibilityHint ? translateText(accessibilityHint, language) : undefined}
  />;
}
