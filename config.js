#!/usr/bin/env python3
# Honte Review · KataGo analysis server
# Takes a game from the site, has the KataGo analysis engine evaluate every move, and returns Black win rate, score lead and best move.
import json, os, subprocess, sys, threading, time, uuid
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

TOKEN = os.environ.get('BENSHOU_TOKEN', '')
HOME = os.environ.get('KATAGO_HOME', '/opt/katago')
PORT = int(os.environ.get('PORT', '8765'))
THREADS = os.environ.get('KATAGO_THREADS', '2')

proc = subprocess.Popen(
    [os.path.join(HOME, 'katago'), 'analysis', '-config', os.path.join(HOME, 'analysis.cfg'), '-model', os.path.join(HOME, 'model.bin.gz'),
     '-override-config', 'reportAnalysisWinratesAs=BLACK,numAnalysisThreads=' + THREADS + ',numSearchThreadsPerAnalysisThread=2,logToStderr=false,logAllResponses=false'],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=open(os.path.join(HOME, 'katago.log'), 'a'), text=True, bufsize=1)
jobs, lock = {}, threading.Lock()


def reader():
    for line in proc.stdout:
        try:
            r = json.loads(line)
        except Exception:
            continue
        with lock:
            j = jobs.get(r.get('id'))
            if not j:
                continue
            if 'error' in r:
                j['status'], j['error'] = 'error', r['error']
                continue
            if 'turnNumber' not in r:
                continue
            ri, mi = r.get('rootInfo', {}), r.get('moveInfos', [])
            j['turns'][r['turnNumber']] = {
                'wr': round(ri.get('winrate', 0.5) * 100, 1),
                'lead': round(ri.get('scoreLead', 0), 1),
                'best': mi[0]['move'] if mi else None,
                'pv': mi[0].get('pv', [])[:8] if mi else [],
            }
            if len(j['turns']) >= j['total']:
                j['status'] = 'done'
    os._exit(1)  # if KataGo exits, let systemd restart us


threading.Thread(target=reader, daemon=True).start()


class H(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'authorization, content-type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

    def send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def authed(self):
        if TOKEN and self.headers.get('Authorization', '') != 'Bearer ' + TOKEN:
            self.send(401, {'error': 'wrong password'})
            return False
        return True

    def log_message(self, *a):
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if self.path in ('/', '/health'):
            return self.send(200, {'ok': True, 'msg': 'Honte Review KataGo server is running'})
        if not self.authed():
            return
        if self.path.startswith('/job/'):
            with lock:
                j = jobs.get(self.path[5:])
                if not j:
                    return self.send(404, {'error': 'analysis job not found'})
                out = {'status': j['status'], 'error': j.get('error'), 'total': j['total'], 'done': len(j['turns']),
                       'turns': [j['turns'].get(i) for i in range(j['total'])]}
            return self.send(200, out)
        self.send(404, {'error': 'not found'})

    def do_POST(self):
        if self.path == '/ping':
            if self.authed():
                self.send(200, {'ok': True})
            return
        if self.path != '/analyze' or not self.authed():
            return self.send(404, {'error': 'not found'}) if self.path != '/analyze' else None
        try:
            q = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))) or b'{}')
            moves = [[str(c), str(m)] for c, m in q.get('moves', [])][:600]
            size = int(q.get('size', 19))
            visits = max(10, min(400, int(q.get('visits', 50))))
        except Exception as e:
            return self.send(400, {'error': 'bad request: ' + str(e)})
        jid = uuid.uuid4().hex[:12]
        with lock:
            now = time.time()
            for k in [k for k, v in jobs.items() if now - v['t'] > 3600]:
                jobs.pop(k, None)
            jobs[jid] = {'t': now, 'status': 'running', 'total': len(moves) + 1, 'turns': {}}
        query = {'id': jid, 'moves': moves, 'initialStones': q.get('initialStones', []), 'rules': q.get('rules', 'chinese'),
                 'komi': float(q.get('komi', 7.5)), 'boardXSize': size, 'boardYSize': size,
                 'analyzeTurns': list(range(len(moves) + 1)), 'maxVisits': visits}
        proc.stdin.write(json.dumps(query) + '\n')
        proc.stdin.flush()
        self.send(200, {'id': jid, 'total': len(moves) + 1})


print('Honte Review KataGo server listening on port', PORT, flush=True)
ThreadingHTTPServer((os.environ.get('HOST', '127.0.0.1'), PORT), H).serve_forever()
