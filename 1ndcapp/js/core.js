// 게임 코어 다리 — 폰 앱 CoreBridge 와 같은 몫. 코어(dom_stub + app + native_core)를 한 함수 안에서 올려
// 브라우저 전역(document·localStorage·location)을 가리고, 저장은 명령이 ok 일 때만 한 번(직전 정상본을 남긴다).
const KEY = '1ndc_core', PREV = KEY + '.prev';
let NC = null, revision = 0, SRC = '';

function readable(t) { try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch { return null; } }

function start(saved) {
  NC = new Function('__boot_storage', 'print', SRC + '\n;__flushTimers(); return NativeCore;')(saved || '', () => {});
  const o = saved ? readable(saved) : null;
  revision = (o && o.__rev) || 0;
  NC.setRevision(revision);
}

export async function boot() {
  const files = ['core/dom_stub.js', 'core/app.js', 'core/native_core.js'];
  SRC = (await Promise.all(files.map(f => fetch(f).then(r => { if (!r.ok) throw new Error(f); return r.text(); })))).join('\n;\n');
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  if (saved && !readable(saved)) {   // 깨졌으면 직전 정상본으로 — 깨진 것은 지우지 않고 옆에 둔다
    try { localStorage.setItem(KEY + '.broken', saved); saved = localStorage.getItem(PREV); } catch { saved = null; }
    if (saved && !readable(saved)) saved = null;
  }
  start(saved);
}

export const currentRevision = () => revision;

/** 순수 읽기 — {revision, data} 의 data */
export function query(name, arg) {
  if (!NC) return null;
  const out = arg === undefined || arg === null ? NC.query(name) : NC.query(name, String(arg));
  const o = readable(out); return o ? o.data : null;
}

/** 변경 명령 — ok 면 저장까지 끝난 뒤 돌려준다. 저장 실패는 마지막 정상본으로 되돌린다 */
export function dispatch(type, payload, expected) {
  if (!NC) return { status: 'rejected', code: 'coreFailure', recovery: '게임을 불러오지 못했어요. 새로고침해 주세요.' };
  const cmd = { apiVersion: 1, commandId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())), expectedRevision: expected ?? revision, type, payload: payload || {} };
  let reply;
  try { reply = readable(NC.dispatch(JSON.stringify(cmd))); } catch (e) { reply = null; }
  if (!reply) return { status: 'rejected', code: 'coreFailure', recovery: '처리하지 못했어요. 새로고침해 주세요.' };
  if (reply.status !== 'ok' || reply.revision === undefined || reply.revision === revision) return reply;
  if (commit(reply.revision)) { revision = reply.revision; return reply; }
  let saved = null; try { saved = localStorage.getItem(KEY); } catch {}
  start(saved);
  return { status: 'rejected', code: 'persistenceFailed', recovery: '저장하지 못했어요. 입력은 그대로예요 — 다시 시도해 주세요.' };
}

function commit(rev) {
  try {
    const o = readable(NC.exportStorage()); if (!o) return false;
    o.__rev = rev;
    const cur = localStorage.getItem(KEY); if (cur) localStorage.setItem(PREV, cur);
    localStorage.setItem(KEY, JSON.stringify(o));
    return true;
  } catch { return false; }
}
