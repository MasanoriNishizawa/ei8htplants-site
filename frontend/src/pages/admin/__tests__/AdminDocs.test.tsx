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
    expected: ['予約送信のHTTP 400案内文を日本語・英語で分類', 'reserve/errorMessage.ts', 'lib/reserve/errorMessage.ts', 'API型定義ファイルツリー', 'gallery.ts', 'priceCalcEntries.ts', 'EventSiteImageInput.tsx', 'EventSiteLineupEditor.tsx', 'ラインナップ一覧・名称/説明/画像の入力、追加/削除UI。変更はcallbackで親に通知', '親の pc.lineup state・保存・dirty判定を維持', 'API契約・保存形式は不変', 'CheckoutShippingAddressFields.tsx', 'EventDailyTimesField.tsx', '日別時間モードの切替、複数日の各日時間欄、単一の共通時間欄を表示', '日付・選択状態・共通時間・ラベルstyleをpropsで受け', '日付計算・state・初期値・保存処理は持たない', 'admin/articles/ArticlesList.tsx', '読み込み中・記事table・空状態の表示。記事と状態をpropsで受け、公開切替・編集・削除をcallbackで親へ通知', 'admin/articles/ArticleEditorModal.tsx', '記事の入力UI。フォーム値と操作callbackを親から受け、編集・タグ・本文ブロック・関連商品・公開状態を表示', 'admin/reservations/ReservationsList.tsx', '絞り込み済み予約のモバイルカード/PCテーブル表示', 'イベント名・更新状態・選択/更新callbackを親から受け取る', 'admin/EventWalkinReservationModal.tsx', '当日参加入力UIを表示し、入力・閉じる・登録操作を親へ通知', 'admin/Reservations.tsx（取得・初期値・絞り込み/集計・更新・詳細/当日参加モーダル管理・成功後の行追加）', 'ReserveScheduleFields.tsx', 'ReserveCustomerFields.tsx', '参加人数、氏名・メール・電話、植物/鉢の持ち込み、備考の入力UIを表示する', 'EventAdminInfoGuidelinesSection.tsx', '出店要項の文章欄と画像表示をまとめる表示部品', 'useEventAdminInfoGuidelinesImages.ts', '画像の逐次アップロード・部分失敗・削除確認とviewer操作', '枠の読み込み中・失敗・空・満席・残席数', 'HomeApproachSection.tsx', '02 / OUR APPROACH', '見出し・説明・リンク要素を親から受け取り、表示専用', 'HomeGallerySection.tsx', 'Gallery見出し・View Allリンク・2周の画像マーキー表示', '画像一覧・見出し書体を親から受け取る', 'HomeBrandShowcase.tsx', '公式HomeツリーにHomeBrandShowcase.tsxを追加', '2026-10-31 06:18', 'HomeBrandShowcaseの記録後、FE-DC-01でAdminDocsにDD-01の実本文を表示して再確認。', 'Vitest 17・Playwright admin-docs 4・TypeScript/build/runner成功', '画面確認は設計書本文の表示に限定', 'HomeSocialSection.tsx', 'HomeSocialSection.tsx（Instagramリンク・シェア表示）', 'HomeShopSection.tsx', 'Shop見出し・全商品カード表示。親から表示対象商品を受け取る', 'checkout/orderErrorMessage.ts', '注文送信失敗の画面向け文言を日本語・英語で分類'],
  },
  {
    path: '02_DD/03_フロントエンドロジック.md',
    heading: 'DD-03 — フロントエンドロジック',
    expected: ['既存の Reserve.test.tsx FE-BE-08〜19', 'reserve400Message(err, t)', '69. Reserve — HTTP 400案内文の分離', 'API 型定義の配置', 'apiTypes/gallery.ts', 'apiTypes/priceCalcEntries.ts', 'GalleryImage', '単画像の入力UIは', 'CheckoutShippingAddressFields.tsx', '配送先の5項目', 'HTML標準検証に使う', 'reserve/ReserveScheduleFields.tsx', '複数日イベントの日付ラジオ', '時間枠変更時の参加人数リセット', 'reserve/ReserveCustomerFields.tsx', '表示部品は参加人数と各入力値', '入力変更はcallbackで親へ通知し', '独自stateや予約API・送信処理は持ちません。', 'フォームstate、人数変更時の値更新', '状態判定と予約state、入力中のフォーム、予約payload作成・API送信は', 'EventDailyTimesField.tsx', '日別時間モードの切替、日付ごとの開催時間欄、共通開催時間欄の表示', '複数日イベントだけ「日ごとに異なる」チェック欄', '親から受け取った各日について日付ラベルと', 'onDailyTimesModeChange', 'onDailyTimeChange', '日付配列の算出・state・初期値設定・保存処理を持ちません。', '開始日・終了日の比較と listDates', 'dailyTimesMode と dailyTimes のstate', '日別モードを有効にした時点では', '各日を現在の共通時間で初期化します。', '複数日かつ日別モードの場合だけ', 'daily_times', '60. 管理画面 — 記事一覧と編集モーダルの表示分離', 'ArticlesList.tsx', 'ArticleEditorModal.tsx', '2026-11-01に編集モーダルの表示と入力UIを articles/ArticleEditorModal.tsx に分けました。', '子は editing・フォーム値・本文ブロック・タグ入力値・商品候補・保存状態・エラー表示を受け取り、', 'フォーム項目、本文ブロック、タグ、関連商品、公開状態と操作ボタンを描画します。', '入力変更・タグ操作・商品選択・保存・閉じる要求はcallbackで親へ返します。', '未保存確認、Esc操作、API呼び出し、フォームstateと保存処理は親に残しています。', 'loading', 'hasPageError', '公開切替・編集・削除の各callback', '画像・タイトル・タグ・公開日・公開状態・操作の表', '親から一覧エラーが渡された場合は空状態として扱いません。', '子はデータ取得や操作用state、API呼び出しを持ちません。', 'モバイルカード/PCテーブルの表示分離', 'reservations/ReservationsList.tsx', 'Reservations.tsx は予約とイベントの取得', '全イベント表示時に限りカードとテーブルへイベント名を加え', 'onSelectReservation', 'onStatusUpdate', '各表示形式の空状態', '読み込み中/エラー表示は親に残します。', '子はAPI取得、絞り込み、並べ替え、更新stateを持ちません。', 'EventAdminInfoGuidelinesSection.tsx', '文章欄と画像表示部品をまとめる', 'useEventAdminInfoGuidelinesImages', 'hookがアップロード進捗/エラー', 'hookは画像を選択順に逐次アップロード', 'hookは注入された更新関数とアップロード関数を使います', '61. 管理画面 — 設計書目次・本文表示の分離', 'AdminDocsTree.tsx', 'スマートフォン向け開閉ボタン', 'FE-DI-01', '62. 公式ホーム — OUR APPROACH表示の分離', 'HomeApproachSection.tsx', 'title', 'description', 'action', 'ReactNode props', '翻訳・リンク生成・state・API処理を持ちません。', '63. 公式ホーム — GALLERY表示の分離', 'HomeGallerySection.tsx', 'gallery.length > 0', '画像順', '2周目の画像ラッパーは', '1周目は img.alt を維持し', '2周目は空のalt', '両周とも', 'loading="lazy"', '64. 公式ホーム — ブランド紹介帯の表示分離', 'HomeBrandShowcase.tsx', 'BRAND_SHOWCASES', 'activeCard', "matchMedia('(max-width: 767px)')", 'hoverまたはキーボードfocus', 'mouseleaveすると先頭へ戻します', '1280pxで2枚目へhover', '390pxではカード3枚の展開情報と縦並びを確認', '65. 公式ホーム — Instagram・シェア表示の分離', 'HomeSocialSection.tsx', 'Habitat Oides・ei8ht plants・HUE by ei8ht plants', 'useT()', '/official', 'ei8ht plants — Collect the strange.', '66. 公式ホーム — Shop表示の分離', 'HomeShopSection.tsx', 'formatYen', '画像がない商品は既存のプレースホルダーを表示します。', 'homeTypography.ts', '67. 公開チャット — メッセージ本文表示の分離（ChatMessageText.tsx、2026-10-31）', 'Chat.tsx からメッセージ本文の改行表示とURLのリンク化を ChatMessageText.tsx に分けました。', '親は歓迎メッセージ、会話・入力・送信中のstate、スクロール、入力検証、送信履歴の組み立て、api.chat.send() の呼び出し、応答・エラー案内の追加を引き続き担当します。', '公開チャットAPIや送信内容、stateの持ち方は変更していません。', '各行の http:// または https:// から始まる空白までの文字列を新しいタブで開くリンクにし', 'URL末尾の句読点・括弧類はリンクの外に通常の文字として残します。', '子は会話state、入力、送信、API呼び出しを持ちません。', '68. Checkout — 注文エラー案内の分離（orderErrorMessage.ts、2026-10-31）', 'orderErrorMessage(err, t)', '支払い済みまたは決済結果を確認できない場合に注文し直す案内を出さない既存条件も維持します。', '既存の Checkout.test.tsx 40件', 'API仕様・通信動作に変更はありません。', 'EventWalkinReservationModal.tsx', 'イベント別予約画面の当日参加モーダルを', '子はイベント日数に応じた参加日の表示、時間枠の選択または自由入力、参加人数、登録エラーと操作ボタンを表示します。', '閉じる操作、登録操作をcallbackで親へ通知します。', 'EventReservations.tsx はイベントと時間枠の取得、当日参加フォームの値、登録中・失敗状態、登録APIと成功後の一覧更新を引き続き管理します。', '子はAPI通信や登録stateを持ちません。', 'EventSiteLineupEditor.tsx', 'ラインナップ一覧の編集UIは', '行の名称・説明・画像欄と追加・削除操作を描画', 'onItemChange', 'onAdd', 'onRemove', '親は pc.lineup state、部分更新、追加・削除後の配列更新を担当', 'API契約・保存データ形式・画面操作を変更していません。'],
  },
  {
    path: '03_PM/06_プロジェクト全体リファクタリング計画.md',
    heading: 'PM-06 — プロジェクト全体リファクタリング計画',
    expected: [
      '段階4の追記（2026-11-01 04:30、BE-Y-30最終関連runner）',
      'BE-Y-26〜30で在庫確保途中の失敗、補償RPCの例外・False戻り値後も補償を続けること',
      'BE-Y-30では、2品目目の decrement_stock.execute() がモック上で例外を送出するとHTTP 500になり',
      '先行1品目の在庫補償RPCを呼び、Square決済と注文保存を呼ばないことを確認しました。',
      '2026-11-01 04:30の最終関連runnerではTypeScript 1件・本番build 1件・runner unittest 50件・Vitest 51件・Playwright 10件・pytest 30件が成功し',
      '分析ダッシュボードは関連なしで省略しています。',
      '04:12のPlaywright起動 listen EPERM は04:15の権限付き実行で解消しました。',
      'このモックは2品目目の在庫変更が実DBに適用済みか、rollbackされたかを検証しません。',
      '実DB状態とrollbackは引き続き未確認で、段階4は未完了です。',
      'BE-Y-26〜30で在庫確保途中の失敗、補償RPCの例外・False戻り値後も補償を続けること、決済後の明細保存失敗、2品目目の在庫確保RPC例外時に先行分を補償し決済・注文保存を止めることをモック確認済み。',
      'イベント別予約画面の当日参加モーダル表示を EventWalkinReservationModal.tsx に分離しました。',
      '入力値・登録状態・登録APIと成功後の一覧更新は EventReservations.tsx に維持し、子は既存入力UIの表示と親への操作通知を担当します。',
      'API契約・予約データ形式は変更していません。',
      '04:30最終関連runnerで注文hardening pytest 30件成功（失敗・skip 0）',
      '決済後の通知失敗、冪等性、実DBでの補償後状態・rollback、応答喪失後の状態は未確認。段階4を継続し、注文処理は未分割',
      '段階4の追記（2026-11-01 06:23、BE-Y-31注文メール失敗経路）',
      'BE-Y-31では、注文本体・注文明細の保存 → 購入者確認メール送信例外 → 管理者通知の試行',
      'HTTP 200と保存注文の order_id を返すことを確認しました。',
      '06:23を最終結果として扱います。',
      '実際のメール配信、実DBの永続状態・rollbackは未確認です。',
    ],
  },
  {
    path: '02_DD/04_バックエンドロジック.md',
    heading: 'DD-04 — バックエンドロジック',
    expected: [
      '26. 注文時の在庫確保と失敗時の補償',
      '_reserve_stock()',
      '_rollback_stock()',
      'increment_stock RPC',
      '補償中の個別RPCが例外になった場合はCRITICALログを記録して次の商品へ進みます。',
      'RPC結果の data が明示的に False の場合も同様にCRITICALログを記録し、後続商品の補償を続けます。',
      'BE-Y-26/27/29',
      'BE-Y-30は2品目目の decrement_stock.execute() がモック上で例外を送出する場合にHTTP 500となること',
      '先行1品目の increment_stock 補償を呼ぶこと、Square決済と注文保存を呼ばないことを確認します。',
      '2026-11-01 04:30の最終関連runnerではTypeScript 1件・build 1件・runner 50件・Vitest 51件・Playwright 10件・test_orders_hardening.py のpytest 30件が成功し',
      '分析ダッシュボードは関連なしで省略しました。',
      'この確認はモック上の呼び出し・ログ・応答を対象とし、2品目目の在庫変更が実DBに適用されたか、DB rollbackされたかを検証しません。',
      '通知失敗、実DBに残る在庫や注文の状態',
      'DBトランザクションのrollback',
      '再試行の冪等性',
      '応答喪失時の永続状態',
      '段階4の完了や注文処理本体の分割可否を示す確認でもありません。',
    ],
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

  it('バックエンドロジック設計書の実本文をMarkdownとして表示する', async () => {
    await expectRealDocRendered(REAL_DOCS[3])
  })
})
