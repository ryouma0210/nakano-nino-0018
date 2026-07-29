export type NinoOutfit = {
  key: string;
  name: string;
  unlock: string;
  cost: number;
  source: number;
  video?: number;
  lines: string[];
};

export const ninoOutfits: NinoOutfit[] = [
  {
    key: "default",
    name: "通常衣装",
    unlock: "初期衣装",
    cost: 0,
    source: require("../../assets/characters/home-nino.png"),
    video: require("../../assets/videos/nino-room/home-nino_01.mp4"),
    lines: [
      "今日はいつもの私よ。落ち着くでしょ？",
      "この姿の私に戻ってくるなんて、やっぱり基本が好きなのね。",
      "まずはここで深呼吸しなさい。私を見る準備はできた？",
    ],
  },
  {
    key: "school",
    name: "制服",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-school.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-school_01.mp4"),
    lines: [
      "制服姿の私に見下ろされたいの？ほんと素直ね。",
      "学生みたいに、ちゃんと返事しなさい。はい、二ノ様。",
      "この格好だと少し優しく見える？勘違いしないでね。",
    ],
  },
  {
    key: "maid",
    name: "メイド服",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-maid.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-maid_01.mp4"),
    lines: [
      "ご主人様？……違うわよ。アンタが私に仕えるの。",
      "メイド服だからって甘やかすと思った？残念、命令する側は私よ。",
      "掃除するなら、まずそのだらしない顔から綺麗にしなさい。",
    ],
  },
  {
    key: "nurse",
    name: "ナース服",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-nurse.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-nurse_01.mp4"),
    lines: [
      "診察してあげる。まずは情けないところ、全部見せなさい。",
      "脈が速いわね。私の格好だけでそんなに反応するの？",
      "処方箋は服従よ。毎日きちんと守りなさい。",
    ],
  },
  {
    key: "bunny",
    name: "バニー",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-bunny.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-bunny_01.mp4"),
    lines: [
      "この格好が好きなの？視線が分かりやすいわね。",
      "バニーの私に見惚れるのはいいけど、命令は聞き逃さないで。",
      "ほら、もっと嬉しそうな顔しなさい。せっかく見せてあげてるんだから。",
    ],
  },
  {
    key: "rubber",
    name: "ラバー",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-rubber.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-rubber_01.mp4"),
    lines: [
      "黒くて艶々なの、好きでしょ？目、逸らさないで。",
      "この質感に弱いのね。ほんと分かりやすいマゾ。",
      "緊張してる？いいわ、そのまま私に管理されなさい。",
    ],
  },
  {
    key: "pink-bondage",
    name: "ピンクゴシック",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-pink-gothic.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-pink-gothic_01.mp4"),
    lines: [
      "可愛い私も好き？でも中身は甘くないわよ。",
      "ピンクで油断した？可愛い顔で命令されるの、好きなんでしょ。",
      "今日は少しだけ甘くしてあげる。……態度が良ければね。",
    ],
  },
  {
    key: "black-dress",
    name: "黒ドレス",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-black-dress.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-black-dress_01.mp4"),
    lines: [
      "特別な私よ。ちゃんと跪いて見上げなさい。",
      "黒ドレスの私に会えるなんて、今日は運がいいわね。",
      "見惚れてないで、ちゃんと褒めなさい。聞いてあげるから。",
    ],
  },
  {
    key: "succubus",
    name: "サキュバス",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-succubus.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-succubus.mp4"),
    lines: [
      "サキュバス姿の私に見惚れてるの？分かりやすいわね。",
      "この羽と角、似合うでしょ。ちゃんと褒めなさい。",
      "油断したら、そのまま私のペースに飲まれるわよ♡",
    ],
  },
  {
    key: "white-dress",
    name: "白ドレス",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-white-dress.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-white-dress.mp4"),
    lines: [
      "白ドレスの私、少しは特別に見えるかしら。",
      "綺麗って言うなら、もっと丁寧に言いなさい。",
      "今日は優しく見える？ふふ、見た目だけで判断しないことね。",
    ],
  },
  {
    key: "china-dress",
    name: "チャイナドレス",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-china-dress.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-china-dress.mp4"),
    lines: [
      "チャイナドレスも悪くないでしょ。視線が正直ね。",
      "赤と黒の私に弱いの？覚えておいてあげる。",
      "見惚れるのはいいけど、命令は聞き逃さないでね。",
    ],
  },
  {
    key: "oiran",
    name: "和風花魁",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-oiran.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-oiran.mp4"),
    lines: [
      "和風の私も好き？今日は少しだけ艶やかにしてあげたわ。",
      "この衣装を見られるなんて、かなり贅沢なんだから。",
      "跪いて見上げなさい。花魁姿の私をちゃんと目に焼き付けて。",
    ],
  },
  {
    key: "new-year-kimono",
    name: "正月の着物",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-new-year-kimono.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-new-year-kimono.mp4"),
    lines: [
      "新年くらいは、少し華やかな私を見せてあげる。",
      "着物姿の私に見惚れてるの？今年も分かりやすいわね。",
      "初詣より先に、私へ挨拶しなさい。",
    ],
  },
  {
    key: "valentine",
    name: "バレンタイン",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-valentine.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-valentine.mp4"),
    lines: [
      "バレンタインの私、甘く見える？中身まで甘いとは限らないわよ。",
      "チョコより私を見てるじゃない。正直でよろしい。",
      "今日は少しだけ甘やかしてあげる。態度が良ければね。",
    ],
  },
  {
    key: "school-swimsuit",
    name: "スク水",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-school-swimsuit.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-school-swimsuit.mp4"),
    lines: [
      "この格好、そんなに気になるの？目線で全部分かるわ。",
      "泳ぐ前から溺れそうな顔してるわね。",
      "涼しい顔してるつもり？反応、隠せてないわよ。",
    ],
  },
  {
    key: "bikini",
    name: "ビキニ",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-bikini.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-bikini.mp4"),
    lines: [
      "ビキニの私に見惚れるのはいいけど、ぼーっとしすぎ。",
      "夏のご褒美よ。ちゃんと目に焼き付けなさい。",
      "似合うって？もっと上手に褒めなさい。",
    ],
  },
  {
    key: "yukata",
    name: "浴衣",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-yukata.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-yukata.mp4"),
    lines: [
      "浴衣姿の私、少しは風情があるでしょ。",
      "花火より私を見てなさい。そっちの方が大事よ。",
      "夏祭り気分で浮かれてるの？迷子にならないようについてきなさい。",
    ],
  },
  {
    key: "halloween",
    name: "ハロウィン",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-halloween.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-halloween.mp4"),
    lines: [
      "トリック・オア・トリート。もちろん私に従う方を選ぶわよね。",
      "悪戯されたい顔してるわね。分かりやすすぎ。",
      "今夜だけの私よ。ちゃんと楽しみなさい。",
    ],
  },
  {
    key: "santa",
    name: "サンタ",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-santa.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-santa.mp4"),
    lines: [
      "サンタ姿の私からご褒美？まずは良い子にしてからね。",
      "プレゼントが欲しいなら、ちゃんとお願いしなさい。",
      "寒い夜でも、私を見たら少しは温まるでしょ。",
    ],
  },
];

export const exchangeableNinoOutfits = ninoOutfits.filter(
  (outfit) => outfit.key !== "default",
);
