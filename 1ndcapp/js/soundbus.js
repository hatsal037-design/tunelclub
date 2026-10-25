// 소리 나갈 곳(2026-10-25 햇살님 «연결된 화면에서 소리 나게 할지 폰에서 나게 할지 선택») — 설정 «큰 화면 소리»가 큰 화면이고 연결돼 있으면
// screenlink.js 가 send·bgm 을 채워 소리를 TV 로 보낸다(true = 보냈으니 폰에선 안 튼다). 낭독·음악·알림음 모듈이 store 를 거쳐 돌림 import 가 되지 않게 따로 둔다
export const soundOut = { send: null, bgm: null, ping: null };
