# nakano-nino-0018

## 習慣・記録・タイマー

React Native / Expo / TypeScript で作成した、スマートフォン向けのローカル完結アプリです。

アプリ本体:

```text
habit-diary-timer-mobile/
```

## 機能

- 習慣管理
- 日記・記録
- タイマー・リマインダー
- ローカル通知
- JSONエクスポート / インポート
- 端末内 SQLite 保存

## 方針

- API、バックエンド、MySQLは使用しません。
- データは端末内に保存します。
- 通信がない状態でも利用できます。
- AndroidはAPK、iPhoneはTestFlight配布を想定します。
- READMEはこの外側のファイルに集約し、各フォルダごとのREADMEは作成しません。

## ブランチ運用

| ブランチ | 用途 | APK作成 |
|---|---|---|
| `main` | ローカル開発用 | なし |
| `stg` | STG確認用 | push時にGitHub Actionsで作成 |
| `production` | 本番確認・配布用 | push時にGitHub Actionsで作成 |

通常は `main` で開発します。
STG確認する場合は `main` の内容を `stg` へ反映します。
本番確認・配布する場合は確認済みの内容を `production` へ反映します。

```powershell
git checkout main
git pull origin main
git checkout stg
git merge main
git push origin stg
```

`stg` または `production` にpushすると、GitHub Actionsの `Build Android APK` が実行されます。
`main` にpushしてもAPKは作成されません。

ビルドしたAPKはGitHub ActionsのArtifactに加えて、Google Driveへ自動保存します。

| ブランチ | Google Drive保存先 | APK名 |
|---|---|---|
| `stg` | `PC共有/Nino/STG` | `nino-stg.apk` |
| `production` | `PC共有/Nino/PRD` | `nino-prd.apk` |

各フォルダのAPKはビルドのたびに同じファイル名で上書きします。履歴用APKは作成しません。

### Google Drive自動アップロードの初期設定

GitHub ActionsからGoogle Driveへ接続するため、最初に一度だけrcloneの認証設定が必要です。

1. PCへ[rclone](https://rclone.org/downloads/)をインストールする。
2. `rclone config`を実行する。
3. Google Driveのremoteを`gdrive`という名前で作成する。
4. 作成された`rclone.conf`をBase64文字列へ変換する。
5. GitHubリポジトリの`Settings > Secrets and variables > Actions`を開く。
6. `GDRIVE_RCLONE_CONFIG_BASE64`というRepository secretへBase64文字列を登録する。

Windows PowerShellでBase64文字列をクリップボードへコピーする例:

```powershell
$configPath = "$env:APPDATA\rclone\rclone.conf"
$bytes = [System.IO.File]::ReadAllBytes($configPath)
[Convert]::ToBase64String($bytes) | Set-Clipboard
```

Secretが未設定の場合、APKビルド後のDriveアップロード工程はエラーになります。

## 使用技術

| 区分 | 内容 |
|---|---|
| Framework | Expo / React Native |
| Language | TypeScript |
| Routing | Expo Router |
| Form | React Hook Form / Zod |
| DB | expo-sqlite |
| Local storage | AsyncStorage |
| Notification | expo-notifications |
| Feedback | expo-haptics / expo-av |

## 画面

| 画面 | 内容 |
|---|---|
| ホーム | 今日の習慣、達成率、直近の日記、タイマー導線 |
| 習慣の部屋 | 習慣の登録、達成記録、連続日数、詳細表示 |
| 日記の部屋 | 記録の登録、検索、タグ、簡易カレンダー |
| 集中の部屋 | プリセット開始、一時停止、延長、履歴 |
| 準備の部屋 | 通知、表示、エクスポート、インポート、初期化 |

## 部屋テーマ

ホーム画面には各機能へ移動する部屋カードを表示します。
見た目はシミュレーションゲームのホーム画面を意識し、キャラパネル、会話ウィンドウ、ステータス、場所選択カードで構成します。
イベント進行バーは、今日の達成率に応じて現在地点が進む演出にしています。

| 部屋 | 用途 |
|---|---|
| 習慣の部屋 | 毎日の小さな行動を育てる |
| 日記の部屋 | 気持ちや出来事をしまう |
| 集中の部屋 | 作業と休憩を切り替える |
| 準備の部屋 | 通知や保存方法を整える |

## DB

SQLiteに次のテーブルを作成します。

| テーブル | 内容 |
|---|---|
| `habits` | 習慣マスタ |
| `habit_schedules` | 習慣予定 |
| `habit_records` | 習慣実績 |
| `journals` | 日記・記録 |
| `tags` | タグ |
| `journal_tags` | 日記とタグの紐づけ |
| `timer_presets` | タイマープリセット |
| `timer_histories` | タイマー履歴 |
| `app_settings` | アプリ設定 |

## ローカル手順

### 1. 必要なもの

- Node.js
- npm
- Git
- Expo Goを入れたスマートフォン

Androidエミュレータで確認する場合のみ、追加でAndroid Studio、Android SDK、Android Emulatorが必要です。

### 2. 初回セットアップ

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
npm install
```

### 3. ローカル起動

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
npx expo start -c
```

起動後、ターミナルに表示されるQRコードをExpo Goで読み込みます。

スマートフォン側で `Failed to download remote update` が表示される場合は、PCとスマートフォンの通信が届いていません。
その場合はトンネル接続で起動します。

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
npm run tunnel
```

トンネル接続用の `@expo/ngrok` は、このプロジェクトの開発依存に追加済みです。
もしインストール確認や `CommandError: Install @expo/ngrok@^4.1.0 and try again` が表示された場合は、次を実行してから同じコマンドを再実行します。

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
npm install
npm run tunnel
```

### 4. Expo Goで確認

1. PCとスマートフォンを同じWi-Fiに接続する。
2. `C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile` で `npx expo start -c` を実行する。
3. 表示されたQRコードをExpo Goで読み込む。
4. エラーが出た場合はExpo Goの `Log` または `View error log` を確認する。

### 5. Androidエミュレータで確認

Android Studio、Android SDK、Android Emulatorが必要です。

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
npm run android
```

Android SDKが見つからない場合は、`ANDROID_HOME` を設定します。

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
$env:ANDROID_HOME="C:\Users\ryoum\AppData\Local\Android\Sdk"
$env:Path="$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
npm run android
```

Android SDKを入れていない場合、`npm run android` は失敗します。
その場合は `npx expo start -c` とExpo Goで確認します。

### 6. iPhoneシミュレータで確認

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
npm run ios
```

iPhoneシミュレータはmacOS環境が必要です。WindowsではExpo Goで確認します。

### 7. ローカル検証

```powershell
npm run typecheck
npm run lint
```

## 本番運用手順

### 1. 本番前チェック

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
npm install
npm run typecheck
npm run lint
npx expo export --platform android --output-dir .expo-test
```

`.expo-test` は確認用の生成物です。Gitへコミットしません。

### 2. バージョン更新

配布前に `habit-diary-timer-mobile/app.json` の `version` を更新します。

```json
{
  "expo": {
    "version": "0.1.0"
  }
}
```

Android / iOS のビルド番号を運用する場合は、`android.versionCode` と `ios.buildNumber` も追加して管理します。

### 3. APK作成

APK確認は、GitHub Actionsで作成します。
`stg` または `production` にpushするとビルドが実行され、完了後にArtifactsからAPKをダウンロードできます。

GitHubでの操作:

1. GitHubのリポジトリを開く。
2. `Actions` を開く。
3. `Build Android APK` を選択する。
4. 自動実行されていない場合は `Run workflow` を押し、対象ブランチに `stg` または `production` を選ぶ。
5. 実行完了後、画面下部の `Artifacts` から `habit-diary-timer-mobile-stg-apk` または `habit-diary-timer-mobile-production-apk` をダウンロードする。
6. ZIPを展開し、`app-release.apk` をAndroid端末へ入れる。

このAPKはJavaScript bundleを同梱した単体起動可能なRelease APKです。
Android端末へ入れる場合は、端末側で提供元不明アプリのインストール許可が必要です。

GitHub Actionsは次のファイルで管理します。

```text
.github/workflows/build-android-apk.yml
```

EAS Buildを使う場合は、ExpoのビルドページからAPKを直接ダウンロードできます。

初回のみExpoアカウントへログインします。

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
npx eas login
```

APKを作成します。

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
npm run build:android-apk
```

完了するとターミナルにEASのビルドURLが表示されます。
そのURLを開き、`Download` からAPKをダウンロードします。

Android端末へ入れる方法:

- PCでAPKをダウンロードして、USBやGoogle Driveなどでスマートフォンへ送る
- スマートフォンでEASのビルドURLを開いてAPKを直接ダウンロードする
- GitHub ReleasesへAPKを添付して、そこからダウンロードする

GitHub Releasesへの添付は任意です。
配布先を固定したい場合や、バージョンごとのAPKを残したい場合に使います。

### 4. TestFlight

Apple Developer Program、App Store Connect、EASの設定後に実行します。

```powershell
npm run build:ios-testflight
```

TestFlight配布はApple Developer Programへの登録が必要です。

### 5. 配布後確認

- 初回起動できること
- 習慣を登録できること
- 習慣を達成できること
- 日記・記録を登録できること
- タイマーを開始、完了できること
- 通知権限を許可できること
- JSONエクスポートができること
- JSONインポートができること

### 6. データ運用

このアプリはローカル完結です。

- サーバー同期はありません。
- 端末を変更すると、データは自動移行されません。
- データ移行は設定画面のJSONエクスポート / インポートで行います。
- アプリ削除時は端末内データも削除されます。

### 7. 障害時の対応

- Expo Go確認時のエラーは `npx expo start -c` でキャッシュを消して再起動します。
- 端末内データが不整合になった場合は、設定画面から初期化します。
- 配布版で問題が出た場合は、修正版をビルドして再配布します。

## エクスポート / インポート

設定画面からJSONファイルを出力できます。

- 追加取込: 既存データを残して取り込み
- 置換取込: 既存データを削除して取り込み

## トラブルシュート

| 症状 | 確認 |
|---|---|
| 通知が出ない | 設定画面で通知権限を確認 |
| データが見えない | 設定画面で初期化後、再起動 |
| Expo Goでエラーになる | `C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile` で `npx expo start -c` を実行し、Expo Go側も再読み込み |
| `Failed to download remote update` | PCとスマートフォンが同じWi-Fiか確認。直らない場合は `npm install` 後に `npm run tunnel` で起動 |
| `package.json does not exist` | ルートではなく `habit-diary-timer-mobile` フォルダへ移動してから実行 |
| APKビルドに失敗 | `npx eas login` と `eas.json` を確認 |
| iOS配布に失敗 | Apple Developer Program と Bundle ID を確認 |

## 開発メモ

まずはローカル完結のMVPとして実装しています。
将来的にクラウド同期が必要になった場合も、DB層をリポジトリに分けているため、同期処理を追加しやすい構成です。

## キャラクター画像の制作メモ

準備部屋とお仕置き部屋のキャラクター画像は、OpenAIの内蔵画像生成機能を使用して制作しています。
参考画像をそのまま複製するのではなく、次の特徴を文章へ置き換えたオリジナルキャラクターとして新規生成しました。

- 成人女性のアニメ調キャラクター
- コーラルピンクのボブヘア
- 青い瞳
- 黒を中心とした暗い部屋
- 準備部屋はピンク、お仕置き部屋は黒の衣装
- 胸元や腰回りを覆う非露出の衣装
- ビジュアルノベルの会話画面で使用しやすい縦長構図
- 文字、ロゴ、ウォーターマークなし

生成後、両キャラクターの髪の左右へ黒いサテンリボンを追加しました。
準備部屋はピンク、お仕置き部屋は赤の縁取りを入れています。

### 準備部屋

準備部屋では、予定を確認する落ち着いた雰囲気にしています。

```text
成人女性のオリジナルアニメキャラクター。
コーラルピンクのボブヘア、青い瞳、落ち着いた微笑み。
全身を覆う光沢のあるローズピンクのハイネック衣装、手袋、ブーツ。
黒い革張りのソファへ座り、クリップボードとペンで予定を確認している。
背景は黒い棚、暖色の照明、整理されたケースがある準備用ラウンジ。
縦長2:3、全身、モバイル画面で切り抜きやすい余白を確保。
非性的、非暴力的。文字、ロゴ、ウォーターマークなし。
```

リボン追加時の編集指示:

```text
髪の左右、耳の後ろへ黒いサテンリボンを一つずつ追加する。
短いテールのある整った蝶結びで、縁へピンクのアクセントを入れる。
顔、髪型、ポーズ、衣装、クリップボード、背景、照明、構図は変更しない。
```

生成画像:

```text
habit-diary-timer-mobile/assets/characters/preparation-nino.png
```

### お仕置き部屋

お仕置き部屋では、黒と深紅を中心にした緊張感のある雰囲気にしています。

```text
成人女性のオリジナルアニメキャラクター。
コーラルピンクのボブヘア、青い瞳、自信のある表情。
襟元まで閉じた黒いレザー調ジャケット、黒いパンツ、長手袋、ロングブーツ。
小さく巻いた演出用の小道具を身体の横で持つ。暴力的な動作は行わない。
背景は黒い木製の壁、深紅のカーテン、控えめな赤い間接光がある暗い書斎。
縦長2:3、全身、モバイル画面で切り抜きやすい余白を確保。
非性的、非暴力的。文字、ロゴ、ウォーターマークなし。
```

リボン追加時の編集指示:

```text
髪の左右、耳の後ろへ黒いサテンリボンを一つずつ追加する。
短いテールのある整った蝶結びで、縁へ深い赤のアクセントを入れる。
顔、髪型、ポーズ、衣装、小道具、背景、照明、構図は変更しない。
```

生成画像:

```text
habit-diary-timer-mobile/assets/characters/punishment-nino.png
```

### アプリへの組み込み

キャラクター画像は、共通会話コンポーネントの `characterSource` へ渡しています。

```tsx
<RoomConversation
  characterSource={require("../../assets/characters/punishment-nino.png")}
  roomName="お仕置き部屋"
  lines={conversationLines}
/>
```

関連ファイル:

```text
habit-diary-timer-mobile/src/components/RoomConversation.tsx
habit-diary-timer-mobile/src/components/RoomScreen.tsx
habit-diary-timer-mobile/app/(tabs)/preparation.tsx
habit-diary-timer-mobile/app/(tabs)/timer.tsx
```

再生成すると顔、衣装の細部、背景、小物などは変化します。
同じキャラクターとして複数枚を追加する場合は、最初に生成した画像を編集対象またはキャラクター参照として渡し、変更する箇所以外を維持するよう明示します。
