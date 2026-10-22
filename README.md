# 人生クエスト

毎日の行動をクエストに変えて、経験値や連続達成報酬を集めるWebアプリです。フレンドと3Dフィールドを探索し、モンスター討伐クエストに挑戦できます。

## 起動

Node.js 24を使い、このフォルダーで以下を実行します。

```powershell
npm install
npm run dev
```

ブラウザーで [http://localhost:8000](http://localhost:8000) を開きます。

## ビルド

```powershell
npm run build
```

3D描画にはThree.jsとWebGLを使います。モンスター・ハンターモデルのライセンス情報は `public/assets/hunt/ASSET-LICENSES.txt` にあります。Void/Viteのローカル開発データは `.wrangler/` に保存されます。
