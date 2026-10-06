// API 키 — 이 파일만 바꾸면 됩니다. (외부 공유 금지)
window.KEYS = {
  kakao:  "8cf550fc493131ae0b9e191c277069a9",          // Kakao Developers > 앱 > 플랫폼 키 > JavaScript 키 (도메인 http://localhost:8080)
  google: "AIzaSyBPh2XxxngUHx72Mp6dEql_oLiWY1scSf8",   // Google Maps Demo Key (테스트용, 일일 한도)
  vworld: "E9225D4A-39A0-49D7-B5D1-3AB2E4CB8428",      // 브이월드 개발키 (만료 2027-04-02, 연장 3회) URL http://localhost:8080
  apiBase: "",                                          // 건축물대장 중계 서버 주소. 로컬(서버실행.bat)은 비워둠, 웹 배포판은 Cloudflare Worker 주소
  domain: location.origin                              // 브이월드 domain 파라미터 = 현재 사이트 주소 (로컬/웹 자동)
};
