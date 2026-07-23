# Nino Room Windows

Android版から切り離した、ElectronベースのWindows専用アプリです。

メッセージ・日付処理・契約ルールはルートの `shared/` を参照します。画像・動画・音声はモバイル版の `assets/` を原本とし、起動・ビルド前に自動同期します。同じ内容を両方で修正する必要はありません。

## 開発起動

```powershell
npm install
npm run dev
```

## Windows配布物の作成

```powershell
npm run build:windows
```

ZIP版とインストーラー版を生成します。ウィンドウ位置・サイズ・最大化状態・表示倍率はWindowsのユーザーデータ領域へ保存します。

## 操作

- `F11`: 全画面の切り替え
- `Ctrl + +`: 拡大
- `Ctrl + -`: 縮小
- `Ctrl + 0`: 100%へ戻す
- 表示倍率: 75%〜200%
