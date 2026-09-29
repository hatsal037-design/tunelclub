/* 네이티브 코어 받침 — 앱(build/app.js)을 브라우저 없이 JavaScriptCore 에 올린다 (2026-09-28 iOS 3단계).
   tests/_harness.js 의 DOM 스텁(anything)·저장소를 옮겨 왔다 — node 전용(Buffer·vm) 없이. 화면은 그리지 않는다.
   저장소는 메모리 — 스위프트가 부팅 때 __boot_storage 로 채우고, 명령 성공 뒤 NativeCore.exportStorage() 를 파일로 쓴다. */
function anything(name = 'el') {
  const el = function () { return anything(name + '()'); };
  el._name = name; el._attrs = {}; el.children = []; el.dataset = {};
  // style 은 CSSStyleDeclaration 흉내 — 앱이 CSS 변수를 setProperty/removeProperty 로 다룬다 (2026-09-20 역할 확인 아트 층)
  el.style = { setProperty(k, v){ this[k] = v; }, removeProperty(k){ const v = this[k]; delete this[k]; return v === undefined ? '' : v; },
    getPropertyValue(k){ return this[k] === undefined ? '' : this[k]; } };
  const cls = new Set();   // classList 를 실제로 기억 — 넘김·잠금 회귀를 단위 테스트가 본다 (2026-08-31)
  // toggle(c, force) 의 둘째 인자까지 흉내낸다 — 앱이 그 형태를 쓴다 (2026-08-31)
  el.classList = { add(c){ cls.add(c); }, remove(c){ cls.delete(c); },
    toggle(c, force){ const on = (force===undefined) ? !cls.has(c) : !!force; if(on) cls.add(c); else cls.delete(c); return on; },
    contains(c){ return cls.has(c); } };
  el.innerHTML = ''; el.textContent = ''; el.value = ''; el.checked = false;
  return new Proxy(el, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === Symbol.toPrimitive || k === 'toString' || k === 'valueOf') return () => '';
      if (k === 'then') return undefined;               // await 시 thenable로 오해 방지
      if (k === 'length') return 0;
      if (k === 'querySelectorAll' || k === 'getElementsByClassName') return () => [];
      if (k === 'querySelector' || k === 'getElementById' || k === 'closest' || k === 'appendChild' || k === 'createElement' || k === 'cloneNode') return () => anything(name + '.' + String(k));
      if (k === 'addEventListener' || k === 'removeEventListener' || k === 'setAttribute' || k === 'focus' || k === 'blur' || k === 'scrollIntoView' || k === 'insertAdjacentHTML' || k === 'remove') return () => {};
      if (k === 'getAttribute') return () => null;
      if (k === 'getBoundingClientRect') return () => ({ width: 800, height: 600, top: 0, left: 0 });
      return anything(name + '.' + String(k));
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function makeStorage() { const m = new Map(); return {
  getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
  removeItem: k => m.delete(k), clear: () => m.clear(), key: i => [...m.keys()][i], get length() { return m.size; } }; }

var __timers = []; function setTimeout(f){ __timers.push(f); return __timers.length; } function clearTimeout(){} function setInterval(){ return 0; } function clearInterval(){}
function __flushTimers(){ for (var n = 0; n < 50 && __timers.length; n++) { var q = __timers.splice(0); q.forEach(function(f){ try { f(); } catch (e) {} }); } }
var localStorage = makeStorage();
if (typeof __boot_storage === 'string' && __boot_storage) {   // 스위프트가 앱 폴더 파일에서 읽어 넘긴 저장본(마지막 정상 커밋)
  var __b = JSON.parse(__boot_storage); Object.keys(__b).forEach(function (k) { if (k !== '__rev') localStorage.setItem(k, __b[k]); });
}
var sessionStorage = makeStorage();
var document = anything('document');
(function(){ var byId = new Map(); document.getElementById = function(id){ if (!byId.has(id)) byId.set(id, anything('#' + id)); return byId.get(id); }; })();
var navigator = { serviceWorker: { register: function(){ return Promise.resolve(); }, getRegistrations: async function(){ return []; } }, userAgent: 'dangsan-native', maxTouchPoints: 5, vibrate: function(){} };
var location = { href: 'app://dangsan/', search: '', hash: '', reload: function(){} };
var history = { replaceState: function(){}, pushState: function(){} };
var matchMedia = function(){ return { matches: false, addEventListener: function(){}, addListener: function(){} }; };
var screen = { width: 390, height: 844, orientation: { type: 'portrait-primary', addEventListener: function(){} } };
var innerWidth = 390, innerHeight = 844, devicePixelRatio = 3;
var requestAnimationFrame = function(f){ return setTimeout(f); }, cancelAnimationFrame = function(){};
var alert = function(){}, confirm = function(){ return true; }, prompt = function(){ return ''; };
var addEventListener = function(){}, removeEventListener = function(){}, dispatchEvent = function(){};
var getComputedStyle = function(){ return { getPropertyValue: function(){ return ''; } }; };
var URL = { createObjectURL: function(){ return 'blob:'; }, revokeObjectURL: function(){} };
var Blob = function(p){ this.parts = p; }, FileReader = function(){};
var crypto = { randomUUID: function(){ return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); },
  getRandomValues: function(a){ for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } };
var performance = { now: function(){ return Date.now(); } }, caches = { keys: async function(){ return []; }, delete: async function(){ return true; } };
var CustomEvent = function(){}, Event = function(){};
var event = { target: anything('event.target'), preventDefault: function(){}, stopPropagation: function(){} };
var window = globalThis, self = globalThis;
