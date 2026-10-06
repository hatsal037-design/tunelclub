/* 참가자 모듈 — 앱(JSContext)·웹(me/)이 같은 파일로 서버를 부른다 (2026-10-06, 단계 2)
 * 약속: docs/참가자_계약.md · 설계: docs/보고서/참가자웹_설계도_20261006/클로드_기능설계.md 1절
 * - 통신은 밖에서 넣는다: net(fn, args) → Promise. 웹 = supabase-js rpc, 앱 = 스위프트 URLSession 다리.
 * - 진행 코어(app.js·native_core)와 섞지 않는다. 이 파일은 그 전역을 읽지 않는다.
 * - 판정은 서버. 여기 «미리 보기»는 서버와 같은 규칙으로 저장 전에 알려 주기만 한다(서버가 마지막 말).
 * - 화면 문장은 돌려주지 않는다. 오류는 코드 → 화면이 i18n/<언어>.json 의 err.<코드> 로 읽는다.
 */
(function (root) {
  'use strict';

  var IMPERSONATE = ['운영자', '관리자', '진행자', '운영진', 'admin', 'administrator', 'official', 'support', 'moderator', 'tunel', '투넬', '첫밤사망자클럽', '1ndclub', '1ndcapp', '당산나무'];
  var HANDLE_RESERVED = ['admin', 'administrator', 'root', 'support', 'help', 'official', 'system', 'staff', 'api', 'www', 'app', 'null', 'undefined',
    'tunel', '1ndclub', '1ndcapp', 'dangsan', 'hatsal', 'host', 'moderator', 'operator', 'notice'];
  var EMOJI = /[\u{1F000}-\u{1FAFF}☀-➿⬀-⯿←-⇿️‍]/u;
  var CTRL = /[\u0000-\u001f\u007f]/;
  var NICK_SYMBOL = /[!"#$%&()*+,/:;<=>?@[\\\]^`{|}~]/;
  var LIMIT = { nick: 12, name: 30, bio: 150, handle: 30 };

  function norm(s) { return String(s == null ? '' : s).normalize('NFC').trim().replace(/\s+/g, ' '); }
  function impersonates(v) { var f = v.toLowerCase().replace(/\s/g, ''); return IMPERSONATE.some(function (w) { return f.indexOf(w) >= 0; }); }

  // 글자 미리 보기 — 문제가 없으면 null, 있으면 코드. 횟수·겹침은 서버만 안다
  function problem(kind, raw) {
    var v = kind === 'handle' ? String(raw == null ? '' : raw).trim().toLowerCase() : norm(raw);
    if (kind === 'handle') {
      // 인스타식(2026-10-06 정함 2): 영문·숫자·점·밑줄 1~30자, 숫자로 시작해도 됨. 점 연속·끝 점 안 됨
      if (!v) return 'too_short';
      if (v.length > LIMIT.handle) return 'too_long';
      if (!/^[a-z0-9._]+$/.test(v) || /\.\./.test(v) || /\.$/.test(v) || /^\./.test(v)) return 'bad_chars';
      if (HANDLE_RESERVED.indexOf(v) >= 0 || impersonates(v)) return 'impersonate';
      return null;
    }
    if (kind === 'nick') {
      if (!v) return 'too_short';
      if (Array.from(v).length > LIMIT.nick) return 'too_long';
      if (CTRL.test(v)) return 'bad_chars';
      if (EMOJI.test(v)) return 'emoji';
      if (NICK_SYMBOL.test(v)) return 'bad_chars';
      if (impersonates(v)) return 'impersonate';
      return null;
    }
    if (kind === 'name' || kind === 'bio') {
      if (!v) return null;   // 비워 두기 됨
      if (Array.from(v).length > LIMIT[kind]) return 'too_long';
      if (CTRL.test(v)) return 'bad_chars';
      if (EMOJI.test(v)) return 'emoji';
      return null;
    }
    return 'bad_chars';
  }

  // 서버 답을 한 꼴로 — {ok, code, ...}. 코드가 없는 옛 함수는 문장(error)을 legacy 로 넘긴다(그대로 보여 줄 수밖에 없다)
  function answer(r) {
    if (r && typeof r === 'object' && 'ok' in r) {
      if (r.ok) return r;
      return Object.assign({}, r, { ok: false, code: r.code || 'legacy', legacy: r.code ? undefined : (r.error || r.reason || null) });
    }
    return { ok: true, value: r };
  }

  function create(opts) {
    var net = opts && opts.net;
    if (typeof net !== 'function') throw new Error('participant: net 이 필요해요');
    var state = { me: null, joined: [], inbox: null, notices: null };
    var listeners = [];
    function emit() { listeners.forEach(function (f) { try { f(state); } catch (e) {} }); }
    function call(fn, args) {
      return Promise.resolve().then(function () { return net(fn, args || {}); }).then(answer, function (e) {
        var m = String((e && e.message) || e || '');
        return { ok: false, code: /로그인|JWT|auth/i.test(m) ? 'not_logged_in' : 'net', legacy: m };
      });
    }
    function set(k, v) { state[k] = v; emit(); return v; }

    return {
      state: state,
      on: function (f) { listeners.push(f); return function () { listeners = listeners.filter(function (x) { return x !== f; }); }; },
      problem: problem,

      // ── 나·프로필 ──
      me: function () {   // needs = 채워야 할 칸(nick·handle·agree) — 투넬에서 넘어온 계정은 다음 로그인 때 채운다(0250, 스위치 complete_profile)
        return Promise.all([call('my_profile'), call('my_needs')]).then(function (a) {
          var r = a[0]; if (!r.ok) return r;
          var v = r.value || r; v.needs = a[1].ok && Array.isArray(a[1].value) ? a[1].value : (v.handle ? [] : ['handle', 'agree']);
          return set('me', v);
        });
      },
      nameCheck: function (kind, value) {   // 입력 중 — 글자 문제는 서버에 묻지 않는다
        var p = problem(kind, value); if (p) return Promise.resolve({ ok: false, code: p });
        return call(kind === 'handle' ? 'handle_check' : 'nick_check', kind === 'handle' ? { p_handle: value } : { p_nick: value });
      },
      // 바뀐 칸만, 칸마다 따로 저장(인스타 절차의 ✓완료). 미리 보기에 걸린 칸은 보내지 않는다
      setProfile: function (changes) {
        var jobs = [], failed = {}, saved = [];
        var map = { handle: ['set_handle', 'p_handle'], nick: ['set_nickname', 'p_nick'], name: ['set_display_name', 'p_name'] };
        Object.keys(changes || {}).forEach(function (k) {
          if (!map[k]) return;
          var p = problem(k, changes[k]); if (p) { failed[k] = p; return; }
          jobs.push(call(map[k][0], (function () { var a = {}; a[map[k][1]] = changes[k]; return a; })()).then(function (r) {
            if (r.ok) saved.push(k); else failed[k] = r.code === 'legacy' ? (r.legacy || 'legacy') : r.code;
          }));
        });
        var more = {};
        ['bio', 'avatar', 'private', 'lang', 'agreed'].forEach(function (k) {
          if (!(k in (changes || {}))) return;
          if (k === 'bio') { var p = problem('bio', changes.bio); if (p) { failed.bio = p; return; } }
          more[k] = changes[k];
        });
        if (Object.keys(more).length) jobs.push(call('set_profile_more', { p: more }).then(function (r) {
          if (r.ok) Object.keys(more).forEach(function (k) { saved.push(k); }); else failed[r.field || Object.keys(more)[0]] = r.code;
        }));
        var self = this;
        return Promise.all(jobs).then(function () { return saved.length ? self.me() : null; })
          .then(function () { return { ok: !Object.keys(failed).length, saved: saved, failed: failed }; });
      },

      revert: function (kind) { return call('name_revert', { p_kind: kind }).then(function (r) { return r.ok ? this.me().then(function () { return r; }) : r; }.bind(this)); },

      // ── 사람 ──
      profile: function (handle) { return call('profile', { p_handle: handle }); },
      follow: function (handle) { return call('follow', { p_handle: handle }); },
      unfollow: function (handle) { return call('unfollow', { p_handle: handle }); },
      answer: function (handle, accept) { return call('request_answer', { p_handle: handle, p_accept: !!accept }); },
      removeFollower: function (handle) { return call('follower_remove', { p_handle: handle }); },
      block: function (handle) { return call('block', { p_handle: handle }); },
      unblock: function (handle) { return call('unblock', { p_handle: handle }); },
      blocked: function () { return call('blocked_list'); },
      followers: function (handle, after) { return call('follow_list', { p_handle: handle, p_which: 'followers', p_after: after || null }); },
      following: function (handle, after) { return call('follow_list', { p_handle: handle, p_which: 'following', p_after: after || null }); },
      search: function (q) { return String(q || '').replace(/^@/, '').trim().length < 2 ? Promise.resolve({ ok: true, rows: [] }) : call('people_search', { p_q: q }); },
      playedWith: function () { return call('people_played_with', {}); },
      plazaPeople: function (plazaId) { return call('plaza_people', { p_plaza: plazaId }); },

      // ── 요청함·알림함·푸시 ──
      inbox: function () { return call('inbox_list', {}).then(function (r) { return r.ok ? set('inbox', r.value || []) : r; }); },
      notices: function () { return call('notices_list', {}).then(function (r) { return r.ok ? set('notices', r.value || []) : r; }); },
      readNotices: function (upto) { return call('notices_read', { p_upto: upto || null }); },
      pushRegister: function (platform, token, lang) { return call('push_register', { p_platform: platform, p_token: token, p_lang: lang || null }); },
      pushForget: function (token) { return call('push_forget', { p_token: token }); },

      // ── 사진·탈퇴(0210) ──
      photoSet: function (path, sha256) { return call('photo_set', { p_path: path, p_sha256: sha256 }); },
      photoReport: function (handle) { return call('photo_report', { p_handle: handle }); },
      status: function () { return call('my_status'); },
      accountLeave: function () { return call('account_leave'); },
      accountReturn: function () { return call('account_return'); },

      // ── 광장 ──
      checkin: function (code) { return call('plaza_checkin', { p_code: code }); },
      joined: function () { return call('plaza_joined').then(function (r) { return r.ok ? set('joined', r.value || []) : r; }); },
      leave: function (plazaId) { return call('plaza_leave', { p_id: plazaId }); },

      // ── 전적·정정 ──
      stats: function () { return call('my_stats'); },
      seated: function (limit) { return call('my_seated', { p_limit: limit || 20 }); },
      fixRequest: function (gameId) { return call('fix_request', { p_game: gameId }); },
    };
  }

  // QR·링크에서 광장 코드 꺼내기 — …/?j=코드 또는 …/me/?j=코드, 코드만 적어도 됨
  function codeFrom(text) {
    var s = String(text || '').trim(), m = s.match(/[?&]j=([A-Za-z0-9]{8})/);
    if (m) return m[1].toUpperCase();
    return /^[A-Za-z0-9]{8}$/.test(s) ? s.toUpperCase() : null;
  }

  // 문구 — 사전(i18n/<언어>.json)에서 키를 찾아 {이름} 자리를 채운다. 없으면 한국어 사전, 그래도 없으면 키
  function text(dict, key, vars, fallback) {
    var s = (dict && dict[key]) || (fallback && fallback[key]) || key;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? String(vars[k]) : m; });
  }
  // 언어 고르기 — 계정에 정한 것 → 기기 언어 → 지원하지 않는 언어면 영어(정함 2026-10-06). 중국어는 대만·홍콩·번체면 번체, 나머지 간체
  var LANGS = ['ko', 'en', 'ja', 'es', 'zh-Hans', 'zh-Hant', 'th', 'vi', 'id', 'pt-BR'];   // 한류가 통하는 나라에서 많이 쓰는 말(2026-10-06 햇살님)
  function lang(account, device) {
    if (account && LANGS.indexOf(account) >= 0) return account;
    var d = String(device || '').replace('_', '-'), l = d.slice(0, 2).toLowerCase();
    if (l === 'zh') return /Hant|TW|HK|MO/i.test(d) ? 'zh-Hant' : 'zh-Hans';
    if (l === 'pt') return 'pt-BR';
    if (l === 'in') return 'id';   // 옛 인도네시아어 코드
    return LANGS.indexOf(l) >= 0 ? l : 'en';
  }

  var api = { create: create, problem: problem, codeFrom: codeFrom, text: text, lang: lang, LANGS: LANGS, LIMIT: LIMIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Participant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
