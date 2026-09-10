/**
 * 日次の取得・判定・記録・通知。UC-01 / UC-02 / UC-03、CON-01 / CON-02 / CON-03。
 *
 * 監視対象アカウントの投稿を毎日1回追跡し、保存数（ブックマーク数）が閾値を
 * 超えた投稿を LINE で担当者に通知し、スプレッドシートに記録する。
 *
 * **監視対象はコードに書かない。** 設定シートの「監視アカウント」に入れる。
 * このリポジトリは公開されているため、誰を見ているかを残さない。
 *
 * ── 導入の手順 ──────────────────────────────
 *   1. スクリプトプロパティに X_BEARER_TOKEN と LINE_CHANNEL_TOKEN を登録する
 *      （LINE_USER_ID は任意。未設定なら broadcast で送る）
 *   2. setup() を1回だけ実行する（3シート作成＋初期設定＋毎朝9時のトリガー作成）
 *   3. 動作確認したいときは dailyRun() を手で実行する
 *
 * ── 運用 ────────────────────────────────
 *   閾値と追跡日数は「設定」シートで変える。コードを触る必要はない。
 *   止めたいときは「設定」シートの 稼働 を OFF にする。
 *
 * ── 費用 ────────────────────────────────
 *   月額 ≈ 410円 × 追跡日数。追跡4日で約1,640円（実測18.3投稿/日での試算）。
 *   同じ投稿は24時間UTC以内に何回読んでも1回しか課金されないため、
 *   費用を決めるのは取得頻度ではなく「1投稿を何日間追いかけるか」。
 */

const CFG = {
  sheet: {
    config:   '設定',
    snapshot: '日次スナップショット',
    log:      '通知ログ',
  },
  api: {
    base: 'https://api.x.com/2',
    postReadUsd: 0.005,
    userReadUsd: 0.010,
    pageSize: 100,
    maxPages: 3,          // 300件を超えたら取りこぼしの可能性ありとして警告する
  },
  line: {
    push:      'https://api.line.me/v2/bot/message/push',
    broadcast: 'https://api.line.me/v2/bot/message/broadcast',
    maxItems:  20,        // 1通に載せる通知の上限。超えた分は件数だけ伝える
  },
  tz: 'Asia/Tokyo',
  triggerHour: 9,
};

const LOG_KIND = { first: '初回', step: '継続', error: '異常', weekly: '週次', budget: '予算' };

// ============================================================
// セットアップ（1回だけ実行する）
// ============================================================

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  initConfigSheet_(ss);
  initSnapshotSheet_(ss);
  initLogSheet_(ss);
  createDailyTrigger_();
  ss.toast('3シートと毎朝' + CFG.triggerHour + '時台のトリガーを作成しました。', 'セットアップ完了', 15);
}

function initConfigSheet_(ss) {
  let sh = ss.getSheetByName(CFG.sheet.config);
  if (sh) return;                       // 既にあれば設定を壊さない
  sh = ss.insertSheet(CFG.sheet.config);

  const rows = [
    ['キー', '値', '説明'],
    ['監視アカウント', '', 'X のユーザー名。@ は付けない。**導入時に手で入れる**'],
    ['ユーザーID', '', '初回実行時に自動で入る。手で触らない'],
    ['追跡日数', 4, '投稿日から何日間追いかけるか。1日増やすと月額が約410円増える'],
    ['閾値1（初回通知）', 500, 'ブックマーク数がこれを超えたら通知する'],
    ['閾値2', 1000, '2段階目。ラベル2を付けて再通知する'],
    ['閾値3', 2000, '3段階目。ラベル3を付けて再通知する'],
    ['ラベル2', '【要チェック】', ''],
    ['ラベル3', '【要注意！！】', ''],
    ['月額予算（円）', 3000, ''],
    ['警告する割合', 0.8, '月額予算のこの割合を超えたら警告を通知する'],
    ['為替レート（円/ドル）', 150, ''],
    ['週次サマリーの曜日', '月', '日 月 火 水 木 金 土 のいずれか'],
    ['稼働', 'ON', 'OFF にすると毎日の実行を止める'],
    ['対象月', '', '自動更新。手で触らない'],
    ['今月の取得件数', 0, '自動更新。手で触らない'],
  ];

  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#EDF0EE');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 160);
  sh.setColumnWidth(3, 460);
  sh.getRange(1, 3, rows.length, 1).setWrap(true);
}

function initSnapshotSheet_(ss) {
  if (ss.getSheetByName(CFG.sheet.snapshot)) return;
  const sh = ss.insertSheet(CFG.sheet.snapshot);
  const header = ['取得日時', '投稿ID', '投稿日時', '経過日数', 'ブックマーク', 'インプレッション',
                  'リポスト', 'いいね', '引用', '返信', '商品名', '本文', 'URL'];
  sh.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#EDF0EE');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(3, 130);
  sh.setColumnWidth(11, 220);
  sh.setColumnWidth(12, 380);
  sh.setColumnWidth(13, 250);
}

function initLogSheet_(ss) {
  if (ss.getSheetByName(CFG.sheet.log)) return;
  const sh = ss.insertSheet(CFG.sheet.log);
  const header = ['日時', '種別', '投稿ID', '段階', '閾値', 'ブックマーク', 'URL', '備考'];
  sh.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#EDF0EE');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(7, 250);
  sh.setColumnWidth(8, 380);
}

function createDailyTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyRun') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyRun')
    .timeBased()
    .atHour(CFG.triggerHour)     // 実際の実行は9:00〜10:00のどこか（Apps Script の仕様）
    .everyDays(1)
    .inTimezone(CFG.tz)
    .create();
}

// ============================================================
// 毎日の本体
// ============================================================

function dailyRun() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const conf = readConfig_(ss);

  if (String(conf['稼働']).toUpperCase() !== 'ON') {
    console.log('設定シートの 稼働 が OFF のため終了します。');
    return;
  }

  try {
    runOnce_(ss, conf);
    dailyExtras_(ss, conf);   // 通知の有無にかかわらず、予算チェックと週次サマリーは必ず通す
  } catch (err) {
    // 記録してから LINE に投げる。LINE も落ちていたら Apps Script の失敗メールに任せる。
    // ここでの二次的な失敗で元のエラーが埋もれないよう、それぞれ独立して握りつぶす。
    try {
      appendLog_(ss, [[nowStr_(), LOG_KIND.error, '', '', '', '', '', String(err).slice(0, 400)]]);
    } catch (e) {
      console.error('通知ログへの記録も失敗しました: ' + e);
    }
    try {
      sendLine_('【ガチャモニター 異常】\n' + String(err).slice(0, 800));
    } catch (e) {
      console.error('LINE への異常通知も失敗しました: ' + e);
    }
    throw err;
  }
}

function runOnce_(ss, conf) {
  const token = requireProp_('X_BEARER_TOKEN');
  const trackDays = num_(conf['追跡日数'], 4);

  // --- ユーザーID（初回だけ API で引いて設定シートに書き戻す） ---
  let userId = String(conf['ユーザーID'] || '').trim();
  let userReads = 0;
  if (!userId) {
    userId = fetchUserId_(token, String(conf['監視アカウント']).trim());
    writeConfigValue_(ss, 'ユーザーID', userId);
    userReads = 1;
  }

  // --- 取得 ---
  const fetched = fetchRecentPosts_(token, userId, trackDays);
  const posts = fetched.posts;

  // --- 異常検知 ---
  const anomalies = detectAnomalies_(posts, fetched.hitPageCap);
  anomalies.forEach(function (msg) {
    appendLog_(ss, [[nowStr_(), LOG_KIND.error, '', '', '', '', '', msg]]);
    sendLine_('【ガチャモニター 異常】\n' + msg);
  });

  // --- 課金件数の積算（フィルタ前の件数が課金対象） ---
  addUsage_(ss, conf, posts.length + userReads);

  // --- オリジナル投稿だけに絞る（API のパラメータは当てにしない） ---
  const originals = posts.filter(function (p) { return kindOf_(p) === 'オリジナル'; });
  if (originals.length === 0) return;

  const now = new Date();
  const rows = originals.map(function (p) { return toRow_(p, conf, now); });

  // --- 記録 ---
  appendSnapshot_(ss, rows.map(function (r) {
    return [nowStr_(), r.id, fmt_(r.createdAt), r.ageDays, r.bookmark, r.impression,
            r.retweet, r.like, r.quote, r.reply, r.product, r.text, r.url];
  }));

  // --- 判定 ---
  const steps = thresholdSteps_(conf);
  const notified = readNotifiedStages_(ss, trackDays);
  const hits = [];

  rows.forEach(function (r) {
    if (r.bookmark === null) return;
    const reached = highestStep_(r.bookmark, steps);       // 0 = どの閾値にも届いていない
    const already = notified[r.id] || 0;
    if (reached > already) {
      hits.push({ row: r, stage: reached, step: steps[reached - 1] });
    }
  });

  if (hits.length === 0) return;    // 該当なしの日は何も送らない

  hits.sort(function (a, b) { return b.row.bookmark - a.row.bookmark; });

  sendLine_(buildNotification_(hits));
  appendLog_(ss, hits.map(function (h) {
    return [nowStr_(), h.stage === 1 ? LOG_KIND.first : LOG_KIND.step,
            h.row.id, h.stage, h.step.value, h.row.bookmark, h.row.url, h.step.label];
  }));
}

/** 毎日の実行の最後に呼ばれる。曜日が合えば週次サマリー、予算超過なら警告。 */
function dailyExtras_(ss, conf) {
  checkBudget_(ss, conf);
  if (isSummaryDay_(conf)) sendWeeklySummary_(ss, conf);
}

// ============================================================
// X API
// ============================================================

function fetchUserId_(token, username) {
  const url = CFG.api.base + '/users/by/username/' + encodeURIComponent(username);
  const json = callX_(token, url);
  if (!json.data || !json.data.id) throw new Error('ユーザーが見つかりません: @' + username);
  return json.data.id;
}

/**
 * start_time で追跡期間内の投稿だけを取得する。
 * 課金は「返ってきたリソース数」なので、期間で絞ることがそのまま費用の削減になる。
 */
function fetchRecentPosts_(token, userId, trackDays) {
  const start = new Date(Date.now() - trackDays * 86400000);
  const base = CFG.api.base + '/users/' + userId + '/tweets'
    + '?max_results=' + CFG.api.pageSize
    + '&start_time=' + encodeURIComponent(start.toISOString().replace(/\.\d{3}Z$/, 'Z'))
    + '&exclude=' + encodeURIComponent('replies,retweets')
    + '&tweet.fields=' + encodeURIComponent('created_at,public_metrics,text,referenced_tweets');
  // expansions は付けない。付けると User Read が1件ずつ加算されて課金が跳ね上がる。

  const posts = [];
  let token_ = null;
  let pages = 0;

  do {
    const url = base + (token_ ? '&pagination_token=' + encodeURIComponent(token_) : '');
    const json = callX_(token, url);
    (json.data || []).forEach(function (p) { posts.push(p); });
    token_ = json.meta && json.meta.next_token;
    pages++;
  } while (token_ && pages < CFG.api.maxPages);

  return { posts: posts, hitPageCap: !!token_ };
}

function callX_(token, url) {
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code !== 200) {
    throw new Error('X API エラー（HTTP ' + code + '）' + diagnoseX_(code) + '\n' + body.slice(0, 600));
  }
  return JSON.parse(body);
}

function diagnoseX_(code) {
  if (code === 401) return ' → Bearer Token が失効しています。再発行してください。';
  if (code === 402) return ' → クレジット残高が不足しています。チャージしてください。';
  if (code === 403) return ' → アクセス権限の問題です。';
  if (code === 429) return ' → レート制限です。次回の実行で回復します。';
  return '';
}

function detectAnomalies_(posts, hitPageCap) {
  const out = [];
  if (posts.length === 0) {
    out.push('投稿が1件も取得できませんでした。アカウント名または権限を確認してください。');
    return out;
  }
  const allZero = posts.every(function (p) {
    const m = p.public_metrics;
    return !m || (!m.bookmark_count && !m.impression_count && !m.like_count && !m.retweet_count);
  });
  if (allZero) {
    out.push('取得した ' + posts.length + '件すべての指標が0でした。X 側の障害の可能性があります。');
  }
  if (hitPageCap) {
    out.push('取得が上限（' + (CFG.api.pageSize * CFG.api.maxPages) + '件）に達しました。'
           + '投稿頻度が上がって取りこぼしている可能性があります。追跡日数を短くするか、上限を上げてください。');
  }
  return out;
}

// ============================================================
// 投稿の解釈
// ============================================================

function kindOf_(p) {
  const refs = p.referenced_tweets || [];
  for (let i = 0; i < refs.length; i++) {
    if (refs[i].type === 'retweeted')  return 'リポスト';
    if (refs[i].type === 'quoted')     return '引用';
    if (refs[i].type === 'replied_to') return '返信';
  }
  return 'オリジナル';
}

function toRow_(p, conf, now) {
  const m = p.public_metrics || {};
  const created = new Date(p.created_at);
  const text = (p.text || '').replace(/\s+/g, ' ');
  const name = text.match(/【([^】]{1,80})】/);
  return {
    id: p.id,
    createdAt: created,
    ageDays: Math.floor((now - created) / 86400000),
    bookmark:   numOrNull_(m.bookmark_count),
    impression: numOrNull_(m.impression_count),
    retweet:    numOrNull_(m.retweet_count),
    like:       numOrNull_(m.like_count),
    quote:      numOrNull_(m.quote_count),
    reply:      numOrNull_(m.reply_count),
    product: name ? name[1] : '',
    text: text.slice(0, 200),
    url: 'https://x.com/' + String(conf['監視アカウント']).trim() + '/status/' + p.id,
  };
}

/** 設定の3段階を、小さい順の配列にして返す */
function thresholdSteps_(conf) {
  return [
    { value: num_(conf['閾値1（初回通知）'], 500),  label: '' },
    { value: num_(conf['閾値2'], 1000),             label: String(conf['ラベル2'] || '') },
    { value: num_(conf['閾値3'], 2000),             label: String(conf['ラベル3'] || '') },
  ];
}

/** ブックマーク数が到達している最大の段階（1〜3）。どれにも届いていなければ0。 */
function highestStep_(bookmark, steps) {
  let reached = 0;
  for (let i = 0; i < steps.length; i++) {
    if (bookmark >= steps[i].value) reached = i + 1;
  }
  return reached;
}

// ============================================================
// 通知
// ============================================================

function buildNotification_(hits) {
  const head = '【注目商品】' + Utilities.formatDate(new Date(), CFG.tz, 'M/d');
  const shown = hits.slice(0, CFG.line.maxItems);

  const body = shown.map(function (h) {
    return h.step.label + 'ブックマーク ' + comma_(h.row.bookmark) + '\n' + h.row.url;
  }).join('\n\n');

  const rest = hits.length - shown.length;
  return head + '\n\n' + body + (rest > 0 ? '\n\nほか ' + rest + '件' : '');
}

function sendLine_(text) {
  const token = requireProp_('LINE_CHANNEL_TOKEN');
  const userId = PropertiesService.getScriptProperties().getProperty('LINE_USER_ID');

  const payload = { messages: [{ type: 'text', text: text.slice(0, 4900) }] };
  if (userId) payload.to = userId;

  const res = UrlFetchApp.fetch(userId ? CFG.line.push : CFG.line.broadcast, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('LINE API エラー（HTTP ' + code + '）'
      + (code === 401 ? ' → チャネルアクセストークンが失効しています。' : '')
      + (code === 400 ? ' → 宛先IDが誤っているか、友だち追加がされていません。' : '')
      + '\n' + res.getContentText().slice(0, 400));
  }
}

// ============================================================
// 週次サマリーと予算の見張り
// ============================================================

function sendWeeklySummary_(ss, conf) {
  const since = new Date(Date.now() - 7 * 86400000);

  const snap = valuesOf_(ss, CFG.sheet.snapshot);
  const recent = snap.filter(function (r) { return asDate_(r[0]) >= since; });
  const ids = {};
  let maxBookmark = 0;
  recent.forEach(function (r) {
    ids[r[1]] = true;
    const b = Number(r[4]);
    if (b > maxBookmark) maxBookmark = b;
  });

  const log = valuesOf_(ss, CFG.sheet.log);
  const errors = log.filter(function (r) {
    return r[1] === LOG_KIND.error && asDate_(r[0]) >= since;
  }).length;

  const usd = num_(conf['今月の取得件数'], 0) * CFG.api.postReadUsd;
  const yen = Math.round(usd * num_(conf['為替レート（円/ドル）'], 150));

  const text =
    '【週次サマリー ' + Utilities.formatDate(since, CFG.tz, 'M/d') + '-'
      + Utilities.formatDate(new Date(), CFG.tz, 'M/d') + '】\n' +
    '追跡した投稿 ' + Object.keys(ids).length + '件 ／ エラー ' + errors + '件\n' +
    '今週の最大ブックマーク：' + comma_(maxBookmark) + '\n' +
    '今月の API 利用額：$' + (Math.round(usd * 100) / 100) + '（約' + comma_(yen) + '円）';

  sendLine_(text);
  appendLog_(ss, [[nowStr_(), LOG_KIND.weekly, '', '', '', maxBookmark, '', '取得' +
    Object.keys(ids).length + '件 / エラー' + errors + '件 / ' + yen + '円']]);
}

function checkBudget_(ss, conf) {
  const budget = num_(conf['月額予算（円）'], 3000);
  const ratio  = num_(conf['警告する割合'], 0.8);
  const rate   = num_(conf['為替レート（円/ドル）'], 150);
  const yen = Math.round(num_(conf['今月の取得件数'], 0) * CFG.api.postReadUsd * rate);

  if (yen < budget * ratio) return;

  // 同じ月に何度も鳴らさない
  const month = monthKey_();
  const already = valuesOf_(ss, CFG.sheet.log).some(function (r) {
    return r[1] === LOG_KIND.budget && String(r[7] || '').indexOf(month) === 0;
  });
  if (already) return;

  const msg = '【ガチャモニター 予算警告】\n今月の API 利用額が約' + comma_(yen) + '円になりました。'
            + '\n月額予算 ' + comma_(budget) + '円 の ' + Math.round(ratio * 100) + '% を超えています。'
            + '\n設定シートの「追跡日数」を減らすと下がります。';
  sendLine_(msg);
  appendLog_(ss, [[nowStr_(), LOG_KIND.budget, '', '', '', '', '', month + ' 利用額 ' + yen + '円']]);
}

function isSummaryDay_(conf) {
  const names = ['日', '月', '火', '水', '木', '金', '土'];
  const want = String(conf['週次サマリーの曜日'] || '月').trim();
  const today = names[Number(Utilities.formatDate(new Date(), CFG.tz, 'u')) % 7];
  return today === want;
}

// ============================================================
// シートの読み書き
// ============================================================

function readConfig_(ss) {
  const sh = mustSheet_(ss, CFG.sheet.config);
  const last = sh.getLastRow();
  if (last < 2) throw new Error('設定シートが空です。setup() を実行してください。');
  const values = sh.getRange(2, 1, last - 1, 2).getValues();
  const map = {};
  values.forEach(function (r) {
    if (String(r[0]).trim()) map[String(r[0]).trim()] = r[1];
  });
  return map;
}

function writeConfigValue_(ss, key, value) {
  const sh = mustSheet_(ss, CFG.sheet.config);
  const keys = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === key) {
      sh.getRange(i + 2, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value, '']);
}

/** 月が変わったらリセットしたうえで、当日の課金件数を足す */
function addUsage_(ss, conf, count) {
  const month = monthKey_();
  const current = String(conf['対象月'] || '').trim();
  const base = (current === month) ? num_(conf['今月の取得件数'], 0) : 0;
  if (current !== month) writeConfigValue_(ss, '対象月', month);
  const total = base + count;
  writeConfigValue_(ss, '今月の取得件数', total);
  conf['対象月'] = month;
  conf['今月の取得件数'] = total;
}

function appendSnapshot_(ss, rows) {
  if (!rows.length) return;
  const sh = mustSheet_(ss, CFG.sheet.snapshot);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function appendLog_(ss, rows) {
  if (!rows.length) return;
  const sh = mustSheet_(ss, CFG.sheet.log);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * 投稿IDごとの「通知済みの最大段階」を返す。
 * 追跡期間を過ぎた投稿はもう判定しないので、直近ぶんだけ見れば足りる。
 */
function readNotifiedStages_(ss, trackDays) {
  const since = new Date(Date.now() - (trackDays + 2) * 86400000);
  const out = {};
  valuesOf_(ss, CFG.sheet.log).forEach(function (r) {
    if (r[1] !== LOG_KIND.first && r[1] !== LOG_KIND.step) return;
    if (asDate_(r[0]) < since) return;
    const id = String(r[2]);
    const stage = Number(r[3]) || 0;
    if (!out[id] || stage > out[id]) out[id] = stage;
  });
  return out;
}

function valuesOf_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

function mustSheet_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('シート「' + name + '」がありません。setup() を実行してください。');
  return sh;
}

// ============================================================
// ユーティリティ
// ============================================================

function requireProp_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('スクリプトプロパティ ' + key + ' が未設定です。'
    + 'プロジェクトの設定 → スクリプト プロパティ で登録してください。');
  return v;
}

function numOrNull_(v) { return (typeof v === 'number') ? v : null; }
function num_(v, d)     { const n = Number(v); return isFinite(n) ? n : d; }
function comma_(n)      { return Number(n || 0).toLocaleString('ja-JP'); }
function fmt_(d)        { return Utilities.formatDate(d, CFG.tz, 'yyyy-MM-dd HH:mm'); }
function nowStr_()      { return fmt_(new Date()); }
function monthKey_()    { return Utilities.formatDate(new Date(), CFG.tz, 'yyyy-MM'); }

function asDate_(v) {
  if (v instanceof Date) return v;
  const d = new Date(String(v).replace(/-/g, '/'));
  return isNaN(d) ? new Date(0) : d;
}

// ============================================================
// 手動確認用
// ============================================================

/**
 * 自動実行されないときに、どこで止まっているかを調べる。
 * 実行後、エディタ左の「実行ログ」に結果が出る。
 */
function diagnose() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = [];

  // タイムゾーンは名前ではなく実際の時差で比べる。
  // 例えば Etc/GMT-9 は名前こそ違うが UTC+9 で、Asia/Tokyo と同じ時刻になる。
  const scriptTz = Session.getScriptTimeZone();
  const nowD = new Date();
  const sameOffset = Utilities.formatDate(nowD, scriptTz, 'Z')
                  === Utilities.formatDate(nowD, CFG.tz, 'Z');

  out.push('── 時刻 ──');
  out.push('  スクリプトのタイムゾーン : ' + scriptTz
         + ' (UTC' + Utilities.formatDate(nowD, scriptTz, 'Z').replace(/(\d{2})(\d{2})/, '$1:$2') + ')'
         + (sameOffset ? '  → ' + CFG.tz + ' と同じ時差なので問題ありません'
                       : '  ← ' + CFG.tz + ' と時差が違います。要確認'));
  out.push('  いまの時刻（日本時間）   : ' + nowStr_());
  out.push('  設定した実行時刻         : 毎日 ' + CFG.triggerHour + ':00〜'
         + (CFG.triggerHour + 1) + ':00 のどこか');

  out.push('');
  out.push('── トリガー ──');
  const triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) {
    out.push('  1つもありません。setup() が最後まで通っていない可能性があります。');
  } else {
    triggers.forEach(function (t) {
      out.push('  ' + t.getHandlerFunction() + '  種別=' + t.getEventType()
             + '  ID=' + t.getUniqueId());
    });
    const has = triggers.some(function (t) { return t.getHandlerFunction() === 'dailyRun'; });
    out.push(has ? '  → dailyRun のトリガーは登録されています。'
                 : '  → dailyRun のトリガーがありません。createDailyTrigger_() を実行してください。');
  }

  out.push('');
  out.push('── シート ──');
  [CFG.sheet.config, CFG.sheet.snapshot, CFG.sheet.log].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    out.push('  ' + name + ' : ' + (sh ? (sh.getLastRow() - 1) + ' 行' : 'ありません'));
  });

  out.push('');
  out.push('── スクリプトプロパティ（値は表示しません） ──');
  const props = PropertiesService.getScriptProperties();
  ['X_BEARER_TOKEN', 'LINE_CHANNEL_TOKEN', 'LINE_USER_ID'].forEach(function (k) {
    const v = props.getProperty(k);
    out.push('  ' + k + ' : ' + (v ? '登録済み（' + v.length + '文字）' : '未登録')
           + (k === 'LINE_USER_ID' && !v ? '  ← 未登録なら broadcast で送ります（正常）' : ''));
  });

  out.push('');
  out.push('── 直近の実行 ──');
  const snap = valuesOf_(ss, CFG.sheet.snapshot);
  const log  = valuesOf_(ss, CFG.sheet.log);
  out.push('  スナップショット最終行 : ' + (snap.length ? fmtCell_(snap[snap.length - 1][0]) : 'なし'));
  out.push('  通知ログ最終行         : ' + (log.length
    ? fmtCell_(log[log.length - 1][0]) + '  種別=' + log[log.length - 1][1]
      + '  ' + String(log[log.length - 1][7] || '').slice(0, 120)
    : 'なし'));

  if (!snap.length) {
    out.push('');
    out.push('  一度も実行されていません。dailyRun() を手で実行すれば、いま動くかどうかが分かります。');
    out.push('  そこで正常に動くなら、あとは翌朝の自動実行を待つだけです。');
  }

  console.log(out.join('\n'));
}

function fmtCell_(v) {
  return (v instanceof Date) ? fmt_(v) : String(v);
}

/** トリガーを作り直す（diagnose() で dailyRun のトリガーが無かったとき用） */
function recreateTrigger() {
  createDailyTrigger_();
  console.log('dailyRun のトリガーを作り直しました。'
    + '毎日 ' + CFG.triggerHour + ':00〜' + (CFG.triggerHour + 1) + ':00 に実行されます。'
    + '\n最初の自動実行は、今日の枠を過ぎていれば翌朝になります。');
}

/** LINE の疎通だけを確かめる */
function testLineNotify() {
  sendLine_('【疎通テスト】\nガチャモニターから送信しています。実際の通知ではありません。');
  SpreadsheetApp.getActiveSpreadsheet().toast('送信しました。LINE を確認してください。', 'テスト', 10);
}

/** 週次サマリーを曜日に関係なく1回送る */
function testWeeklySummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  sendWeeklySummary_(ss, readConfig_(ss));
}

/** 通知を送らずに、いま何件が閾値を超えているかだけを調べる */
function dryRun() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const conf = readConfig_(ss);
  const token = requireProp_('X_BEARER_TOKEN');
  const trackDays = num_(conf['追跡日数'], 4);

  let userId = String(conf['ユーザーID'] || '').trim();
  if (!userId) userId = fetchUserId_(token, String(conf['監視アカウント']).trim());

  const fetched = fetchRecentPosts_(token, userId, trackDays);
  const originals = fetched.posts.filter(function (p) { return kindOf_(p) === 'オリジナル'; });
  const steps = thresholdSteps_(conf);
  const now = new Date();

  const lines = originals
    .map(function (p) { return toRow_(p, conf, now); })
    .filter(function (r) { return r.bookmark !== null && highestStep_(r.bookmark, steps) > 0; })
    .sort(function (a, b) { return b.bookmark - a.bookmark; })
    .map(function (r) {
      return '  段階' + highestStep_(r.bookmark, steps) + '  ブックマーク ' + comma_(r.bookmark)
           + '  ' + (r.product || r.text.slice(0, 30));
    });

  const usd = fetched.posts.length * CFG.api.postReadUsd;
  console.log(
    '取得 ' + fetched.posts.length + '件（うちオリジナル ' + originals.length + '件）\n' +
    '閾値超過 ' + lines.length + '件\n' + lines.join('\n') + '\n' +
    'この実行の課金：$' + (Math.round(usd * 1000) / 1000) +
    '（同じ投稿を同じ日に再取得した場合は課金されません）'
  );
}
