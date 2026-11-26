// Studio runner: a one-at-a-time queue that runs Claude Code headless on the owner's own
// subscription, for the Desk. The queue lives in studio/runner/queue.json so a Desk restart
// keeps it. Each run's raw stream-json goes to jobs/<id>/runs/<n>.jsonl (or studio/runner/logs/
// until the job id is known) with a short human log next to it (<n>.log).
//
// The claude child writes straight into its log file (not a pipe) and runs in its own process
// group, so it survives a Desk restart; the Desk re-adopts it by pid and keeps tailing the file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ALLOWED_TOOLS = 'Bash,Read,Write,Edit,Glob,Grep,Task,Agent,Skill,WebSearch,WebFetch,TodoWrite';
const MAX_FINISHED = 60;
const MAX_LINES = 3000;
const MIN_WAIT_MS = 15 * 60e3; // never retry a usage-limited run sooner than this
const MAX_USAGE_ATTEMPTS = 12;

const now = () => new Date().toISOString();
const hhmmss = (d = new Date()) => d.toTimeString().slice(0, 8);
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

export function findClaude() {
  if (process.env.CLAUDE_BIN && fs.existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const dirs = [...String(process.env.PATH || '').split(':'), path.join(process.env.HOME || '', '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  for (const d of dirs) { const p = path.join(d, 'claude'); try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* next */ } }
  return null;
}

// The child gets the Desk's environment minus the API key (so the subscription login is used)
// and minus the variables of whatever Claude Code session happened to start the Desk.
export function childEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k === 'CLAUDE_PID' || k === 'CLAUDE_EFFORT' || k.startsWith('CLAUDE_AGENT_SDK') || (k.startsWith('CLAUDE_CODE_') && k !== 'CLAUDE_CODE_OAUTH_TOKEN')) delete env[k];
  }
  env.STUDIO_RUNNER = '1';
  return env;
}

export function claudeArgs(prompt) {
  return ['-p', prompt, '--permission-mode', 'dontAsk', '--allowedTools', ALLOWED_TOOLS, '--output-format', 'stream-json', '--verbose'];
}

// Usage-limit text as Claude Code prints it in results/errors. Only consulted for error results
// or a rejected rate_limit_event, so a script that merely mentions "rate limits" won't trip it.
export function usageLimitFrom(text) {
  const t = String(text || '');
  if (!/(usage limit|limit reached|hit your (usage )?limit|out of (extra )?usage|rate[_ ]limit(ed)?|too many requests|429|resets? (at )?\d|weekly limit|5-hour limit|session limit)/i.test(t)) return null;
  const out = { text: t.slice(0, 200) };
  const ep = t.match(/\|(\d{10})\b/); // "Claude AI usage limit reached|1795120200"
  if (ep) out.resetsAt = Number(ep[1]) * 1000;
  return out;
}

// --------------------------------------------------------------------- summaries
function relPath(R, p) {
  const s = String(p || '');
  const j = s.match(new RegExp(`^${R.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/jobs/[^/]+/(.+)$`));
  if (j) return j[1];
  return s.startsWith(R + '/') ? s.slice(R.length + 1) : s.replace(/^\/Users\/[^/]+/, '~');
}
function oneLine(s, max = 150) { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; }
export function summarizeTool(R, name, input = {}) {
  const rel = (p) => relPath(R, p);
  switch (name) {
    case 'Task': case 'Agent': return { kind: 'agent', msg: `${oneLine(input.description || input.prompt, 90)}…` };
    case 'Bash': {
      const c = String(input.command || '');
      let m;
      if ((m = c.match(/job\.mjs['"]?\s+node\s+(\S+)\s+(\w+)\s+(\w+)(?:[\s\S]*?--summary\s+(["'])([\s\S]*?)\4)?/))) return { kind: 'node', msg: `${m[2]} → ${m[3]}${m[5] ? ': ' + oneLine(m[5], 110) : ''}` };
      if (/job\.mjs['"]?\s+new\b/.test(c)) return { kind: 'tool', msg: 'creating the job folder' };
      if (/job\.mjs['"]?\s+gate\b/.test(c)) return { kind: 'tool', msg: 'recording the gate decision' };
      if (/job\.mjs['"]?\s+output\b/.test(c)) return { kind: 'tool', msg: 'registering an output' };
      if (/job\.mjs['"]?\s+(list|show)\b/.test(c)) return { kind: 'tool', msg: 'reading job status' };
      if (/job\.mjs['"]?\s+log\b/.test(c)) return { kind: 'tool', msg: 'writing to the job log' };
      if (/desk\/start\.sh/.test(c)) return { kind: 'tool', msg: 'making sure the Desk is up' };
      if (/tools\/qa\//.test(c)) return { kind: 'tool', msg: 'running QA checks…' };
      if (/variety\.py/.test(c)) return { kind: 'tool', msg: 'checking variety against past pieces' };
      if (/\bffmpeg\b/.test(c)) return { kind: 'tool', msg: 'rendering video (ffmpeg)…' };
      if (/\bffprobe\b/.test(c)) return { kind: 'tool', msg: 'probing media' };
      if (/remotion|hyperframes|playwright|chromium|puppeteer|\brender\b|shoot\.mjs/.test(c)) return { kind: 'tool', msg: 'rendering…' };
      if (/whisper/.test(c)) return { kind: 'tool', msg: 'transcribing audio' };
      if (input.description) return { kind: 'tool', msg: oneLine(input.description, 120) };
      return { kind: 'tool', msg: `$ ${oneLine(c, 110)}` };
    }
    case 'Write': return { kind: 'tool', msg: `writing ${rel(input.file_path)}` };
    case 'Edit': case 'MultiEdit': return { kind: 'tool', msg: `editing ${rel(input.file_path)}` };
    case 'Read': return { kind: 'tool', msg: `reading ${rel(input.file_path)}` };
    case 'Glob': case 'Grep': return { kind: 'tool', msg: `searching ${oneLine(input.pattern, 60)}` };
    case 'Skill': return { kind: 'tool', msg: `using skill ${input.skill || input.name || ''}` };
    case 'WebSearch': return { kind: 'tool', msg: `searching the web: ${oneLine(input.query, 80)}` };
    case 'WebFetch': { let h = ''; try { h = new URL(input.url).hostname; } catch { /* */ } return { kind: 'tool', msg: `fetching ${h || 'a page'}` }; }
    case 'TodoWrite': return { kind: 'tool', msg: 'updating the plan' };
    default: return { kind: 'tool', msg: name };
  }
}
function toolResultText(c) {
  if (typeof c.content === 'string') return c.content;
  if (Array.isArray(c.content)) return c.content.map((x) => (typeof x === 'string' ? x : x?.text || '')).join('\n');
  return '';
}

// --------------------------------------------------------------------- runner
export function createRunner({ R, onEvent = () => {}, logger = console }) {
  const DIR = HERE;
  const QFILE = path.join(DIR, 'queue.json');
  const LOGS = path.join(DIR, 'logs');
  fs.mkdirSync(LOGS, { recursive: true });
  const bin = findClaude();
  let items = [];
  let current = null; // the running item
  const live = new Map(); // runId -> {lines:[], tail state}
  let saveT = null;

  // ------------------------------------------------ persistence
  function load() {
    try { const q = JSON.parse(fs.readFileSync(QFILE, 'utf8')); items = Array.isArray(q.items) ? q.items : []; } catch { items = []; }
  }
  function saveNow() {
    clearTimeout(saveT); saveT = null;
    const fin = items.filter((x) => !['queued', 'running', 'waiting'].includes(x.status));
    const keep = new Set(fin.slice(-MAX_FINISHED).map((x) => x.id));
    items = items.filter((x) => ['queued', 'running', 'waiting'].includes(x.status) || keep.has(x.id));
    const tmp = `${QFILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, saved: now(), items: items.map(stripPrivate) }, null, 2));
    fs.renameSync(tmp, QFILE);
  }
  function save() { if (!saveT) saveT = setTimeout(saveNow, 300); }
  function stripPrivate(x) { const o = {}; for (const [k, v] of Object.entries(x)) if (!k.startsWith('_')) o[k] = v; return o; }

  function publicItem(x) {
    if (!x) return null;
    const { id, kind, label, text, prompt, jobId, jobs, status, created, started, ended, attempts, retryAt, n, result, cost, lastLine, error, brief, sessionId, turns, durationMs, logFile, humanFile } = x;
    return { id, kind, label, text, prompt, jobId: jobId || null, jobs: jobs || (jobId ? [jobId] : []), status, created, started, ended, attempts, retryAt, n, result, cost, lastLine, error, brief, sessionId, turns, durationMs, logFile, humanFile, stopping: !!x._stopRequested };
  }
  let rate = null;
  function status() {
    const queued = items.filter((x) => x.status === 'queued');
    const waiting = items.find((x) => x.status === 'waiting') || null;
    const st = current ? (current._stopRequested ? 'stopping' : 'running') : waiting ? 'waiting' : 'idle';
    return {
      state: st, bin: bin ? bin.replace(/^\/Users\/[^/]+/, '~') : null, current: publicItem(current), waiting: publicItem(waiting),
      queued: queued.map(publicItem), history: items.filter((x) => !['queued', 'running', 'waiting'].includes(x.status)).slice(-15).reverse().map(publicItem), rate,
    };
  }
  const emitState = () => onEvent({ type: 'state', status: status() });

  // ------------------------------------------------ queue ops
  function enqueue({ kind, prompt, label, text, jobId = null, brief = null, dedupeJob = false }) {
    if (!prompt || typeof prompt !== 'string') throw new Error('prompt required');
    if (dedupeJob && jobId) {
      const q = items.find((x) => x.status === 'queued' && x.jobId === jobId && x.kind === kind);
      if (q) { Object.assign(q, { prompt, label, text, created: q.created, updated: now() }); save(); emitState(); return publicItem(q); }
    }
    const item = { id: `r${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`, kind, label: label || prompt.slice(0, 80), text: text || null, prompt, jobId, jobs: jobId ? [jobId] : [], brief, status: 'queued', created: now(), attempts: 0 };
    items.push(item);
    saveNow(); emitState();
    setImmediate(tick);
    return publicItem(item);
  }
  function cancel(id) {
    const x = items.find((i) => i.id === id);
    if (!x) return { ok: false, error: 'no such run' };
    if (x === current) return { ok: false, error: 'that run is running; use stop' };
    if (!['queued', 'waiting'].includes(x.status)) return { ok: false, error: `run is ${x.status}` };
    x.status = 'cancelled'; x.ended = now(); saveNow(); emitState(); setImmediate(tick);
    return { ok: true };
  }
  function retryNow(id) {
    const x = items.find((i) => i.id === id && i.status === 'waiting');
    if (!x) return { ok: false, error: 'no waiting run with that id' };
    x.retryAt = now(); saveNow(); setImmediate(tick); return { ok: true };
  }
  function stop() {
    if (!current) return { ok: false, error: 'nothing is running' };
    const x = current; const pid = x.pid;
    x._stopRequested = true; emitState();
    line(x, 'runner', 'stop requested: SIGTERM', 'error');
    const sig = (s) => { try { process.kill(-pid, s); } catch { try { process.kill(pid, s); } catch { /* gone */ } } };
    sig('SIGTERM');
    setTimeout(() => { if (alive(pid)) { line(x, 'runner', 'still alive after 10 s: SIGKILL', 'error'); sig('SIGKILL'); } }, 10e3).unref();
    return { ok: true, id: x.id };
  }

  // ------------------------------------------------ files + lines
  function nextRunN(jobId) {
    const d = path.join(R, 'jobs', jobId, 'runs');
    try { return fs.readdirSync(d).filter((f) => /^\d+\.jsonl$/.test(f)).map((f) => parseInt(f, 10)).reduce((a, b) => Math.max(a, b), 0) + 1; } catch { return 1; }
  }
  function line(x, agent, msg, kind = 'tool') {
    const l = { t: now(), agent, msg: oneLine(msg, 220), kind };
    const L = live.get(x.id) || { lines: [] };
    l.i = L.lines.length ? L.lines.at(-1).i + 1 : 0;
    L.lines.push(l); if (L.lines.length > MAX_LINES) L.lines.splice(0, L.lines.length - MAX_LINES);
    live.set(x.id, L);
    x.lastLine = `${agent}: ${l.msg}`;
    if (!x._replay && x.humanFile) { try { fs.appendFileSync(x.humanFile, `${hhmmss()}\t${agent}\t${kind}\t${l.msg}\n`); } catch { /* */ } }
    if (!x._replay) onEvent({ type: 'line', run: x.id, job: x.jobId || null, line: l });
  }
  function readHuman(file) {
    let txt = ''; try { txt = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const out = []; let i = 0;
    for (const s of txt.split('\n')) {
      if (!s || s.startsWith('#')) continue;
      const [t, agent, kind, ...rest] = s.split('\t');
      out.push({ i: i++, t, agent, kind, msg: rest.join('\t') });
    }
    return out;
  }
  function lines(id, since = -1) {
    const x = items.find((i) => i.id === id);
    if (!x) return null;
    const L = live.get(id);
    const all = L && L.lines.length ? L.lines : (x.humanFile ? readHuman(x.humanFile) : []);
    return { run: publicItem(x), lines: all.filter((l) => l.i > since).slice(-1500) };
  }
  function attachJob(x, jobId) {
    if (!jobId || !fs.existsSync(path.join(R, 'jobs', jobId, 'job.json'))) return;
    x.jobs = [...new Set([...(x.jobs || []), jobId])];
    if (x.jobId) return;
    x.jobId = jobId;
    if (x.logFile && x.logFile.startsWith(LOGS + path.sep)) {
      const n = nextRunN(jobId);
      const d = path.join(R, 'jobs', jobId, 'runs');
      try {
        fs.mkdirSync(d, { recursive: true });
        const nl = path.join(d, `${n}.jsonl`), nh = path.join(d, `${n}.log`);
        fs.renameSync(x.logFile, nl); // the child's fd follows the inode, so writing continues
        try { fs.renameSync(x.humanFile, nh); } catch { /* none yet */ }
        Object.assign(x, { logFile: nl, humanFile: nh, n });
      } catch (e) { logger.error?.('[runner] move log failed', e.message); }
    }
    line(x, 'runner', `job ${jobId}`, 'system');
    saveNow(); emitState();
  }

  // ------------------------------------------------ stream-json handling
  function handle(x, ev) {
    const S = x._s ||= { agents: {}, newCalls: new Set() };
    if (ev.type === 'system' && ev.subtype === 'init') {
      x.sessionId = ev.session_id;
      line(x, 'producer', `session started · ${ev.model || ''} · ${ev.permissionMode || ''} · auth ${ev.apiKeySource || '?'}`, 'system');
      return;
    }
    if (ev.type === 'rate_limit_event') {
      const ri = ev.rate_limit_info || {};
      rate = { status: ri.status, type: ri.rateLimitType, resetsAt: ri.resetsAt ? ri.resetsAt * 1000 : null, fiveHour: ri.unifiedWindows?.five_hour?.utilization ?? null, sevenDay: ri.unifiedWindows?.seven_day?.utilization ?? null, at: now() };
      if (ri.status && !/^allowed/.test(ri.status)) {
        x._limited = { resetsAt: rate.resetsAt, text: `${ri.rateLimitType || 'usage'} limit ${ri.status}` };
        line(x, 'runner', `usage limit hit (${ri.rateLimitType || 'usage'}); resets ${rate.resetsAt ? new Date(rate.resetsAt).toLocaleTimeString() : 'later'}`, 'error');
      }
      return;
    }
    if (ev.type === 'assistant' && ev.message?.content) {
      const parent = ev.parent_tool_use_id || null;
      const who = parent ? (S.agents[parent] || 'agent') : 'producer';
      for (const c of ev.message.content) {
        if (c.type === 'tool_use') {
          if (c.name === 'Task' || c.name === 'Agent') {
            const t = String(c.input?.subagent_type || 'agent');
            S.agents[c.id] = t;
            line(x, t, summarizeTool(R, c.name, c.input).msg, 'agent');
            continue;
          }
          if (c.name === 'Bash') {
            const cmd = String(c.input?.command || '');
            if (/job\.mjs['"]?\s+new\b/.test(cmd)) S.newCalls.add(c.id);
            const m = cmd.match(/job\.mjs['"]?\s+(?:node|set|log|gate|output|show)\s+([A-Za-z0-9][A-Za-z0-9._-]+)/);
            if (m && m[1] !== x.jobId && /^\d{4}-\d{2}-\d{2}-/.test(m[1])) attachJob(x, m[1]);
          }
          const s = summarizeTool(R, c.name, c.input);
          line(x, who, s.msg, s.kind);
        } else if (c.type === 'text' && !parent && c.text?.trim()) {
          line(x, 'producer', c.text, 'text');
        }
      }
      return;
    }
    if (ev.type === 'user' && Array.isArray(ev.message?.content)) {
      for (const c of ev.message.content) {
        if (c.type !== 'tool_result') continue;
        const txt = toolResultText(c);
        if (/Studio guard:/.test(txt)) line(x, 'guard', txt.replace(/^[\s\S]*?Studio guard:/, 'blocked:'), 'guard');
        else if (c.is_error && txt) line(x, S.agents[ev.parent_tool_use_id] || (ev.parent_tool_use_id ? 'agent' : 'producer'), `error: ${txt}`, 'error');
        if (S.newCalls.has(c.tool_use_id)) {
          S.newCalls.delete(c.tool_use_id);
          const ids = txt.match(/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*/g);
          if (ids) attachJob(x, ids.at(-1));
        }
        if (S.agents[c.tool_use_id]) line(x, S.agents[c.tool_use_id], c.is_error ? 'failed' : 'done', c.is_error ? 'error' : 'agent-done');
      }
      return;
    }
    if (ev.type === 'result') {
      x._result = ev;
      x.result = oneLine(ev.result || ev.subtype, 600);
      x.cost = typeof ev.total_cost_usd === 'number' ? +ev.total_cost_usd.toFixed(4) : null;
      x.turns = ev.num_turns ?? null; x.durationMs = ev.duration_ms ?? null;
      if (ev.is_error) {
        const u = usageLimitFrom(`${ev.result || ''} ${ev.api_error_status || ''}`);
        if (u && !x._limited) x._limited = u;
      }
      line(x, 'producer', ev.is_error ? `finished with an error: ${x.result}` : `finished · ${ev.num_turns ?? '?'} turns · ${Math.round((ev.duration_ms || 0) / 1000)} s`, ev.is_error ? 'error' : 'result');
    }
  }

  // ------------------------------------------------ tailing
  function startTail(x, { replayTo = 0 } = {}) {
    // st.off = bytes consumed into complete lines; st.rest = trailing partial line
    const st = { off: 0, rest: Buffer.alloc(0) };
    x._tail = st;
    const drain = () => {
      let fd; try { fd = fs.openSync(x.logFile, 'r'); } catch { return; }
      try {
        const size = fs.fstatSync(fd).size;
        let readPos = st.off + st.rest.length;
        while (readPos < size) {
          const len = Math.min(size - readPos, 1 << 20);
          const b = Buffer.alloc(len);
          const got = fs.readSync(fd, b, 0, len, readPos);
          if (!got) break;
          readPos += got;
          let buf = Buffer.concat([st.rest, b.subarray(0, got)]);
          let k;
          while ((k = buf.indexOf(10)) >= 0) {
            const s = buf.subarray(0, k).toString('utf8');
            buf = buf.subarray(k + 1);
            st.off += k + 1;
            if (!s.trim()) continue;
            x._replay = st.off <= replayTo;
            let ev; try { ev = JSON.parse(s); } catch { continue; }
            try { handle(x, ev); } catch (e) { logger.error?.('[runner] event', e.message); }
          }
          st.rest = Buffer.from(buf);
          x._replay = false;
        }
        x.offset = st.off;
      } finally { fs.closeSync(fd); }
    };
    st.drain = drain;
    st.timer = setInterval(() => {
      drain();
      if (!x._child && !alive(x.pid)) finish(x, null, null); // adopted run ended
    }, 500);
    st.saver = setInterval(save, 5000);
    drain();
  }
  function stopTail(x) { if (x._tail) { clearInterval(x._tail.timer); clearInterval(x._tail.saver); x._tail.drain?.(); } }

  // ------------------------------------------------ start / finish
  function start(x) {
    if (!bin) { x.status = 'failed'; x.error = 'claude binary not found on PATH (set CLAUDE_BIN)'; x.ended = now(); saveNow(); emitState(); return; }
    x.attempts = (x.attempts || 0) + 1;
    x.status = 'running'; x.started = now(); x.ended = null; x.error = null; x.result = null; x._limited = null; x._result = null; x._s = null; x._stopRequested = false;
    if (x.jobId && fs.existsSync(path.join(R, 'jobs', x.jobId))) {
      const n = nextRunN(x.jobId); const d = path.join(R, 'jobs', x.jobId, 'runs');
      fs.mkdirSync(d, { recursive: true });
      Object.assign(x, { n, logFile: path.join(d, `${n}.jsonl`), humanFile: path.join(d, `${n}.log`) });
    } else {
      const base = `${x.id}-${x.attempts}`;
      Object.assign(x, { n: null, logFile: path.join(LOGS, `${base}.jsonl`), humanFile: path.join(LOGS, `${base}.log`) });
    }
    live.set(x.id, { lines: [] });
    fs.writeFileSync(x.humanFile, `# run ${x.id} (attempt ${x.attempts}) · ${x.text || x.label} · started ${x.started}\n`);
    const out = fs.openSync(x.logFile, 'a');
    const err = fs.openSync(path.join(LOGS, `${x.id}-${x.attempts}.stderr`), 'a');
    let child;
    try {
      child = spawn(bin, claudeArgs(x.prompt), { cwd: R, env: childEnv(), detached: true, stdio: ['ignore', out, err] });
    } catch (e) {
      fs.closeSync(out); fs.closeSync(err);
      x.status = 'failed'; x.error = e.message; x.ended = now(); saveNow(); emitState(); return;
    }
    fs.closeSync(out); fs.closeSync(err);
    current = x; x.pid = child.pid; x._child = child;
    child.on('error', (e) => { x.error = e.message; });
    child.on('exit', (code, signal) => { x.exit = code; x.signal = signal; setTimeout(() => finish(x, code, signal), 300); });
    line(x, 'runner', `started (pid ${child.pid}, attempt ${x.attempts})`, 'system');
    saveNow(); emitState();
    startTail(x);
  }

  function finish(x, code, signal) {
    if (x._finished === x.attempts) return;
    x._finished = x.attempts;
    stopTail(x);
    x._child = null;
    if (!x.result) {
      // no result event: look at stderr for a usage message
      try { const e = fs.readFileSync(path.join(LOGS, `${x.id}-${x.attempts}.stderr`), 'utf8'); if (e.trim()) { x.error = oneLine(e, 400); const u = usageLimitFrom(e); if (u && !x._limited) x._limited = u; } } catch { /* */ }
    }
    x.ended = now();
    if (x._stopRequested) {
      x.status = 'stopped'; line(x, 'runner', 'stopped by the owner', 'error');
    } else if (x._limited) {
      if (x.attempts >= MAX_USAGE_ATTEMPTS) { x.status = 'failed'; x.error = `gave up after ${x.attempts} usage-limited attempts`; }
      else {
        const backoff = Math.min(MIN_WAIT_MS * 2 ** Math.max(0, x.attempts - 1), 3 * 3600e3);
        const at = x._limited.resetsAt && x._limited.resetsAt > Date.now() ? Math.max(x._limited.resetsAt + 2 * 60e3, Date.now() + 60e3) : Date.now() + backoff;
        x.status = 'waiting'; x.retryAt = new Date(Math.max(at, Date.now() + (x._limited.resetsAt ? 60e3 : MIN_WAIT_MS))).toISOString();
        // a create run that already made its job must not make a second one on retry
        if (x.kind === 'create' && x.jobId) { x.prompt = `/create resume ${x.jobId} [Desk runner: this run was cut off by the usage limit. Headless, nobody is reading the chat: do not ask questions; continue the pipeline and stop at the next gate.]`; x.text = `/create resume ${x.jobId}`; }
        line(x, 'runner', `waiting for usage reset; retry at ${new Date(x.retryAt).toLocaleTimeString()}`, 'error');
      }
    } else if (x._result) {
      x.status = x._result.is_error ? 'failed' : 'done';
      if (x._result.is_error && !x.error) x.error = x.result;
    } else {
      x.status = code === 0 ? 'done' : 'failed';
      if (x.status === 'failed' && !x.error) x.error = signal ? `killed by ${signal}` : code == null ? 'process ended without a result' : `exit code ${code}`;
    }
    if (current === x) current = null;
    saveNow(); emitState();
    setTimeout(tick, 1500);
  }

  function tick() {
    if (current) return;
    const pending = items.filter((x) => x.status === 'queued' || x.status === 'waiting');
    if (!pending.length) return;
    const head = pending[0];
    if (head.status === 'waiting' && new Date(head.retryAt).getTime() > Date.now()) return; // everyone shares the same usage window
    start(head);
  }

  // ------------------------------------------------ boot: adopt or close runs left over from a previous Desk
  load();
  for (const x of items.filter((i) => i.status === 'running')) {
    let isClaude = false;
    if (alive(x.pid)) { try { isClaude = /claude/.test(execFileSync('ps', ['-o', 'command=', '-p', String(x.pid)], { encoding: 'utf8' })); } catch { /* */ } }
    if (isClaude && !current) {
      current = x; live.set(x.id, { lines: readHuman(x.humanFile) });
      startTail(x, { replayTo: x.offset || 0 });
      line(x, 'runner', `re-attached after a Desk restart (pid ${x.pid})`, 'system');
    } else {
      live.set(x.id, { lines: readHuman(x.humanFile) });
      startTail(x, { replayTo: x.offset || 0 });
      finish(x, null, null); // drains whatever it wrote, then closes it
    }
  }
  saveNow();
  setInterval(tick, 5000).unref();
  setImmediate(tick);

  // called on Desk shutdown: record exactly how far the log was read, so re-attaching doesn't repeat lines
  function flush() { try { if (current?._tail) current._tail.drain(); } catch { /* */ } saveNow(); }
  return { enqueue, cancel, retryNow, stop, status, lines, publicItem, items: () => items, bin, args: claudeArgs, flush };
}
