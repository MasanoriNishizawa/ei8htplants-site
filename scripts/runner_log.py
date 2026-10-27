"""テスト実行結果を Markdown の記録に整え、ログファイルへ保存する。"""
from datetime import datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))
MARKER = "<!-- 実行結果はこの下に新しい順で追加される（scripts/run_tests.py が書き込む。手で書き換えない） -->"

HEADER = f"""# テスト実行ログ

**プロジェクト：** ei8htplants-site

自動テストを実行した結果の記録。`python scripts/run_tests.py --note \"何を変えたか\"` を実行するたびに、一番上に 1 件追加される（手で書き換えない）。
テストの方針は [01_マスターテスト計画書](01_マスターテスト計画書.md)、ケース一覧は [07_テストケース一覧](07_テストケース一覧.md) を参照。

## 見方

- **判定**：✅ 成功 ／ ⚠️ 省略あり ／ ❌ 失敗あり。スキップのあるテスト枠は、実行できたテストが成功していても ⚠️ と表示する
- **コミット**：テストしたときのソースの版（`git` のコミット番号）。「＋未コミット」は、まだコミットしていない変更を含めてテストしたもの
- **省略**：急ぐときなどに、そのテストを実行しなかったもの。「省略（関連なし）」は絞った実行で対象外のテスト、「省略（--no-e2e）」は画面テストを明示的に省いたもの。Playwright 以外を全件実行した場合も部分実行として記録する。分析ダッシュボードは `analytics/.venv` がない場合、スキップ件数と理由を表示する

{MARKER}
"""


def make_entry(
    results: list[dict],
    note: str,
    skipped_suites: list[tuple[str, str]],
    git_revision: str,
    targets: list[str] | None = None,
    now: datetime | None = None,
) -> str:
    """テスト結果・省略内容を、ログへ追加する Markdown 1 件に整える。

    Args:
        results: 実行した各テスト枠の結果。
        note: 今回の変更内容。
        skipped_suites: 実行対象から省いたテスト枠と理由。
        git_revision: テスト時のコミット番号と未コミット状態。
        targets: 対象を絞った実行の対象一覧。全件実行は None。
        now: 記録日時。省略時は現在の日本時間を使う。

    Returns:
        ログファイルへ追加する Markdown。
    """
    # 1. 失敗と省略を分けて判定し、部分実行やスキップを全件成功と表示しない。
    interrupted = any(r.get("interrupted", False) for r in results)
    failed_results = any(r["code"] != 0 or r["failed"] != 0 for r in results if not r.get("interrupted", False))
    has_skips = bool(skipped_suites) or any(r["skipped"] > 0 for r in results)
    elapsed = sum(r["sec"] for r in results)
    timestamp = (now or datetime.now(JST)).astimezone(JST).strftime("%Y-%m-%d %H:%M")
    if interrupted and failed_results:
        verdict = "⏹ 中断・失敗あり（関連する部分だけ実行）" if targets is not None else "⏹ 中断・失敗あり"
    elif interrupted:
        verdict = "⏹ 中断（関連する部分だけ実行）" if targets is not None else "⏹ 中断"
    elif failed_results:
        verdict = "❌ 失敗あり（関連する部分だけ実行）" if targets is not None else "❌ 失敗あり"
    elif has_skips:
        verdict = "⚠️ 実行した対象は成功（省略あり）"
    elif targets is not None:
        verdict = "✅ 対象のテストは成功（関連する部分だけ実行）"
    else:
        verdict = "✅ 全部成功"

    lines = [
        f"### {timestamp}　{verdict}",
        "",
        f"- **変更内容**：{note or '（記載なし）'}",
        f"- **コミット**：{git_revision}",
        f"- **かかった時間**：{elapsed:.0f} 秒",
    ]
    # 2. 絞った実行では、実行したファイル名やテスト枠を記録する。
    if targets is not None:
        lines.append(f"- **流したテスト**：{'、'.join(f'`{t}`' for t in targets) or '（型チェックと本番ビルドだけ）'}")
    lines += [
        "",
        "| テスト | 判定 | 成功 | 失敗 | スキップ | 既知の問題 | 時間 |",
        "|---|---|---|---|---|---|---|",
    ]
    for result in results:
        # 3. 実行したテスト枠の行でも、省略があれば成功と誤読されない表示にする。
        good = result["code"] == 0 and result["failed"] == 0 and result["skipped"] == 0
        if result.get("interrupted", False):
            judgment = "⏹ 中断"
        else:
            judgment = "⚠️ 省略あり" if result["code"] == 0 and result["failed"] == 0 and result["skipped"] > 0 else ("✅" if good else "❌")
        lines.append(
            f"| {result['name']} | {judgment} | {result['passed']} | {result['failed']} | {result['skipped']} | {result['xfail']} | {result['sec']:.0f} 秒 |"
        )
    for name, reason in skipped_suites:
        lines.append(f"| {name} | {reason} | - | - | - | - | - |")
    for result in results:
        if result.get("skip_reason"):
            lines += ["", f"- **省略理由**：{result['name']} — {result['skip_reason']}"]
    failed_names = [(result["name"], name) for result in results for name in result["failed_names"]]
    if failed_names:
        truncated = [r for r in results if r["failed"] > len(r["failed_names"]) and r["failed_names"]]
        heading = "**失敗したテスト（各テスト枠につき最大10件表示）**" if truncated else "**失敗したテスト**"
        lines += ["", heading, ""] + [f"- {suite}：`{name}`" for suite, name in failed_names]
        for result in truncated:
            lines.append(f"- {result['name']}：ほか {result['failed'] - len(result['failed_names'])} 件（合計 {result['failed']} 件）")
    for result in results:
        if result.get("interrupted", False):
            lines += ["", f"**{result['name']} の状態**：実行中に割り込みを受けました"]
        elif result["code"] != 0 and not result["failed_names"]:
            lines += ["", f"**{result['name']} の最後の出力**：`{' '.join(result['tail']) or '（なし）'}`"]
    lines += ["", "---", ""]
    return "\n".join(lines)


def append_log(log_path: Path, text: str) -> None:
    """ログの目印の直下へ新しい記録を追加し、既存の記録を残す。

    Args:
        log_path: 更新するテスト実行ログのパス。
        text: 先頭に追加する Markdown 記録。

    Returns:
        戻り値なし。
    """
    # 1. ファイルがなければ共通ヘッダーで作り、既存ログも現行の判定表示の説明へそろえる。
    current = log_path.read_text(encoding="utf-8") if log_path.exists() else HEADER
    if MARKER in current:
        _, rest = current.split(MARKER, 1)
        current = HEADER + rest.lstrip("\n")
    else:
        current = HEADER + current
    head, rest = current.split(MARKER, 1)
    # 2. 最新の記録を目印の直下へ置き、古い記録はその後ろに保つ。
    log_path.write_text(head + MARKER + "\n\n" + text + rest.lstrip("\n"), encoding="utf-8")
