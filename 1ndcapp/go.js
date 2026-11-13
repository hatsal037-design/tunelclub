// 진행 웹을 내린 뒤 첫 주소 — 큰 화면 연결 코드(?screen=)면 안내만, 그 밖(?j= 체크인·?u= 프로필 포함)은 참가 웹으로 그대로 넘긴다
(function () {
  var q = new URLSearchParams(location.search);
  if (q.has('screen')) { document.getElementById('screen-only').hidden = false; return; }
  location.replace('me/' + location.search + location.hash);
})();
