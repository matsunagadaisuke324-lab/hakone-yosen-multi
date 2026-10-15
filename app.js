
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  getDoc,
  getDocFromServer,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import { firebaseConfig } from './firebase-config.js';

const names = [
  '中央学院', '東海', '神奈川', '東洋',
  '日本体育', '東京国際', '山梨学院',
  '東京農業', '大東文化', '立教',
  '法政', '明治', '専修', '国士舘'
];

const $ = id => document.getElementById(id);

const QUEUE_KEY = 'hakoneMultiQueueV2';
const TEAM_KEY = 'hakoneMultiSelectedTeam';

let db;
let auth;
let user = null;
let events = [];
let queue = [];
let unsubscribeEvents = null;
let unsubscribeRace = null;
let sending = false;
let starting = false;
let offset = 0;
let offsetKnown = false;

// STARTの状態
let raceLoaded = false;
let raceStartedAtMs = null;

// 未送信データを復元
try {
  queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (!Array.isArray(queue)) queue = [];
} catch {
  queue = [];
}

const saveQueue = () => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  $('queueCount').textContent = queue.length;
};

const selected = () => $('team').value;

const esc = s => String(s ?? '').replace(
  /[&<>"']/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c])
);

// 経過時間：分:秒.小数1桁
const fmt = ms => {
  if (!Number.isFinite(ms)) return '—';

  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / 60000);
  const seconds = (safe % 60000 / 1000).toFixed(1);

  return `${String(minutes).padStart(2, '0')}:${seconds.padStart(4, '0')}`;
};

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.style.display = 'block';

  clearTimeout(toast.t);
  toast.t = setTimeout(() => {
    el.style.display = 'none';
  }, 3500);
}

function setStatus(message) {
  $('connection').textContent = message;
}

function startTimeText(ms) {
  return new Date(ms).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
}

// 大学選択
$('team').innerHTML =
  '<option value="">大学を選択してください</option>' +
  names.map(n =>
    `<option value="${esc(n)}">${esc(n)}大学</option>`
  ).join('');

$('team').value = localStorage.getItem(TEAM_KEY) || '';

$('team').onchange = () => {
  localStorage.setItem(TEAM_KEY, selected());
  render();
};

// 今回のレースの有効なGOAL記録
function active() {
  if (raceStartedAtMs === null) return [];

  return events.filter(e =>
    e.status === 'active' &&
    names.includes(e.university) &&
    Number.isFinite(e.capturedAtMs) &&
    e.capturedAtMs >= raceStartedAtMs
  );
}

// 全端末共通のSTART時刻
function baseline() {
  return raceStartedAtMs;
}

// 同時刻の記録も安定した順序にする
function compareEvents(x, y) {
  return x.capturedAtMs - y.capturedAtMs ||
    String(x.id).localeCompare(String(y.id));
}

// 大学ごとの記録と集計
function getTeamScores(a, b) {
  return names.map(n => {
    const list = a
      .filter(e => e.university === n)
      .sort(compareEvents);

    const topTen = list.slice(0, 10);

    const score = b === null
      ? 0
      : topTen.reduce(
          (sum, e) => sum + (e.capturedAtMs - b),
          0
        );

    return {
      n,
      count: list.length,
      score,
      list,
      topTen
    };
  });
}

// START状態の表示
function renderRace() {
  const button = $('start');

  if (!raceLoaded || !user) {
    $('raceStatus').textContent = '開始状態を確認中…';
    $('startTime').textContent = '開始時刻：確認中';
    button.disabled = true;
    return;
  }

  if (raceStartedAtMs !== null) {
    $('raceStatus').textContent = '🟢 レース進行中';
    $('startTime').textContent =
      '開始時刻：' + startTimeText(raceStartedAtMs);
    button.disabled = true;
    button.textContent = '✓ START済み';
    return;
  }

  $('raceStatus').textContent = '⚪ レース開始前';
  $('startTime').textContent = '開始時刻：未設定';
  button.disabled = starting || !navigator.onLine;
  button.textContent = starting
    ? 'START処理中…'
    : '🚩 START';
}

// 画面描画
function render() {
  const a = active();
  const b = baseline();
  const team = selected();

  const mine = a
    .filter(e => e.university === team)
    .sort(compareEvents);

  $('allCount').textContent = a.length;
  $('myCount').textContent = mine.length;

  saveQueue();
  renderRace();

  // START前はGOAL不可
  $('goal').disabled =
    !user ||
    !team ||
    !raceLoaded ||
    b === null;

  $('operatorTitle').textContent = team
    ? `${team}大学 GOAL`
    : '大学を選択してください';

  $('timeNote').textContent = b === null
    ? 'START後に共通の経過時間を計測します'
    : 'FirebaseのSTART時刻を基準に計算（端末の時計補正は推定値）';

  const scores = getTeamScores(a, b);

  // 10人以上到達した大学の順位
  $('completed').innerHTML = scores
    .filter(x => x.count >= 10)
    .sort((x, y) =>
      x.score - y.score || x.n.localeCompare(y.n)
    )
    .map((x, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(x.n)}</td>
        <td>${x.count}/10</td>
        <td>${fmt(x.score)}</td>
      </tr>
    `).join('') ||
    '<tr><td colspan="4">まだありません</td></tr>';

  // 10人未満の大学
  $('progress').innerHTML = scores
    .filter(x => x.count < 10)
    .sort((x, y) =>
      y.count - x.count || x.score - y.score
    )
    .map(x => `
      <tr>
        <td>${esc(x.n)}</td>
        <td>${x.count}/10</td>
        <td>${x.count ? fmt(x.score) : '—'}</td>
      </tr>
    `).join('');

  // 選択中の大学の履歴
  $('myLog').innerHTML = mine.map((e, i) => {
    const excluded = i >= 10;

    return `
      <div class="entry">
        <span>
          ${i + 1}人目 / ${fmt(e.capturedAtMs - b)}
          ${excluded
            ? '<span class="muted">（順位集計対象外）</span>'
            : ''}
        </span>
        <span class="muted">
          ${new Date(e.capturedAtMs).toLocaleTimeString('ja-JP')}
        </span>
      </div>
    `;
  }).join('') ||
    '<p class="muted">記録なし</p>';

  // 全大学のGOAL履歴
  $('allLog').innerHTML = a
    .slice()
    .sort(compareEvents)
    .map(e => `
      <div class="entry">
        <span>
          ${esc(e.university)} /
          ${fmt(e.capturedAtMs - b)}
        </span>
        <span class="row">
          <select
            data-edit="${esc(e.id)}"
            aria-label="大学変更"
          >
            ${names.map(n => `
              <option
                value="${esc(n)}"
                ${n === e.university ? 'selected' : ''}
              >
                ${esc(n)}
              </option>
            `).join('')}
          </select>
          <button
            class="danger"
            data-delete="${esc(e.id)}"
          >
            削除
          </button>
        </span>
      </div>
    `).join('') ||
    '<p class="muted">記録なし</p>';

  // 大学変更
  document.querySelectorAll('[data-edit]').forEach(el => {
    el.onchange = async () => {
      const event = events.find(
        e => e.id === el.dataset.edit
      );

      if (
        !event ||
        !confirm(
          `${event.university} → ${el.value} に変更しますか？`
        )
      ) {
        render();
        return;
      }

      try {
        await updateDoc(
          doc(db, 'events', event.id),
          {
            university: el.value,
            editedAt: serverTimestamp(),
            editedBy: user.uid
          }
        );

        toast('変更しました');
      } catch (err) {
        toast('変更失敗: ' + err.message);
        render();
      }
    };
  });

  // 記録の論理削除
  document.querySelectorAll('[data-delete]').forEach(el => {
    el.onclick = async () => {
      if (!confirm('このGOAL記録を削除しますか？')) {
        return;
      }

      try {
        await updateDoc(
          doc(db, 'events', el.dataset.delete),
          {
            status: 'deleted',
            editedAt: serverTimestamp(),
            editedBy: user.uid
          }
        );

        toast('削除しました');
      } catch (err) {
        toast('削除失敗: ' + err.message);
      }
    };
  });
}

// STARTボタン
$('start').onclick = async () => {
  if (!user || !db || !raceLoaded) {
    return toast('接続状態を確認してください');
  }

  if (raceStartedAtMs !== null) {
    return toast('レースはすでに開始しています');
  }

  if (!navigator.onLine) {
    return toast('STARTにはインターネット接続が必要です');
  }

  if (starting) return;

  if (!confirm(
    'レースをSTARTしますか？\n\n' +
    '最初のSTARTだけが有効です。\n' +
    '開始後は時刻を変更できません。'
  )) {
    return;
  }

  starting = true;
  renderRace();

  try {
    const raceRef = doc(db, 'raceControl', 'main');

    // 既存STARTを確認し、未作成の場合だけ登録
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(raceRef);

      if (snap.exists()) {
        throw new Error('すでにSTARTされています');
      }

      transaction.set(raceRef, {
        startedAt: serverTimestamp(),
        startedBy: user.uid,
        createdAt: serverTimestamp()
      });
    });

    toast('STARTを登録しました');
  } catch (err) {
    toast('STARTできません: ' + err.message);
  } finally {
    starting = false;
    renderRace();
  }
};

// Firebase初期化
const configOK =
  !!firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.includes('REPLACE_ME');

if (!configOK) {
  setStatus('Firebaseの設定が未入力です');
  toast('firebase-config.js に接続情報を設定してください');
} else {
  try {
    const app = initializeApp(firebaseConfig);

    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(
      auth,
      async u => {
        if (unsubscribeEvents) {
          unsubscribeEvents();
          unsubscribeEvents = null;
        }

        if (unsubscribeRace) {
          unsubscribeRace();
          unsubscribeRace = null;
        }

        user = u;
        raceLoaded = false;
        raceStartedAtMs = null;

        if (!u) {
          setStatus('自動認証中…');

          try {
            await signInAnonymously(auth);
          } catch (e) {
            setStatus('認証エラー: ' + e.message);
          }

          render();
          return;
        }

        setStatus('接続中…');

        // START状態を全端末にリアルタイム配信
        unsubscribeRace = onSnapshot(
          doc(db, 'raceControl', 'main'),
          snap => {
            // キャッシュだけの未作成判定ではSTARTを許可しない
            if (snap.metadata.fromCache && !snap.exists()) {
              raceLoaded = false;
              render();
              return;
            }

            raceLoaded = true;

            const ts = snap.exists()
              ? snap.data().startedAt
              : null;

            raceStartedAtMs = ts?.toMillis?.() ?? null;

            render();
          },
          err => {
            raceLoaded = false;
            toast('START状態の取得失敗: ' + err.message);
            render();
          }
        );

        unsubscribeEvents = onSnapshot(
          collection(db, 'events'),
          snap => {
            events = snap.docs.map(d => ({
              id: d.id,
              ...d.data()
            }));

            setStatus('🟢 リアルタイム接続中');
            render();
            resend();
          },
          err => {
            setStatus(
              '🔴 データ受信エラー: ' + err.message
            );
          }
        );

        render();
        await syncClock();
        resend();
      },
      e => {
        setStatus('認証エラー: ' + e.message);
      }
    );
  } catch (e) {
    setStatus('初期化エラー: ' + e.message);
  }
}

// Firebaseサーバーとの時計補正
async function syncClock() {
  if (!user) return;

  try {
    const samples = [];

    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();

      const ref = doc(collection(db, 'clockSync'));

      await setDoc(ref, {
        uid: user.uid,
        serverTime: serverTimestamp()
      });

      // キャッシュではなくサーバーから取得
      const snap = await getDocFromServer(ref);

      const t1 = Date.now();
      const ts = snap.data()?.serverTime;

      if (ts) {
        samples.push({
          rtt: t1 - t0,
          delta: ts.toMillis() - (t0 + t1) / 2
        });
      }
    }

    samples.sort((x, y) => x.rtt - y.rtt);

    if (samples.length) {
      offset = samples[0].delta;
      offsetKnown = true;

      $('syncInfo').textContent =
        `時計補正 ${Math.round(offset)}ms / ` +
        `通信往復 ${samples[0].rtt}ms（推定）`;
    }
  } catch (e) {
    $('syncInfo').textContent =
      '時計補正できません: ' + e.message;
  }
}

$('syncClock').onclick = syncClock;

// GOAL記録
$('goal').onclick = () => {
  const team = selected();

  if (!user || !team) {
    return toast('大学を選択してください');
  }

  if (!raceLoaded || raceStartedAtMs === null) {
    return toast('レースSTART前です');
  }

  const local = Date.now();
  const capturedAtMs = local + offset;

  if (capturedAtMs < raceStartedAtMs) {
    return toast('GOAL時刻がSTARTより前です。時計を確認してください');
  }

  queue.push({
    id: crypto.randomUUID(),
    university: team,
    capturedAtMs,
    localCapturedAtMs: local,
    clockOffsetMs: offset,
    clockOffsetKnown: offsetKnown,
    uid: user.uid,
    status: 'active'
  });

  saveQueue();
  render();

  toast('GOALを端末に記録しました');

  resend();
};

// 未送信記録をFirebaseへ送信
async function resend() {
  if (
    sending ||
    !user ||
    !db ||
    !navigator.onLine
  ) {
    return;
  }

  sending = true;

  try {
    for (const e of [...queue]) {
      try {
        const { id, ...data } = e;

        await setDoc(
          doc(db, 'events', id),
          {
            ...data,
            createdAt: serverTimestamp()
          }
        );

        queue = queue.filter(x => x.id !== id);
        saveQueue();
      } catch (err) {
        toast('未送信として保存中: ' + err.message);
        break;
      }
    }
  } finally {
    sending = false;
    render();
  }
}

$('resend').onclick = async () => {
  await resend();

  toast(
    queue.length
      ? `未送信 ${queue.length} 件`
      : 'すべて送信済みです'
  );
};

window.addEventListener('online', () => {
  renderRace();
  resend();
});

window.addEventListener('offline', renderRace);

// STARTからの経過時間表示
setInterval(() => {
  const b = baseline();

  $('timer').textContent = b === null
    ? '00:00.0'
    : fmt(Date.now() + offset - b);
}, 100);

// CSV出力共通処理
function csv(name, rows) {
  const contents =
    '\uFEFF' +
    rows.map(row =>
      row.map(v =>
        '"' +
        String(v ?? '').replaceAll('"', '""') +
        '"'
      ).join(',')
    ).join('\r\n');

  const url = URL.createObjectURL(
    new Blob(
      [contents],
      { type: 'text/csv;charset=utf-8' }
    )
  );

  const a = document.createElement('a');

  a.href = url;
  a.download = name;
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

// 全履歴CSV
$('exportHistory').onclick = () => {
  const b = baseline();

  csv(
    '予選会Multi_全履歴.csv',
    [
      [
        'ID',
        '大学',
        'STARTからの経過秒',
        '記録時刻',
        '担当UID',
        '状態',
        '最終編集UID',
        '時計補正済み'
      ],
      ...events.map(e => [
        e.id,
        e.university,
        b !== null && Number.isFinite(e.capturedAtMs)
          ? ((e.capturedAtMs - b) / 1000).toFixed(3)
          : '',
        Number.isFinite(e.capturedAtMs)
          ? new Date(e.capturedAtMs).toISOString()
          : '',
        e.uid,
        e.status,
        e.editedBy || '',
        e.clockOffsetKnown
      ])
    ]
  );
};

// 順位CSV
$('exportRank').onclick = () => {
  const a = active();
  const b = baseline();

  const teams = getTeamScores(a, b)
    .sort((x, y) =>
      (y.count >= 10) - (x.count >= 10) ||
      x.score - y.score
    );

  csv(
    '予選会Multi_順位.csv',
    [
      [
        '大学',
        '人数',
        '合計経過秒',
        '10人完了'
      ],
      ...teams.map(x => [
        x.n,
        x.count,
        x.count
          ? (x.score / 1000).toFixed(3)
          : '',
        x.count >= 10 ? 'はい' : 'いいえ'
      ])
    ]
  );
};

render();
