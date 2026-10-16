import { useT } from '../lib/lang'
import PageMeta from '../components/PageMeta'

// 見出しの書体（特定商取引法のページと同じ）
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
// 本文の書体
const SANS = "'Noto Sans JP', sans-serif"
// ページ背景色
const BG = '#faf9f7'

/** 制定日（改定したら更新する） */
export const PRIVACY_POLICY_DATE = { ja: '2026年10月16日 制定', en: 'Established October 16, 2026' }

/** Google アナリティクスのオプトアウト（計測を止める）アドオンの URL */
export const GA_OPTOUT_URL = 'https://tools.google.com/dlpage/gaoptout'
/** Google がパートナーサイトのデータをどう使うかの説明ページの URL */
export const GOOGLE_PARTNER_URL = 'https://policies.google.com/technologies/partner-sites'

/** 本文の1行。文字列なら段落、{ text, href } ならリンク付きの段落 */
type Line = string | { text: string; href: string }

/** 1つの節（見出しと本文。本文は ja / en それぞれの行の配列） */
interface Section {
  title: string
  titleEn: string
  body: Line[]
  bodyEn: Line[]
}

// プライバシーポリシーの各節。サイトで実際に取得・送信している情報に合わせて書いている。
// フォームの項目や外部サービスを変えたら、ここも見直すこと
const sections: Section[] = [
  {
    title: '1. 基本方針',
    titleEn: '1. Basic Policy',
    body: [
      'ei8ht plants（以下「当店」）は、ei8ht plants・Habitat Oides・HUE by ei8ht plants の公式サイト（https://ei8htplants.com、以下「本サイト」）でお預かりする個人情報を、個人情報の保護に関する法律その他の関係法令に従い、適切に取り扱います。',
    ],
    bodyEn: [
      'ei8ht plants ("we") handles personal information received through the official website of ei8ht plants, Habitat Oides and HUE by ei8ht plants (https://ei8htplants.com, the "Site") appropriately and in accordance with the Act on the Protection of Personal Information of Japan and other applicable laws.',
    ],
  },
  {
    title: '2. 取得する情報',
    titleEn: '2. Information We Collect',
    body: [
      '本サイトでは、次の情報を取得します。',
      '・お問い合わせ：お名前、メールアドレス、お問い合わせ内容',
      '・ワークショップのご予約：お名前、メールアドレス、電話番号（任意）、参加人数、ご希望の日時、植物・鉢の持ち込みの有無、備考',
      '・オンラインショップのご注文：お名前、メールアドレス、電話番号（任意）、お届け先の住所、備考、ご注文内容',
      '・AIチャット：ご入力いただいたメッセージと回答の内容、IPアドレスから作成した識別用の値（IPアドレスそのものは保存しません）',
      '・アクセス情報：閲覧したページ、ご利用の端末・ブラウザの種類、おおよその地域、参照元など（Google アナリティクスによる。第5項）',
      'クレジットカード情報は決済代行会社（Square）が直接受け取り、当店のサーバーでは保存しません。',
    ],
    bodyEn: [
      'We collect the following information on the Site:',
      '- Contact form: name, email address and message',
      '- Workshop reservations: name, email address, phone number (optional), number of participants, preferred date and time, whether you bring a plant or pot, and notes',
      '- Online shop orders: name, email address, phone number (optional), shipping address, notes and order details',
      '- AI chat: the messages you enter and the replies, and an identifier derived from your IP address (the IP address itself is not stored)',
      '- Access information: pages viewed, device and browser type, approximate region, referrer, etc. (via Google Analytics; see Section 5)',
      'Credit card information is received directly by our payment processor (Square) and is not stored on our servers.',
    ],
  },
  {
    title: '3. 利用目的',
    titleEn: '3. Purposes of Use',
    body: [
      '取得した情報は、次の目的に限って利用します。',
      '・お問い合わせへの回答',
      '・ワークショップの予約受付、確認・変更・キャンセルのご連絡、当日の運営',
      '・ご注文の決済、商品の発送、発送のご連絡、アフターサービス',
      '・AIチャットの回答の品質向上と、不正な利用の防止',
      '・本サイトの利用状況の把握と、サービスの改善',
      '・法令に基づく対応',
    ],
    bodyEn: [
      'We use the information only for the following purposes:',
      '- Responding to your inquiries',
      '- Accepting workshop reservations, contacting you about confirmations, changes and cancellations, and running the workshop',
      '- Processing payments, shipping orders, sending shipping notices and providing after-sales support',
      '- Improving the quality of AI chat replies and preventing misuse',
      '- Understanding how the Site is used and improving our services',
      '- Complying with laws and regulations',
    ],
  },
  {
    title: '4. 第三者への提供と業務の委託',
    titleEn: '4. Disclosure to Third Parties and Service Providers',
    body: [
      '当店は、法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供しません。',
      'ただし、本サイトの運営に必要な範囲で、次の外部サービスに情報の保管・処理を委託しています。委託先には、日本国外のサーバーで情報を保管・処理するものがあります。',
      '・Supabase（データベース・画像の保管）',
      '・Render（本サイトのサーバー）',
      '・Resend（予約・注文・お問い合わせの確認メールの送信）',
      '・Square（クレジットカード決済）',
      '・Google（AIチャットの回答の生成〔Gemini API〕、アクセス解析〔Google アナリティクス〕、文字の表示に使うフォントの配信〔Google Fonts〕。フォントの配信では、ページを開いたときに IP アドレスなどが Google に送られます）',
    ],
    bodyEn: [
      'We do not disclose personal information to third parties without your consent, except as required by law.',
      'However, to the extent necessary to operate the Site, we entrust the storage and processing of information to the following service providers, some of which store and process information on servers outside Japan:',
      '- Supabase (database and image storage)',
      '- Render (web server hosting the Site)',
      '- Resend (sending confirmation emails for reservations, orders and inquiries)',
      '- Square (credit card payments)',
      '- Google (generating AI chat replies [Gemini API], access analytics [Google Analytics] and delivering web fonts [Google Fonts]; when a page is opened, your IP address and similar information are sent to Google to deliver the fonts)',
    ],
  },
  {
    title: '5. アクセス解析ツール（Google アナリティクス）について',
    titleEn: '5. Analytics (Google Analytics)',
    body: [
      '本サイトでは、利用状況を把握するために Google LLC の「Google アナリティクス」を利用しています。Google アナリティクスは Cookie などを使ってアクセス情報を収集しますが、お名前やメールアドレスなど個人を特定する情報は含みません。管理画面のページは計測していません。',
      '収集された情報は Google のプライバシーポリシーに基づいて管理されます。Google によるデータの使われ方は次のページでご確認いただけます。',
      { text: 'Google のサービスを使用するサイトやアプリから収集した情報の Google による使用', href: GOOGLE_PARTNER_URL },
      '計測を望まない場合は、ブラウザの設定で Cookie を無効にするか、Google が提供する次のアドオンをご利用ください。',
      { text: 'Google アナリティクス オプトアウト アドオン', href: GA_OPTOUT_URL },
    ],
    bodyEn: [
      'The Site uses Google Analytics, a service of Google LLC, to understand how the Site is used. Google Analytics collects access information using cookies and similar technologies, but this does not include information that identifies you, such as your name or email address. Admin pages are not tracked.',
      'The collected data is managed under Google\'s privacy policy. You can learn how Google uses this data on the following page:',
      { text: 'How Google uses information from sites or apps that use its services', href: GOOGLE_PARTNER_URL },
      'If you do not wish to be tracked, you can disable cookies in your browser settings or use the following add-on provided by Google:',
      { text: 'Google Analytics Opt-out Browser Add-on', href: GA_OPTOUT_URL },
    ],
  },
  {
    title: '6. ブラウザへの保存',
    titleEn: '6. Data Stored in Your Browser',
    body: [
      '本サイトでは、表示言語の設定とショッピングカートの中身を、お使いのブラウザ（ローカルストレージ）に保存します。これらは当店のサーバーには送信されず、ブラウザの設定から削除できます。',
    ],
    bodyEn: [
      'The Site stores your language preference and shopping cart contents in your browser (local storage). This data is not sent to our servers and can be deleted from your browser settings.',
    ],
  },
  {
    title: '7. 安全管理',
    titleEn: '7. Security',
    body: [
      '当店は、個人情報への不正なアクセス、漏えい、改ざん、紛失を防ぐため、通信の暗号化（HTTPS）、管理画面へのアクセス制限など、必要かつ適切な安全管理措置を講じます。',
    ],
    bodyEn: [
      'We take necessary and appropriate security measures, such as encrypted communication (HTTPS) and access restrictions on the admin pages, to prevent unauthorized access to, leakage, alteration or loss of personal information.',
    ],
  },
  {
    title: '8. 開示・訂正・削除などのご請求',
    titleEn: '8. Requests for Disclosure, Correction or Deletion',
    body: [
      'ご本人から、保有する個人情報の開示、訂正、追加、削除、利用の停止などのご請求があった場合は、ご本人であることを確認したうえで、法令に従い遅滞なく対応します。下記の窓口までご連絡ください。',
    ],
    bodyEn: [
      'If you request disclosure, correction, addition, deletion or suspension of use of your personal information, we will respond promptly in accordance with the law after verifying your identity. Please contact us using the details below.',
    ],
  },
  {
    title: '9. プライバシーポリシーの変更',
    titleEn: '9. Changes to This Policy',
    body: [
      '当店は、法令の改正やサービスの変更に応じて、本ポリシーを変更することがあります。変更後の内容は、本ページに掲載した時点から効力を生じます。',
    ],
    bodyEn: [
      'We may revise this policy in response to changes in laws or our services. The revised policy takes effect when it is posted on this page.',
    ],
  },
  {
    title: '10. お問い合わせ窓口',
    titleEn: '10. Contact',
    body: [
      'ei8ht plants（運営責任者：西澤 政徳）',
      '所在地：埼玉県入間市高倉4丁目9番地',
      'メールアドレス：info@ei8htplants.com',
      { text: 'お問い合わせフォーム', href: '/contact' },
    ],
    bodyEn: [
      'ei8ht plants (Representative: Masanori Nishizawa)',
      'Address: 4-9 Takakura, Iruma, Saitama, Japan',
      'Email: info@ei8htplants.com',
      { text: 'Contact form', href: '/contact' },
    ],
  },
]

/**
 * 本文の1行を描画する（リンク付きの行は外部ならリンクを新しいタブで開く）
 * @param line - 行の内容
 * @param key - React の key
 * @returns 段落要素
 */
function renderLine(line: Line, key: number) {
  // 段落の共通スタイル（行間を広めにして読みやすくする）
  const p: React.CSSProperties = { margin: '0 0 10px', lineHeight: 2, fontSize: 14, color: '#444' }
  if (typeof line === 'string') return <p key={key} style={p}>{line}</p>
  const external = line.href.startsWith('http')
  return (
    <p key={key} style={p}>
      <a
        href={line.href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        style={{ color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3, wordBreak: 'break-all' }}
      >
        {line.text}
      </a>
    </p>
  )
}

/** プライバシーポリシーのページ（/privacy）。取得する情報・利用目的・外部サービス・アクセス解析などを掲載する */
export default function PrivacyPolicy() {
  const t = useT()
  return (
    <>
      <PageMeta
        title={t('プライバシーポリシー', 'Privacy Policy')}
        description={t('ei8ht plants のプライバシーポリシー（個人情報の取り扱い・アクセス解析について）', 'ei8ht plants Privacy Policy')}
      />

      <div style={{ background: BG, minHeight: '100vh' }}>
        {/* 見出しの帯（白背景・下線） */}
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '52px 24px 44px' }}>
            <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase', color: '#aaa', margin: '0 0 12px' }}>
              Privacy
            </p>
            <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3.5vw, 32px)', fontWeight: 300, margin: 0, color: '#1c1c1c', letterSpacing: '0.04em', lineHeight: 1.4 }}>
              {t('プライバシーポリシー', 'Privacy Policy')}
            </h1>
          </div>
        </div>

        {/* 本文（各節を順に並べる） */}
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px 100px', fontFamily: SANS }}>
          {sections.map((s) => (
            <section key={s.title} style={{ marginBottom: 44 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 400, color: '#1c1c1c', margin: '0 0 16px', paddingBottom: 10, borderBottom: '1px solid #e8e3da', letterSpacing: '0.03em' }}>
                {t(s.title, s.titleEn)}
              </h2>
              {t(s.body, s.bodyEn).map(renderLine)}
            </section>
          ))}
          {/* 制定日（右寄せ） */}
          <p style={{ textAlign: 'right', fontSize: 13, color: '#888', margin: 0 }}>
            {t(PRIVACY_POLICY_DATE.ja, PRIVACY_POLICY_DATE.en)}
          </p>
        </div>
      </div>
    </>
  )
}
