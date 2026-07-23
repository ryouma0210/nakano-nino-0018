export type ConfigurableMessage = {
  text: string;
  withName: boolean;  /** true: 設定名を先頭に付ける、false: 名前を付けない */
};

// 先頭に名前付ける
export const namedMessage = (text: string): ConfigurableMessage => ({
  text,
  withName: true,
});
// 名前付けるない
export const plainMessage = (text: string): ConfigurableMessage => ({
  text,
  withName: false,
});

export function formatConfiguredMessage(
  message: ConfigurableMessage,
  playerName: string,
) {
  return message.withName && playerName
    ? `${playerName}。${message.text}`
    : message.text;
}

type RoomMessages = {
  lines?: ConfigurableMessage[];
  contractLines?: ConfigurableMessage[];
};

export const roomMessages: Record<string, RoomMessages> = {
  // ホーム画面：app/(tabs)/index.tsx
  home: {
    lines: [
      namedMessage("おかえりなさい。今日はどの部屋へ行く？"),
      namedMessage("あなたの調教記録は、私がここで見守っているわ。"),
    ],
    contractLines: [
      plainMessage("おい、マゾ犬。奴隷用の首輪は付けてきたのかしら？"),
      plainMessage("まだ何もしていないのに、なんで興奮しているのかしら。"),
      namedMessage("部屋に移動する際は、四つん這いで移動しなさい。"),
    ],
  },
  // 記録・管理メニュー：app/(tabs)/menu.tsx
  menu: {
    lines: [
      plainMessage("記録の確認や設定は、ここから選びなさい。"),
      plainMessage("ご褒美の交換も忘れないでね。"),
    ],
    contractLines: [
      plainMessage("奴隷としての記録もご褒美も、全部ここで私に管理されるのよ♡")
    ],
  },
  // 準備部屋：app/(tabs)/preparation.tsx
  preparation: {
    lines: [
      namedMessage("今日の準備を一つずつ確認して。"),
      namedMessage("必須項目を全部済ませたら、最後の挨拶よ。"),
    ],
    contractLines: [
      plainMessage("契約した奴隷なら、首輪を着けて土下座で私を待つのが当然よね♡"),
      namedMessage("貞操帯辛い？何もしていないのに、中でパンパンね♡"),
    ],
  },
  // 敗北部屋：app/(tabs)/defeat.tsx（契約者限定）
  defeat: {
    contractLines: [
      namedMessage("この部屋は、弱いマゾ/負けたがりのマゾが最初に入る部屋へよ♡アンタもそうなのかしら？"),
      plainMessage("アンタ、負けに来たんでしょ？全部にチェックして、今日も完全敗北を認めなさい♡"),
      plainMessage("乳首カリに合わせて、チンピクしなさい♡"),
      plainMessage("カリ♡ビクン♡カリカリ♡ビクンビクン♡カリカリカリカリカリカリ♡ほら、チンピクしろ♡"),
      namedMessage("私に見下ろされるために来たの？本当に従順なマゾ犬ね♡"),
    ],
  },
  // 調教部屋：app/(tabs)/habits.tsx
  training: {
    lines: [
      namedMessage("今日の課題を確認するわ。続けるものを選んで。"),
      plainMessage("達成した課題は、忘れずに記録して。"),
      plainMessage("積み重ねた日数は、あなたが続けた証拠よ。"),
    ],
    contractLines: [
      namedMessage("私の奴隷になった以上、許可するまで勝手に逝っちゃダメよ♡")
    ],
  },
  // お仕置き部屋：app/(tabs)/timer.tsx
  punishment: {
    lines: [
      namedMessage("時間は自分で決めなさい。"),
      plainMessage("スリッパがあるならそれを使って叩きなさい♡"),
      plainMessage("黒いスペードがピンクの丸へ到達したら、表示された場所へビンタよ。"),
    ],
    contractLines: [
      plainMessage("ディルドがあるならそれを使って叩きなさい♡"),
      plainMessage("契約済みの奴隷なら、最低30分以上。お仕置きから逃げずに最後まで受けなさい♡"),
      plainMessage("貞操帯着用している人は、金玉ビンタのみよ♡"),
    ],
  },
  // 射精管理部屋：app/(tabs)/management.tsx
  management: {
    lines: [
      namedMessage("今日はどちらの管理方法にする？"),
      namedMessage("選んだ方法に合わせて、指示を変えてあげる。"),
    ],
    contractLines: [
      plainMessage("契約した奴隷なんだから、もちろん貞操帯付けて受けるわよね♡")
    ],
  },
  // 射精管理の実行画面：src/components/ManagementRoom.tsx
  managementSession: {
    lines: [
      plainMessage("まずサイコロで管理期間を決めるわ。"),
      plainMessage("最終日までは、毎日違う指示を確認して。"),
    ],
    contractLines: [
      plainMessage("契約した奴隷の射精は私の管理下よ。最終日まで勝手なことは禁止♡"),
    ],
  },
  // 本日の命令部屋：app/(tabs)/orders.tsx
  orders: {
    lines: [
      plainMessage("今日の命令は一度だけ抽選できるわ。"),
      namedMessage("決まったら、最後まで実行して。"),
    ],
    contractLines: [
      plainMessage("契約したんだから、どんな命令でも絶対服従でしょ。返事は『はい、二ノ様』でしょ♡")
    ],
  },
  // 調教日記部屋：app/(tabs)/records.tsx
  records: {
    lines: [
      namedMessage("今日あったことを、ここに残して。"),
      plainMessage("気持ちも評価も、正直に書けばいいわ。"),
      namedMessage("過去の記録は、いつでも読み返せるわよ。"),
    ],
    contractLines: [
      plainMessage("奴隷として何をされたか、恥ずかしいことまで全部正直に残しなさい♡")
    ],
  },
  // ファイル格納部屋：app/(tabs)/files.tsx
  files: {
    lines: [
      namedMessage("残しておきたいファイルは、ここへ格納して。"),
      plainMessage("不要になったものは選んで削除できるわ。"),
    ],
    contractLines: [
      plainMessage("奴隷好みのオカズを全部ここに入れなさい♡私に弱点晒せ♡")
    ],
  },
  // ご褒美部屋：app/(tabs)/rewards.tsx
  rewards: {
    lines: [
      plainMessage("命令を達成した分だけポイントをあげる。"),
      namedMessage("貯めたポイントで、好きなご褒美を選びなさい♡"),
    ],
    contractLines: [
      plainMessage("契約した奴隷にも、ご主人様からのご褒美は必要よね♡")
    ],
  },
  // コレクション部屋：app/(tabs)/collection.tsx
  collection: {
    lines: [
      namedMessage("獲得したご褒美と称号を、ここへ集めておいたわ。"),
      plainMessage("動画もコメントも、好きなときに見返しなさい♡"),
    ],
    contractLines: [
      plainMessage("契約内容もここに保管してあるわ。忘れたとは言わせないわよ♡")
    ],
  },
  // 称号・実績画面：app/(tabs)/achievements.tsx
  achievements: {
    lines: [
      namedMessage("積み重ねた結果を見せてあげる。"),
      plainMessage("未獲得の称号も、条件を満たせば解放よ。"),
    ],
    contractLines: [
      plainMessage("契約後の実績は、あなたがどれだけ従順な奴隷かを示す証拠よ♡")
    ],
  },
  // 設定画面：app/(tabs)/settings.tsx
  settings: {
    lines: [
      namedMessage("保存量の確認や初期化は、ここで行えるわ。"),
      namedMessage("初期化したデータは戻せないから、よく確認して。"),
    ],
    contractLines: [
      plainMessage("奴隷として積み上げた記録、勝手に消す前によく考えなさい。")
    ],
  },
  // 契約部屋（契約成立前）：app/(tabs)/contract.tsx
  contract: {
    lines: [
      namedMessage("二ノ様の奴隷になりますか？"),
      plainMessage("一度奴隷になると、契約を解除できません。"),
    ],
  },
  // 週間報告部屋：app/(tabs)/report.tsx
  report: {
    lines: [
      namedMessage("本日から今月までの記録を、私がまとめて評価してあげる。")
    ],
    contractLines: [
      plainMessage("奴隷としての働きは、数字にも残るのよ。毎週きちんと報告を確認しなさい♡")
    ],
  },
};

// 調教部屋の実行中コメント：src/components/TrainingVideo.tsx
export const trainingStageMessages = {
  warmup: [
    namedMessage("しっかりリズムを守りなさい♡"),
    plainMessage("四つん這いで受けると気持ちいいわよ♡"),
    plainMessage("姿勢を崩さないで♡ゆっくり丁寧に続けなさい♡"),
    namedMessage("私に集中しなさい♡"),
  ],
  training: [
    namedMessage("もっとマゾらしくアヘアへしながら腰振りなさい♡"),
    plainMessage("根本から先端まで♡カリ首引っ掛けて♡"),
    plainMessage("何、手緩めているのかしら？もっと強く握りしめて♡"),
    plainMessage("ばぁ～か♡あぁ～ほ♡ざぁ～こ♡まぁ～ぞ♡変態マゾ死ね♡"),
    plainMessage("聞こえないわよ？もっと『二ノ様好き♡』って連呼しなさい♡"),
    plainMessage("なに？もう逝きそうなの？我慢しろ♡変態♡"),
    plainMessage("ダ～メ♡まだ我慢♡『乳首』もいじりなさい♡カリカリカリ…♡"),
    namedMessage("ふふ♡情けない顔ね♡もっと舌出して、白目向いて『アヘ顔』晒しなさい♡"),
    plainMessage("我慢汁止まらないわね♡指ですくって舐めたり、乳首にヌリヌリしなさい♡"),
    namedMessage("もっと一定の速さで腰を振って、私のリズムについてきなさい♡"),
    namedMessage("手を止める許可なんて出してないわよ♡そのまま続けなさい♡"),
    plainMessage("先端ばかり触ってないで♡根元からゆっくり扱いなさい♡"),
    namedMessage("もっと声を出して♡誰の命令で動いているのか言ってみなさい♡"),
    namedMessage("その情けない顔、ちゃんと私に見せなさい♡隠したらダメよ♡"),
    plainMessage("右手が疲れたなら左手に替えなさい♡休憩とは言ってないわ♡"),
    plainMessage("速く♡ゆっくり♡また速く♡私の言葉どおりに切り替えなさい♡"),
    plainMessage("もう震えているの？まだ終わりじゃないわ♡しっかり耐えなさい♡"),
    namedMessage("もっと腰を前に出して♡一回ずつ丁寧に数えながら続けなさい♡"),
    namedMessage("目を逸らさないで♡私を見ながら『もっとください』って懇願しなさい♡"),
  ],
  intensive: [
    plainMessage("カウントダウンしてあげる♡"),
    plainMessage("５…♡"),
    plainMessage("４…♡"),
    plainMessage("３…♡"),
    plainMessage("２…♡"),
    plainMessage("１～…♡"),
    plainMessage("１～…♡♡♡"),
    plainMessage("１～…♡♡♡♡♡"),
    plainMessage("ゼ～…♡w"),
    plainMessage("オ・ア・ズ・ケ♡寸・止・め♡"),
  ],
  finishing: [
    plainMessage("０♡ゼロ♡ほら、出せよ♡漏らせ♡逝け♡"),
    plainMessage("びゅるるる～♡びゅるびゅる♡"),
  ],
} as const;

// お仕置き部屋の実行中コメント：app/(tabs)/timer.tsx
export const punishmentSessionMessages = [
  namedMessage("リズムが変わっても逃げちゃダメよ♡"),
  plainMessage("痛い？辛い？知らないわ、もっと強くやれよ。変態"),
  plainMessage("何、緩めているの？ちゃんとリズム通りにしなさい♡"),
  plainMessage("死ね♡死ね♡死ね♡死ね♡死ね♡死ね♡死ね♡死ね♡"),
  plainMessage("精子死ね♡チンポ死ね♡金玉死ね♡マゾ死ね♡"),
  namedMessage("まさかこんなのでお漏らししないわよね♡"),
  plainMessage("ギブアップしたい？ダメに決まっているでしょｗ最後まで耐えてみなさい♡"),
  plainMessage("もっと正確に強く狙いなさい♡"),
  namedMessage("痛がるだけじゃダメ。きちんと回数を声に出して数えなさい♡"),
  plainMessage("私が終わりと言うまで、お仕置きは続くわよ♡"),
] as const;

// 準備部屋の動画ループコメント：app/(tabs)/preparation.tsx
export const preparationLoopMessages = [
  plainMessage("ふぅ～～～～～～～♡"),
  namedMessage("ほら、早く勃起させなさい♡"),
  plainMessage("ふふ♡ビクビクさせてチョロすぎ♡"),
  namedMessage("まだ足りないの？欲張りさんね♡"),
  plainMessage("準備できるまで、何度でもしてあげる♡"),
  namedMessage("勃起しろ♡チンピクしろ♡"),
] as const;

// 準備部屋のチェック項目：app/(tabs)/preparation.tsx
export const preparationChecklistMessages = [
  { text: "全裸の状態であること。", required: true },
  { text: "土下座の状態であること。", required: true },
  { text: "お貢ぎ用意していること。", required: true },
  { text: "発情状態であること。", required: true },
  { text: "3日間以上オナ禁したこと。", required: false },
  { text: "首輪（犬用でも可）を装着していること。", required: false },
  { text: "貞操帯を装着していること。", required: false },
] as const;

// 敗北部屋の強制チェック項目：app/(tabs)/defeat.tsx
export const defeatChecklistMessages = [
  "準備部屋で全てのチェック項目を完了すること。",
  "調教を5回受けること♡",
  "お仕置き部屋で60分以上受けること♡",
  "私に直接お貢ぎすること♡",
] as const;

// ご褒美部屋で交換し、コレクション部屋で閲覧する罵倒コメント：
// app/(tabs)/rewards.tsx、app/(tabs)/collection.tsx
export const rewardInsultMessages = [
  plainMessage("アンタ、手の施しようがない変態だわ♡"),
  plainMessage("ざぁこ♡今日も二ノ様に見下されに来たの？♡"),
  plainMessage("その程度で満足してるなんて、本当にお手軽なマゾね♡"),
  plainMessage("情けない顔♡鏡でちゃんと見ておきなさい♡"),
  plainMessage("命令がないと何もできないの？かわいそうな奴隷ね♡"),
  plainMessage("ほら、情けなく腰振って、必死にオネダリしてみなさい♡"),
  plainMessage("二ノ様に褒めてもらえると思った？甘すぎ♡"),
  plainMessage("アンタの弱点、隠せているつもりなのかしら♡バレバレよ♡"),
  plainMessage("今日も私の言葉だけで喜んでるのね♡"),
  plainMessage("マゾらしく、もっと情けなく鳴きなさい♡"),
  plainMessage("これでご褒美なんて、本当に安上がりな子ね♡"),
] as const;

// ご褒美部屋で交換し、コレクション部屋で閲覧する称賛コメント：
// app/(tabs)/rewards.tsx、app/(tabs)/collection.tsx
export const rewardPraiseMessages = [
  namedMessage("よく頑張ったわね。今日は特別に褒めてあげる♡"),
  namedMessage("アンタのこと好きよ・・・？♡もう二度と言わないから感謝しないさいよね…///"),
  namedMessage("好き好き♡大好き♡愛してるわ♡"),
  namedMessage("最後までやり切れて偉いわ。ちゃんと見ていたわよ♡"),
  namedMessage("積み重ねた努力、二ノ様はちゃんと知っているわ♡"),
  namedMessage("今日は合格。少しだけ胸を張っていいわよ♡"),
  namedMessage("昨日より立派になったわね。いい子よ♡"),
  namedMessage("逃げずに向き合えたのね。本当によくできました♡"),
  namedMessage("私の期待に応えたご褒美よ。偉い偉い♡"),
  namedMessage("その調子で続けなさい。もっと好きになってあげる♡"),
  namedMessage("頑張ったお兄さんには、優しくしてあげる♡"),
  namedMessage("今日のアンタはとても素敵だったわよ♡"),
] as const;

// ご褒美部屋で交換し、コレクション部屋で閲覧する鬼畜命令：
// app/(tabs)/rewards.tsx、app/(tabs)/collection.tsx
export const rewardBrutalOrderMessages = [
  plainMessage("全裸で首輪を着けて土下座し、二ノ様への絶対服従を200回誓いなさい。途中で姿勢を崩したら最初からやり直しよ。"),
  plainMessage("寸止めを20回。1回ごとに正座で3分待機し、『許可なく射精しません』と10回言いなさい。"),
  plainMessage("四つん這いで腰を500回振ったあと、土下座を30回。最後まで射精は禁止よ。"),
  plainMessage("60分間、強い刺激1分と完全停止2分を交互に繰り返しなさい。射精しそうになったら停止時間を5分追加よ。"),
  plainMessage("鏡に情けない姿を映しながら寸止めを15回。毎回、自分が二ノ様の奴隷だと声に出しなさい。"),
  plainMessage("首輪を着けたまま膝立ちで30分待機。5分ごとに『もっと厳しくしてください』と10回お願いしなさい。"),
  plainMessage("両乳首に選択バサミを装着し、左右交互に45分刺激しなさい。途中で手を止めたら、その時点から15分追加よ。射精は禁止。"),
  plainMessage("土下座の姿勢を保ったまま『私は二ノ様の所有物です』と100回言い、終わったら正座で20分反省しなさい。"),
  plainMessage("亀頭刺激だけで60分耐えなさい。絶対に射精せず、10分ごとに現在の我慢度を声に出して報告すること。"),
  plainMessage("寸止め10回、腰振り300回、土下座30回を1セットとして合計3セット。すべて終えてから1000文字以上の反省文を書きなさい。"),
] as const;

// ご褒美部屋の秘密交換コメント：app/(tabs)/rewards.tsx
export const rewardSecretMessages = [
  namedMessage("調教1回無料プレゼント。私に連絡してきなさい♡"),
] as const;

export function findRewardMessage(key: string, text: string) {
  const groups: Record<string, readonly ConfigurableMessage[]> = {
    insult: rewardInsultMessages,
    praise: rewardPraiseMessages,
    brutal: rewardBrutalOrderMessages,
    secret: rewardSecretMessages,
  };
  return groups[key]?.find((message) => message.text === text);
}

// 射精管理部屋の通常指示：src/repositories/roomRepository.ts、src/components/ManagementRoom.tsx
// 既存指定により初期状態はすべて名前なし
export const managementInstructionMessages = {
  release: [
    plainMessage("足ピンしながら寸止め3回"),
    plainMessage("四つん這いの状態で寸止め3回"),
    plainMessage("ゴミ箱に向けて寸止め3回"),
    plainMessage("土下座の状態で寸止め5回"),
    plainMessage("ヨダレを大量に付けた状態で寸止め10回"),
    plainMessage("好きな態勢の状態で寸止め5回"),
    plainMessage("チングリ返しで寸止め3回"),
  ],
  chastity: [
    plainMessage("お仕置き30分＆アナル責め30分"),
    plainMessage("お仕置き40分＆両乳首洗濯バサミ着用"),
    plainMessage("お仕置き30分＆貞操帯越しにシコシコ30分"),
    plainMessage("お仕置き30分＆乳首責めしながらチンピク30分"),
    plainMessage("お仕置き30分＆金玉潰し10分"),
    plainMessage("お仕置き60分"),
    plainMessage("お仕置き60分＆乳首責めしながらチンピク60分"),
  ],
} as const;

// 射精管理部屋の最終日指示：src/repositories/roomRepository.ts、src/components/ManagementRoom.tsx
// 既存指定により初期状態はすべて名前なし
export const managementFinalDayMessages = {
  release: [
    plainMessage("本日は射精日よ。土下座の姿勢で寸止めを3回してから射精しなさい♡"),
    plainMessage("本日は射精日よ。四つん這いで寸止めを5回してから射精しなさい♡"),
    plainMessage("本日は射精日よ。鏡の前でアヘ顔で射精しなさい♡"),
    plainMessage("本日は射精日よ。乳首をいじめながら足ピンの状態で射精しなさい♡"),
  ],
  chastity: [
    plainMessage("本日は射精日よ。貞操帯を外し、寸止めを3回してから射精しなさい♡\n射精後は貞操帯を再度装着すること。♡"),
    plainMessage("本日は射精日よ。貞操帯を外して四つん這いになり、最後に射精しなさい♡\n射精後は貞操帯を再度装着すること。♡"),
    plainMessage("本日は射精日よ。貞操帯を外して許可をお願いし、寸止め後に射精しなさい\n射精後は貞操帯を再度装着すること。♡"),
    plainMessage("本日は射精日よ。貞操帯付けたまま、射精しなさい。電マでもアナルでもなんでもいいわよ♡\nこれで射精できたら永久に貞操帯付けたままでいいわね♡"),
  ],
} as const;

export function findManagementMessage(text: string) {
  const messages = [
    ...managementInstructionMessages.release,
    ...managementInstructionMessages.chastity,
    ...managementFinalDayMessages.release,
    ...managementFinalDayMessages.chastity,
  ];
  return messages.find((message) => message.text === text);
}

// コレクション部屋の称号・実績：app/(tabs)/collection.tsx
export const achievementMessages = {
  training: [
    { name: "調教入門初級", count: 1, condition: "調教を累計1回完了" },
    { name: "調教入門中級", count: 30, condition: "調教を累計30回完了" },
    { name: "調教入門上級", count: 100, condition: "調教を累計100回完了" },
    { name: "調教入門マゾ級", count: 1000, condition: "調教を累計1,000回完了" },
  ],
  punishment: [
    { name: "お仕置き耐性初級", minutes: 30, condition: "お仕置き累計30分" },
    { name: "お仕置き耐性中級", minutes: 500, condition: "お仕置き累計500分" },
    { name: "お仕置き耐性上級", minutes: 1000, condition: "お仕置き累計1,000分" },
    { name: "お仕置き耐性マゾ級", minutes: 100000, condition: "お仕置き累計100,000分" },
  ],
  management: [
    { name: "管理生活初級", days: 7, condition: "射精管理累計7日" },
    { name: "管理生活中級", days: 30, condition: "射精管理累計30日" },
    { name: "管理生活上級", days: 100, condition: "射精管理累計100日" },
    { name: "管理生活マゾ級", days: 1000, condition: "射精管理累計1,000日" },
  ],
  contract: [
    { name: "二ノ様との契約", days: 1, condition: "契約部屋で契約を成立" },
    { name: "服従の一週間", days: 7, condition: "契約成立から7日経過" },
    { name: "従順な奴隷", days: 30, condition: "契約成立から30日経過" },
    { name: "優秀な奴隷", days: 100, condition: "契約成立から100日経過" },
    { name: "永遠の契約者", days: 1000, condition: "契約成立から1,000日経過" },
  ],
} as const;

// 本日の命令部屋の抽選指示：app/(tabs)/orders.tsx、src/services/gameRoomService.ts
// 指示文のため初期状態はすべて名前なし
export const dailyOrderMessages = [
  plainMessage("首輪を着けて、鏡の前で『二ノ様の命令に従います』と10回言いなさい。"),
  plainMessage("土下座の姿勢を3分間保ちなさい。"),
  plainMessage("四つん這いの姿勢で寸止めを3回しなさい。"),
  plainMessage("足を伸ばした姿勢で寸止めを3回しなさい。"),
  plainMessage("正座して、今日受けたい命令を3つ書き出しなさい。"),
  plainMessage("今日は二ノ様の許可なしに射精禁止よ。"),
  plainMessage("首輪を着けたまま30分間過ごしなさい。"),
  plainMessage("土下座の姿勢で寸止めを5回しなさい。"),
  plainMessage("ヨダレを垂らした状態で寸止めを5回しなさい。"),
  plainMessage("鏡を見ながら『私は二ノ様の奴隷です』と20回言いなさい。"),
  plainMessage("乳首を左右交互に5分間刺激しなさい。"),
  plainMessage("ゆっくり100回数えながら刺激し、射精せずに止めなさい。"),
  plainMessage("四つん這いのまま腰を100回振りなさい。"),
  plainMessage("土下座を10回して、毎回『お願いします』と言いなさい。"),
  plainMessage("今日の服従度を5段階で自己評価し、理由を日記に書きなさい。"),
  plainMessage("下着を脱いで正座し、5分間待機しなさい。"),
  plainMessage("寸止めを1回するたびに『二ノ様好き』と5回言い、合計3セット行いなさい。"),
  plainMessage("両手を後ろに組み、膝立ちの姿勢を3分間保ちなさい。"),
  plainMessage("亀頭刺激を30秒、休憩10秒の間隔で10セット行いなさい。"),
  plainMessage("首輪を着けて土下座し、二ノ様への誓いを声に出して読みなさい。"),
  plainMessage("亀頭刺激を10分間耐え、最後まで射精せずに終えなさい。"),
  plainMessage("寸止めを3回したあと、正座して5分間反省しなさい。"),
  plainMessage("四つん這いで寸止めを行い、『もっと命令してください』と10回言いなさい。"),
  plainMessage("鏡の前で自分の服従姿勢を確認し、最もきれいな土下座を10回しなさい。"),
  plainMessage("乳首を刺激しながら、腰を50回振りなさい。"),
  plainMessage("寸止めを5回行い、休憩30秒の間隔でやりなさい。"),
  plainMessage("命令中は『やめたい』ではなく『もっとください』と言いなさい。"),
  plainMessage("今日の命令を終えた感想と次回の目標を調教日記に残しなさい。"),
] as const;

export function findDailyOrderMessage(text: string) {
  return dailyOrderMessages.find((message) => message.text === text);
}
