# すごろく画像の配置先

画像ファイルはこのフォルダ (`habit-diary-timer-mobile/assets/sugoroku/`) に置きます。設定するファイルは [images.ts](../../src/features/sugoroku/images.ts) です。配置済みのJPEG画像56枚を、全55枠へ設定しています。スタートだけ2枚のマップを表示します。

## 現在の割り当て

| 表示する場所 | 設定するID | ファイル名 |
|---|---|---|
| スタート | `start` | `Map1.jpg` → `Map2.jpg` |
| マイナスゾーン | `-6`〜`-1` | `No.-6.jpg`〜`No.-1.jpg` |
| 通常マス | `1`〜`40` | `No.1.jpg`〜`No.40.jpg`（下記3マスを除く） |
| 強制停止マス | `7`・`14`・`21` | `No.7_kyouseistop.jpg`・`No.14_kyouseistop.jpg`・`No.21_kyouseistop.jpg` |
| 延長コースのストップ1〜3 | `stop-1`〜`stop-3` | `kyouseistop1.jpg`〜`kyouseistop3.jpg` |
| 延長コースのストップ4 | `stop-4` | `kyouseiidou4.jpg` |
| ゴール①・ゴール② | `goal-1`・`goal-2` | `Map1_GOAL.jpg`・`Map2_GOAL.jpg` |
| リタイアイベント | `retire` | `kyouseiidou.jpg` |
| ペナルティ | `penalty` | `batuge-mu.jpg` |

25の強制停止マスは `"25"` に `No.25.jpg` を設定しています。`stop-1`〜`stop-4` は延長コースの途中に挿入される別のマスです。

スタートの画像は左右へのスワイプ、または前後の切り替えボタンで選べます。画像をタップすると、選択中のマップを全画面で拡大します。「閉じる」でゲーム画面へ戻っても選択は維持します。各マスの画像も縦横比を維持して表示し、タップで全画面表示できます。

## 画像を差し替える場合

各マスは `images.ts` の `SUGOROKU_IMAGES` で設定します。例えば1マス目の現在の設定は次のとおりです。

```ts
"1": require("../../../assets/sugoroku/No.1.jpg"),
```

スタートの2枚は同じファイルの `SUGOROKU_START_IMAGES` に、`Map1.jpg`、`Map2.jpg` の順で設定しています。`SUGOROKU_IMAGES.start` は先頭の画像を使用します。

同じファイル名で画像を差し替える場合は設定変更は不要です。別のファイル名や拡張子を使う場合は、実際に置いたファイルに合わせて `require()` のパスを変更してください。他の `assets` フォルダにある画像を指定することもできます。パスは `images.ts` からの相対パスを文字列で直接書きます。画像を設定しないマスは `undefined` にすると仮表示になります。読み込み失敗時も仮表示になります。

画像はアプリに同梱されます。配布済みのアプリへ反映するには再ビルドし、WEB版は再エクスポートしてください。画像をフォルダへ置くだけでは表示は変わりません。画像の内容でゲームのルールが変わることはなく、ルールは `src/features/sugoroku/game.ts` で管理します。
