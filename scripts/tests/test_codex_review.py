"""scripts/codex_review.sh（Codex にコードレビューを頼むスクリプト）の回帰テスト。

本物の Codex には接続しない。PATH の先頭に偽物の codex（スタブ）を置き、
渡された指示文を記録して、決まった報告を -o のファイルに書くだけにする。
"""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

# SCRIPT: テスト対象のスクリプトの絶対パス
SCRIPT = Path(__file__).resolve().parents[1] / "codex_review.sh"

# STUB_CODEX: 偽物の codex。exec の指示文を記録し、-o の先に決まった報告を書く。
# 環境変数 CODEX_STUB_FAIL=1 のときは失敗（終了コード 3）を返す。
STUB_CODEX = """#!/usr/bin/env bash
set -euo pipefail
if [[ "${CODEX_STUB_FAIL:-0}" == "1" ]]; then
  echo "stub failure" >&2
  exit 3
fi
out=""
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [[ "${args[$i]}" == "-o" ]]; then
    out="${args[$((i + 1))]}"
  fi
done
# 最後の引数が指示文
printf '%s' "${args[${#args[@]}-1]}" > "$CODEX_STUB_PROMPT"
printf '%s\\n' "$*" > "$CODEX_STUB_ARGS"
printf '指摘なし（スタブ）\\n' > "$out"
echo "途中経過（捨てられるはず）"
"""


class TestCodexReviewScript(unittest.TestCase):
    """引数の検証・Codex への受け渡し・失敗時の終了コード・保存先を確認する。"""

    def setUp(self):
        """一時的な Git リポジトリと、偽物の codex を置いた bin フォルダを用意する。

        Returns:
            なし。
        """
        # 1. 一時フォルダの中に、コミットが1つある Git リポジトリを作る
        # self.tmp: テストごとに作り、終わったら消す一時フォルダ
        self.tmp = Path(tempfile.mkdtemp())
        # self.repo: レビュー対象にする一時的な Git リポジトリ
        self.repo = self.tmp / "repo"
        self.repo.mkdir()
        # git_env: ホストの Git 設定（フック・署名など）や GIT_* 環境変数を引き継がない、準備用の環境
        git_env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        git_env.update({
            "HOME": str(self.tmp), "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
            "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com",
        })
        # git: フックを無効にし、署名もしない git の呼び出し（ホストのフックから本物の codex が動かないように）
        git = ["git", "-c", f"core.hooksPath={os.devnull}", "-c", "commit.gpgsign=false"]
        subprocess.run([*git, "init", "-q"], cwd=self.repo, check=True, env=git_env)
        (self.repo / "a.txt").write_text("a\n")
        subprocess.run([*git, "add", "a.txt"], cwd=self.repo, check=True, env=git_env)
        subprocess.run([*git, "commit", "-q", "-m", "init"], cwd=self.repo, check=True, env=git_env)
        # self.head: 作ったコミットの完全な ID
        self.head = subprocess.run([*git, "rev-parse", "HEAD"], cwd=self.repo, check=True, env=git_env,
                                   capture_output=True, text=True).stdout.strip()

        # 2. 偽物の codex を置いた bin フォルダを作る
        # self.bin: PATH の先頭に置く、偽物の codex だけが入ったフォルダ
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        stub = self.bin / "codex"
        stub.write_text(STUB_CODEX)
        stub.chmod(0o755)

        # 3. スクリプトとスタブが使うコマンドだけを集めたフォルダを作る。
        #    PATH をこのフォルダ（と、必要ならスタブ）だけにして、マシンに入っている本物の codex を決して呼ばない
        # self.tools: 必要なコマンドへのシンボリックリンクだけを置いたフォルダ
        self.tools = self.tmp / "tools"
        self.tools.mkdir()
        for name in ("bash", "git", "sed", "cat", "date", "mktemp", "mv", "mkdir", "tail"):
            found = shutil.which(name)
            self.assertIsNotNone(found, f"{name} が見つかりません")
            (self.tools / name).symlink_to(found)

        # 4. スタブが指示文と引数を書き出す先
        # self.prompt_file / self.args_file: スタブが受け取った指示文・全引数の記録先
        self.prompt_file = self.tmp / "prompt.txt"
        self.args_file = self.tmp / "args.txt"

    def tearDown(self):
        """一時フォルダを消す。

        Returns:
            なし。
        """
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_script(self, *args, with_codex=True, fail=False):
        """一時リポジトリの中でスクリプトを動かす。

        Args:
            *args: スクリプトに渡す引数。
            with_codex: True なら偽物の codex を PATH に入れる。
            fail: True なら偽物の codex を失敗させる。

        Returns:
            subprocess.CompletedProcess（stdout・stderr は文字列）。
        """
        # 1. PATH を「スタブ（必要なら）＋必要なコマンドだけのフォルダ」にする。標準の場所は入れない
        path = f"{self.bin}:{self.tools}" if with_codex else str(self.tools)
        env = {
            "PATH": path,
            "HOME": str(self.tmp),
            "CODEX_STUB_PROMPT": str(self.prompt_file),
            "CODEX_STUB_ARGS": str(self.args_file),
            "CODEX_STUB_FAIL": "1" if fail else "0",
        }
        # 2. bash でスクリプトを動かし、結果を返す
        return subprocess.run([str(self.tools / "bash"), str(SCRIPT), *args], cwd=self.repo, env=env,
                              capture_output=True, text=True)

    def test値のないcommitは終了コード2で使い方を出す(self):
        """--commit の値を省いたとき、分かりにくいエラーではなく日本語の案内で止まる。"""
        result = self.run_script("--commit")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--commit には値が必要です", result.stderr)
        self.assertIn("使い方", result.stderr)
        self.assertFalse(self.prompt_file.exists())

    def test次のオプションを値として読まない(self):
        """--commit --note "補足" のとき、--note をコミット ID として読まずに止まる。"""
        result = self.run_script("--commit", "--note", "補足")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--commit には値が必要です", result.stderr)

    def test不明な引数は終了コード2(self):
        """知らない引数は使い方を出して止まる。"""
        result = self.run_script("--unknown")
        self.assertEqual(result.returncode, 2)
        self.assertIn("不明な引数です", result.stderr)

    def test存在しないコミットは終了コード2(self):
        """見つからないコミットを指定したら、Codex を呼ばずに止まる。"""
        result = self.run_script("--commit", "0123456789abcdef")
        self.assertEqual(result.returncode, 2)
        self.assertIn("見つかりません", result.stderr)
        self.assertFalse(self.prompt_file.exists())

    def testcodexがなければ終了コード1(self):
        """codex コマンドがないときは、入れ方を案内して止まる（本物の codex がマシンにあっても呼ばない）。"""
        self.assertFalse((self.tools / "codex").exists())
        result = self.run_script(with_codex=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn("npm i -g @openai/codex", result.stderr)

    def testCodexが失敗したら終了コード1(self):
        """Codex の実行に失敗したら、結果を出さずに終了コード 1 で止まる。"""
        result = self.run_script(fail=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Codex の実行に失敗しました", result.stderr)
        self.assertNotIn("指摘なし", result.stdout)
        # 失敗の原因を追えるよう、途中経過の末尾（スタブのエラー出力）を表示する
        self.assertIn("stub failure", result.stderr)

    def test読み取り専用で動かし補足と観点を指示文に入れる(self):
        """read-only で動かし、空白を含む補足・観点がそのまま指示文に入り、最終報告だけが表示される。"""
        result = self.run_script("--note", "変えた範囲: A と B", "--focus", "データの 競合")
        self.assertEqual(result.returncode, 0, result.stderr)
        # 1. 読み取り専用と、最終報告の書き出し先の指定がある
        args = self.args_file.read_text()
        self.assertIn("exec -s read-only -o", args)
        # 2. 補足と観点が、空白を含んだまま指示文に入る
        prompt = self.prompt_file.read_text()
        self.assertIn("変えた範囲: A と B", prompt)
        self.assertIn("データの 競合", prompt)
        self.assertIn("まだコミットしていない変更", prompt)
        self.assertIn("修正もしないで", prompt)
        # 3. 最終報告だけが表示され、途中経過は出ない
        self.assertIn("指摘なし（スタブ）", result.stdout)
        self.assertNotIn("途中経過", result.stdout)
        self.assertNotIn("途中経過", result.stderr)
        # 途中経過は画面に出さず、結果と同じ名前の .log に残す
        logs = list((self.repo / "tmp" / "codex-review").glob("*.log"))
        self.assertEqual(len(logs), 1)
        self.assertIn("途中経過", logs[0].read_text())
        self.assertIn("tmp/codex-review/", result.stdout)

    def test短いコミットIDは完全なIDにして渡す(self):
        """--commit に短い ID を渡しても、確定した完全な ID を指示文に入れる。"""
        result = self.run_script("--commit", self.head[:7])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f"git show {self.head}", self.prompt_file.read_text())

    def test続けて動かしても保存先が重ならない(self):
        """同じ秒に2回動かしても、結果のファイルは別々に残る。"""
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(self.run_script().returncode, 0)
        saved = sorted((self.repo / "tmp" / "codex-review").glob("*.md"))
        self.assertEqual(len(saved), 2)


if __name__ == "__main__":
    unittest.main()
