#!/usr/bin/env bash
# Codex CLI にコードレビューを頼むスクリプト（PM が「レビュー」の手順で使う）。
#
# 実装は Claude Code の担当が行い、レビューは別の AI（Codex）に独立して見てもらう。
# 実装したときの前提をそのまま引き継がないよう、Codex には「変更の内容・範囲・見てほしい観点」だけを渡し、
# 実際のコードを読んで確かめさせる。Codex は読み取り専用で動かすので、ファイルは変更しない。
#
# 使い方:
#   scripts/codex_review.sh                        # まだコミットしていない変更（git diff HEAD と新規ファイル）をレビュー
#   scripts/codex_review.sh --commit <SHA>         # 指定したコミットの変更をレビュー
#   scripts/codex_review.sh --note "補足"           # 変更の内容・範囲・変えていないこと・失敗時の動き・テストしたことを伝える
#   scripts/codex_review.sh --focus "見てほしい点"   # 特に見てほしい観点を足す（データの競合・認証など）
#   （--commit・--note・--focus は組み合わせられる）
#
# 結果:
#   Codex の最終報告を標準出力に出し、同じ内容を tmp/codex-review/ に日時付きのファイルで残す。
#
# 終了コード:
#   0: レビューが終わった（指摘の有無は問わない） / 1: codex がない・Codex の実行に失敗 / 2: 引数の誤り
#
# 前提:
#   `npm i -g @openai/codex` で codex コマンドを入れ、`codex login` 済みであること。
set -euo pipefail

# 使い方を表示する関数。引数の誤りのときに使う
usage() {
  sed -n '8,13p' "$0" | sed 's/^# \{0,1\}//' >&2
}

# 1. 引数を読み取る（値が必要なオプションは、値の有無を確かめてから読む）
# target: レビューの対象（uncommitted か、コミットの SHA）
target="uncommitted"
# note: PM から Codex に伝える補足（変更の内容・範囲など）
note=""
# focus: 特に見てほしい観点
focus=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit|--note|--focus)
      # 値がない、または次のオプションを値として読んでしまう場合は、使い方を出して止める
      if [[ $# -lt 2 || "$2" == --* ]]; then
        echo "エラー: $1 には値が必要です。" >&2
        usage
        exit 2
      fi
      case "$1" in
        --commit) target="$2" ;;
        --note) note="$2" ;;
        --focus) focus="$2" ;;
      esac
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "エラー: 不明な引数です: $1" >&2; usage; exit 2 ;;
  esac
done

# 2. codex コマンドがあるかを確かめる
if ! command -v codex >/dev/null 2>&1; then
  echo "エラー: codex コマンドが見つかりません。npm i -g @openai/codex で入れてください。" >&2
  exit 1
fi

# 3. リポジトリの一番上に移動する
# root: リポジトリの一番上のフォルダ
root="$(git rev-parse --show-toplevel)"
cd "$root"

# 4. コミットを指定されたときは、存在を確かめて完全な ID に直す（途中で HEAD が動いても対象がぶれないように）
if [[ "$target" != "uncommitted" ]]; then
  if ! resolved="$(git rev-parse --verify --quiet "${target}^{commit}")"; then
    echo "エラー: コミット ${target} が見つかりません。" >&2
    exit 2
  fi
  target="$resolved"
  scope="コミット ${target} の変更（git show ${target}）"
else
  scope="まだコミットしていない変更（git diff HEAD と、git status で ?? と出る新規ファイル）"
fi

# 5. 結果の保存先を、実行ごとに重ならない名前で作る（tmp/ の下は .gitignore 対象）
# out_dir: レビュー結果を保存するフォルダ、out_file: 今回の結果のファイル
out_dir="$root/tmp/codex-review"
mkdir -p "$out_dir"
out_file="$(mktemp "$out_dir/$(date +%Y%m%d-%H%M%S)-XXXXXX")"
mv "$out_file" "$out_file.md"
out_file="$out_file.md"

# 6. Codex への指示を組み立てる
# prompt: Codex に渡すレビューの指示（日本語で、直さずに指摘だけを返させる）
prompt="あなたはこのリポジトリの独立したコードレビュー担当です。実装した担当とは別の立場で見てください。
ファイルは一切変更しないでください（コマンドは読み取りだけにする）。修正もしないで、問題点の指摘だけを返してください。

レビューの対象: ${scope}

進め方:
- まず CLAUDE.md を読み、そのルール（日本語の詳しいコメント、秘密の値を書かない、テストの方針など）も踏まえる。
- 下の「PM からの補足」は実装側の説明です。説明をうのみにせず、実際のコードと既存の仕様を読んで、本当にそうなっているかを確かめる。
- 変更した箇所だけでなく、それを呼び出している所・影響を受ける既存機能も読む。

見る観点:
- 不具合（境界値・null や空の値・エラー処理・失敗したときの動き）
- データの競合・同時更新・処理の順番（別タブの古い状態での更新、削除と更新が重なる場合など）
- 既存機能へのデグレ、ほかの画面・API への影響
- 認証・権限・入力の検証などのセキュリティ
- 後片付け漏れ（イベント・タイマー・購読の解除）
- テストの不足（実装と同じ前提で書かれていて、確かめたいことの証明になっていないテストも含む）
- CLAUDE.md のコメントのルール違反
特に見てほしい観点: ${focus:-なし}

PM からの補足（変更の内容・範囲・変えていないこと・失敗時の動き・テストしたこと）:
${note:-なし}

報告の形:
- 日本語で書く。指摘ごとに「重要度（高/中/低）・場所（ファイル:行）・起きること（具体的な再現の条件）・直し方の案」を書く。
- 自信がない指摘は、その旨と、確かめるために何を見ればよいかを書く。
- 最後に「確認したこと」と「確認できなかったこと」を書く。
- 問題がなければ「指摘なし」と書く。"

# 7. 読み取り専用で Codex を動かし、最終報告だけをファイルに書き出す（途中経過の出力は捨てる）
if ! codex exec -s read-only -o "$out_file" "$prompt" >/dev/null; then
  echo "エラー: Codex の実行に失敗しました（ログイン切れ・利用上限などを確かめてください）。" >&2
  exit 1
fi

# 8. 結果を表示する
cat "$out_file"
echo
echo "（レビュー結果の保存先: ${out_file#"$root"/}）"
