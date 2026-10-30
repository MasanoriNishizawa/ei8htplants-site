/**
 * 管理画面「設計書」（pages/admin/AdminDocs.tsx）のテスト
 * - 本文の中の .md へのリンクを押すと、画面を移動せずにそのファイルを画面内に開く（ツリーでも選択中になる）
 * - 外部リンクは target=_blank・rel=noopener noreferrer で新しいタブに開く
 * - 設計書の外のファイルへのリンクは href が外れて押しても移動しない
 * - 本文の中のスクリプトは無害化される
 * api.docs はモックにして、本番のサーバーには接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminDocs from '../AdminDocs'
import { api } from '../../../lib/api'

// api.docs だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      docs: {
        tree: vi.fn(),
        content: vi.fn(),
      },
    },
  }
})

/** 設計書のツリー（2 つのフォルダに 1 ファイルずつ） */
const TREE = [
  { type: 'dir' as const, name: '01_BD', path: '01_BD', children: [{ type: 'file' as const, name: '01_概要.md', path: '01_BD/01_概要.md' }] },
  { type: 'dir' as const, name: '02_DD', path: '02_DD', children: [{ type: 'file' as const, name: '06_API仕様.md', path: '02_DD/06_API仕様.md' }] },
]

/** パス → 本文の Markdown */
const CONTENTS: Record<string, string> = {
  '01_BD/01_概要.md': [
    '# 概要',
    '',
    '[API 仕様へ](../02_DD/06_API仕様.md#イベント)',
    '',
    '[外部のページ](https://example.com/page)',
    '',
    '[ソース](../../frontend/src/App.tsx)',
    '',
    '<script>window.__docsXss = true</script>',
  ].join('\n'),
  '02_DD/06_API仕様.md': '# API 仕様\n\n## イベント\n\nイベントの API の説明',
}

/** 実リポジトリの設計書本文を、テストファイル位置からの相対URLで読み込む */
const REAL_DOCS = [
  {
    path: '02_DD/01_モジュール構成.md',
    heading: 'DD-01 — モジュール構成',
    expected: ['API型定義ファイルツリー', 'gallery.ts', 'priceCalcEntries.ts', 'EventSiteImageInput.tsx', 'CheckoutShippingAddressFields.tsx', 'EventDailyTimesField.tsx', '日別時間モードの切替、複数日の各日時間欄、単一の共通時間欄を表示', '日付・選択状態・共通時間・ラベルstyleをpropsで受け', '日付計算・state・初期値・保存処理は持たない', 'admin/articles/ArticlesList.tsx', '読み込み中・記事table・空状態の表示。記事と状態をpropsで受け、公開切替・編集・削除をcallbackで親へ通知', 'admin/reservations/ReservationsList.tsx', '絞り込み済み予約のモバイルカード/PCテーブル表示', 'イベント名・更新状態・選択/更新callbackを親から受け取る', 'admin/Reservations.tsx（取得・初期値・絞り込み/集計・更新・詳細/当日参加モーダル管理・成功後の行追加）', 'ReserveScheduleFields.tsx', 'ReserveCustomerFields.tsx', '参加人数、氏名・メール・電話、植物/鉢の持ち込み、備考の入力UIを表示する', 'EventAdminInfoGuidelinesSection.tsx', '出店要項の文章欄と画像表示をまとめる表示部品', 'useEventAdminInfoGuidelinesImages.ts', '画像の逐次アップロード・部分失敗・削除確認とviewer操作', '枠の読み込み中・失敗・空・満席・残席数'],
  },
  {
    path: '02_DD/03_フロントエンドロジック.md',
    heading: 'DD-03 — フロントエンドロジック',
    expected: ['API 型定義の配置', 'apiTypes/gallery.ts', 'apiTypes/priceCalcEntries.ts', 'GalleryImage', '単画像の入力UIは', 'CheckoutShippingAddressFields.tsx', '配送先の5項目', 'HTML標準検証に使う', 'reserve/ReserveScheduleFields.tsx', '複数日イベントの日付ラジオ', '時間枠変更時の参加人数リセット', 'reserve/ReserveCustomerFields.tsx', '表示部品は参加人数と各入力値', '入力変更はcallbackで親へ通知し', '独自stateや予約API・送信処理は持ちません。', 'フォームstate、人数変更時の値更新', '予約payload作成・送信、完了画面を維持します。', 'EventDailyTimesField.tsx', '日別時間モードの切替、日付ごとの開催時間欄、共通開催時間欄の表示', '複数日イベントだけ「日ごとに異なる」チェック欄', '親から受け取った各日について日付ラベルと', 'onDailyTimesModeChange', 'onDailyTimeChange', '日付配列の算出・state・初期値設定・保存処理を持ちません。', '開始日・終了日の比較と listDates', 'dailyTimesMode と dailyTimes のstate', '日別モードを有効にした時点では', '各日を現在の共通時間で初期化します。', '複数日かつ日別モードの場合だけ', 'daily_times', '60. 管理画面 — 記事一覧の表示分離', 'ArticlesList.tsx', 'loading', 'hasPageError', '公開切替・編集・削除の各callback', '画像・タイトル・タグ・公開日・公開状態・操作の表', '親から一覧エラーが渡された場合は空状態として扱いません。', '子はデータ取得や操作用state、API呼び出しを持ちません。', 'モバイルカード/PCテーブルの表示分離', 'reservations/ReservationsList.tsx', 'Reservations.tsx は予約とイベントの取得', '全イベント表示時に限りカードとテーブルへイベント名を加え', 'onSelectReservation', 'onStatusUpdate', '各表示形式の空状態', '読み込み中/エラー表示は親に残します。', '子はAPI取得、絞り込み、並べ替え、更新stateを持ちません。', 'EventAdminInfoGuidelinesSection.tsx', '文章欄と画像表示部品をまとめる', 'useEventAdminInfoGuidelinesImages', 'hookがアップロード進捗/エラー', 'hookは画像を選択順に逐次アップロード', 'hookは注入された更新関数とアップロード関数を使います'],
  },
  {
    path: '03_PM/06_プロジェクト全体リファクタリング計画.md',
    heading: 'PM-06 — プロジェクト全体リファクタリング計画',
    expected: ['段階2のAPI型配置整理を完了しました', '全15ドメイン', 'apiTypes.ts', 'EventSiteImageInput.tsx', 'CheckoutShippingAddressFields.tsx', 'ReserveScheduleFields.tsx', 'Reserve.test.tsxにFE-CU-01〜06', 'すべてPASSで確認しました', '2026-10-30 15:56の最終関連runner', 'EventDailyTimesField.tsx', '日別モード切替、日別欄と共通時間欄を表示し', '日付・値・styleをpropsで受け', '操作をcallbackで親に通知します。', '開始/終了日からの複数日判定', '日付一覧', 'dailyTimesMode', 'dailyTimes', 'payload/API/dirty/submitは親に維持しています。', 'FE-P-04・FE-P-05・FE-Q-10の3統合ケースとE2E-C-07', 'ArticlesList.tsx', '記事の取得・関連商品候補の取得・一覧stateと読み込みエラー', '読み込み中・table・空状態の描画', '公開切替・編集・削除callbackの通知', '17:46の関連runnerではTypeScript 1件・build 1件・runner 50件・Vitest 31件・Playwright 23件が成功し、失敗・skipは0件でした。', '最終更新: 2026-10-30 17:48', '段階2: ArticlesList.tsxへの記事一覧表示分離をDD-01・DD-03・PM-06へ記録', '17:46関連runnerでTypeScript 1・build 1・runner 50・Vitest 31・Playwright 23が成功', '17:44のAdminDocs期待文字列不一致は修正runnerで解消', '段階2の進捗メモ（2026-10-31 03:55）', 'Reservations.tsx のモバイルカード/PCテーブルによる予約一覧表示を', 'reservations/ReservationsList.tsx に分離しました。', '親は予約・イベント・時間枠の取得', 'タブ/イベントによる絞り込みと並べ替え', '件数集計、ステータス更新APIと状態管理', '選択予約の詳細表示、当日参加モーダル、印刷を維持しています。', '子は絞り込み済み行を受け取り', 'モバイルカード・PCテーブルと空状態を描画し', '予約選択とステータス変更をcallbackで親へ通知します。', '設計書は', 'DD-01', 'DD-03 13章', '18:12の関連runnerではTypeScript 1件・本番build 1件・runner 50件・Vitest 44件・Playwright 24件が成功し、失敗・skipは0件でした', 'この結果は18:12時点の実績として保持します。', '19:55の最終関連runnerでTypeScript 1件・本番build 1件・runner 50件・Vitest 44件・Playwright 24件が成功し、失敗・skipは0件でした', '（所要131秒）', '既定のPC幅1280pxで表を確認し', 'スマホ幅390pxに切り替えてカード表示を確認した後', '1280pxに戻して同じ予約行が再表示されることを確認しました（E2E-Z-01）。', '続く20:00の最終関連runnerでもTypeScript 1件・本番build 1件・runner 50件・Vitest 44件・Playwright 24件が成功し、失敗・skipは0件でした', '（所要88秒）', 'FE-DG-01〜08、E2E-Z-01、AdminDocs実本文表示を含みます。', '20:00の結果はこのPM-06/DD本文改訂前の実行として保持します。', '20:04の単独確認ではAdminDocs全体9/10で', '今回の変更と無関係な既存.mdリンク遷移テスト1件が失敗しました。', '20:09の単独確認ではFE-DC-03が1件成功しました。', '20:11 runnerはその後の本文追記・AdminDocs期待値同期より前の版を対象に実行され', 'TypeScript 1件・build 1件・runner 50件・Vitest 44件・Playwright 24件が成功、失敗・skip 0', '（114秒）', '20:11のrunner結果を現行本文の確認実績とは扱いません。', '03:51 runnerではVitest 44件が成功しましたが', 'Playwrightは21件成功・3件失敗でした。', '失敗した3ケースは後続の単独再実行で3件とも成功しました。', 'EventAdminInfoGuidelinesSection.tsx', '文章欄と既存の画像表示部品をまとめる層', 'useEventAdminInfoGuidelinesImages', '画像の逐次アップロード・部分失敗の記録・削除確認・viewer操作を担当します'],
  },
].map((doc) => ({
  ...doc,
  // 1. テストファイルの絶対パスからリポジトリのdoc/を解決し、runnerの起動位置に依存せず本文を読む
  markdown: readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../doc', doc.path), 'utf8'),
}))

/** 実文書3件をAdminDocsのAPIツリーノードとして選べる形にする */
const REAL_DOC_TREE = [
  {
    type: 'dir' as const,
    name: '02_DD',
    path: '02_DD',
    children: REAL_DOCS.filter((doc) => doc.path.startsWith('02_DD/')).map((doc) => ({
      type: 'file' as const,
      name: doc.path.split('/')[1],
      path: doc.path,
    })),
  },
  {
    type: 'dir' as const,
    name: '03_PM',
    path: '03_PM',
    children: REAL_DOCS.filter((doc) => doc.path.startsWith('03_PM/')).map((doc) => ({
      type: 'file' as const,
      name: doc.path.split('/')[1],
      path: doc.path,
    })),
  },
]

/**
 * 設計書の画面を開き、最初のファイル（01_概要）をツリーから選んで本文が出るまで待つ
 * @returns なし
 */
async function openOverview() {
  render(
    <MemoryRouter initialEntries={['/admin/docs']}>
      <AdminDocs />
    </MemoryRouter>,
  )
  // 1. フォルダを開いてファイルを選ぶ
  fireEvent.click(await screen.findByRole('button', { name: /01_BD/ }))
  fireEvent.click(screen.getByRole('button', { name: '01_概要' }))
  // 2. 本文の見出しが出るまで待つ
  await screen.findByRole('heading', { name: '概要' })
}

describe('AdminDocs の本文のリンク', () => {
  beforeEach(() => {
    vi.mocked(api.docs.tree).mockReset()
    vi.mocked(api.docs.content).mockReset()
    vi.mocked(api.docs.tree).mockResolvedValue(TREE)
    vi.mocked(api.docs.content).mockImplementation((path: string) =>
      CONTENTS[path] ? Promise.resolve(CONTENTS[path]) : Promise.reject(new Error('404')),
    )
    // jsdom には scrollIntoView が無いので、見出しへのスクロールを空の関数にする
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('.md へのリンクを押すと画面を移動せずにそのファイルを読み込み、本文が切り替わる', async () => {
    await openOverview()
    // 1. リンクを押す
    fireEvent.click(screen.getByRole('link', { name: 'API 仕様へ' }))
    // 2. 開いているファイルの場所から解決したパスで本文を取りに行く
    await waitFor(() => expect(api.docs.content).toHaveBeenLastCalledWith('02_DD/06_API仕様.md'))
    // 3. 本文が切り替わり、ツリーでも選択中になる（別フォルダも自動で開く）
    expect(await screen.findByRole('heading', { name: 'API 仕様' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '概要' })).toBeNull()
    // 本文の切替とツリー側の選択属性が別々の描画に反映されても、選択状態まで待つ
    await waitFor(() => expect(screen.getByRole('button', { name: '06_API仕様' })).toHaveAttribute('aria-current', 'true'))
  })

  it('.md へのリンクに #見出し があると、開いた後にその見出しまでスクロールする', async () => {
    await openOverview()
    fireEvent.click(screen.getByRole('link', { name: 'API 仕様へ' }))
    await screen.findByRole('heading', { name: 'API 仕様' })
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
    // スクロールした要素は「イベント」の見出し
    const contexts = vi.mocked(Element.prototype.scrollIntoView).mock.contexts
    // tsconfig の lib が ES2020 で Array.prototype.at が使えないため、末尾は添字で取る
    const target = contexts[contexts.length - 1] as HTMLElement
    expect(target.textContent).toBe('イベント')
  })

  it('外部リンクは target=_blank・rel=noopener noreferrer が付き、新しいタブで開く', async () => {
    await openOverview()
    const link = screen.getByRole('link', { name: '外部のページ' })
    expect(link).toHaveAttribute('href', 'https://example.com/page')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('外部リンクを押しても設計書の読み込みは行わない（本文はそのまま）', async () => {
    await openOverview()
    const calls = vi.mocked(api.docs.content).mock.calls.length
    fireEvent.click(screen.getByText('外部のページ'))
    expect(vi.mocked(api.docs.content).mock.calls.length).toBe(calls)
    expect(screen.getByRole('heading', { name: '概要' })).toBeInTheDocument()
  })

  it('設計書の外のファイルへのリンクは href が外れ、理由が title に入る', async () => {
    await openOverview()
    const el = screen.getByText('ソース')
    expect(el.tagName).toBe('A')
    expect(el).not.toHaveAttribute('href')
    expect(el.getAttribute('title')).toContain('設計書の外のファイル')
  })

  it('本文の <script> は無害化されて実行されない', async () => {
    await openOverview()
    expect(document.querySelector('.docs-markdown script')).toBeNull()
    expect((window as unknown as { __docsXss?: boolean }).__docsXss).toBeUndefined()
  })

  it('リンク先のファイルの読み込みに失敗すると「ファイルの取得に失敗しました」が出る', async () => {
    await openOverview()
    vi.mocked(api.docs.content).mockRejectedValueOnce(new Error('500'))
    fireEvent.click(screen.getByRole('link', { name: 'API 仕様へ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ファイルの取得に失敗しました')
  })
})

describe('AdminDocs の実文書本文表示', () => {
  beforeEach(() => {
    vi.mocked(api.docs.tree).mockReset()
    vi.mocked(api.docs.content).mockReset()
    vi.mocked(api.docs.tree).mockResolvedValue(REAL_DOC_TREE)
    vi.mocked(api.docs.content).mockImplementation((path: string) => {
      const doc = REAL_DOCS.find((candidate) => candidate.path === path)
      return doc ? Promise.resolve(doc.markdown) : Promise.reject(new Error('404'))
    })
  })

  /**
   * 実文書を選択し、Markdown描画後に指定本文が表示されることを確かめる。
   * @param doc - 実リポジトリから読み込んだ文書と表示確認用の見出し・本文文字列
   * @returns 文書の見出しと本文が表示されるまで待つPromise
   */
  async function expectRealDocRendered(doc: (typeof REAL_DOCS)[number]) {
    // 1. 実リポジトリの文書ツリーを読み込み、対象ファイルを選択する
    render(
      <MemoryRouter initialEntries={[`/admin/docs?path=${encodeURIComponent(doc.path)}`]}>
        <AdminDocs />
      </MemoryRouter>,
    )

    // 2. 選択中の実ファイルをAPIモック経由で取得し、見出しと実本文が描画されるのを待つ
    expect(await screen.findByRole('heading', { name: doc.heading })).toBeInTheDocument()
    await waitFor(() => expect(api.docs.content).toHaveBeenCalledWith(doc.path))
    // renderedMarkdown: AdminDocsがMarkdownから生成した本文コンテナ。
    const renderedMarkdown = document.querySelector('.docs-markdown')
    expect(renderedMarkdown).toBeInTheDocument()
    // 3. この文書に期待する見出し・識別文字列が描画本文に含まれることを1件ずつ確認する
    for (const text of doc.expected) {
      expect(renderedMarkdown).toHaveTextContent(text)
    }
  }

  it('モジュール構成の実本文をMarkdownとして表示する', async () => {
    await expectRealDocRendered(REAL_DOCS[0])
  })

  it('フロントエンドロジックの実本文をMarkdownとして表示する', async () => {
    await expectRealDocRendered(REAL_DOCS[1])
  })

  it('プロジェクト全体リファクタリング計画の実本文をMarkdownとして表示する', async () => {
    await expectRealDocRendered(REAL_DOCS[2])
  })
})
