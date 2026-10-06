# 勃起我慢の素材

各フォルダの画像20枚・動画1本を `src/features/endurance/assets.ts` の `enduranceAssets` に登録済みです。①〜⑤はファイル名末尾の1・2・3・4の順に表示します。ファイル名を変更する場合は、拡張子・大文字小文字を含めて `require` の指定も合わせて変更してください。

| ゲーム | フォルダ | 必要な素材 |
| --- | --- | --- |
| ① | `game-1/` | `bokkigamann_1_1.jpeg`〜`bokkigamann_1_4.jpeg` |
| ② | `game-2/` | `bokkigamann_2_1.jpeg`〜`bokkigamann_2_4.jpeg` |
| ③ | `game-3/` | `bokkigamann_3_1.jpeg`〜`bokkigamann_3_4.jpeg` |
| ④ | `game-4/` | `bokkigamann_4_1.jpeg`〜`bokkigamann_4_4.jpeg` |
| ⑤ | `game-5/` | `bokkigamann_5_1.jpg`〜`bokkigamann_5_4.jpg`・初期状態は未公開 |
| ⑥ | `game-6/` | `○○我慢ゲーム⑥(ファイナル).mp4`・初期状態は未公開 |

画像の登録:

```ts
"game-1": [
  { id: "game-1-1", label: "1", kind: "image", source: require("../../../assets/endurance/game-1/bokkigamann_1_1.jpeg") },
  { id: "game-1-2", label: "2", kind: "image", source: require("../../../assets/endurance/game-1/bokkigamann_1_2.jpeg") },
  { id: "game-1-3", label: "3", kind: "image", source: require("../../../assets/endurance/game-1/bokkigamann_1_3.jpeg") },
  { id: "game-1-4", label: "4", kind: "image", source: require("../../../assets/endurance/game-1/bokkigamann_1_4.jpeg") },
],
```

動画の登録:

```ts
"game-6": [
  { id: "game-6-1", label: "1", kind: "video", source: require("../../../assets/endurance/game-6/○○我慢ゲーム⑥(ファイナル).mp4") },
],
```

⑤⑥は未解禁の間「勃起我慢⑤（未公開）」「勃起我慢⑥（未公開）」と表示します。正しい解除パスワードを一度入力すると、両方の解禁状態を端末に保存します。パスワード入力画面に特別会員室の案内を表示します。

「勃起我慢（格納ファイル）」ではアプリの「ファイル格納」で「勃起我慢用」を指定した画像・動画を使います。選んだ素材をゲーム開始時にランダムな順番にし、そのプレイ中は同じ順序を維持します。素材の重複表示はありません。この素材フォルダやソースコードの編集は不要です。同じ格納ファイルを他用途と共有できます。

①〜⑤・格納ファイルは各素材の1分タイマーを開始し、満了後にボタンか左スワイプで次へ進みます。自動送りはありません。「我慢失敗」は赤文字のボタンで、押した後は準備ができたら自分で3分タイマーを開始します。同じ素材のまま3分を終えると次へ進めます。白文字の「リタイア」はゲームを終了して履歴に保存します。⑥は動画を最後まで再生してから終了します。画面を離れた場合やアプリが背景に移った場合、タイマーは停止し、復帰後は明示的な再開が必要です。
