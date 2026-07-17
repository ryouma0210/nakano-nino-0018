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

## セットアップ

```powershell
cd C:\Users\ryoum\nakanoNino0018\habit-diary-timer-mobile
npm install
npm run start
```

キャッシュをクリアして起動:

```powershell
npx expo start -c
```

Androidで確認:

```powershell
npm run android
```

iPhoneで確認:

```powershell
npm run ios
```

## Expo Goで確認

1. `npm run start` または `npx expo start -c` を実行する。
2. 表示されたQRコードをExpo Goで読み込む。
3. エラーが出た場合はExpo Goの `Log` または `View error log` を確認する。

## APK作成

EAS CLIへログイン後に実行します。

```powershell
npx eas login
npm run build:android-apk
```

## TestFlight

Apple Developer Program、App Store Connect、EASの設定後に実行します。

```powershell
npm run build:ios-testflight
```

## エクスポート / インポート

設定画面からJSONファイルを出力できます。

- 追加取込: 既存データを残して取り込み
- 置換取込: 既存データを削除して取り込み

## トラブルシュート

| 症状 | 確認 |
|---|---|
| 通知が出ない | 設定画面で通知権限を確認 |
| データが見えない | 設定画面で初期化後、再起動 |
| Expo Goでエラーになる | `npx expo start -c` でキャッシュクリア |
| APKビルドに失敗 | `npx eas login` と `eas.json` を確認 |
| iOS配布に失敗 | Apple Developer Program と Bundle ID を確認 |

## 開発メモ

まずはローカル完結のMVPとして実装しています。
将来的にクラウド同期が必要になった場合も、DB層をリポジトリに分けているため、同期処理を追加しやすい構成です。
