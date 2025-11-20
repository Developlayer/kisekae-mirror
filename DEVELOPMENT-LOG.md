# Development Log - 開発ログ

## 2025-11-19

### セッション開始
- プロジェクト開始
- 仕様書（KisekaeMirror.md）の確認完了

### 技術スタック決定
**検討内容:**
- 仕様書では React + Three.js が提案されていた
- ユーザー要件: 最もシンプル、コスト削減、プロトタイプ、初心者向け

**決定事項:**
- ❌ React → ✅ Vanilla JavaScript（フレームワーク不要）
- ❌ Three.js → ✅ Canvas API（2D処理には十分、軽量）
- ❌ TypeScript → ✅ JavaScript（ビルド設定不要）
- ✅ MediaPipe Pose（骨格検出に最適）
- ✅ Vite（開発サーバーのみ、最小構成）

**選定理由:**
- シンプルさ重視: フレームワーク・ビルドツールを最小限に
- パフォーマンス: ブラウザ標準機能を活用、軽量化
- 学習コスト: 初心者でも扱いやすい技術

### ドキュメント作成
- ✅ CLAUDE.md 作成（開発ガイドライン）
- ✅ DEVELOPMENT-LOG.md 作成（このファイル）

### プロジェクトセットアップ完了
- ✅ package.json 作成（Viteのみ依存）
- ✅ npm install でViteをインストール
- ✅ index.html 作成（メインHTML構造）
- ✅ style.css 作成（レスポンシブ対応のスタイル）
- ✅ main.js 作成（全機能を実装）
- ✅ README.md 作成（使い方説明）

### 実装した機能（main.js）

#### 1. カメラ映像の取得と表示
- `initializeCamera()`: getUserMediaでカメラアクセス
- Canvas要素に映像を描画
- エラーハンドリング実装

#### 2. MediaPipe骨格検出
- `initializeMediaPipe()`: MediaPipe Poseの初期化
- CDN経由でライブラリを読み込み
- `onPoseResults()`: 骨格情報の取得と処理
- デバッグ用の骨格表示機能

#### 3. 服画像の読み込み
- ドラッグ&ドロップ対応
- ファイル選択ボタン対応
- 画像プレビュー
- カテゴリ分類（上半身/下半身/全身）

#### 4. 服の管理
- `clothesData`: 読み込んだ服のデータ保持
- `activeClothes`: 現在着用中の服
- UIでの服の表示・削除・選択機能
- 着用ルールの実装（全身は単独、上下は同時可）

#### 5. 服の重ね合わせ表示
- `drawUpperBodyCloth()`: 上半身の服を骨格に合わせて描画
- `drawLowerBodyCloth()`: 下半身の服を骨格に合わせて描画
- `drawFullBodyCloth()`: 全身の服を骨格に合わせて描画
- 骨格ランドマークから位置・サイズを自動計算

### ファイル構成
```
kisekae-mirror-claude/
├── index.html           # メインHTML（完成）
├── main.js              # メインロジック（完成）
├── style.css            # スタイル（完成）
├── package.json         # Vite設定（完成）
├── package-lock.json    # 自動生成
├── node_modules/        # 依存パッケージ
├── KisekaeMirror.md     # 仕様書
├── CLAUDE.md            # 開発ガイドライン
├── DEVELOPMENT-LOG.md   # このファイル
└── README.md            # 使い方説明（完成）
```

### バグ修正 (セッション1)

**問題：**
- カメラ映像が表示されない（真っ黒）
- コンソールログが高速で更新され続ける（無限ループ）

**原因：**
- MediaPipeのCDNライブラリが正しく読み込まれていない
- `Pose`、`Camera`、`drawConnectors`、`drawLandmarks`、`POSE_CONNECTIONS`が未定義
- エラーが発生してもループが止まらない

**修正内容：**
1. MediaPipeライブラリの存在確認を追加
2. エラーハンドリングを強化
3. MediaPipeが利用できない場合のフォールバック機能を追加
   - `startCameraOnly()`: MediaPipeなしでカメラ映像のみ表示
   - `drawClothesSimple()`: 骨格検出なしで画面中央に服を固定表示
4. `onPoseResults()`内の描画関数にもエラーチェックを追加

**次のステップ：**
- ブラウザをリロードして動作確認
- カメラ映像が表示されるか確認
- MediaPipeライブラリの読み込み問題を解決（必要に応じて）

### バグ修正 (セッション2) - シンプル版に切り替え

**問題：**
- 修正後もカメラが映らない
- コンソールエラーが継続

**対応：**
- MediaPipeを一時的に完全に無効化
- main.jsをシンプル版（MediaPipeなし）に置き換え
  - 元のファイルは `main-mediapipe.js` としてバックアップ
  - シンプル版は骨格検出なしでカメラ映像と服を画面中央に表示
- index.htmlのMediaPipeスクリプトタグをコメントアウト

**期待される結果：**
- カメラ映像が表示される
- 服の読み込み・着せ替えが可能（画面中央固定）
- コンソールエラーなし

---

## 2025-11-19（続き）- MediaPipe骨格検出の実装

### 実施内容
シンプル版（カメラのみ）が動作確認できたため、本来の仕様通りMediaPipe Poseによる骨格検出機能を実装。

### 技術的な変更
**問題の原因:**
- 前回はCDN経由でMediaPipeライブラリを読み込もうとしたが、読み込みに失敗していた

**解決策:**
- MediaPipeをnpmパッケージとして導入
- 最新の `@mediapipe/tasks-vision` APIを使用
- ES Modulesでimportする方式に変更

### 実装詳細

#### 1. MediaPipeパッケージのインストール
```bash
npm install @mediapipe/tasks-vision
```

#### 2. main.jsの全面書き換え
- **旧版**: CDN + グローバル変数で `Pose`, `Camera` を使用
- **新版**: ES Modules + `PoseLandmarker` API を使用

**主な変更点:**
```javascript
// ES Modulesでインポート
import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

// 初期化方法の変更
const vision = await FilesetResolver.forVisionTasks(
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
);

poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    delegate: 'GPU'
  },
  runningMode: 'VIDEO',
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5
});
```

#### 3. 骨格検出とリアルタイム描画
- `requestAnimationFrame`を使った描画ループ
- `poseLandmarker.detectForVideo()`で骨格検出
- デバッグ用に骨格の線と点を描画
- 検出された骨格に基づいて服を自動配置

#### 4. 服の描画ロジック（骨格ベース）
- **上半身**: 肩（11, 12）と腰（23, 24）のランドマークを使用
- **下半身**: 腰（23, 24）と膝（25, 27）のランドマークを使用
- **全身**: 肩（11, 12）と足首（27, 29）のランドマークを使用

#### 5. ファイル構成
- `main.js`: MediaPipe対応版（新）
- `main-mediapipe.js`: 旧CDN版のバックアップ（参考用）

### 動作確認方法
```bash
npm run dev
```
ブラウザで http://localhost:5173/ を開く

### 期待される動作
1. カメラ映像が表示される
2. 人物の骨格が緑の線と赤い点で表示される（デバッグ用）
3. 服画像を読み込むと、骨格に合わせて自動配置される
4. 体を動かすと、服も追従して動く

### 次のステップ（今後の改善案）
- デバッグ用の骨格表示をON/OFF切り替え可能にする
- 服の位置・サイズ・回転の微調整機能
- パフォーマンスの最適化（FPS測定）
- エラーハンドリングの改善

---

## 2025-11-19（続き2）- MediaPipe骨格検出とUI機能の完成

### 実装した機能一覧

#### 1. MediaPipe骨格検出の実装成功
**問題解決:**
- 前回CDNでの読み込みに失敗していた問題を、npmパッケージ化で解決
- `@mediapipe/tasks-vision` を使用した最新のAPI実装

**実装内容:**
- リアルタイム骨格検出（33ポイント）
- 骨格に基づく服の自動配置・サイズ調整
- ランドマーク番号の修正（右膝26、右足首28）

#### 2. 手動トリミング機能
**変更理由:**
- 背景透過画像の余白が原因で服の位置がずれる問題
- 自動トリミングでは精度が不十分だったため手動方式に変更

**実装内容:**
- 四隅＋辺（8つ）のハンドルをドラッグして範囲調整
- カーソルが操作に応じて変化（リサイズ、移動）
- リセット機能、スキップ機能

#### 3. 服のサイズ・位置調整

**上半身の服:**
- 横幅: 肩幅の1.715倍
- 縦幅: 上半身の高さの1.4倍
- 上端位置: 肩の中心から上に `extraHeight * 0.65`
- 下端位置: 腰付近

**下半身の服:**
- 横幅: 腰幅の3.0倍
- 縦幅: 下半身の高さの1.15倍
- 上端位置: 腰付近
- 下端位置: 足首の少し上

**全身の服:**
- 上端位置: 上半身の上端と揃える
- 下端位置: 下半身の下端と揃える
- 横幅・縦幅: 上記に合わせて自動計算

#### 4. 重ね順設定機能
**実装内容:**
- 上半身と下半身の重ね順をラジオボタンで切り替え
- 「上半身を上に」（デフォルト）
- 「下半身を上に」
- リアルタイムで描画順序を変更

#### 5. デバッグモード
**実装内容:**
- チェックボックスで骨格表示のON/OFF切り替え
- デフォルトOFF（カメラ映像と服のみ表示）
- ON時：骨格の線・点、服の配置領域の枠を表示

#### 6. サイズ手動調整機能
**実装内容:**
- 服を選択すると「サイズ調整」セクションが表示
- 横幅・縦幅をスライダーで調整（50%～200%、5%刻み）
- 各服ごとに個別の調整値を保存
- リセットボタンで100%に戻す
- リアルタイムプレビュー

### 技術的な改善点

**コード構造:**
- 服データに `widthScale` と `heightScale` プロパティを追加
- 描画関数でベースサイズとユーザー調整を分離
- デバッグモードによる条件分岐

**UI/UX:**
- 直感的なトリミング操作（画像編集ソフト風）
- リアルタイムフィードバック
- 視覚的にわかりやすい調整UI（黄色背景）

### ファイル構成（最終版）
```
kisekae-mirror-claude/
├── index.html           # メインHTML（トリミング、サイズ調整、デバッグモードUI追加）
├── main.js              # メインロジック（MediaPipe対応、全機能実装）
├── style.css            # スタイル（新規UI対応）
├── package.json         # 依存関係（@mediapipe/tasks-vision追加）
├── package-lock.json    # 自動生成
├── node_modules/        # 依存パッケージ
├── main-mediapipe.js    # 旧CDN版のバックアップ
├── KisekaeMirror.md     # 仕様書
├── CLAUDE.md            # 開発ガイドライン
├── DEVELOPMENT-LOG.md   # このファイル
└── README.md            # 使い方説明
```

### 完成した主要機能

✅ **MediaPipe Poseによる骨格検出**
- リアルタイム検出
- 33ポイントのランドマーク

✅ **服の自動配置**
- 上半身・下半身・全身の3タイプ
- 骨格に基づく自動サイズ・位置調整

✅ **手動トリミング**
- 四隅・辺のハンドルで直感的に調整
- リセット・スキップ機能

✅ **サイズ手動調整**
- 横幅・縦幅を個別に調整
- 50%～200%の範囲
- 各服ごとに保存

✅ **重ね順設定**
- 上半身と下半身の重なり方を選択

✅ **デバッグモード**
- 骨格表示のON/OFF切り替え

✅ **UI機能**
- ドラッグ&ドロップで服を読み込み
- 服の分類（上半身/下半身/全身）
- 服の着脱（クリックで切り替え）
- 服の削除

### 次回以降の拡張案

- 録画・スクリーンショット機能
- 服の位置調整（上下左右に移動）
- 服の回転機能
- 複数の服セットを保存・読み込み
- モバイル対応

---

## 作業メモ

### 実装済みの主要機能
- ✅ カメラアクセスとリアルタイム映像表示
- ✅ MediaPipe Poseによる骨格検出
- ✅ 服画像のドラッグ&ドロップ読み込み
- ✅ 服の分類（上半身/下半身/全身）
- ✅ Canvas APIによる画像合成
- ✅ 骨格に基づく服の位置・スケール調整

### 技術的な実装詳細

#### 骨格ランドマークの使用
- 上半身: ランドマーク11,12（肩）、23,24（腰）
- 下半身: ランドマーク23,24（腰）、25,27（膝）
- 全身: ランドマーク11,12（肩）、27,29（足首）

#### 服のサイズ計算
- 上半身: 肩幅の1.5倍
- 下半身: 腰幅の1.8倍
- 全身: 肩から足首までの高さの1.2倍

---

## 2025-11-20 - Vercelへのデプロイと公開

### 実施内容
アプリケーションをインターネット上に公開するため、Vercelを使用したデプロイを実施。

### デプロイ準備

#### 1. 個人情報チェック
**実施内容:**
- 全ファイルの内容を確認（HTML, JS, CSS, MD, JSON）
- ユーザー名、パス情報、APIキーなどの個人情報が含まれていないことを確認
- `package.json`の`author`フィールドも空欄で問題なし

**結果:**
- ✅ 個人情報は一切含まれていない
- ✅ 全ファイルが安全に公開可能

#### 2. .gitignoreの作成
**除外対象:**
```
- node_modules/      # 依存パッケージ
- dist/              # ビルド成果物
- .claude/           # Claude Code個人設定
- .DS_Store          # macOSシステムファイル
- .vscode/, .idea/   # エディタ設定
- *.log              # ログファイル
- .env*              # 環境変数ファイル
```

#### 3. Gitリポジトリの初期化
```bash
git init
git add -A
git commit -m "Initial commit: KisekaeMirror - 着せ替え体験アプリ"
```

**コミット内容（11ファイル）:**
- .gitignore
- CLAUDE.md
- DEVELOPMENT-LOG.md
- KisekaeMirror.md
- README.md
- index.html
- main-mediapipe.js
- main.js
- package-lock.json
- package.json
- style.css

### GitHubへの公開

#### リポジトリ作成
**設定:**
- リポジトリ名: `kisekae-mirror`
- 公開設定: Public（Vercel無料プランで必要）
- README/License: 追加なし（ローカルに既存）

#### プッシュ
```bash
git remote add origin git@github.com:Developlayer/kisekae-mirror.git
git branch -M main
git push -u origin main
```

**リポジトリURL:**
https://github.com/Developlayer/kisekae-mirror

### Vercelへのデプロイ

#### 技術選定の理由
- **完全無料**: クレジットカード登録不要
- **自動ビルド**: Viteプロジェクトを自動認識
- **HTTPS対応**: カメラ使用に必須
- **設定不要**: GitHubと連携するだけ

#### デプロイ手順
1. Vercelアカウント作成（GitHubアカウントで連携）
2. GitHubリポジトリをインポート
3. ビルド設定（自動検出）:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. デプロイ実行

#### 結果
- ✅ デプロイ成功
- ✅ 自動HTTPS対応
- ✅ 世界中からアクセス可能

### 課金防止対策

**実施した安全設定:**
1. Vercel Hobbyプラン（無料）を使用
2. クレジットカード未登録（物理的に課金不可）
3. 有料機能の回避:
   - Edge Functions未使用
   - Analytics有料版未使用
   - チーム機能未使用

**無料枠の範囲:**
- 100 GB 帯域幅/月
- 無制限のデプロイ数
- 6,000分のビルド時間/月
- 静的サイトなので十分に収まる範囲

### 今後の更新方法

コードを修正した場合:
```bash
git add .
git commit -m "修正内容"
git push
```
→ Vercelが自動で再デプロイ（1〜2分）

### 完成したプロジェクト構成

**公開されているファイル（GitHub）:**
- HTML/CSS/JavaScriptファイル
- ドキュメント（README, CLAUDE.md等）
- package.json（依存関係）

**除外されているファイル（.gitignore）:**
- node_modules/（依存パッケージ）
- .claude/（個人設定）
- dist/（ビルド成果物、Vercelが自動生成）

### 技術スタック（最終版）

**開発環境:**
- HTML + Vanilla JavaScript
- MediaPipe Pose（@mediapipe/tasks-vision）
- Canvas API
- Vite（開発サーバー・ビルド）

**ホスティング:**
- GitHub（ソースコード管理）
- Vercel（本番環境）

**特徴:**
- フレームワーク不使用（軽量・シンプル）
- サーバーレス（静的サイト）
- 完全無料で運用可能

---
