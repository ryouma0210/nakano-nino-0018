import { useCallback, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAppModal } from "@/components/AppModalProvider";
import { roomMessages } from "@/constants/messages";
import { ninoOutfits as outfits } from "@/constants/outfits";
import { rewardRepository } from "@/repositories/rewardRepository";
import {
  profileService,
  type ProfileSettings,
} from "@/services/profileService";

type Panel = "outfits" | null;
type MediaMode = "image" | "video";

export default function NinoRoomScreen() {
  const insets = useSafeAreaInsets();
  const { showNotice } = useAppModal();
  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [redeemedOutfits, setRedeemedOutfits] = useState<Set<string>>(
    new Set(),
  );
  const [panel, setPanel] = useState<Panel>(null);
  const [mediaMode, setMediaMode] = useState<MediaMode>("image");
  const [lineIndex, setLineIndex] = useState(0);

  const baseLines = useMemo(
    () => [
      ...(roomMessages.ninoRoom.lines ?? []),
      ...(roomMessages.ninoRoom.contractLines ?? []),
    ],
    [],
  );

  const load = useCallback(() => {
    profileService.load().then(setProfile);
    setRedeemedOutfits(
      new Set(
        rewardRepository
          .acquired()
          .filter((item) => item.reward_key === "outfit" && item.file_uri)
          .map((item) => item.file_uri!),
      ),
    );
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const selectedOutfit =
    outfits.find((item) => item.key === profile?.ninoOutfit) ?? outfits[0];
  const lines = useMemo(
    () =>
      selectedOutfit.key === "default"
        ? [...baseLines, ...selectedOutfit.lines.map((text) => ({ text }))]
        : selectedOutfit.lines.map((text) => ({ text })),
    [baseLines, selectedOutfit],
  );
  const currentLine = lines[lineIndex % lines.length];
  const hasVideo = Boolean(selectedOutfit.video);
  const displayMode = hasVideo ? mediaMode : "image";

  async function selectOutfit(key: string) {
    const outfit = outfits.find((item) => item.key === key);
    if (!outfit) {
      showNotice("選択できません", "この衣装は選択できません。");
      return;
    }
    const unlocked = key === "default" || redeemedOutfits.has(key);
    if (!unlocked) {
      const redeemed = rewardRepository.redeemOutfit(key, outfit.name);
      if (!redeemed) {
        showNotice(
          "ポイントが足りません",
          `${outfit.name}は${outfit.cost}ptで交換できます。`,
        );
        return;
      }
      setRedeemedOutfits((current) => new Set([...current, key]));
      showNotice(
        "交換しました",
        `${outfit.name}を${outfit.cost}ptで交換しました。`,
      );
    }
    const next = {
      ...(profile ?? (await profileService.load())),
      ninoOutfit: key,
    };
    setProfile(next);
    await profileService.save(next);
    setPanel(null);
    setMediaMode("image");
    setLineIndex(0);
    if (unlocked)
      showNotice("保存しました", `${outfit.name}に着せ替えました。`);
  }

  function toggleMediaMode() {
    if (!hasVideo) {
      showNotice(
        "動画は未設定です",
        "この衣装には動画がないため、画像で表示します。",
      );
      setMediaMode("image");
      return;
    }
    setMediaMode((current) => (current === "image" ? "video" : "image"));
  }

  return (
    <View style={styles.root}>
      <View style={styles.mediaLayer}>
        {displayMode === "video" && selectedOutfit.video ? (
          <NinoOutfitVideo source={selectedOutfit.video} />
        ) : (
          <Image
            source={selectedOutfit.source}
            resizeMode="cover"
            style={styles.backgroundMedia}
          />
        )}
      </View>

      <View
        pointerEvents="box-none"
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(10, insets.top),
            paddingBottom: Math.max(10, insets.bottom),
          },
        ]}
      >
        <View style={styles.topBar}>
          <View style={styles.pointPill}>
            <AppText style={styles.pointIcon}>♥</AppText>
            <AppText style={styles.pointText}>DRESS</AppText>
          </View>
          <View style={styles.infoPill}>
            <AppText style={styles.infoText}>{selectedOutfit.name}</AppText>
          </View>
        </View>

        <View style={styles.sideButtons}>
          <CircleButton
            title={displayMode === "video" ? "画像" : "動画"}
            active={displayMode === "video"}
            onPress={toggleMediaMode}
          />
          <CircleButton
            title="衣装"
            active={panel === "outfits"}
            onPress={() => setPanel("outfits")}
          />
          <CircleButton
            title="戻る"
            onPress={() => router.replace("/(tabs)")}
          />
        </View>

        <Pressable
          style={styles.dialogue}
          onPress={() => setLineIndex((current) => current + 1)}
        >
          <View style={styles.nameTag}>
            <AppText style={styles.nameText}>二ノ</AppText>
          </View>
          <AppText style={styles.dialogueText}>{currentLine.text}</AppText>
          <AppText style={styles.nextText}>タップして次へ ▶</AppText>
        </Pressable>
      </View>

      <Modal
        visible={panel === "outfits"}
        transparent
        animationType="slide"
        onRequestClose={() => setPanel(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalPanel}>
            <View style={styles.panelHeader}>
              <AppText style={styles.panelTitle}>着せ替え</AppText>
              <Pressable
                onPress={() => setPanel(null)}
                style={styles.closeButton}
              >
                <AppText style={styles.closeText}>×</AppText>
              </Pressable>
            </View>
            <AppText style={styles.modalHelp}>
              衣装を選ぶと控え室の二ノ様に反映されます。未交換の衣装は300ptで交換できます。
            </AppText>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.outfitList}
            >
              {outfits.map((outfit) => {
                const unlocked =
                  outfit.key === "default" || redeemedOutfits.has(outfit.key);
                const active = selectedOutfit.key === outfit.key;
                return (
                  <Pressable
                    key={outfit.key}
                    onPress={() => selectOutfit(outfit.key)}
                    style={[
                      styles.outfitRow,
                      active && styles.optionActive,
                      !unlocked && styles.optionLocked,
                    ]}
                  >
                    <Image
                      source={outfit.source}
                      resizeMode="cover"
                      style={styles.outfitThumb}
                    />
                    <View style={styles.outfitInfo}>
                      <AppText style={styles.optionName}>{outfit.name}</AppText>
                      <AppText style={styles.optionMeta}>
                        {active
                          ? "選択中"
                          : unlocked
                            ? outfit.unlock
                            : `未交換 ${outfit.cost}pt`}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function NinoOutfitVideo({ source }: { source: number }) {
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.volume = 0;
    instance.play();
  });

  return (
    <VideoView
      player={player}
      nativeControls={false}
      contentFit="cover"
      style={styles.backgroundMedia}
    />
  );
}

function CircleButton({
  title,
  active,
  onPress,
}: {
  title: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.circleButton, active && styles.circleButtonActive]}
    >
      <AppText
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={styles.circleButtonText}
      >
        {title}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  mediaLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backgroundMedia: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  topBar: {
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pointPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  pointIcon: { color: "#ff5ca8", fontWeight: "900" },
  pointText: { color: "#333", fontWeight: "900", fontSize: 12 },
  infoPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  infoText: { color: "#333", fontWeight: "900", fontSize: 12 },
  sideButtons: {
    position: "absolute",
    right: 14,
    top: 78,
    gap: 10,
    zIndex: 4,
  },
  circleButton: {
    width: 86,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  circleButtonActive: {
    backgroundColor: "#ff7ab8",
  },
  circleButtonText: {
    color: "#246",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "center",
    width: "100%",
  },
  dialogue: {
    zIndex: 5,
    minHeight: 112,
    gap: 5,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  nameTag: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: "#ff7ab8",
  },
  nameText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  dialogueText: {
    color: "#2b2230",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "800",
  },
  nextText: {
    alignSelf: "flex-end",
    color: "#7f7785",
    fontSize: 11,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  modalPanel: {
    maxHeight: "82%",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  modalHelp: { color: "#cfcfcf", fontSize: 12, lineHeight: 18 },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  closeText: { color: "#111", fontSize: 18, fontWeight: "900" },
  outfitList: { gap: 10, paddingBottom: 8 },
  outfitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#777",
    borderRadius: 12,
    padding: 8,
    backgroundColor: "#050505",
  },
  outfitThumb: {
    width: 86,
    height: 116,
    borderRadius: 8,
    backgroundColor: "#111",
  },
  outfitInfo: { flex: 1, gap: 5 },
  optionActive: {
    borderColor: "#fff",
    backgroundColor: "#7b2cbf",
  },
  optionLocked: {
    opacity: 0.55,
  },
  optionName: { color: "#fff", fontSize: 12, fontWeight: "900" },
  optionMeta: { color: "#ddd", fontSize: 10 },
});
