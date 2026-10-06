# -*- coding: utf-8 -*-
"""그랜드썬 배치도 사이트 로컬 서버 (localhost:8080)
 - 상위 폴더(6.배치도,제안서,견적서 자동완성)를 그대로 서비스 → http://localhost:8080/배치도/
 - /api/br?sigunguCd=..&bjdongCd=..&platGbCd=..&bun=..&ji=..  : 건축물대장 표제부(국토부 건축HUB) 중계
   (브라우저에서 직접 부르면 CORS 로 막히므로 여기서 대신 호출. 키는 keys.js 의 datago 값)
"""
import http.server, socketserver, urllib.request, urllib.error, urllib.parse, json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PORT = 8080

def read_key(name):
    if name == 'datago':  # 공공데이터포털 키는 깃허브에 올라가지 않도록 datago.txt(.gitignore) 에 따로 둔다
        try:
            v = open(os.path.join(HERE, 'datago.txt'), encoding='utf-8').read().strip()
            if v: return v
        except Exception:
            pass
    try:
        txt = open(os.path.join(HERE, 'keys.js'), encoding='utf-8').read()
        m = re.search(name + r'\s*:\s*"([^"]*)"', txt)
        return m.group(1) if m else ''
    except Exception:
        return ''

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def log_message(self, fmt, *args):
        if '/api/' in (args[0] if args else ''):
            super().log_message(fmt, *args)
    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path.startswith('/api/br'):
            return self.api_br()
        if self.path.startswith('/api/ping'):
            return self.send_json(200, {'ok': True, 'datago': bool(read_key('datago'))})
        return super().do_GET()
    def api_br(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        key = read_key('datago')
        if not key:
            return self.send_json(400, {'error': 'datago.txt(공공데이터포털 인증키)가 없습니다'})
        p = {k: q.get(k, [''])[0] for k in ('sigunguCd', 'bjdongCd', 'platGbCd', 'bun', 'ji')}
        p['bun'] = p['bun'].zfill(4); p['ji'] = p['ji'].zfill(4); p['platGbCd'] = p['platGbCd'] or '0'
        url = ('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=' + urllib.parse.quote(key, safe='') +
               '&_type=json&numOfRows=50&pageNo=1&' + urllib.parse.urlencode(p))
        try:
            raw = ''; last = None
            for attempt in range(4):  # 건축HUB 는 가끔 503 / SERVICETIMEOUT_ERROR(05) 를 내므로 몇 번 더 시도
                try:
                    with urllib.request.urlopen(url, timeout=25) as r:
                        raw = r.read().decode('utf-8', 'replace')
                    if 'SERVICETIMEOUT' not in raw and 'OpenAPI_ServiceResponse' not in raw:
                        break
                except urllib.error.HTTPError as e:
                    last = e
                    if e.code < 500: raise
                time.sleep(1.0 + attempt)
            if not raw:
                return self.send_json(502, {'error': '건축HUB 서버가 응답하지 않습니다(%s) — 잠시 후 「건축물대장 다시 조회」' % (last.code if last else 'timeout')})
            try:
                data = json.loads(raw)
            except Exception:
                return self.send_json(502, {'error': '건축HUB 응답이 JSON 이 아닙니다(키 미승인/오류)', 'raw': raw[:500]})
            if 'OpenAPI_ServiceResponse' in data:
                h = data['OpenAPI_ServiceResponse'].get('cmmMsgHeader', {})
                return self.send_json(502, {'error': '건축HUB 오류: %s (%s) — 잠시 후 다시 시도' % (h.get('returnAuthMsg'), h.get('errMsg'))})
            items = (((data.get('response') or {}).get('body') or {}).get('items') or {})
            it = items.get('item') if isinstance(items, dict) else items
            if it is None: it = []
            if isinstance(it, dict): it = [it]
            keep = ['mgmBldrgstPk', 'bldNm', 'dongNm', 'mainPurpsCdNm', 'etcPurps', 'strctCdNm', 'etcStrct', 'roofCdNm', 'etcRoof',
                    'heit', 'grndFlrCnt', 'ugrndFlrCnt', 'archArea', 'totArea', 'platArea', 'bcRat', 'vlRat', 'useAprDay', 'platPlc', 'newPlatPlc', 'mainAtchGbCdNm', 'regstrKindCdNm']
            out = [{k: x.get(k) for k in keep if x.get(k) not in (None, '', 0, '0', 0.0)} for x in it]
            hdr = (data.get('response') or {}).get('header') or {}
            return self.send_json(200, {'ok': True, 'count': len(out), 'items': out, 'header': hdr})
        except Exception as e:
            return self.send_json(502, {'error': str(e)})

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), H) as srv:
        print('GRANDSUN layout site: http://localhost:%d/%s/' % (PORT, urllib.parse.quote(os.path.basename(HERE))))
        print('root =', ROOT, '| datago key:', 'OK' if read_key('datago') else 'none (keys.js 에 datago 추가하면 건축물대장 조회 가능)')
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
