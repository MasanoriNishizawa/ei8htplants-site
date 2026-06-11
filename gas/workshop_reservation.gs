/**
 * gas/workshop_reservation.gs
 * ============================
 * ei8ht plants — ワークショップ予約管理 GAS スクリプト
 *
 * このスクリプトは Google Apps Script ウェブアプリとしてデプロイし、
 * FastAPI の /reserve ページから POST されたフォームデータを処理する。
 *
 * 処理の流れ:
 *   1. /reserve ページがイベントの GAS URL に form POST を送信
 *   2. doPost(e) が呼ばれて満席チェック → Sheets 書き込み → 確認メール送信
 *   3. 成功/エラーの HTML ページを返してユーザーに表示
 *
 * ===================================================
 * デプロイ手順
 * ===================================================
 *   1. ei8ht plants の Google スプレッドシートを開く
 *   2. 「拡張機能」→「Apps Script」を開く
 *   3. このコードを貼り付けて保存（Ctrl+S）
 *   4. 「デプロイ」→「新しいデプロイ」→ 種類を「ウェブアプリ」に設定
 *      - 説明: "ワークショップ予約 v1"
 *      - 実行者: 自分（スプレッドシートのオーナー）
 *      - アクセス権: 全員（匿名含む）
 *   5. 「デプロイ」をクリック → 生成された URL をコピー
 *   6. スプレッドシートのイベント行の「WS予約URL」列に貼り付ける
 *
 * ===================================================
 * スプレッドシート構成
 * ===================================================
 *   このスクリプトは「WS予約」という名前のシートを自動作成する。
 *   予め手動で作成しておく必要はない。
 *
 *   WS予約 シートの列構成（自動作成）:
 *     A: タイムスタンプ
 *     B: イベント名
 *     C: お名前
 *     D: メールアドレス
 *     E: 電話番号
 *     F: 希望日
 *     G: 希望時間帯
 *     H: 参加人数
 *     I: 植木鉢持参
 *     J: 植物持参
 *     K: 備考
 */

// ================================================================
// 設定値
// ================================================================

/** 予約完了後に表示する「イベント一覧に戻る」リンク先 */
var SITE_URL = "https://ei8htplants.onrender.com";

/** 1 時間帯あたりの最大参加人数 */
var MAX_PARTICIPANTS = 4;

/** 予約データを書き込むシート名（なければ自動作成） */
var SHEET_NAME = "WS予約";

// ================================================================
// POST ハンドラ — 予約フォーム送信処理
// ================================================================

/**
 * フォーム送信を受け取り、満席チェック → Sheets 書き込み → 確認メール送信を行う。
 * HTML ページを返してユーザーに結果を伝える。
 */
function doPost(e) {
  try {
    var data = parseFormData(e);

    // バリデーション（必須項目）
    if (!data.name || !data.email || !data.date || !data.time) {
      return createErrorPage("必須項目（お名前・メールアドレス・希望日・希望時間帯）が入力されていません。");
    }

    // 満席チェック: 同じイベント×日付×時間帯の参加人数合計を確認
    var currentCount = getParticipantCount(data.eventName, data.date, data.time);
    if (currentCount + data.participants > MAX_PARTICIPANTS) {
      var remaining = MAX_PARTICIPANTS - currentCount;
      var msg = remaining <= 0
        ? "ご指定の時間帯は満席です。他の時間帯をお選びください。"
        : "残り " + remaining + " 席のみです。参加人数を " + remaining + " 名以下に変更してください。";
      return createErrorPage(msg);
    }

    // Sheets に書き込み
    writeToSheet(data);

    // 確認メール送信
    sendConfirmEmail(data);

    return createSuccessPage(data);

  } catch (err) {
    return createErrorPage("システムエラーが発生しました。お手数ですが Instagram DM にてご連絡ください。<br><small>(" + err.message + ")</small>");
  }
}

// ================================================================
// GET ハンドラ — 空き状況確認 API（オプション）
// ================================================================

/**
 * ?action=checkAvailability&event_name=X&date=YYYY-MM-DD&time=HH:MM-HH:MM
 * で呼び出すと、指定スロットの残席数を JSON で返す。
 *
 * FastAPI 側で fetch() によるリアルタイムチェックに使用できる。
 * CORS の制約によりブラウザからの直接呼び出しは機能しない場合がある。
 */
function doGet(e) {
  if (e.parameter.action === "checkAvailability") {
    var eventName = e.parameter.event_name || "";
    var date      = e.parameter.date       || "";
    var time      = e.parameter.time       || "";

    var current   = getParticipantCount(eventName, date, time);
    var available = MAX_PARTICIPANTS - current;

    var result = JSON.stringify({
      available: available,
      max:       MAX_PARTICIPANTS,
      current:   current,
      isFull:    available <= 0
    });

    return ContentService.createTextOutput(result)
      .setMimeType(ContentService.MimeType.JSON);
  }

  // action 未指定のアクセス（動作確認用）
  return ContentService.createTextOutput(JSON.stringify({ status: "ok", message: "GAS is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================================================================
// ヘルパー関数
// ================================================================

/** フォームデータを安全にパースして正規化された object を返す */
function parseFormData(e) {
  var p = e.parameter;
  return {
    eventName:   p.event_name  || "",
    name:        p.name        || "",
    email:       p.email       || "",
    phone:       p.phone       || "",
    date:        p.date        || "",
    time:        p.time        || "",
    participants: parseInt(p.participants) || 1,
    bringPot:    p["bring-pot"]   === "yes",
    bringPlant:  p["bring-plant"] === "yes",
    message:     p.message     || "",
  };
}

/**
 * WS予約 シートを取得する。
 * シートが存在しない場合はヘッダー行付きで自動作成する。
 */
function getOrCreateSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "タイムスタンプ", "イベント名", "お名前", "メールアドレス", "電話番号",
      "希望日", "希望時間帯", "参加人数", "植木鉢持参", "植物持参", "備考"
    ]);
    // ヘッダー行を太字・背景色で装飾
    var header = sheet.getRange(1, 1, 1, 11);
    header.setFontWeight("bold");
    header.setBackground("#ffe082");
  }
  return sheet;
}

/**
 * 指定イベント×日付×時間帯の現在の参加人数合計を返す。
 * 満席チェックに使用する。
 */
function getParticipantCount(eventName, date, time) {
  var sheet = getOrCreateSheet();
  var data  = sheet.getDataRange().getValues();
  var count = 0;
  // ヘッダー行（index 0）をスキップ
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    // B: イベント名, F: 希望日, G: 希望時間帯, H: 参加人数
    if (String(row[1]) === String(eventName) &&
        String(row[5]) === String(date)      &&
        String(row[6]) === String(time)) {
      count += parseInt(row[7]) || 0;
    }
  }
  return count;
}

/** Sheets に予約行を書き込む */
function writeToSheet(data) {
  var sheet = getOrCreateSheet();
  sheet.appendRow([
    new Date(),                                // タイムスタンプ
    data.eventName,                            // イベント名
    data.name,                                 // お名前
    data.email,                                // メールアドレス
    data.phone,                                // 電話番号
    data.date,                                 // 希望日
    data.time,                                 // 希望時間帯
    data.participants,                         // 参加人数
    data.bringPot   ? "持参する" : "不要",    // 植木鉢持参
    data.bringPlant ? "持参する" : "不要",    // 植物持参
    data.message,                              // 備考
  ]);
}

/** 申し込み者に確認メールを送信する */
function sendConfirmEmail(data) {
  var dateText = data.date.replace(/-/g, "/");

  var bringItems = [];
  if (data.bringPot)   bringItems.push("植木鉢");
  if (data.bringPlant) bringItems.push("植物");
  var bringText = bringItems.length > 0 ? bringItems.join("・") + " を持参" : "なし";

  var lines = [
    "この度は Habitat Style Workshop へのお申し込みありがとうございます。",
    "以下の内容でご予約を承りました。",
    "",
    "━━━━━━━━━━━━━━━━━━",
    "【ご予約内容】",
    "イベント　：" + data.eventName,
    "お名前　　：" + data.name + " 様",
    "ご希望日　：" + dateText,
    "時間帯　　：" + data.time,
    "参加人数　：" + data.participants + " 名",
    "お持ち込み：" + bringText,
  ];
  if (data.message) {
    lines.push("備考　　　：" + data.message);
  }
  lines = lines.concat([
    "━━━━━━━━━━━━━━━━━━",
    "",
    "当日スタッフがご案内いたします。",
    "ご不明な点がございましたら Instagram DM にてお問い合わせください。",
    "",
    "ei8ht plants / Habitat Oides",
    "@habitatoides  |  @ei8ht.plants",
    SITE_URL + "/events",
  ]);

  GmailApp.sendEmail(
    data.email,
    "【ワークショップご予約確認】" + data.eventName + " — ei8ht plants",
    lines.join("\n"),
    {
      replyTo: Session.getActiveUser().getEmail(),
      name:    "ei8ht plants"
    }
  );
}

// ================================================================
// HTML レスポンス生成
// ================================================================

/** 共通のページ CSS */
function pageStyle() {
  return (
    "<style>" +
    "*, *::before, *::after{box-sizing:border-box;}" +
    "body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue','Noto Sans JP',sans-serif;" +
    "display:flex;align-items:center;justify-content:center;" +
    "min-height:100vh;margin:0;background:#fafafa;padding:20px;}" +
    ".card{background:#fff;border:1px solid #e0e0e0;border-radius:6px;" +
    "padding:48px 40px;max-width:480px;width:100%;text-align:center;}" +
    "h1{font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 24px;}" +
    "p{font-size:14px;color:#555;line-height:1.8;margin:0 0 12px;}" +
    ".back{display:inline-block;margin-top:28px;font-size:11px;letter-spacing:2px;" +
    "text-transform:uppercase;color:#999;text-decoration:none;" +
    "border-bottom:1px solid #ddd;padding-bottom:2px;}" +
    ".back:hover{color:#333;border-color:#333;}" +
    "</style>"
  );
}

/** 予約完了ページ */
function createSuccessPage(data) {
  var html = HtmlService.createHtmlOutput(
    "<!DOCTYPE html><html lang='ja'><head>" +
    "<meta charset='UTF-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    "<title>予約完了 | ei8ht plants</title>" +
    pageStyle() +
    "</head><body><div class='card'>" +
    "<h1 style='color:#795548;'>予約が完了しました</h1>" +
    "<p>" + escapeHtml(data.name) + " 様</p>" +
    "<p>確認メールを<br><strong>" + escapeHtml(data.email) + "</strong><br>にお送りしました。</p>" +
    "<p style='font-size:12px;color:#aaa;'>メールが届かない場合は迷惑メールフォルダをご確認ください。</p>" +
    "<a href='" + SITE_URL + "/events' class='back'>← イベント一覧に戻る</a>" +
    "</div></body></html>"
  );
  html.setTitle("予約完了 | ei8ht plants");
  return html;
}

/** エラーページ */
function createErrorPage(message) {
  var html = HtmlService.createHtmlOutput(
    "<!DOCTYPE html><html lang='ja'><head>" +
    "<meta charset='UTF-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    "<title>エラー | ei8ht plants</title>" +
    pageStyle() +
    "</head><body><div class='card'>" +
    "<h1 style='color:#c0392b;'>送信できませんでした</h1>" +
    "<p>" + message + "</p>" +
    "<a href='javascript:history.back()' class='back'>← 戻る</a>" +
    "</div></body></html>"
  );
  html.setTitle("エラー | ei8ht plants");
  return html;
}

/** XSS 対策の HTML エスケープ */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
