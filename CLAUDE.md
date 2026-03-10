# CLAUDE.md — scogene プロジェクト

## プロジェクト概要
- **プロジェクト名**: 無限問題作成AI「モンジェネ」/ 採点AI「ScoGene」
- **目的**: 未踏IT人材発掘・育成事業 2026年度への提案
- **チーム**: 高橋創真(代表/塾講師)、若月耕紀(フルスタック)、小武壮太(デザイン)、舛田岳(AI/ML) — 全員M1
- **メンター**: 新田洸平さん

## ディレクトリ構成
- `mitou-teiansyo/` — 提案書LaTeX（メイン）
  - `proposal.tex` — 1段組版（メイン）
  - `proposalcopy.tex` — 2段組版（実験用）
  - `proposal-v10.pdf` — 最新1段組PDF
  - `proposal-twocol.pdf` — 最新2段組PDF
- `googledocs/` — Google Docs下書きのHTML + 画像
- `backend/` — ScoGene採点バックエンド (Python/FastAPI)
- `frontend/` — Next.js フロントエンド
- `ipa-prototypes/` — IPA向けプロトタイプ
- `tmp.md` — 提案書の残課題・面接対策リスト
- `議事録.md` / `文字起こし.md` — 新田さんとの会議記録
- `教育文献の最新化と代替提案.md` — Deep Research結果

## 提案書（LaTeX）の重要な技術的制約
- **フォントサイズ**: 公募要領で「10.5ポイント以上」が必須。`jlreq`クラスで`fontsize=10.5bp`を使用（ltjsarticleは日本語スケーリングで実測9.21ptになるため不可）
- **ページ制限**: A4で10ページ以内
- **ビルドコマンド**: `lualatex -jobname=proposal-vN proposal.tex`（2回実行で相互参照解決）
- **バージョン管理**: PDFはproposal-v1, v2, ...と番号を付ける

## 公募要領チェックリスト（竹内統括PM）
①何を作るか ②どんな出し方 ③斬新さ ④進め方・予算(開発場所/計算機環境/言語ツール/分担/線表/時間帯/予算) ⑤腕前 ⑥特記事項(指導教員了解+チーム経緯) ⑦IT以外の趣味 ⑧将来のIT

## ユーザーの好み・ワークフロー
- 日本語で会話
- PDFの視覚確認を必ず行うこと（画像として読み込んでチェック）
- texの変更後は毎回ビルドしてページ数を確認
- tmp.mdは変更のたびに最新状態に更新する
- CLAUDE.mdも重要な発見があれば更新する

## 主要URL
- モンジェネ: https://mon-gene.wakatsuki.app/login (ID:77777 / Pass:20260312)
- ScoGene: https://scogene.vercel.app
- ETSUZAN Makers: https://meikan.etsuzan.org/
- モンジェネ発表動画: https://youtu.be/PCIbYSYGWrI
- SakeScope発表動画: https://youtu.be/noTHRUNfiwA
- 舛田テレビ放映: https://youtu.be/LLsKAEKmDJ4
