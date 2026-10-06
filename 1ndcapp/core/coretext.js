/* 판 진행 글 영어 — 앱 CoreText.swift 와 같은 규칙의 JS 판(웹 진행 화면·번역 덮음 재기) (2026-10-06)
   사전: data(직업·모드 글) + core(문장 조각 틀 {p} 사람 이름 · {n} 숫자 · {r} 직업 이름). 문장·줄·« · » 로 쪼개 조각마다 찾고 못 찾으면 원문 그대로. */
(function (root) {
  function make(core, data) {
    var exact = {}, tmpls = [], memo = {};
    Object.keys(core || {}).forEach(function (ko) {
      if (ko.indexOf('{') < 0) { exact[ko] = core[ko]; return; }
      var slots = [], pat = '^' + ko.replace(/\{([pnr])\}|[.*+?^$()|[\]\\{}]/g, function (m, c) { if (c) { slots.push(c); return c === 'n' ? '(\\d+)' : '([^.!?\\n·]+?)';   /* 빈칸은 문장을 넘지 않는다 — 짧은 틀이 여러 문장 내레이션을 통째로 삼키던 것 */ } return '\\' + m; }) + '$';
      tmpls.push({ re: new RegExp(pat), en: core[ko], slots: slots, len: pat.length });
    });
    tmpls.sort(function (a, b) { return b.len - a.len; });
    data = data || {};
    function whole(s) {
      if (exact[s] != null) return exact[s]; if (data[s] != null) return data[s];
      for (var i = 0; i < tmpls.length; i++) { var t = tmpls[i], m = s.match(t.re); if (!m) continue;
        var out = t.en; t.slots.forEach(function (c, k) { var v = m[k + 1]; out = out.replace('{' + c + '}', c === 'n' ? v : (data[v] || exact[v] || v));   /* 빈칸에 든 낱말(마당·직업 이름)도 사전에 있으면 */ }); return out; }
      return null;
    }
    function tr(s) {
      if (typeof s !== 'string' || !/[가-힣]/.test(s)) return s;
      if (memo[s] != null) return memo[s];
      var w = whole(s), out = w != null ? w : s.split(/((?<=[.!?])\s+|\n+|\s+·\s+)/).map(function (seg, i) { if (i % 2) return seg; var x = whole(seg); return x != null ? x : seg; }).join('');
      return (memo[s] = out);
    }
    return tr;
  }
  var api = { make: make };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CoreText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
