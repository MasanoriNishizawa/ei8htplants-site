"""dist 配下の静的ファイル実パス解決を確認する先行テスト。"""

import os

import pytest

from app.spa_files import resolve_dist_file_path


class TestResolveDistFilePath:
    """dist の外へ出ない実パス解決とファイル存在確認の責務を確認する。"""

    def test_dist内の通常ファイルは実パスを返す(self, tmp_path):
        """dist 内の既存ファイルを実パスで返すことを確認する。

        Args:
            self: テストクラスのインスタンス。
            tmp_path: pytest が用意する一時ディレクトリ。

        Returns:
            なし。
        """
        # 1. 一時 dist と、その配下に解決対象のファイルを用意する。
        dist_dir = tmp_path / 'dist'
        asset_path = dist_dir / 'assets' / 'app.js'
        asset_path.parent.mkdir(parents=True)
        asset_path.write_text('window.app = true;', encoding='utf-8')

        # 2. 相対パスを渡し、dist 内ファイルの実パスが返ることを確認する。
        resolved_path = resolve_dist_file_path(str(dist_dir), 'assets/app.js')

        assert resolved_path == os.path.realpath(asset_path)

    def test_親ディレクトリへの移動とdist自体は拒否する(self, tmp_path):
        """親ディレクトリへの移動と dist 自体の指定を拒否する。

        Args:
            self: テストクラスのインスタンス。
            tmp_path: pytest が用意する一時ディレクトリ。

        Returns:
            なし。
        """
        # 1. dist の隣に外部ファイルを置き、dist の実パスを基準にする。
        dist_dir = tmp_path / 'dist'
        dist_dir.mkdir()
        (tmp_path / 'outside.txt').write_text('outside', encoding='utf-8')

        # 2. 親へ移動する指定と dist 自身の指定がどちらも拒否されることを確認する。
        assert resolve_dist_file_path(str(dist_dir), '../outside.txt') is None
        assert resolve_dist_file_path(str(dist_dir), '.') is None

    def test_dist外を指す絶対パスは拒否する(self, tmp_path):
        """requested_path が dist 外の絶対パスなら拒否する。

        Args:
            self: テストクラスのインスタンス。
            tmp_path: pytest が用意する一時ディレクトリ。

        Returns:
            なし。
        """
        # 1. dist と、その外側に実在する絶対パスを用意する。
        dist_dir = tmp_path / 'dist'
        dist_dir.mkdir()
        outside_path = tmp_path / 'outside.txt'
        outside_path.write_text('outside', encoding='utf-8')

        # 2. 絶対パスであっても dist 外なら None になることを確認する。
        assert resolve_dist_file_path(str(dist_dir), str(outside_path)) is None

    def test_dist外へのシンボリックリンクは拒否する(self, tmp_path):
        """dist 内のリンクが外部ファイルを指す場合は拒否する。

        Args:
            self: テストクラスのインスタンス。
            tmp_path: pytest が用意する一時ディレクトリ。

        Returns:
            なし。
        """
        # 1. dist 外の実ファイルと、dist 内に作るシンボリックリンクの場所を用意する。
        dist_dir = tmp_path / 'dist'
        dist_dir.mkdir()
        outside_path = tmp_path / 'outside.txt'
        outside_path.write_text('outside', encoding='utf-8')
        link_path = dist_dir / 'external-link.txt'

        # 2. OS や権限でリンクを作れない環境はこのケースだけを skip する。
        try:
            link_path.symlink_to(outside_path)
        except (NotImplementedError, OSError) as error:
            pytest.skip(f'この環境ではシンボリックリンクを作成できません: {error}')

        # 3. リンクの実体が dist 外なので None になることを確認する。
        assert resolve_dist_file_path(str(dist_dir), 'external-link.txt') is None

    def test_存在しないdist内パスも解決し存在確認は行わない(self, tmp_path):
        """ファイルが存在しなくても dist 内実パスを返す契約を確認する。

        Args:
            self: テストクラスのインスタンス。
            tmp_path: pytest が用意する一時ディレクトリ。

        Returns:
            なし。
        """
        # 1. dist のみ作成し、その中には存在しないファイル名を指定する。
        dist_dir = tmp_path / 'dist'
        dist_dir.mkdir()
        requested_path = 'assets/not-created.js'
        expected_path = os.path.realpath(os.path.join(dist_dir, requested_path))

        # 2. 存在確認は呼び出し元の責務なので、解決関数はパスを返すことを確認する。
        assert not os.path.exists(expected_path)
        assert resolve_dist_file_path(str(dist_dir), requested_path) == expected_path
