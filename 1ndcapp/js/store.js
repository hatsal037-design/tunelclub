// 화면이 보는 코어 창구 — 폰 앱 CoreStore 와 같다. 읽기는 refresh(한 바퀴), 변경은 dispatch 하나로만.
import * as core from './core.js';
import { settings } from './settings.js';
import { speakEffects } from './narrator.js';
import { bgmSync, bgmEffects } from './bgm.js';

const listeners = new Set();
export const store = {
  home: { destination: 'newPreparation', ruleFamily: '', hasRecords: false },
  board: { shape: 'round', seats: [], cells: [], rows: 0, cols: 0, canRearrange: true },
  night: null, roles: null, handoff: null, stage: null, process: null, reference: null, day: null, result: null,
  art: {}, notice: null, seen: 0,
  subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
  emit() { store.seen++; listeners.forEach(f => f()); },
  artOf(name) { return name ? store.art[name] : undefined; },

  refresh() {
    const q = core.query;
    const h = q('home'); if (h) store.home = h;
    const b = q('preparation.board'); if (b) store.board = b;
    store.night = q('game.current');
    store.stage = q('game.stage');
    if (store.home.destination === 'resumeGame') { store.process = q('game.process'); store.reference = q('reference'); }
    store.day = q('game.day');
    const art = q('roles.art'); if (art) { const m = {}; art.forEach(a => { if (!m[a.ko]) m[a.ko] = a; }); store.art = m; }
    store.result = store.stage && store.stage.stage === 'done' ? q('game.result') : null;
    if (store.home.destination !== 'resumeGame') { store.roles = q('preparation.roles'); store.handoff = q('preparation.handoff'); }
    store.seenRevision = core.currentRevision();
    store.emit();
  },

  get(name, arg) { return core.query(name, arg); },
  voters(k) { return core.query('day.voters', String(k)) || []; },
  publicCard(seat) { return core.query('handoff.public', String(seat)); },

  /** 변경 명령 — 앞 명령이 끝나고 화면이 새 판을 읽은 뒤 다음 명령이 revision 을 잡는다 */
  _chain: Promise.resolve(),
  dispatch(type, payload = {}) {
    const run = () => new Promise(res => setTimeout(() => res(store._now(type, payload)), 0));
    const p = store._chain.then(run); store._chain = p.catch(() => {}); return p;
  },
  _now(type, payload) {
    const r = core.dispatch(type, payload, store.seenRevision);
    let reply;
    if (r.status === 'ok') reply = { ok: true, revision: r.revision };
    else if (r.status === 'needsConfirmation') reply = { confirm: true, token: r.token || '', reasonCode: r.reasonCode || '', choices: r.choices || [] };
    else reply = { rejected: true, code: r.code || 'coreFailure', recovery: r.recovery || '' };
    store.refresh();
    if (reply.ok && Array.isArray(r.effects) && r.effects.length) {
      speakEffects(r.effects); bgmEffects(r.effects);
      const notes = r.effects.filter(e => e.kind === 'notice').map(e => e.text).filter(Boolean);
      if (notes.length) { store.notice = notes.join('\n'); store.emit(); }
    }
    if (reply.ok) { try { bgmSync(core.query('bgm.slot')); } catch {} }   // 배경 음악 — 과정이 바뀌면 곡도(2026-10-04)
    if (reply.ok && store.afterCommit) { try { store.afterCommit(type); } catch {} }
    if (reply.ok && store.afterPublic) { try { store.afterPublic(type); } catch {} }   // 큰 화면 — 공개 정보가 바뀌었으면 올린다
    if (reply.ok && STEP.has(type) && settings.get('haptics') && navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
    return reply;
  },
};
// 성공 진동을 주는 명령 — 저장 완료·단계 전환만
const STEP = new Set(['roles.assign', 'game.beginFirstNight', 'handoff.seen', 'night.start', 'night.commitTargets', 'night.advance',
  'phase.enterDay', 'phase.enterNight', 'day.execute', 'day.executeAndFinish', 'game.finish', 'game.again']);

export async function bootStore() { await core.boot(); store.refresh(); core.watchOtherTabs(() => store.refresh()); }   // 다른 창이 판을 바꾸면 이 창도 새 판을 읽는다
