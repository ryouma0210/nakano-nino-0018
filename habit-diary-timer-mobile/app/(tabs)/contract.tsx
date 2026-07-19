import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { lightTheme } from "@/constants/theme";
import {
  contractService,
  type ContractSettings,
} from "@/services/gameRoomService";
import { useAppAudio } from "@/audio/AudioProvider";

const contractRules = [
  { text: "私の命令は絶対服従すること。", required: true },
  { text: "私の許可なしに射精しないこと。", required: true },
  { text: "私のATMになること。", required: true },
  { text: "調教を受ける際は、首輪を着用すること。", required: true },
  { text: "調教を受ける際は、貞操帯を着用すること。", required: false },
] as const;

function formatContractDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export default function ContractScreen() {
  const { settings } = useAppAudio();
  const playerName = settings?.playerName.trim() ?? "";
  const [contract, setContract] = useState<ContractSettings | null>(null);
  const [checked, setChecked] = useState(() => new Set<string>());
  const [signature, setSignature] = useState("");
  const [contractConfirmation, setContractConfirmation] = useState(false);
  const player = useVideoPlayer(
    require("../../assets/videos/contract_1.mp4"),
    (instance) => {
      instance.loop = true;
    },
  );

  useEffect(() => {
    contractService.load().then((saved) => {
      setContract(saved);
      setSignature(saved.signature ?? "");
    });
  }, []);

  const signed = Boolean(contract?.signedAt);

  useEffect(() => {
    if (signed) player.play();
    else player.pause();
  }, [player, signed]);

  if (!contract)
    return (
      <Screen>
        <AppText>読み込み中...</AppText>
      </Screen>
    );

  const requiredComplete = contractRules
    .filter((rule) => rule.required)
    .every((rule) => checked.has(rule.text));
  const canSign = requiredComplete && signature.trim().length > 0;

  function toggleRule(text: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  }

  function confirmContract() {
    setContractConfirmation(true);
  }

  async function signContract() {
    const next: ContractSettings = {
      allowRelease: true,
      allowChastity: checked.has("調教を受ける際は、貞操帯を着用すること。"),
      maxPunishmentMinutes: contract?.maxPunishmentMinutes ?? 30,
      note: contract?.note ?? "",
      signature: signature.trim(),
      signedAt: new Date().toISOString(),
    };
    await contractService.save(next);
    setContract(next);
    player.replay();
  }

  async function updateSignature() {
    const nextSignature = signature.trim();
    const current = contract;
    if (!nextSignature || !current?.signedAt) return;
    const next: ContractSettings = { ...current, signature: nextSignature };
    await contractService.save(next);
    setContract(next);
    Alert.alert(
      "変更完了",
      "契約者サインを変更しました。契約内容と契約状態は変更されません。",
    );
  }

  return (
    <Screen>
      <AppText variant="title" style={styles.contractText}>
        契約部屋
      </AppText>
      {signed ? (
        <>
          <Card style={styles.contractCard}>
            <VideoView
              player={player}
              style={styles.video}
              nativeControls={false}
              contentFit="contain"
            />
            <AppText style={styles.completedMessage}>
              {`契約成立♡\n${playerName ? `${playerName}、` : ""}アンタは私の奴隷♡\nこれからよろしくね♡\nATMマゾ君♡`}
            </AppText>
          </Card>
          <Card style={styles.contractCard}>
            <AppText variant="label" style={styles.contractText}>
              契約日
            </AppText>
            <AppText style={styles.contractDate}>
              {formatContractDate(contract.signedAt)}
            </AppText>
            <AppText variant="subtitle" style={styles.contractText}>
              契約者
            </AppText>
            <TextField
              label="契約者サイン"
              value={signature}
              onChangeText={setSignature}
              placeholder="名前を入力"
            />
            <PrimaryButton
              title="契約者サインを変更"
              tone="contract"
              disabled={
                !signature.trim() ||
                signature.trim() === (contract.signature ?? "")
              }
              onPress={updateSignature}
            />
            <AppText style={styles.contractText}>
              この契約は解除できません。
            </AppText>
          </Card>
        </>
      ) : (
        <>
          <RoomConversation
            characterSource={require("../../assets/characters/settings-nino.png")}
            roomName="契約部屋"
            lines={[
              { text: "二ノ様の奴隷になりますか？" },
              { text: "一度奴隷になると、契約を解除できません。" },
            ]}
          />
          <Card style={styles.contractCard}>
            <AppText variant="subtitle" style={styles.contractText}>
              奴隷になることで以下のルールが追加されます。
            </AppText>
            {contractRules.map((rule) => (
              <Pressable
                key={rule.text}
                onPress={() => toggleRule(rule.text)}
                style={styles.checkRow}
              >
                <AppText style={styles.check}>
                  {checked.has(rule.text) ? "✅" : "□"}
                </AppText>
                <View style={styles.grow}>
                  <AppText style={styles.contractText}>{rule.text}</AppText>
                  {!rule.required ? (
                    <AppText style={styles.contractMutedText}>任意</AppText>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </Card>
          <Card style={styles.contractCard}>
            <TextField
              label="契約者サイン"
              value={signature}
              onChangeText={setSignature}
              placeholder="名前を入力"
            />
            <PrimaryButton
              title="契約ルールにサインする"
              tone="contract"
              disabled={!canSign}
              onPress={confirmContract}
            />
          </Card>
        </>
      )}
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
      <ConfirmModal
        visible={contractConfirmation}
        title="本当に契約しますか？"
        message="一度奴隷になると、契約を解除できません。契約内容をもう一度確認してください。"
        confirmLabel="契約にサインする"
        confirmTone="danger"
        onCancel={() => setContractConfirmation(false)}
        onConfirm={() => {
          setContractConfirmation(false);
          signContract();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingVertical: 12,
  },
  check: { width: 28, color: lightTheme.muted, fontSize: 20, lineHeight: 30 },
  grow: { flex: 1, gap: 2 },
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#000",
  },
  completedMessage: {
    color: "#ff4b55",
    fontSize: 22,
    lineHeight: 34,
    fontWeight: "900",
    textAlign: "center",
  },
  contractDate: { fontSize: 20, lineHeight: 30, fontWeight: "900" },
  contractCard: { borderColor: "#b875ff" },
  contractText: { color: "#c99aff" },
  contractMutedText: { color: "#9e72c9" },
});
