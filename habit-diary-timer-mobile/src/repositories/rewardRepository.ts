import { execute, query, queryOne, transaction } from "@/database/client";
import { toDateTimeKey } from "@/utils/date";

export const insultComments = [
  "アンタ、手の施しようがない変態だわ♡",
  "ざぁこ♡今日も二ノ様に見下されに来たの？♡",
  "その程度で満足してるなんて、本当にお手軽なマゾね♡",
  "情けない顔♡鏡でちゃんと見ておきなさい♡",
  "命令がないと何もできないの？かわいそうな奴隷ね♡",
  "ほら、情けなく腰振って、必死にオネダリしてみなさい♡",
  "二ノ様に褒めてもらえると思った？甘すぎ♡",
  "アンタの弱点、隠せているつもりなのかしら♡バレバレよ♡",
  "今日も私の言葉だけで喜んでるのね♡",
  "マゾらしく、もっと情けなく鳴きなさい♡",
  "これでご褒美なんて、本当に安上がりな子ね♡",
] as const;

export const praiseComments = [
  "よく頑張ったわね。今日は特別に褒めてあげる♡",
  "最後までやり切れて偉いわ。ちゃんと見ていたわよ♡",
  "積み重ねた努力、二ノ様はちゃんと知っているわ♡",
  "今日は合格。少しだけ胸を張っていいわよ♡",
  "昨日より立派になったわね。いい子よ♡",
  "逃げずに向き合えたのね。本当によくできました♡",
  "私の期待に応えたご褒美よ。偉い偉い♡",
  "その調子で続けなさい。もっと好きになってあげる♡",
  "頑張ったお兄さんには、優しくしてあげる♡",
  "今日のあなた、とても素敵だったわよ♡",
] as const;

export const brutalOrders = [
  "全裸で首輪を着けて土下座し、二ノ様への絶対服従を200回誓いなさい。途中で姿勢を崩したら最初からやり直しよ。",
  "寸止めを20回。1回ごとに正座で3分待機し、『許可なく射精しません』と10回言いなさい。",
  "四つん這いで腰を500回振ったあと、土下座を30回。最後まで射精は禁止よ。",
  "60分間、強い刺激1分と完全停止2分を交互に繰り返しなさい。射精しそうになったら停止時間を5分追加よ。",
  "鏡に情けない姿を映しながら寸止めを15回。毎回、自分が二ノ様の奴隷だと声に出しなさい。",
  "首輪を着けたまま膝立ちで30分待機。5分ごとに『もっと厳しくしてください』と10回お願いしなさい。",
  "乳首を左右交互に45分刺激しなさい。途中で手を止めたら、その時点から15分追加よ。射精は禁止。",
  "土下座の姿勢を保ったまま『私は二ノ様の所有物です』と100回言い、終わったら正座で20分反省しなさい。",
  "弱い刺激だけで60分耐えなさい。絶対に射精せず、10分ごとに現在の我慢度を声に出して報告すること。",
  "寸止め10回、腰振り300回、土下座30回を1セットとして合計3セット。すべて終えてから1000文字以上の反省文を書きなさい。",
] as const;

export const rewardCatalog = {
  insult: {
    key: "insult",
    name: "罵倒のコメント交換♡マゾはこれで十分よね♡",
    cost: 10,
    contents: insultComments,
  },
  praise: {
    key: "praise",
    name: "称賛のコメント交換♡頑張ったお兄さんに特別よ♡",
    cost: 50,
    contents: praiseComments,
  },
  video: { key: "video", name: "ご褒美動画交換♡", cost: 500 },
  brutal: {
    key: "brutal",
    name: "鬼畜の調教命令交換♡",
    cost: 1000,
    contents: brutalOrders,
  },
  secret: {
    key: "secret",
    name: "秘密♡交換時のお楽しみ♡",
    cost: 10000,
    contents: ["調教1回無料プレゼント。私に連絡してきなさい♡"],
  },
} as const;

export type RandomRewardKey = "insult" | "praise" | "brutal";
export type RewardRedemption = {
  id: number;
  reward_key: string;
  reward_name: string;
  points_spent: number;
  reward_content: string | null;
  file_uri: string | null;
  redeemed_at: string;
};

const stgBonus = process.env.EXPO_PUBLIC_APP_ENV === "stg" ? 99999 : 0;

export const pointRepository = {
  award(sourceKey: string, points: number, description: string) {
    const result = execute(
      "INSERT OR IGNORE INTO point_transactions(source_key, points, description, created_at) VALUES(?, ?, ?, ?)",
      [sourceKey, points, description, toDateTimeKey()],
    );
    return result.changes > 0;
  },
};

export const rewardRepository = {
  balance() {
    const activityPoints =
      queryOne<{ total: number }>(
        "SELECT COALESCE(SUM(points), 0) AS total FROM point_transactions",
      )?.total ?? 0;
    const spent =
      queryOne<{ total: number }>(
        "SELECT COALESCE(SUM(points_spent), 0) AS total FROM reward_redemptions",
      )?.total ?? 0;
    const earned = activityPoints + stgBonus;
    return { earned, spent, available: Math.max(0, earned - spent), stgBonus };
  },

  acquired() {
    return query<RewardRedemption>(
      "SELECT * FROM reward_redemptions ORDER BY id DESC",
    );
  },

  remaining(key: RandomRewardKey) {
    const reward = rewardCatalog[key];
    const acquired = new Set(
      query<{ reward_content: string | null }>(
        "SELECT reward_content FROM reward_redemptions WHERE reward_key=?",
        [key],
      )
        .map((item) => item.reward_content)
        .filter(Boolean),
    );
    return reward.contents.filter((content) => !acquired.has(content));
  },

  redeemRandom(key: RandomRewardKey) {
    const reward = rewardCatalog[key];
    const choices = this.remaining(key);
    if (choices.length === 0) return null;
    const content = choices[Math.floor(Math.random() * choices.length)];
    let redeemed = false;
    transaction(() => {
      if (this.balance().available < reward.cost) return;
      execute(
        "INSERT INTO reward_redemptions(reward_key, reward_name, points_spent, reward_content, redeemed_at) VALUES(?, ?, ?, ?, ?)",
        [reward.key, reward.name, reward.cost, content, toDateTimeKey()],
      );
      redeemed = true;
    });
    return redeemed ? content : null;
  },

  redeemVideo(name: string) {
    const reward = rewardCatalog.video;
    let redeemed = false;
    transaction(() => {
      const existing = queryOne<{ count: number }>(
        "SELECT COUNT(*) AS count FROM reward_redemptions WHERE reward_key='video' AND reward_content=?",
        [name],
      )?.count ?? 0;
      if (existing > 0) return;
      if (this.balance().available < reward.cost) return;
      execute(
        "INSERT INTO reward_redemptions(reward_key, reward_name, points_spent, reward_content, redeemed_at) VALUES('video', ?, ?, ?, ?)",
        [reward.name, reward.cost, name, toDateTimeKey()],
      );
      redeemed = true;
    });
    return redeemed;
  },

  redeemSecret() {
    const reward = rewardCatalog.secret;
    let redeemed = false;
    transaction(() => {
      if (this.balance().available < reward.cost) return;
      execute(
        "INSERT INTO reward_redemptions(reward_key, reward_name, points_spent, reward_content, redeemed_at) VALUES('secret', ?, ?, ?, ?)",
        [reward.name, reward.cost, reward.contents[0], toDateTimeKey()],
      );
      redeemed = true;
    });
    return redeemed ? reward.contents[0] : null;
  },
};
