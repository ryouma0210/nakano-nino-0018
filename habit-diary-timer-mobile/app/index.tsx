import { useCallback, useEffect, useState } from "react";
import {
  BackHandler,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";
import { useAppModal } from "@/components/AppModalProvider";
import {
  loginBonusRepository,
  type LoginBonusStamp,
  type LoginBonusStatus,
} from "@/repositories/loginBonusRepository";
import { reportRepository } from "@/repositories/reportRepository";

let startupLoginBonusModalShown = false;

export default function Index() {
  const [exitConfirmation, setExitConfirmation] = useState(false);
  const [loginBonusVisible, setLoginBonusVisible] = useState(false);
  const [loginBonusStatus, setLoginBonusStatus] = useState<LoginBonusStatus | null>(null);
  const [loginBonusStamps, setLoginBonusStamps] = useState<LoginBonusStamp[]>([]);
  const [todayEarnedPoints, setTodayEarnedPoints] = useState(0);
  const { showNotice } = useAppModal();
  const loginBonusMonthLabel = loginBonusStatus
    ? `${loginBonusStatus.today.slice(0, 7).replace("-", "年")}月`
    : "";

  const refreshLoginBonusInfo = useCallback(() => {
    const status = loginBonusRepository.status();
    setLoginBonusStatus(status);
    setLoginBonusStamps(loginBonusRepository.monthlyStamps(status.today.slice(0, 7)));
    setTodayEarnedPoints(reportRepository.today().earnedPoints);
    return status;
  }, []);

  const claimStartupLoginBonus = useCallback(() => {
    try {
      const status = loginBonusRepository.claim();
      setLoginBonusStatus(status);
      setLoginBonusStamps(loginBonusRepository.monthlyStamps(status.today.slice(0, 7)));
      setTodayEarnedPoints(reportRepository.today().earnedPoints);
    } catch {
      showNotice(
        "ログインボーナスを受け取れません",
        "本日の記録画面から再度お試しください。",
      );
    }
  }, [showNotice]);

  useEffect(() => {
    if (startupLoginBonusModalShown) return;
    startupLoginBonusModalShown = true;
    try {
      refreshLoginBonusInfo();
      setLoginBonusVisible(true);
    } catch {
      showNotice(
        "ログイン情報を確認できません",
        "本日の記録画面からログインボーナスを確認してください。",
      );
    }
  }, [refreshLoginBonusInfo, showNotice]);

  function exitGame() {
    if (Platform.OS === "android") BackHandler.exitApp();
    else
      showNotice(
        "ゲーム終了",
        "iOSではアプリを閉じる操作は端末側から行ってください。",
      );
  }

  return (
    <Screen>
      <View style={styles.start}>
        <AppText style={styles.title}>PRIVATE ROOM</AppText>
        <Image
          source={require("../assets/characters/home-nino.png")}
          style={styles.hero}
          resizeMode="contain"
        />
        <View style={styles.menu}>
          <PrimaryButton
            title="始める"
            tone="secondary"
            onPress={() => router.replace("/(tabs)")}
          />
          <PrimaryButton
            title="設定"
            onPress={() => router.push("/sound-settings")}
          />
          <PrimaryButton
            title="ゲーム終了"
            onPress={() => setExitConfirmation(true)}
            tone="danger"
          />
        </View>
        <AppText style={styles.version}>
          Ver:{Constants.expoConfig?.version ?? "-"}
        </AppText>
      </View>
      <ConfirmModal
        visible={exitConfirmation}
        title="ゲームを終了しますか？"
        message="アプリを終了してスタート画面を閉じます。"
        confirmLabel="終了する"
        confirmTone="danger"
        onCancel={() => setExitConfirmation(false)}
        onConfirm={() => {
          setExitConfirmation(false);
          exitGame();
        }}
      />
      <Modal
        visible={loginBonusVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLoginBonusVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.loginDialog}>
            <AppText style={styles.modalKicker}>LOGIN BONUS</AppText>
            <AppText variant="subtitle">
              {loginBonusMonthLabel}のスタンプ
            </AppText>
            <AppText style={styles.loginStatus}>
              本日のログインボーナス：
              {loginBonusStatus?.alreadyClaimed ? "受取済み♡" : "未受取"}
            </AppText>
            <View style={styles.loginBonusDetails}>
              <AppText style={styles.loginBonusDetailLabel}>連続ログイン日数：</AppText>
              <AppText style={styles.loginBonusDetailValue}>{loginBonusStatus?.claimStreak ?? 0}日</AppText>
              <AppText style={styles.loginBonusDetailLabel}>明日のPt予定：</AppText>
              <AppText style={styles.loginBonusDetailValue}>{loginBonusStatus?.nextClaimPoints ?? 0}pt</AppText>
            </View>
            <AppText style={styles.todayPoints}>
              本日の獲得Pt：{todayEarnedPoints.toLocaleString()}pt
            </AppText>
            <ScrollView style={styles.stampScroll} contentContainerStyle={styles.stampGrid}>
              {loginBonusStamps.map((stamp) => {
                const isToday = loginBonusStatus?.today === stamp.date;
                return (
                  <View
                    key={stamp.date}
                    style={[
                      styles.stampCell,
                      stamp.claimed && styles.stampCellClaimed,
                      isToday && styles.stampCellToday,
                    ]}
                  >
                    <AppText style={styles.stampDay}>{stamp.day}</AppText>
                    <AppText style={[styles.stampMark, stamp.claimed && styles.stampMarkClaimed]}>
                      {stamp.claimed ? "♡" : "—"}
                    </AppText>
                    {stamp.claimed ? (
                      <AppText style={styles.stampPoint}>{stamp.points}pt</AppText>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
            {loginBonusStatus?.alreadyClaimed ? (
              <PrimaryButton
                title="閉じる"
                tone="secondary"
                onPress={() => setLoginBonusVisible(false)}
              />
            ) : (
              <PrimaryButton
                title={`受け取る（${loginBonusStatus?.claimPoints ?? 0}pt）`}
                onPress={claimStartupLoginBonus}
              />
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  start: { minHeight: 620, justifyContent: "center", gap: 24 },
  title: {
    color: lightTheme.text,
    fontSize: 34,
    lineHeight: 46,
    fontWeight: "900",
    letterSpacing: 5,
    textAlign: "center",
  },
  hero: {
    width: "100%",
    height: 430,
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 4,
    backgroundColor: "#000",
  },
  menu: { gap: 16 },
  version: {
    alignSelf: "flex-end",
    color: lightTheme.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.88)",
  },
  loginDialog: {
    width: "100%",
    maxWidth: 430,
    maxHeight: "86%",
    gap: 14,
    borderWidth: 1,
    borderColor: "#ff5fb3",
    borderRadius: 6,
    padding: 18,
    backgroundColor: "#080008",
  },
  modalKicker: {
    color: "#ff5fb3",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "900",
    letterSpacing: 4,
  },
  loginStatus: {
    color: "#fff",
    fontWeight: "800",
  },
  loginBonusDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,95,179,0.45)",
    borderRadius: 5,
    backgroundColor: "rgba(255,95,179,0.08)",
    padding: 10,
  },
  loginBonusDetailLabel: {
    width: "58%",
    color: "#ddd",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
  },
  loginBonusDetailValue: {
    flex: 1,
    color: "#f2c94c",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    textAlign: "right",
  },
  todayPoints: {
    color: "#f2c94c",
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "900",
  },
  stampScroll: {
    maxHeight: 280,
  },
  stampGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingVertical: 2,
  },
  stampCell: {
    width: "13.2%",
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 6,
    backgroundColor: "#111",
    paddingVertical: 4,
  },
  stampCellClaimed: {
    borderColor: "#ff5fb3",
    backgroundColor: "#2a071a",
  },
  stampCellToday: {
    borderColor: "#f2c94c",
  },
  stampDay: {
    color: "#fff",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  stampMark: {
    color: "#555",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  stampMarkClaimed: {
    color: "#ff5fb3",
  },
  stampPoint: {
    color: "#aaa",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
  },
});
