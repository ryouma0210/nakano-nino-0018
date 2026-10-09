# オセロの誘惑マス用画像

このフォルダは、アプリに同梱するオセロの誘惑マス用画像の置き場です。
このフォルダの画像 10 枚（JPEG 6 枚・WebP 4 枚）を画像カタログへ登録しています。空の場合はセリフだけを表示し、「閉じる」で対局を続けられます。

## 追加方法

1. 使用する PNG・JPEG・WebP 画像をこのフォルダに配置します。例: `temptation-01.png`。拡張子は画像の実際の形式に合わせてください。
2. `src/features/othello/temptationImages.ts` の `OTHELLO_TEMPTATION_IMAGES` 配列に、画像ごとに次のような行を追加します。

```ts
export const OTHELLO_TEMPTATION_IMAGES: readonly OthelloTemptationImage[] = [
  { id: "temptation-01", source: require("../../../assets/images/othello-temptation/temptation-01.png") },
];
```

3. アプリを再ビルドします。開発中は Metro に画像とカタログの変更を反映させます。

既存の同梱画像と同様に、静的な `require` で Android・iOS・Web・Windows のビルドに画像を含めます。フォルダへの配置だけでは登録されません。`id` は画像ごとに重複しない値を使い、画像を削除する際は対応する配列の行も削除してください。

新しい誘惑マスを提示するたびに、登録された画像から 1 枚をランダムに選びます。同じ手番での再描画や拡大・縮小では画像を引き直しません。表示と拡大表示は同じ画像ソースを使います。
