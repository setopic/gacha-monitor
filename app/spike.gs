/**
 * 検証スパイク。ADR-0002（主指標）と ADR-0003（追跡期間）の根拠を実測する。
 *
 * 本実装（monitor.gs）より前に 1 回だけ回すもので、日次の処理には関与しない。
 *
 * 目的：本実装に入る前に、設計の前提が本当に成り立つかを1回の実行で確かめる。
 *
 *   1. bookmark_count が非ゼロで返るか      ← ここが崩れると設計全体が崩れる
 *   2. ブックマーク数の実際の水準            ← 閾値 500 が高いか低いかを確定させる
 *   3. 返信を除いた1日あたりの実投稿数       ← 月額費用を確定させる
 *   4. リポストの実比率                      ← 除外して問題ないかの最終確認
 *   5. 【商品名】書式の適合率                ← 例外投稿がどれだけ混ざるか
 *   6. 1回あたりの実課金額                   ← 試算と実測のズレを潰す
 *
 * 実行前に、スクリプトプロパティに X_BEARER_TOKEN を設定しておくこと。
 * （Apps Script エディタ → 左の歯車「プロジェクトの設定」→ スクリプト プロパティ）
 *
 * 概算費用：1回あたり約 $0.51（約77円）。Post Read 100件 × $0.005 ＋ User Read 1件 × $0.010。
 */

const SPIKE = {
  // 監視対象はコードに書かない。設定シートの「監視アカウント」から読む。
  // 設定シートがまだ無い場合はスクリプトプロパティ TARGET_USERNAME を使う。
  targetUsername: '',
  maxResults: 100,              // 5〜100。X API の上限は100
  candidateThresholds: [500, 1000, 2000],
  targetAlertsPerWeek: 2,       // 「週に何件鳴らしたいか」。推奨閾値の算出に使う
  summarySheet: 'スパイク_サマリー',
  detailSheet: 'スパイク_明細',
  apiBase: 'https://api.x.com/2',
  usdJpy: 150,
  postReadUsd: 0.005,
  userReadUsd: 0.010,
  timezone: 'Asia/Tokyo',
};

// ============================================================
// エントリポイント：この関数を実行する
// ============================================================

function runSpike() {
  const token = getProp_('X_BEARER_TOKEN');
  if (!token) {
    throw new Error(
      'スクリプトプロパティ X_BEARER_TOKEN が未設定です。\n' +
      'Apps Script エディタ左側の歯車「プロジェクトの設定」→「スクリプト プロパティ」で、\n' +
      'プロパティ名 X_BEARER_TOKEN、値に X の Bearer Token を登録してから再実行してください。'
    );
  }

  const user = fetchUser_(token, resolveTarget_());
  const posts = fetchPosts_(token, user.id);
  if (posts.length === 0) {
    throw new Error('投稿が1件も取得できませんでした。ユーザー名とアクセス権限を確認してください。');
  }

  const report = analyse_(posts, user);
  writeSummary_(report);
  writeDetail_(report);

  SpreadsheetApp.getActiveSpreadsheet()
    .toast(posts.length + '件を取得しました。「' + SPIKE.summarySheet + '」を確認してください。',
           'スパイク完了', 15);
}

/**
 * 監視対象を決める。**コードには書かない。**
 *
 * このリポジトリは公開されているため、誰を見ているかを残さない。
 * 設定シートがまだ無い段階でもスパイクを回せるよう、
 * スクリプトプロパティからも読めるようにしてある。
 */
function resolveTarget_() {
  if (SPIKE.targetUsername) return SPIKE.targetUsername;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('設定');
  if (sheet && sheet.getLastRow() > 1) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === '監視アカウント') {
        const name = String(rows[i][1] || '').trim();
        if (name) return name;
      }
    }
  }

  const prop = PropertiesService.getScriptProperties().getProperty('TARGET_USERNAME');
  if (prop) return prop.trim();

  throw new Error(
    '監視対象が決まりません。次のどちらかを設定してください。\n' +
    '  ・設定シートの「監視アカウント」に X のユーザー名を入れる（@ は付けない）\n' +
    '  ・スクリプトプロパティ TARGET_USERNAME に入れる'
  );
}

// ============================================================
// X API 呼び出し
// ============================================================

function fetchUser_(token, username) {
  const url = SPIKE.apiBase + '/users/by/username/' + encodeURIComponent(username) +
              '?user.fields=public_metrics,name';
  const json = callApi_(token, url);
  if (!json.data) {
    throw new Error('ユーザーが見つかりませんでした: @' + username);
  }
  return json.data;
}

function fetchPosts_(token, userId) {
  // expansions は付けない。付けると User Read が1件ずつ加算されて課金が跳ね上がる。
  // exclude は replies のみ。リポストは比率を測るためにあえて取得する。
  const params = [
    'max_results=' + SPIKE.maxResults,
    'exclude=replies',
    'tweet.fields=' + encodeURIComponent('created_at,public_metrics,text,referenced_tweets'),
  ].join('&');

  const url = SPIKE.apiBase + '/users/' + userId + '/tweets?' + params;
  const json = callApi_(token, url);
  return json.data || [];
}

function callApi_(token, url) {
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const body = res.getContentText();

  if (code !== 200) {
    throw new Error(
      'X API がエラーを返しました（HTTP ' + code + '）\n' +
      diagnose_(code) + '\n\nレスポンス本文:\n' + body.slice(0, 1200)
    );
  }
  return JSON.parse(body);
}

function diagnose_(code) {
  if (code === 401) return '→ Bearer Token が誤っているか失効しています。Developer Portal で再発行してください。';
  if (code === 402) return '→ クレジット残高が不足しています。Developer Portal でチャージしてください。';
  if (code === 403) return '→ アクセス権限またはプランの問題です。アプリのアクセスレベルを確認してください。';
  if (code === 404) return '→ ユーザーまたはエンドポイントが見つかりません。ユーザー名を確認してください。';
  if (code === 429) return '→ レート制限です。15分ほど待ってから再実行してください。';
  return '→ 下のレスポンス本文に原因が書かれています。';
}

// ============================================================
// 集計
// ============================================================

function analyse_(posts, user) {
  const rows = posts.map(function (t) {
    const m = t.public_metrics || {};
    return {
      id: t.id,
      createdAt: new Date(t.created_at),
      kind: classify_(t),
      hasMetrics: !!t.public_metrics,
      bookmark:   numOrNull_(m.bookmark_count),
      impression: numOrNull_(m.impression_count),
      retweet:    numOrNull_(m.retweet_count),
      like:       numOrNull_(m.like_count),
      quote:      numOrNull_(m.quote_count),
      reply:      numOrNull_(m.reply_count),
      product: extractProductName_(t.text || ''),
      text: (t.text || '').replace(/\s+/g, ' ').slice(0, 140),
      url: 'https://x.com/' + user.username + '/status/' + t.id,
    };
  });

  rows.sort(function (a, b) { return b.createdAt - a.createdAt; });

  const originals = rows.filter(function (r) { return r.kind === 'オリジナル'; });
  const withMetrics = originals.filter(function (r) { return r.hasMetrics; });

  // --- 期間と投稿頻度 ---
  const times = rows.map(function (r) { return r.createdAt.getTime(); });
  const newest = new Date(Math.max.apply(null, times));
  const oldest = new Date(Math.min.apply(null, times));
  const spanDays = Math.max((newest - oldest) / 86400000, 1 / 24);
  const postsPerDay = originals.length / spanDays;

  // --- ブックマークの分布（オリジナル投稿のみ） ---
  const bookmarks = withMetrics
    .map(function (r) { return r.bookmark; })
    .filter(function (v) { return v !== null; })
    .sort(function (a, b) { return a - b; });

  // --- 閾値シミュレーション ---
  const p90 = roundNice_(percentile_(bookmarks, 0.90));
  const p95 = roundNice_(percentile_(bookmarks, 0.95));
  const recommended = recommendThreshold_(bookmarks, spanDays);

  const candidates = dedupe_(SPIKE.candidateThresholds.concat([p90, p95, recommended]))
    .filter(function (v) { return v > 0; })
    .sort(function (a, b) { return a - b; });

  const simulation = candidates.map(function (t) {
    const hit = bookmarks.filter(function (v) { return v >= t; }).length;
    return { threshold: t, hits: hit, perWeek: hit / spanDays * 7 };
  });

  return {
    user: user,
    rows: rows,
    originals: originals,
    withMetrics: withMetrics,
    bookmarks: bookmarks,
    newest: newest,
    oldest: oldest,
    spanDays: spanDays,
    postsPerDay: postsPerDay,
    p90: p90,
    p95: p95,
    recommended: recommended,
    simulation: simulation,
    verdict: judgeBookmark_(withMetrics),
    impressionVerdict: judgeImpression_(withMetrics),
    productHitRate: originals.length
      ? originals.filter(function (r) { return r.product; }).length / originals.length
      : 0,
    costUsd: posts.length * SPIKE.postReadUsd + SPIKE.userReadUsd,
  };
}

function classify_(t) {
  const refs = t.referenced_tweets || [];
  for (let i = 0; i < refs.length; i++) {
    if (refs[i].type === 'retweeted')  return 'リポスト';
    if (refs[i].type === 'quoted')     return '引用';
    if (refs[i].type === 'replied_to') return '返信';
  }
  return 'オリジナル';
}

function extractProductName_(text) {
  const m = text.match(/【([^】]{1,80})】/);
  return m ? m[1] : '';
}

function numOrNull_(v) {
  return (typeof v === 'number') ? v : null;
}

/**
 * 最重要の判定。オリジナル投稿のうち、bookmark_count が非ゼロで返った割合を見る。
 * リポストは仕様上すべて0を返すので、母数から外している。
 */
function judgeBookmark_(withMetrics) {
  if (withMetrics.length === 0) {
    return { level: '判定不能', text: 'public_metrics を持つオリジナル投稿が1件もありませんでした。' };
  }
  const present = withMetrics.filter(function (r) { return r.bookmark !== null; });
  if (present.length === 0) {
    return {
      level: '不合格',
      text: 'bookmark_count フィールドが1件も返っていません。' +
            'この指標では設計が成立しないため、リポスト数など他の指標への切り替えが必要です。',
    };
  }
  const nonZero = present.filter(function (r) { return r.bookmark > 0; });
  const ratio = nonZero.length / present.length;

  if (ratio === 0) {
    return {
      level: '不合格',
      text: 'bookmark_count は返っていますが、全件が0でした。' +
            '他人の投稿では値が取れない可能性が高く、指標の切り替えが必要です。',
    };
  }
  if (ratio < 0.8) {
    return {
      level: '要注意',
      text: '非ゼロは ' + nonZero.length + '/' + present.length +
            '件（' + pct_(ratio) + '）でした。一部の投稿で欠落しています。' +
            '欠落した投稿の傾向を明細シートで確認してください。',
    };
  }
  return {
    level: '合格',
    text: '非ゼロは ' + nonZero.length + '/' + present.length +
          '件（' + pct_(ratio) + '）。設計の前提どおり取得できています。',
  };
}

function judgeImpression_(withMetrics) {
  const present = withMetrics.filter(function (r) { return r.impression !== null; });
  if (present.length === 0) return 'フィールドが返っていない';
  const nonZero = present.filter(function (r) { return r.impression > 0; });
  if (nonZero.length === 0) return '全件0（他人の投稿では取得不可）';
  return '非ゼロ ' + nonZero.length + '/' + present.length + '件（' + pct_(nonZero.length / present.length) + '）';
}

/** 週 targetAlertsPerWeek 件だけ鳴る水準を、実測の分布から逆算する */
function recommendThreshold_(sortedAsc, spanDays) {
  if (sortedAsc.length === 0) return 0;
  const desc = sortedAsc.slice().reverse();
  const wanted = Math.max(1, Math.round(SPIKE.targetAlertsPerWeek * spanDays / 7));
  const idx = Math.min(wanted - 1, desc.length - 1);
  return roundNice_(desc[idx]);
}

function percentile_(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

function roundNice_(v) {
  if (!v || v <= 0) return 0;
  const step = v < 100 ? 10 : v < 1000 ? 50 : v < 10000 ? 100 : 500;
  return Math.round(v / step) * step;
}

function dedupe_(arr) {
  const seen = {};
  return arr.filter(function (v) {
    if (seen[v]) return false;
    seen[v] = true;
    return true;
  });
}

function pct_(r) { return Math.round(r * 1000) / 10 + '%'; }
function yen_(usd) { return Math.round(usd * SPIKE.usdJpy); }
function fmt_(d) { return Utilities.formatDate(d, SPIKE.timezone, 'yyyy-MM-dd HH:mm'); }
function round1_(v) { return Math.round(v * 10) / 10; }

// ============================================================
// 出力
// ============================================================

function writeSummary_(r) {
  const sheet = resetSheet_(SPIKE.summarySheet);
  const out = [];
  const sections = [];

  function head(label) { sections.push(out.length); out.push([label, '', '']); }
  function row(k, v, note) { out.push([k, v, note || '']); }

  head('■ 1. 最重要判定：bookmark_count は取得できるか');
  row('判定', r.verdict.level, r.verdict.text);
  row('参考：impression_count', r.impressionVerdict,
      '非ゼロで返るなら、インプレッションを主指標に戻す選択肢も復活します');

  head('■ 2. ブックマーク数の実際の水準（オリジナル投稿のみ）');
  const b = r.bookmarks;
  row('対象件数', b.length, '');
  row('最小', b.length ? b[0] : 0, '');
  row('中央値', b.length ? Math.round(percentile_(b, 0.5)) : 0, '');
  row('上位10%', r.p90, '');
  row('上位5%', r.p95, '');
  row('最大', b.length ? b[b.length - 1] : 0, '');

  head('■ 3. 閾値のシミュレーション');
  row('推奨初期値', r.recommended,
      '週' + SPIKE.targetAlertsPerWeek + '件だけ鳴る水準を実測の分布から逆算した値');
  r.simulation.forEach(function (s) {
    const tag = s.threshold === r.recommended ? '  ← 推奨' : '';
    row('閾値 ' + s.threshold,
        round1_(s.perWeek) + ' 件/週',
        '取得した ' + b.length + '件のうち ' + s.hits + '件が該当' + tag);
  });

  head('■ 4. 投稿頻度と費用');
  row('取得期間', fmt_(r.oldest) + ' 〜 ' + fmt_(r.newest), round1_(r.spanDays) + '日ぶん');
  row('オリジナル投稿', r.originals.length + '件', round1_(r.postsPerDay) + ' 件/日');
  const monthly = r.postsPerDay * 10 * SPIKE.postReadUsd * 30;
  row('月額の見込み', '$' + Math.round(monthly * 100) / 100 + '（約' + yen_(monthly) + '円）',
      '1投稿あたり10回追跡（7日毎日＋8〜30日は週1回）で算出。予算3,000円との差を確認してください');
  row('今回の実費', '$' + Math.round(r.costUsd * 1000) / 1000 + '（約' + yen_(r.costUsd) + '円）',
      r.rows.length + '件 × $' + SPIKE.postReadUsd + ' ＋ ユーザー取得 $' + SPIKE.userReadUsd);

  head('■ 5. 投稿の性質');
  ['オリジナル', 'リポスト', '引用', '返信'].forEach(function (k) {
    const n = r.rows.filter(function (x) { return x.kind === k; }).length;
    row(k, n + '件', r.rows.length ? pct_(n / r.rows.length) : '');
  });
  row('【商品名】書式の適合率', pct_(r.productHitRate),
      '適合しない投稿は、複数商品まとめ・入荷報告・速報などの例外投稿です');

  head('■ 6. 実行情報');
  row('対象アカウント', '@' + r.user.username, r.user.name || '');
  row('フォロワー数', (r.user.public_metrics && r.user.public_metrics.followers_count) || '取得不可', '');
  row('実行日時', fmt_(new Date()), '');

  sheet.getRange(1, 1, out.length, 3).setValues(out);

  // 体裁
  sections.forEach(function (i) {
    sheet.getRange(i + 1, 1, 1, 3).setFontWeight('bold').setBackground('#EDF0EE');
  });
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 560);
  sheet.getRange(1, 3, out.length, 1).setWrap(true);
  sheet.getRange(1, 1, out.length, 3).setVerticalAlignment('top');

  // 判定行を色分け
  const color = r.verdict.level === '合格' ? '#E3EFE7'
              : r.verdict.level === '要注意' ? '#F6EEDC'
              : '#F6E6E4';
  sheet.getRange(2, 1, 1, 3).setBackground(color).setFontWeight('bold');
}

function writeDetail_(r) {
  const sheet = resetSheet_(SPIKE.detailSheet);
  const header = ['投稿日時', '種別', 'ブックマーク', 'インプレッション', 'リポスト',
                  'いいね', '引用', '返信', '商品名', '本文（先頭140字）', 'URL'];

  const body = r.rows.map(function (x) {
    return [
      fmt_(x.createdAt), x.kind,
      blank_(x.bookmark), blank_(x.impression), blank_(x.retweet),
      blank_(x.like), blank_(x.quote), blank_(x.reply),
      x.product, x.text, x.url,
    ];
  });

  sheet.getRange(1, 1, 1, header.length).setValues([header])
       .setFontWeight('bold').setBackground('#EDF0EE');
  if (body.length) {
    sheet.getRange(2, 1, body.length, header.length).setValues(body);
  }
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(9, 220);
  sheet.setColumnWidth(10, 420);
  sheet.setColumnWidth(11, 260);
  sheet.getRange(1, 3, body.length + 1, 6).setHorizontalAlignment('right');
}

/** null（フィールド自体が無い）と 0 を見分けられるように表示する */
function blank_(v) { return v === null ? '—' : v; }

function resetSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// ============================================================
// LINE 疎通テスト：段階2に進む前に、通知経路が生きているか確認する
// ============================================================

/**
 * スクリプトプロパティに LINE_CHANNEL_TOKEN を設定してから実行する。
 * LINE_USER_ID も設定されていれば push（宛先1人）、未設定なら broadcast（友だち全員）で送る。
 */
function testLineNotify() {
  const token = getProp_('LINE_CHANNEL_TOKEN');
  if (!token) {
    throw new Error(
      'スクリプトプロパティ LINE_CHANNEL_TOKEN が未設定です。\n' +
      'LINE Developers Console の Messaging API 設定タブで発行した\n' +
      '「チャネルアクセストークン（長期）」を登録してください。'
    );
  }

  const userId = getProp_('LINE_USER_ID');
  const text =
    '【注目商品】' + Utilities.formatDate(new Date(), SPIKE.timezone, 'M/d') + '\n' +
    'ブックマーク 612\n' +
    '（投稿の URL）\n\n' +
    '【要チェック】ブックマーク 1,050\n' +
    '（投稿の URL）\n\n' +
    '― これは疎通テストです。実際の通知ではありません。';

  const endpoint = userId
    ? 'https://api.line.me/v2/bot/message/push'
    : 'https://api.line.me/v2/bot/message/broadcast';

  const payload = { messages: [{ type: 'text', text: text }] };
  if (userId) payload.to = userId;

  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code !== 200) {
    throw new Error(
      'LINE API がエラーを返しました（HTTP ' + code + '）\n' +
      (code === 401 ? '→ チャネルアクセストークンが誤っているか失効しています。\n' :
       code === 400 ? '→ 宛先のユーザーIDが誤っているか、友だち追加がされていません。\n' : '') +
      res.getContentText().slice(0, 800)
    );
  }

  SpreadsheetApp.getActiveSpreadsheet()
    .toast((userId ? 'push' : 'broadcast') + ' で送信しました。LINE を確認してください。',
           'LINE 疎通テスト成功', 15);
}
