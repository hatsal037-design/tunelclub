// 게임 코어 다리 — 폰 앱 CoreBridge 와 같은 몫. 코어(dom_stub + app + native_core)를 한 함수 안에서 올려
// 브라우저 전역(document·localStorage·location)을 가리고, 저장은 명령이 ok 일 때만 한 번(직전 정상본을 남긴다).
const KEY = '1ndc_core', PREV = KEY + '.prev', REV = KEY + '.rev';   // REV는 알림용. 저장 확정과 판 번호의 원본은 KEY 안의 __rev
/* 커지는 키(판 기록·그릇)는 KEY 밖 제 키(1ndc_core:botc_logs)에 글 그대로, 바뀔 때만 쓴다. .prev 에는 판 상태만(2026-10-05).
   옛 꼴(KEY 안에 같이 든 것)도 읽는다 — 첫 저장 때 새 꼴로 옮겨진다 */
const SPLIT = ['botc_logs', 'botc_pots'], sk = k => KEY + ':' + k;
let NC = null, revision = 0, SRC = '', written = {};   // written: 따로 둔 키가 지금 저장소에 가진 값(null = 없음)
const isFull = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);

/** KEY 글 + 따로 둔 키 → 코어 부팅 글. KEY 안에 이미 있으면(옛 꼴) 그쪽이 그 판 번호의 값이다 */
function assemble(saved) {
  const o = saved ? readable(saved) : {}; written = {};
  for (const k of SPLIT) { let v = null; try { v = localStorage.getItem(sk(k)); } catch {} written[k] = v; if (o && !(k in o) && v !== null) o[k] = v; }
  return o ? (Object.keys(o).length ? JSON.stringify(o) : '') : saved;
}

function readable(t) { try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch { return null; } }

function start(saved) {
  NC = null;   // 복구 실패 시 이전의 미저장 코어를 계속 쓰지 않는다
  const next = new Function('__boot_storage', 'print', SRC + '\n;__flushTimers(); return NativeCore;')(assemble(saved), () => {});
  const o = saved ? readable(saved) : null;
  const rev = (o && o.__rev) || 0;
  next.setRevision(rev);
  next.initializeDisplay();   // 조회 전에 공개 확정본 준비. 준비까지 성공한 코어만 공개한다
  revision = rev; NC = next;
}

export async function boot() {
  const files = ['core/dom_stub.js', 'core/core_ver.js', 'core/app.js', 'core/native_core.js'];   // core_ver — 규칙 코드 판본(2026-10-05)
  SRC = (await Promise.all(files.map(f => fetch(f).then(r => { if (!r.ok) throw new Error(f); return r.text(); })))).join('\n;\n');
  // 공통 엔진(2026-10-01) — 코어 위 모듈, 화면 연결 전. 없거나 깨져도 코어는 선다(try 안에서 var GameEngine 은 이 함수 범위로)
  for (const m of ['engine', 'reasoner', 'replay']) { try { const en = await fetch('core/' + m + '.js'); if (en.ok) SRC += '\n;try{\n' + (await en.text()) + '\n}catch(e){ print && print("' + m + ': " + e); }\n'; } catch {} }   // reasoner — 풀이기(P4 v2)
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  if (saved && !readable(saved)) {   // 깨졌으면 직전 정상본으로 — 깨진 것은 지우지 않고 옆에 둔다
    try { localStorage.setItem(KEY + '.broken', saved); } catch {}   // 한도에 막혀도 직전 정상본으로는 간다
    try { saved = localStorage.getItem(PREV); } catch { saved = null; }
    if (saved && !readable(saved)) saved = null;
  }
  start(saved);
  try { localStorage.setItem(REV, String(revision)); } catch {}
  migrateOld();
}

/** 옛 웹(tunel.kr/dangsan/) 칸 정리 — 같은 사이트라 기기 저장소를 같이 쓴다. 옮기지 않고 지운다(2026-10-05 햇살님 «이미 중요한 건 다 올렸으니 다 지워»).
 *  지우는 건 옛 앱 칸(botc_·dangsan_)뿐 — 새 앱이 쓰는 dangsan_pull_since·투넬 로그인 등 다른 칸은 그대로 */
const OLD_KEY = k => /^(botc|dangsan)_/.test(k) && !k.startsWith('dangsan_pull_since');
function migrateOld() {
  try { const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (OLD_KEY(k)) ks.push(k); }
    if (!ks.length) return; ks.forEach(k => localStorage.removeItem(k)); localStorage.setItem('1ndc_old_cleaned', new Date().toISOString() + ' · ' + ks.length + '칸');
  } catch (e) { console.warn('옛 칸 정리 실패', e); }
}

/** 옛 키 현황 — {oldKeys, oldLogs, missing, cleanable}. 옛 기록이 없으면 null */
export function oldStatus() {
  const old = readable(localStorage.getItem('botc_logs') || '[]');
  if (!Array.isArray(old) || !old.length || !NC) return null;
  const now = readable((readable(NC.exportStorage()) || {}).botc_logs || '[]') || [];
  const have = new Set(now.map(L => L && L.id));
  const missing = old.filter(L => L && L.id && !have.has(L.id)).length;
  let oldKeys = 0; for (let i = 0; i < localStorage.length; i++) if (/^(botc|dangsan)_/.test(localStorage.key(i))) oldKeys++;
  return { oldKeys, oldLogs: old.length, missing, cleanable: missing === 0 };
}

export const currentRevision = () => revision;

/* 두 창(탭) — 명령 전에 본문에 저장된 판 번호를 대조하고 다르면 다시 읽은 뒤 거절한다.
   알림 키 쓰기 실패/이벤트 누락에도 본문이 기준이다. 탭 간 동시 쓰기 잠금까지 보장하는 장치는 아니다. */
function savedState() {
  const saved = localStorage.getItem(KEY), o = saved ? readable(saved) : null;
  if (saved && (!o || Array.isArray(o))) throw new Error('invalid saved state');
  return { saved, revision: (o && o.__rev) || 0 };
}
function reload(saved) { start(saved);
  try { localStorage.setItem(REV, String(revision)); } catch {} }   // 번호 칸을 다시 읽은 판에 맞춘다 — 어긋난 채 남으면 명령이 계속 거절된다
let onExternal = null;
export function watchOtherTabs(f) { onExternal = f; }
if (typeof window !== 'undefined') window.addEventListener('storage', e => {
  if ((e.key === KEY || e.key === REV || e.key === null) && NC) {
    try { const s = savedState(); if (s.revision !== revision) { reload(s.saved); if (onExternal) onExternal(); } } catch { /* 다음 명령에서도 다시 읽고, 읽지 못하면 거절한다 */ }
  }
});

/** 순수 읽기 — {revision, data} 의 data */
export function query(name, arg) {
  if (!NC) return null;
  const out = arg === undefined || arg === null ? NC.query(name) : NC.query(name, String(arg));
  const o = readable(out); return o ? o.data : null;
}

/** 변경 명령 — ok 면 저장까지 끝난 뒤 돌려준다. 저장 실패는 마지막 정상본으로 되돌린다 */
export function dispatch(type, payload, expected) {
  if (!NC) return { status: 'rejected', code: 'coreFailure', recovery: '게임을 불러오지 못했어요. 새로고침해 주세요.' };
  let before;
  try {
    before = savedState();
    if (before.revision !== revision) { reload(before.saved); return { status: 'rejected', code: 'staleRevision', recovery: '다른 창에서 판이 바뀌었어요. 최신 판을 다시 읽어 왔어요.' }; }
  } catch { return { status: 'rejected', code: 'persistenceFailed', recovery: '저장된 판을 확인하지 못했어요. 다시 시도해 주세요.' }; }
  const cmd = { apiVersion: 1, commandId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())), expectedRevision: expected ?? revision, type, payload: payload || {} };
  let reply;
  try { reply = readable(NC.dispatch(JSON.stringify(cmd))); } catch (e) { reply = null; }
  if (!reply) return { status: 'rejected', code: 'coreFailure', recovery: '처리하지 못했어요. 새로고침해 주세요.' };
  if (reply.status !== 'ok' || reply.revision === undefined || reply.revision === revision) return reply;
  const c = commit(reply.revision);
  if (c === 'ok') { revision = reply.revision; return reply; }
  try { start(before.saved); } catch { NC = null; }
  if (c === 'full') return { status: 'rejected', code: 'storageFull', recovery: '저장 공간이 찼어요. 기록 탭에서 지난 판을 지워 주세요.' };
  return { status: 'rejected', code: 'persistenceFailed', recovery: '저장하지 못했어요. 입력은 그대로예요 — 다시 시도해 주세요.' };
}

/** 'ok' | 'full'(한도) | 'fail'. 쓰는 순서: .prev(판 상태만 — 옛 꼴이면 여기서 줄어든다) → 바뀐 따로 키 → KEY(확정점).
 *  KEY 가 못 쓰이면 따로 키를 되돌린다. 줄어드는 쓰기(기록 지우기)는 한도가 차 있어도 지나간다 */
function commit(rev) {
  const put = (k, v) => v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  let o; try { o = readable(NC.exportStorage()); } catch {} if (!o) return 'fail';
  o.__rev = rev;
  const parts = {};
  for (const k of SPLIT) { const v = k in o ? String(o[k]) : null; delete o[k]; if (v !== written[k]) parts[k] = v; }
  const undo = {};
  try {
    const cur = localStorage.getItem(KEY), c = cur && readable(cur);
    if (c) { SPLIT.forEach(k => delete c[k]);
      try { localStorage.setItem(PREV, JSON.stringify(c)); } catch (e) { if (!isFull(e)) throw e; localStorage.removeItem(PREV); } }   // 직전본은 한도 앞에서 양보한다
    for (const k in parts) { undo[k] = written[k]; put(sk(k), parts[k]); }
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch (e) {
    for (const k in undo) { try { put(sk(k), undo[k]); } catch {} }
    return isFull(e) ? 'full' : 'fail';
  }
  Object.assign(written, parts);
  // KEY 한 번 쓰기가 확정점. 이후 알림 실패로 이미 저장된 명령을 실패라고 돌려주지 않는다.
  try { localStorage.setItem(REV, String(rev)); } catch {}
  return 'ok';
}

/** 씨앗+명령 2단계(2026-10-05) — 올리기 직전 확인: 보관된 규칙 판본으로 돈 판이고, 새로 띄운 코어에서 공개용 기록(rec)만으로 다시 돌린 판이
 *  지금 판과 같으면 사건 기록(events)을 빼고 올린다(slim 표시). 하나라도 어긋나거나 실패하면 그대로(전체) 올린다 — 기록이 사라질 일은 없다 */
export function slimGame(game) {
  try { const P = game && game.payload, rec = P && P.rec;
    if (!rec || !rec.archived || !Array.isArray(rec.c) || !rec.c.length || !Array.isArray(P.events) || rec.core !== NC.coreVersion()) return game;
    const orig = NC.canonLog(P.id); if (!orig) return game;
    const fresh = new Function('__boot_storage', 'print', SRC + '\n;__flushTimers(); return NativeCore;')(JSON.stringify(rec.start), () => {});
    if (fresh.replayRun(JSON.stringify(rec)) !== orig) return game;
    const P2 = { ...P, slim: { core: rec.core, events: P.events.length } }; delete P2.events;
    return { ...game, payload: P2 };
  } catch { return game; } }

/** 받아서 되살리기(씨앗+명령 3단계, 2026-10-05) — 사건 기록을 빼고 올라간 판(payload.slim)을 그 판이 돈 규칙 판본으로 다시 돌려 채운다.
 *  판본 코드는 지금 것과 같으면 그대로, 다르면 사이트의 core-archive/<판본>/ 에서 받는다. 실패하면 결과만 있는 판으로 둔다 */
const archSrc = {};
async function srcFor(v) {
  if (NC && v === NC.coreVersion()) return SRC;
  if (!archSrc[v]) archSrc[v] = Promise.all(['dom_stub', 'app', 'native_core'].map(f => fetch('core-archive/' + v + '/' + f + '.js').then(r => { if (!r.ok) throw new Error(f); return r.text(); })))
    .then(([a, b, c]) => [a, "var __CORE_VER = '" + v + "', __CORE_ARCHIVED = true;", b, c].join('\n;\n')).catch(() => null);
  return archSrc[v];
}
export async function restoreGames(rows) {
  for (const r of rows || []) {
    const P = r && r.payload; if (!P || !P.slim || Array.isArray(P.events) || !P.rec || !P.rec.start) continue;
    try { const src = await srcFor(P.slim.core || P.rec.core); if (!src) continue;
      const fresh = new Function('__boot_storage', 'print', src + '\n;__flushTimers(); return NativeCore;')(JSON.stringify(P.rec.start), () => {});
      const L = readable(fresh.replayLog(JSON.stringify(P.rec)) || 'null');
      if (L && Array.isArray(L.events)) P.events = L.events;
    } catch {}
  }
  return rows;
}
