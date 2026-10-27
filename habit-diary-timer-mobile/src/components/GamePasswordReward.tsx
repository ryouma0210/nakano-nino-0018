import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { GAME_PASSWORD_LABEL, GAME_UNLOCK_PASSWORD } from "@nino/shared/gamePassword";
import { AppText } from "./AppText";
import { PrimaryButton } from "./PrimaryButton";
import { useAppModal } from "./AppModalProvider";

/** Render only inside an acquired secret reward, including legacy purchases. */
export function GamePasswordReward() {
  const { showNotice } = useAppModal();
  async function copy() {
    try {
      const copied = await Clipboard.setStringAsync(GAME_UNLOCK_PASSWORD);
      if (!copied) throw new Error("Clipboard unavailable");
      showNotice("コピーしました", "ゲームのPWをコピーしました。");
    } catch {
      showNotice("コピーできません", "表示されたPWを選択してコピーするか、ゲーム画面に入力してください。");
    }
  }
  return <View style={{ gap: 8 }} testID="game-password-reward">
    <AppText variant="label">{GAME_PASSWORD_LABEL}</AppText>
    <AppText selectable localize={false} testID="game-password-value">{GAME_UNLOCK_PASSWORD}</AppText>
    <PrimaryButton title="PWをコピー" tone="secondary" onPress={copy} />
  </View>;
}
