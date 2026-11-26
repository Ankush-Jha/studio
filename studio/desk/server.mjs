// Studio Desk server: node:http only. Serves the Desk UI, a JSON API over the
// files agents write (jobs/, kits/, library/, radar/), gate + kit + radar writes,
// SSE live updates, and a sandboxed media endpoint with HTTP Range support.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRunner } from '../runner/runner.mjs';
import { buildCreate, buildResume, engineList, FORMATS, LIMITS } from '../runner/brief.mjs';

const DESK = path.dirname(fileURLToPath(import.meta.url));
const R = process.env.STUDIO_ROOT || path.resolve(DESK, '..', '..');
const PORT = Number(process.env.DESK_PORT || 4747);
const HOST = '127.0.0.1';
const PUBLIC = path.join(DESK, 'public');
const FIX = path.join(DESK, 'fixtures');
const CACHE = path.join(DESK, '.cache');
const P = {
  jobs: path.join(R, 'jobs'),
  kits: path.join(R, 'kits'),
  library: path.join(R, 'library'),
  radar: path.join(R, 'radar'),
  runs: path.join(R, 'radar', 'ideas'),
  clients: path.join(R, 'clients.json'),
  env: path.join(R, 'studio', '.env'),
  evals: path.join(R, 'studio', 'evals'),
};
const MEDIA_ROOTS = [R];
const MEDIA_PREFIXES = [];

// ---------------------------------------------------------------- helpers
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
async function readJSON(p, fallback = null) {
  try { return JSON.parse(await fsp.readFile(p, 'utf8')); } catch { return fallback; }
}
async function readJSONL(p) {
  let txt;
  try { txt = await fsp.readFile(p, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of txt.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* skip bad line */ }
  }
  return out;
}
async function listDirs(p) {
  try {
    const ents = await fsp.readdir(p, { withFileTypes: true });
    return ents.filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')).map((e) => e.name);
  } catch { return []; }
}
async function writeJSONAtomic(p, obj) {
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2) + '\n');
  await fsp.rename(tmp, p);
}
const nowISO = () => new Date().toISOString();
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$/;
const JOB_SAFE_ID = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,160}$/; // jobs/_name = throwaway test job (hidden from lists, never logged as feedback)
const HEX = /^#[0-9a-fA-F]{3,8}$/;

function send(res, code, body, headers = {}) {
  const isObj = typeof body !== 'string' && !Buffer.isBuffer(body);
  const data = isObj ? JSON.stringify(body) : body;
  res.writeHead(code, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}
const bad = (res, msg, code = 400) => send(res, code, { ok: false, error: msg });

async function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJSONBody(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  const v = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('body must be a JSON object');
  return v;
}
const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');

// ---------------------------------------------------------------- sample overlay
// Gate decisions on SAMPLE jobs live in memory only (fixtures stay pristine and
// library/feedback.jsonl never receives sample decisions).
const sampleOverlay = new Map();

// ---------------------------------------------------------------- jobs
const FORCE_SAMPLE = process.env.DESK_SAMPLE === '1';
async function realJobIds() { if (FORCE_SAMPLE) return []; return (await listDirs(P.jobs)).filter((d) => exists(path.join(P.jobs, d, 'job.json'))); }
async function fixtureJobIds() { return (await listDirs(path.join(FIX, 'jobs'))).filter((d) => exists(path.join(FIX, 'jobs', d, 'job.json'))); }

async function jobDirFor(id) {
  if (!JOB_SAFE_ID.test(id)) return null;
  const real = path.join(P.jobs, id);
  if (!FORCE_SAMPLE && exists(path.join(real, 'job.json'))) return { dir: real, sample: false };
  if ((await realJobIds()).length === 0) {
    const fx = path.join(FIX, 'jobs', id);
    if (exists(path.join(fx, 'job.json'))) return { dir: fx, sample: true };
  }
  return null;
}
async function loadJob(id) {
  const loc = await jobDirFor(id);
  if (!loc) return null;
  let job = await readJSON(path.join(loc.dir, 'job.json'));
  if (!job) return null;
  if (loc.sample && sampleOverlay.has(id)) job = sampleOverlay.get(id);
  return { job, ...loc };
}
function jobThumb(job, dir) {
  const outs = Array.isArray(job.outputs) ? job.outputs : [];
  const pick = outs.find((o) => o.kind === 'cover') || outs.find((o) => o.kind === 'image' || o.kind === 'carousel') || outs.find((o) => o.kind === 'video');
  if (pick) return { path: absJobPath(dir, Array.isArray(pick.path) ? pick.path[0] : pick.path), kind: pick.kind };
  return null;
}
function absJobPath(dir, p) {
  if (!p || typeof p !== 'string') return null;
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return path.isAbsolute(p) ? p : path.join(dir, p);
}
async function jobSummaries() {
  let ids = await realJobIds(); let sample = false; let base = P.jobs;
  if (ids.length === 0) { ids = await fixtureJobIds(); sample = true; base = path.join(FIX, 'jobs'); }
  const out = [];
  for (const id of ids) {
    const dir = path.join(base, id);
    let job = await readJSON(path.join(dir, 'job.json'));
    if (!job) { out.push({ id, status: 'failed', error: 'job.json unreadable', sample }); continue; }
    if (sample && sampleOverlay.has(id)) job = sampleOverlay.get(id);
    let conceptCount = 0; let concepts = null;
    const cpath = path.join(dir, typeof job.concepts === 'string' ? job.concepts : 'concepts.json');
    const c = await readJSON(cpath);
    if (Array.isArray(c)) { conceptCount = c.length; concepts = c.map((x) => ({ id: x.id, title: x.title, hook: x.hook?.main || '', engine: x.engine, style: x.style, preview: x.preview ? absJobPath(dir, x.preview) : null })); }
    out.push({
      id: job.id || id, created: job.created, updated: job.updated, client: job.client, format: job.format, topic: job.topic,
      status: job.status, engine: job.engine, style: job.style, chosen: job.chosen,
      nodes: (job.nodes || []).map((n) => ({ id: n.id, status: n.status, started: n.started, ended: n.ended, summary: n.summary, outputs: (n.outputs || []).slice(0, 4).map((o) => absJobPath(dir, o)) })),
      gates: job.gates || {}, outputs: (job.outputs || []).map((o) => ({ ...o, path: Array.isArray(o.path) ? o.path.map((p) => absJobPath(dir, p)) : absJobPath(dir, o.path) })),
      qa: job.qa || null, thumb: jobThumb(job, dir), dir, conceptCount, concepts,
      log: (job.log || []).slice(-12), sample,
    });
  }
  out.sort((a, b) => String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || '')));
  return out;
}

// ---------------------------------------------------------------- kits
async function kitSummary(slug) {
  const dir = path.join(P.kits, slug);
  const kit = await readJSON(path.join(dir, 'kit.json'));
  if (!kit) return null;
  const tokens = await readJSON(path.join(dir, 'tokens.json'), {});
  const confirm = await readJSON(path.join(dir, 'confirm.json'), null);
  const web = await readJSON(path.join(dir, 'web.json'), null);
  const colors = [];
  const tc = tokens?.color || {};
  for (const role of Object.keys(tc)) {
    const t = tc[role]; if (!t || typeof t !== 'object') continue;
    const st = t.$extensions?.studio || {};
    colors.push({ role, hex: t.$value, source: st.source || null, provisional: !!st.provisional });
  }
  const abs = (p) => (p ? (path.isAbsolute(p) ? p : path.join(R, p)) : null);
  const a = kit.assets || {};
  return {
    slug, name: kit.name, city: kit.city, province: kit.province, region: kit.region, group: kit.group,
    completeness: kit.completeness, flags: kit.flags || [], missing: kit.missing || [],
    photo: abs(a.photo), footer: abs(a.footer), footerAlt: abs(a.footerAlt), logos: (a.logos || []).map(abs),
    check: (a.check || []).map((p) => ({ path: p, abs: abs(p) })),
    colors, rules: (kit.rules || []).map((r) => ({ id: r.id, kind: r.kind, text: r.text })),
    brokerage: kit.brokerage || null, agent: kit.agent || null, video: kit.video, languages: kit.languages || [],
    socials: kit.socials || null, confirm, aliases: kit.aliases || [],
    font: { display: tokens?.font?.display?.$value || null, body: tokens?.font?.body?.$value || null },
    web: web ? {
      url: web.url || null, tagline: web.tagline || null, bio: web.bio ? String(web.bio).slice(0, 600) : null,
      specialties: web.specialties || [], serviceAreas: web.serviceAreas || [], languages: web.languages || [],
      socials: web.socials || null, brandColors: web.brandColors || [], reviews: web.reviews || null,
      yearsInBusiness: web.yearsInBusiness ?? null, team: (web.team || []).length,
    } : null,
    updated: kit.updated,
  };
}
async function sheetFallbackKits() {
  // Kits not built yet: show the roster from the read-only client sheet, marked pending.
  const cj = await readJSON(P.clients);
  const list = cj?.clients || [];
  return list.map((c) => {
    const slug = String(c.asset_folder || '').replace(/^assets\//, '').replace(/\/$/, '') || c.id;
    const [city, prov] = String(c.location || '').split(',').map((s) => s.trim());
    const abs = (f) => (f ? path.join(R, f) : null);
    return {
      slug, name: c.name, city: city || '', province: prov || '', group: null, completeness: null, pending: true,
      photo: abs(c.assets?.photo?.file), footer: abs(c.assets?.footer?.file), logos: (c.assets?.logos || []).map((l) => abs(l.file)),
      colors: [], rules: (c.special_requests || []).map((t, i) => ({ id: `s${i}`, kind: 'other', text: t })),
      check: [], flags: [], missing: ['kit not built yet'],
      brokerage: c.brokerage_name ? { name: c.brokerage_name, licence: c.brokerage_license_no } : null,
    };
  });
}
async function kitsState() {
  const index = await readJSON(path.join(P.kits, '_index.json'));
  let slugs = Array.isArray(index) ? index.map((k) => k.slug).filter(Boolean) : await listDirs(P.kits);
  slugs = slugs.filter((s) => SAFE_ID.test(s));
  const items = [];
  for (const s of slugs) { const k = await kitSummary(s); if (k) items.push(k); }
  if (items.length === 0) return { index: index || [], items: await sheetFallbackKits(), source: 'sheet' };
  return { index: index || [], items, source: 'kits' };
}

// ---------------------------------------------------------------- library
async function libraryState() {
  let cards = await readJSONL(path.join(P.library, 'index.jsonl'));
  let source = 'index';
  if (cards.length === 0) {
    const files = (await fsp.readdir(path.join(P.library, 'cards')).catch(() => [])).filter((f) => f.endsWith('.json'));
    for (const f of files) { const c = await readJSON(path.join(P.library, 'cards', f)); if (c) cards.push(c); }
    source = 'cards';
  }
  let sample = false;
  if (cards.length === 0) { cards = await readJSONL(path.join(FIX, 'library.jsonl')); sample = true; source = 'sample'; }
  const abs = (p) => (p ? (path.isAbsolute(p) ? p : path.join(R, p)) : null);
  cards = cards.map((c) => ({ ...c, files: Object.fromEntries(Object.entries(c.files || {}).map(([k, v]) => [k, Array.isArray(v) ? v.map(abs) : abs(v)])), sample }));
  cards.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return { cards, sample, source };
}

// ---------------------------------------------------------------- radar
async function envKeyPresence() {
  // Report only whether a key is set; never read values into responses.
  const out = { YOUTUBE_API_KEY: false, META_ACCESS_TOKEN: false, META_IG_USER_ID: false };
  try {
    const txt = await fsp.readFile(P.env, 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
      if (m && m[1] in out) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '').length > 0;
    }
  } catch { /* no env file */ }
  return out;
}
async function radarState() {
  let accounts = await readJSON(path.join(P.radar, 'accounts.json'), []);
  let posts = await readJSONL(path.join(P.radar, 'posts.jsonl'));
  let sample = false;
  if (!Array.isArray(accounts)) accounts = [];
  if (posts.length === 0) {
    sample = true;
    posts = await readJSONL(path.join(FIX, 'radar', 'posts.jsonl'));
    if (accounts.length === 0) accounts = await readJSON(path.join(FIX, 'radar', 'accounts.json'), []);
  }
  // latest run
  let run = null;
  const runFiles = (await fsp.readdir(path.join(P.radar, 'runs')).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
  if (runFiles.length) run = await readJSON(path.join(P.radar, 'runs', runFiles.at(-1)));
  const keys = await envKeyPresence();
  const sources = [
    { id: 'youtube-api', name: 'YouTube Data API', platform: 'youtube', key: 'YOUTUBE_API_KEY', connected: keys.YOUTUBE_API_KEY },
    { id: 'ig-business-discovery', name: 'Instagram Business Discovery', platform: 'instagram', key: 'META_ACCESS_TOKEN + META_IG_USER_ID', connected: keys.META_ACCESS_TOKEN && keys.META_IG_USER_ID },
    { id: 'rss', name: 'Broker blogs (RSS)', platform: 'web', key: null, connected: true },
    { id: 'manual-fb', name: 'Facebook posts', platform: 'facebook', key: null, manual: true, connected: true },
    { id: 'manual-li', name: 'LinkedIn posts', platform: 'linkedin', key: null, manual: true, connected: true },
    { id: 'manual-tt', name: 'TikTok posts', platform: 'tiktok', key: null, manual: true, connected: true },
  ];
  const needsKeys = Array.isArray(run?.needsKeys) ? run.needsKeys : null;
  if (needsKeys) {
    const nk = needsKeys.map((x) => (typeof x === 'string' ? x : x?.key || x?.source || x?.id || '')).join(' ').toLowerCase();
    for (const s of sources) {
      if (s.key && (nk.includes(s.id) || s.key.toLowerCase().split(/[ +]+/).some((k) => k && nk.includes(k.toLowerCase())))) s.connected = false;
    }
  }
  const byPlatform = {}; const byAccount = {};
  for (const p of posts) {
    byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1;
    const a = (byAccount[p.account] ||= { count: 0, last: null });
    a.count++; if (!a.last || String(p.date) > a.last) a.last = p.date;
  }
  const outliers = posts.filter((p) => typeof p.outlier === 'number' && p.outlier >= 2).length;
  // written by the radar collectors; each may be absent
  const patterns = await readJSON(path.join(P.radar, 'patterns.json'), null);
  const status = await readJSON(path.join(P.radar, 'status.json'), null);
  const cj = await readJSON(path.join(P.radar, 'clients.json'), null);
  const clientStats = cj && typeof cj === 'object' ? (cj.clients && typeof cj.clients === 'object' ? cj.clients : cj) : null;
  return {
    patterns: patterns && Array.isArray(patterns.patterns) ? patterns : null,
    status: status && status.sources && typeof status.sources === 'object' ? status : null,
    clientStats, clientStatsAsOf: cj?.asOf || null,
    accounts, posts, sample,
    summary: { posts: posts.length, accounts: accounts.length, byPlatform, byAccount, outliers, run: run ? { date: run.date || runFiles.at(-1).replace('.json', ''), needsKeys: run.needsKeys || [], counts: run.counts || null } : null, sources },
  };
}

// ---------------------------------------------------------------- nightly system
async function systemState() {
  const days = (await listDirs(P.runs)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (let i = days.length - 1; i >= 0; i--) {
    const st = await readJSON(path.join(P.runs, days[i], 'state.json'));
    if (!st) continue;
    const phases = Object.entries(st.phases || {}).map(([id, v]) => ({ id, status: v?.status || 'idle', detail: v?.detail || '' }));
    let ideas = 0;
    const ideasDir = path.join(P.runs, days[i], 'ideas_out');
    try { ideas = (await fsp.readdir(ideasDir)).filter((f) => !f.startsWith('.')).length; } catch { /* none */ }
    const ideaPhase = Object.entries(st.phases || {}).find(([k]) => k.startsWith('p4_scripts'));
    const ideaIds = ideaPhase?.[1]?.ideas || ideaPhase?.[1]?.ids || null;
    return { nightly: { date: st.date || days[i], started: st.started, finished: st.finished || null, depth: st.depth, phases, notes: st.notes || '', ideas: Array.isArray(ideaIds) ? ideaIds.length : ideas, ideaIds: Array.isArray(ideaIds) ? ideaIds : [] } };
  }
  return { nightly: null };
}

async function feedbackCount() {
  try { const t = await fsp.readFile(path.join(P.library, 'feedback.jsonl'), 'utf8'); return t.split('\n').filter((l) => l.trim()).length; } catch { return 0; }
}

async function clientRoster() {
  const cj = await readJSON(P.clients);
  return (cj?.clients || []).map((c) => ({ slug: String(c.asset_folder || '').replace(/^assets\//, '').replace(/\/$/, '') || c.id, name: c.name })).filter((c) => c.slug);
}

// ---------------------------------------------------------------- gate writes
function setNode(job, id, patch) {
  job.nodes ||= [];
  let n = job.nodes.find((x) => x.id === id);
  if (!n) { n = { id, status: 'idle', started: null, ended: null, summary: '', outputs: [] }; job.nodes.push(n); }
  Object.assign(n, patch);
  return n;
}
async function applyGate(id, body) {
  const gate = body.gate; const decision = body.decision;
  if (!['g1', 'g2'].includes(gate)) throw Object.assign(new Error("gate must be 'g1' or 'g2'"), { code: 400 });
  const allowed = gate === 'g1' ? ['pick', 'revise', 'reject'] : ['approve', 'revise', 'reject'];
  if (!allowed.includes(decision)) throw Object.assign(new Error(`decision for ${gate} must be one of ${allowed.join(', ')}`), { code: 400 });
  let choice = body.choice ?? null;
  if (choice !== null && (typeof choice !== 'string' || !/^[A-Za-z0-9]{1,4}(\+[A-Za-z0-9]{1,4}){0,4}$/.test(choice))) throw Object.assign(new Error('choice must look like "A" or "A+C"'), { code: 400 });
  if (gate === 'g1' && decision === 'pick' && !choice) throw Object.assign(new Error('pick needs a choice'), { code: 400 });
  const notes = str(body.notes, 4000);
  const loaded = await loadJob(id);
  if (!loaded) throw Object.assign(new Error('job not found'), { code: 404 });
  const { job, dir, sample } = loaded;
  const at = nowISO();
  job.gates ||= {};
  const gnode = gate === 'g1' ? 'gate1' : 'gate2';
  let concept = null;
  if (gate === 'g1') {
    job.gates.g1 = { at, decision, choice: decision === 'pick' ? choice : null, notes, by: 'desk' };
    if (decision === 'pick') {
      job.chosen = choice; job.status = 'checking';
      setNode(job, gnode, { status: 'done', ended: at, summary: `Picked ${choice}${notes ? ' · ' + notes.slice(0, 80) : ''}` });
      const concepts = await readJSON(path.join(dir, typeof job.concepts === 'string' ? job.concepts : 'concepts.json'), []);
      concept = Array.isArray(concepts) ? concepts.find((c) => c.id === choice.split('+')[0]) : null;
      if (concept && !String(choice).includes('+')) { job.engine = concept.engine || job.engine; job.style = concept.style || job.style; }
    } else if (decision === 'revise') {
      job.status = 'concepts';
      setNode(job, gnode, { status: 'idle', ended: null, summary: `Revise requested${notes ? ': ' + notes.slice(0, 80) : ''}` });
      setNode(job, 'strategist', { status: 'idle', ended: null, summary: 'Revision requested from the Desk' });
    } else {
      job.status = 'parked';
      setNode(job, gnode, { status: 'done', ended: at, summary: 'Rejected at Gate 1' });
    }
  } else {
    job.gates.g2 = { at, decision, notes, by: 'desk' };
    if (decision === 'approve') { job.status = 'approved'; setNode(job, gnode, { status: 'done', ended: at, summary: `Approved${notes ? ' · ' + notes.slice(0, 80) : ''}` }); }
    else if (decision === 'revise') {
      job.status = 'producing';
      setNode(job, gnode, { status: 'idle', ended: null, summary: `Revise requested${notes ? ': ' + notes.slice(0, 80) : ''}` });
      setNode(job, 'director', { status: 'idle', ended: null, summary: 'Revision requested from the Desk' });
    } else { job.status = 'parked'; setNode(job, gnode, { status: 'done', ended: at, summary: 'Rejected at Gate 2' }); }
  }
  job.updated = at;
  job.log ||= [];
  job.log.push({ t: at, node: gnode, msg: `Desk: ${decision}${job.gates[gate].choice ? ' ' + job.gates[gate].choice : ''}${notes ? ' — ' + notes.slice(0, 120) : ''}` });
  if (sample) { sampleOverlay.set(id, job); broadcast({ type: 'jobs', id }); return { ok: true, sample: true, job }; }
  await writeJSONAtomic(path.join(dir, 'job.json'), job);
  if (id.startsWith('_')) return { ok: true, job, test: true }; // throwaway test job: no feedback line
  const fb = {
    job: job.id || id, client: job.client ?? null, format: job.format ?? null,
    engine: concept?.engine ?? job.engine ?? null, style: concept?.style ?? job.style ?? null,
    gate, decision, choice: job.gates[gate].choice ?? null, notes, at, by: 'desk',
  };
  await fsp.mkdir(P.library, { recursive: true });
  await fsp.appendFile(path.join(P.library, 'feedback.jsonl'), JSON.stringify(fb) + '\n');
  return { ok: true, job };
}

// ---------------------------------------------------------------- runner glue
// Gate decision in the Desk → queue `/create resume <id>` so the pipeline carries on by itself.
function enqueueResume(id, body, result) {
  if (result.sample || body.resume === false) return null;
  const r = buildResume({ id, gate: body.gate, decision: body.decision, choice: body.choice ?? null, notes: body.notes });
  if (!r) return null; // reject: nothing to run
  return runner.enqueue({ kind: 'resume', prompt: r.prompt, label: r.label, text: r.text, jobId: id, dedupeJob: true });
}

async function createOptions() {
  const kits = await kitsState();
  const groups = [...new Set(kits.items.map((k) => k.group).filter((g) => Number.isInteger(g)))].sort((a, b) => a - b);
  // newest weekly plan: posts keyed by group
  let weekly = null;
  const rdir = path.join(R, 'engines', 'stills', 'research');
  try {
    const f = (await fsp.readdir(rdir)).filter((x) => /^weekly_\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().at(-1);
    if (f) {
      const w = await readJSON(path.join(rdir, f));
      const posts = {};
      for (const [g, list] of Object.entries(w?.posts || {})) posts[g] = (Array.isArray(list) ? list : []).slice(0, 8).map((p) => ({ title: str(p.title, 160), hook: str(p.hook, 240), format: str(p.format, 40) }));
      weekly = { weekOf: w?.weekOf || f.slice(7, 17), file: f, posts };
    }
  } catch { /* no plan */ }
  const radar = await radarState();
  // competitor outliers with real reach (a 50x on a 150-follower account is noise), max 2 per account
  const A = Object.fromEntries((radar.accounts || []).map((a) => [a.id, a]));
  const reach = (p) => Math.max(Number(p.metrics?.views) || 0, (Number(p.metrics?.likes) || 0) * 25);
  const perAcct = {};
  const onTopic = (p) => /mortgage|rate|renew|heloc|down ?payment|\bcra\b|tax|home|house|housing|buy|sell|refinanc|fixed|variable|bank|lender|credit|debt|equity|invest|property|condo|rent|market|price|payment|loan|amorti|fhsa|rrsp|cmhc|insur|realtor|real estate|\bboc\b|interest/i.test(`${p.hook || ''} ${p.title || ''}`);
  const outliers = radar.posts.filter((p) => typeof p.outlier === 'number' && p.outlier >= 1.5 && (p.hook || p.title) && A[p.account]?.source !== 'client' && !String(p.account || '').startsWith('client-') && reach(p) >= 5000 && onTopic(p))
    .sort((a, b) => b.outlier - a.outlier || reach(b) - reach(a))
    .filter((p) => (perAcct[p.account] = (perAcct[p.account] || 0) + 1) <= 2).slice(0, 10)
    .map((p) => ({ id: p.id, hook: str(p.hook || p.title, 200), account: p.account, platform: p.platform, outlier: p.outlier, format: p.format, thumb: p.thumb || null }));
  return { formats: FORMATS, engines: engineList(R), groups, limits: LIMITS, weekly, outliers };
}

// ---------------------------------------------------------------- kit confirm
async function applyKitConfirm(slug, body) {
  if (!SAFE_ID.test(slug)) throw Object.assign(new Error('bad slug'), { code: 400 });
  const dir = path.join(P.kits, slug);
  if (!exists(path.join(dir, 'kit.json'))) throw Object.assign(new Error('kit not found (kits are built by the kit agent first)'), { code: 404 });
  const file = path.join(dir, 'confirm.json');
  const cur = await readJSON(file, {}) || {};
  const next = { ...cur };
  if (body.colors !== undefined) {
    if (!body.colors || typeof body.colors !== 'object' || Array.isArray(body.colors)) throw Object.assign(new Error('colors must be an object'), { code: 400 });
    next.colors = { ...(cur.colors || {}) };
    for (const [k, v] of Object.entries(body.colors)) {
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(k)) throw Object.assign(new Error(`bad colour role ${k}`), { code: 400 });
      if (v === null) { delete next.colors[k]; continue; }
      if (typeof v === 'boolean') { next.colors[k] = v; continue; }
      if (typeof v !== 'string' || !HEX.test(v)) throw Object.assign(new Error(`colour ${k} must be a #hex, true/false or null`), { code: 400 });
      next.colors[k] = v.toUpperCase();
    }
  }
  if (body.assets !== undefined) {
    if (!body.assets || typeof body.assets !== 'object' || Array.isArray(body.assets)) throw Object.assign(new Error('assets must be an object'), { code: 400 });
    next.assets = { ...(cur.assets || {}) };
    for (const [k, v] of Object.entries(body.assets)) {
      if (typeof k !== 'string' || k.length > 400 || k.includes('..')) throw Object.assign(new Error('bad asset path'), { code: 400 });
      if (v === null) { delete next.assets[k]; continue; }
      if (typeof v !== 'boolean') throw Object.assign(new Error('asset values must be true/false/null'), { code: 400 });
      next.assets[k] = v;
    }
  }
  if (body.group !== undefined) {
    const g = body.group;
    if (!(g === null || (Number.isInteger(g) && g >= 0 && g <= 20) || (typeof g === 'string' && g.length <= 20))) throw Object.assign(new Error('group must be an integer, short string or null'), { code: 400 });
    next.group = g;
  }
  if (body.notes !== undefined) next.notes = str(body.notes, 4000);
  next.at = nowISO(); next.by = 'desk';
  await writeJSONAtomic(file, next);
  return { ok: true, confirm: next };
}

// ---------------------------------------------------------------- radar manual
function platformFromHost(host) {
  const h = host.toLowerCase().replace(/^www\.|^m\.|^mobile\./, '');
  if (/(^|\.)instagram\.com$/.test(h)) return 'instagram';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.watch)$/.test(h)) return 'facebook';
  if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(h)) return 'linkedin';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'youtube';
  if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok';
  return 'web';
}
function formatFromUrl(u, platform) {
  const p = u.pathname.toLowerCase();
  if (platform === 'instagram') return p.includes('/reel') ? 'reel' : 'image';
  if (platform === 'youtube') return p.includes('/shorts') ? 'short' : 'video';
  if (platform === 'tiktok') return 'short';
  if (platform === 'facebook') return p.includes('/reel') || p.includes('/watch') || p.includes('/videos') ? 'video' : 'image';
  if (platform === 'linkedin') return 'image';
  return 'article';
}
function handleFromUrl(u, platform) {
  const seg = u.pathname.split('/').filter(Boolean);
  if (platform === 'tiktok' && seg[0]?.startsWith('@')) return seg[0];
  if (platform === 'instagram' && seg[0] && !['p', 'reel', 'reels', 'tv', 'stories'].includes(seg[0])) return '@' + seg[0];
  if (platform === 'youtube' && seg[0]?.startsWith('@')) return seg[0];
  if (platform === 'linkedin' && (seg[0] === 'in' || seg[0] === 'company') && seg[1]) return seg[1];
  if (platform === 'facebook' && seg[0] && !['watch', 'reel', 'share', 'groups', 'permalink.php', 'story.php', 'photo.php', 'photo', 'videos'].includes(seg[0])) return seg[0];
  return null;
}
async function applyRadarManual(body) {
  const raw = str(body.url, 2000).trim();
  let u;
  try { u = new URL(raw); } catch { throw Object.assign(new Error('url is not a valid URL'), { code: 400 }); }
  if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('url must be http(s)'), { code: 400 });
  const platform = platformFromHost(u.hostname);
  const file = path.join(P.radar, 'posts.jsonl');
  const existing = await readJSONL(file);
  const norm = u.toString().replace(/[?#].*$/, '').replace(/\/$/, '');
  const dupe = existing.find((p) => String(p.url || '').replace(/[?#].*$/, '').replace(/\/$/, '') === norm);
  if (dupe) return { ok: true, duplicate: true, post: dupe };
  const at = nowISO();
  const account = str(body.account, 120).trim() || handleFromUrl(u, platform);
  let ytId = null;
  if (platform === 'youtube') ytId = u.hostname.includes('youtu.be') ? u.pathname.slice(1) : (u.searchParams.get('v') || (u.pathname.match(/\/shorts\/([\w-]+)/) || [])[1] || null);
  const post = {
    id: 'manual-' + crypto.createHash('sha1').update(norm).digest('hex').slice(0, 10),
    account: account || null, platform, url: u.toString(), date: at.slice(0, 10), format: formatFromUrl(u, platform),
    caption: str(body.note, 1000), hook: str(body.note, 200), thumb: ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null,
    metrics: {}, outlier: null, topics: [], source: 'manual', seen: at, confidence: 'check', note: str(body.note, 1000), by: 'desk',
  };
  await fsp.mkdir(P.radar, { recursive: true });
  await fsp.appendFile(file, JSON.stringify(post) + '\n');
  return { ok: true, post };
}

// ---------------------------------------------------------------- media
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jsonl': 'application/x-ndjson; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.srt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
};
function mediaAllowed(abs) {
  if (abs.includes('\0')) return false;
  for (const root of MEDIA_ROOTS) if (abs === root || abs.startsWith(root + path.sep)) return true;
  for (const pre of MEDIA_PREFIXES) if (abs.startsWith(pre)) return true;
  return false;
}
async function resolveMedia(p) {
  if (!p || typeof p !== 'string' || p.length > 2000) return null;
  if (p.split(/[\\/]/).includes('..')) return null;
  let abs = p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : (path.isAbsolute(p) ? p : path.join(R, p));
  abs = path.normalize(abs);
  if (!mediaAllowed(abs)) return null;
  let real;
  try { real = await fsp.realpath(abs); } catch { return { missing: true }; }
  if (!mediaAllowed(real)) return null;
  return { abs: real };
}
async function serveFile(req, res, abs, extraHeaders = {}) {
  let st;
  try { st = await fsp.stat(abs); } catch { return bad(res, 'not found', 404); }
  if (!st.isFile()) return bad(res, 'not a file', 404);
  const type = TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': st.mtime.toUTCString(), 'Cache-Control': 'private, max-age=60', ...extraHeaders };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, base); return res.end(); }
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === '' && m[2] === '')) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    let start, end;
    if (m[1] === '') { const n = Number(m[2]); start = Math.max(0, st.size - n); end = st.size - 1; }
    else { start = Number(m[1]); end = m[2] === '' ? st.size - 1 : Math.min(Number(m[2]), st.size - 1); }
    if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(abs, { start, end }).on('error', () => res.destroy()).pipe(res);
  }
  res.writeHead(200, { ...base, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(abs).on('error', () => res.destroy()).pipe(res);
}
function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}
const thumbJobs = new Map();
async function thumbnail(abs, w, mode) {
  // Resized JPEG cache under desk/.cache so walls stay light. Images via sips, video frames via ffmpeg.
  const st = await fsp.stat(abs);
  const key = crypto.createHash('sha1').update(`${abs}|${st.mtimeMs}|${st.size}|${w}|${mode}`).digest('hex');
  const out = path.join(CACHE, `${key}.jpg`);
  if (exists(out)) return out;
  if (thumbJobs.has(key)) return thumbJobs.get(key);
  const job = (async () => {
    await fsp.mkdir(CACHE, { recursive: true });
    const tmp = `${out}.${process.pid}.tmp.jpg`;
    const ext = path.extname(abs).toLowerCase();
    let ok;
    if (['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) {
      ok = await run('ffmpeg', ['-v', 'error', '-y', '-ss', '1.5', '-i', abs, '-frames:v', '1', '-vf', `scale=${w}:-2`, '-q:v', '4', tmp]);
      if (!ok) ok = await run('ffmpeg', ['-v', 'error', '-y', '-i', abs, '-frames:v', '1', '-vf', `scale=${w}:-2`, '-q:v', '4', tmp]);
    } else {
      ok = await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '--resampleWidth', String(w), abs, '--out', tmp]);
    }
    if (!ok || !exists(tmp)) { thumbJobs.delete(key); return null; }
    await fsp.rename(tmp, out);
    thumbJobs.delete(key);
    return out;
  })();
  thumbJobs.set(key, job);
  return job;
}

// ---------------------------------------------------------------- scorecard (studio/evals: history/, reviews/, tests.json)
async function scorecardState() {
  const H = path.join(P.evals, 'history');
  const index = (await readJSON(path.join(H, 'index.json'), [])) || [];
  const dates = index.map((x) => x.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-90);
  const days = (await Promise.all(dates.map((d) => readJSON(path.join(H, `${d}.json`))))).filter(Boolean);
  const latest = days[days.length - 1] || null;
  // compact per-test history for the charts: {testId: [{date, value, status}]}
  const series = {};
  for (const d of days) for (const s of Object.values(d.suites || {})) for (const t of s.tests || []) {
    (series[t.id] ||= []).push({ date: d.date, value: typeof t.value === 'number' ? t.value : null, status: t.status });
  }
  let review = null;
  try {
    const files = (await fsp.readdir(path.join(P.evals, 'reviews'))).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    if (files.length) { const f = files[files.length - 1]; const rows = await readJSON(path.join(P.evals, 'reviews', f), []); review = { date: f.slice(0, 10), rows: Array.isArray(rows) ? rows : (rows?.reviews || rows?.items || []) }; }
  } catch { /* no reviews yet */ }
  const cat = await readJSON(path.join(P.evals, 'tests.json'), null);
  const catalogue = cat ? { suites: cat.suites, tests: Object.fromEntries((cat.tests || []).map((t) => [t.id, { measures: t.measures, computed: t.computed, why: t.why, method: t.method, thresholds: t.thresholds }])) } : null;
  return { index, latest, series, review, catalogue };
}

// ---------------------------------------------------------------- SSE + watchers
const clients = new Set();
function broadcast(ev) { broadcastNamed('update', { ...ev, at: nowISO() }); }
function broadcastNamed(event, obj) {
  const data = `event: ${event}\ndata: ${JSON.stringify(obj)}\n\n`;
  for (const res of clients) { try { res.write(data); } catch { clients.delete(res); } }
}

// ---------------------------------------------------------------- runner (one headless Claude Code run at a time)
const runner = createRunner({
  R,
  onEvent: (ev) => {
    if (ev.type === 'state') broadcastNamed('runner', ev.status);
    else if (ev.type === 'line') broadcastNamed('run', { run: ev.run, job: ev.job, line: ev.line });
  },
  logger: console,
});
console.log(`[desk] runner: ${runner.bin || 'claude NOT FOUND'}`);
const pending = new Map();
function queue(type, id) {
  const k = `${type}:${id || ''}`;
  clearTimeout(pending.get(k));
  pending.set(k, setTimeout(() => { pending.delete(k); broadcast({ type, id: id || null }); }, 450));
}
const watchers = new Map();
function attachWatch(type, dir) {
  if (watchers.has(type) || !exists(dir)) return;
  try {
    const w = fs.watch(dir, { recursive: true }, (_ev, file) => {
      if (!file) return queue(type, null);
      const f = String(file);
      if (/\.tmp(\.|$)|\.swp$|~$|\.DS_Store$/.test(f)) return;
      if (type === 'jobs' && f.split(path.sep)[1] === 'runs') return; // run logs stream over the 'run' event instead
      if (type === 'evals' && !/^(history|reviews)[\\/][^\\/]+\.json$|^tests\.json$/.test(f)) return; // only scorecard outputs, not caches
      const first = f.split(path.sep)[0];
      const id = type === 'radar' || type === 'library' ? (first.replace(/\.(json|jsonl)$/, '')) : first.replace(/\.json$/, '');
      queue(type, id);
    });
    w.on('error', () => { watchers.delete(type); });
    watchers.set(type, w);
  } catch { /* retry later */ }
}
function ensureWatchers() {
  attachWatch('jobs', P.jobs); attachWatch('kits', P.kits); attachWatch('library', P.library); attachWatch('radar', P.radar);
  attachWatch('evals', P.evals);
}
ensureWatchers();
setInterval(ensureWatchers, 5000).unref();
setInterval(() => { for (const res of clients) { try { res.write(': ping\n\n'); } catch { clients.delete(res); } } }, 20000).unref();

// ---------------------------------------------------------------- router
async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const p = url.pathname;
  const m = req.method;
  let mm;

  if (p === '/events' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 2000\nevent: hello\ndata: ${JSON.stringify({ at: nowISO() })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (p === '/api/state' && m === 'GET') {
    const [jobs, kits, library, radar, feedback, system, roster, scIndex] = await Promise.all([jobSummaries(), kitsState(), libraryState(), radarState(), feedbackCount(), systemState(), clientRoster(), readJSON(path.join(P.evals, 'history', 'index.json'), [])]);
    const scLast = Array.isArray(scIndex) && scIndex.length ? scIndex[scIndex.length - 1] : null;
    return send(res, 200, { at: nowISO(), root: R, jobs, kits, library, radar, feedback: { count: feedback }, system, roster, runner: runner.status(), scorecard: scLast ? { date: scLast.date, overall: scLast.overall, fails: scLast.fails, warns: scLast.warns } : null });
  }

  if (p === '/api/scorecard' && m === 'GET') return send(res, 200, await scorecardState());

  // ---------------- runner
  if (p === '/api/runner' && m === 'GET') return send(res, 200, runner.status());
  if (p === '/api/runner/lines' && m === 'GET') {
    const id = url.searchParams.get('run') || '';
    if (!/^r[a-z0-9]{6,20}$/.test(id)) return bad(res, 'bad run id');
    const since = Number(url.searchParams.get('since') ?? -1);
    const out = runner.lines(id, Number.isFinite(since) ? since : -1);
    return out ? send(res, 200, out) : bad(res, 'run not found', 404);
  }
  if (p === '/api/runner/stop' && m === 'POST') { const r = runner.stop(); return send(res, r.ok ? 200 : 409, r); }
  if ((mm = p.match(/^\/api\/runner\/(cancel|retry)\/(r[a-z0-9]{6,20})$/)) && m === 'POST') {
    const r = mm[1] === 'cancel' ? runner.cancel(mm[2]) : runner.retryNow(mm[2]);
    return send(res, r.ok ? 200 : 409, r);
  }
  if (p === '/api/runner/check' && m === 'POST') {
    // harmless fixed prompt for checking the runner end to end
    return send(res, 200, { ok: true, run: runner.enqueue({ kind: 'status', prompt: '/create status', label: 'Status check', text: '/create status' }) });
  }
  if (p === '/api/create/options' && m === 'GET') return send(res, 200, await createOptions());
  if (p === '/api/create' && m === 'POST') {
    let body;
    try { body = await readJSONBody(req); } catch (e) { return bad(res, `bad JSON: ${e.message}`); }
    let built;
    try { built = buildCreate(body, R); } catch (e) { return bad(res, e.message, e.code || 500); }
    if (body.dryRun === true) return send(res, 200, { ok: true, dryRun: true, prompt: built.prompt, text: built.text, brief: built.brief, label: built.label });
    console.log(`[desk] create → ${built.text}`);
    const run = runner.enqueue({ kind: 'create', prompt: built.prompt, label: built.label, text: built.text, brief: built.brief });
    return send(res, 200, { ok: true, run, prompt: built.prompt, text: built.text });
  }

  if ((mm = p.match(/^\/api\/job\/([^/]+)$/)) && m === 'GET') {
    const id = decodeURIComponent(mm[1]);
    const loaded = await loadJob(id);
    if (!loaded) return bad(res, 'job not found', 404);
    const { job, dir, sample } = loaded;
    const concepts = await readJSON(path.join(dir, typeof job.concepts === 'string' ? job.concepts : 'concepts.json'), null);
    const script = await readJSON(path.join(dir, 'script.json'), null);
    const qa = await readJSON(path.join(dir, typeof job.qa?.report === 'string' ? job.qa.report : 'qa/report.json'), null);
    const check = await readJSON(path.join(dir, 'check.json'), null);
    let files = [];
    try {
      const walk = async (d, rel = '', depth = 0) => {
        if (depth > 3 || files.length > 400) return;
        for (const e of await fsp.readdir(d, { withFileTypes: true })) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) await walk(path.join(d, e.name), r, depth + 1); else files.push(r);
        }
      };
      await walk(dir);
    } catch { /* ignore */ }
    return send(res, 200, { job, concepts, script, qa, check, dir, sample, files });
  }
  if ((mm = p.match(/^\/api\/job\/([^/]+)\/gate$/)) && m === 'POST') {
    let body;
    try { body = await readJSONBody(req); } catch (e) { return bad(res, `bad JSON: ${e.message}`); }
    const id = decodeURIComponent(mm[1]);
    let out;
    try { out = await applyGate(id, body); } catch (e) { return bad(res, e.message, e.code || 500); }
    try { out.resume = enqueueResume(id, body, out); } catch (e) { out.resumeError = e.message; }
    return send(res, 200, out);
  }
  if ((mm = p.match(/^\/api\/job\/([^/]+)\/runs$/)) && m === 'GET') {
    const id = decodeURIComponent(mm[1]);
    if (!JOB_SAFE_ID.test(id)) return bad(res, 'bad job id');
    const st = runner.status();
    const mine = runner.items().filter((x) => x.jobId === id || (x.jobs || []).includes(id)).map(runner.publicItem).reverse();
    // older runs on disk that the queue no longer remembers
    const dir = path.join(P.jobs, id, 'runs');
    const known = new Set(mine.map((x) => x.humanFile));
    const disk = [];
    for (const f of (await fsp.readdir(dir).catch(() => [])).filter((x) => /^\d+\.log$/.test(x)).sort((a, b) => parseInt(b, 10) - parseInt(a, 10))) {
      const abs = path.join(dir, f);
      if (known.has(abs)) continue;
      const head = (await fsp.readFile(abs, 'utf8').catch(() => '')).split('\n')[0];
      disk.push({ id: null, n: parseInt(f, 10), humanFile: abs, status: 'done', label: head.replace(/^#\s*/, '').slice(0, 160) });
    }
    return send(res, 200, { runs: [...mine, ...disk], current: st.current && (st.current.jobs || []).includes(id) ? st.current.id : null });
  }
  if ((mm = p.match(/^\/api\/job\/([^/]+)\/runs\/(\d{1,4})$/)) && m === 'GET') {
    const id = decodeURIComponent(mm[1]);
    if (!JOB_SAFE_ID.test(id)) return bad(res, 'bad job id');
    const txt = await fsp.readFile(path.join(P.jobs, id, 'runs', `${Number(mm[2])}.log`), 'utf8').catch(() => null);
    if (txt === null) return bad(res, 'run log not found', 404);
    let i = 0;
    const lines = txt.split('\n').filter((s) => s && !s.startsWith('#')).map((s) => { const [t, agent, kind, ...rest] = s.split('\t'); return { i: i++, t, agent, kind, msg: rest.join('\t') }; });
    return send(res, 200, { lines });
  }
  if ((mm = p.match(/^\/api\/kit\/([^/]+)$/)) && m === 'GET') {
    const slug = decodeURIComponent(mm[1]);
    if (!SAFE_ID.test(slug)) return bad(res, 'bad slug');
    const dir = path.join(P.kits, slug);
    const kit = await readJSON(path.join(dir, 'kit.json'));
    if (!kit) {
      const fb = (await sheetFallbackKits()).find((k) => k.slug === slug);
      return fb ? send(res, 200, { pending: true, summary: fb }) : bad(res, 'kit not found', 404);
    }
    let voice = null;
    try { voice = await fsp.readFile(path.join(dir, 'voice.md'), 'utf8'); } catch { /* none */ }
    let lessons = null;
    try { lessons = await fsp.readFile(path.join(dir, 'lessons.md'), 'utf8'); } catch { /* none */ }
    return send(res, 200, {
      kit, tokens: await readJSON(path.join(dir, 'tokens.json')), history: await readJSON(path.join(dir, 'history.json')),
      confirm: await readJSON(path.join(dir, 'confirm.json')), web: await readJSON(path.join(dir, 'web.json')), voice, lessons, summary: await kitSummary(slug),
    });
  }
  if ((mm = p.match(/^\/api\/kit\/([^/]+)\/confirm$/)) && m === 'POST') {
    let body;
    try { body = await readJSONBody(req); } catch (e) { return bad(res, `bad JSON: ${e.message}`); }
    try { return send(res, 200, await applyKitConfirm(decodeURIComponent(mm[1]), body)); } catch (e) { return bad(res, e.message, e.code || 500); }
  }
  if (p === '/api/radar/manual' && m === 'POST') {
    let body;
    try { body = await readJSONBody(req); } catch (e) { return bad(res, `bad JSON: ${e.message}`); }
    try { return send(res, 200, await applyRadarManual(body)); } catch (e) { return bad(res, e.message, e.code || 500); }
  }

  if (p === '/file' && (m === 'GET' || m === 'HEAD')) {
    const r = await resolveMedia(url.searchParams.get('p'));
    if (!r) return bad(res, 'forbidden path', 403);
    if (r.missing) return bad(res, 'not found', 404);
    const w = Number(url.searchParams.get('w'));
    if (w && w >= 64 && w <= 1600) {
      const ext = path.extname(r.abs).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov', '.webm', '.m4v'].includes(ext)) {
        const t = await thumbnail(r.abs, Math.round(w / 40) * 40, 'w').catch(() => null);
        if (t) return serveFile(req, res, t, { 'Cache-Control': 'private, max-age=3600' });
        if (['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) return bad(res, 'no frame', 404);
      }
    }
    return serveFile(req, res, r.abs);
  }

  if (m === 'GET' || m === 'HEAD') {
    let rel = decodeURIComponent(p);
    if (rel === '/' || rel === '') rel = '/index.html';
    const abs = path.normalize(path.join(PUBLIC, rel));
    if (!abs.startsWith(PUBLIC + path.sep)) return bad(res, 'forbidden', 403);
    if (!exists(abs)) return bad(res, 'not found', 404);
    return serveFile(req, res, abs, { 'Cache-Control': 'no-cache' });
  }
  return bad(res, 'method not allowed', 405);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('[desk] error', req.method, req.url, e?.message);
    if (!res.headersSent) bad(res, 'internal error', 500); else res.destroy();
  });
});
server.on('clientError', (_e, sock) => { try { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch { /* */ } });
process.on('uncaughtException', (e) => console.error('[desk] uncaught', e?.message));
// A running Claude Code child keeps going when the Desk stops (own process group, writes to its own file).
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { runner.flush(); } catch { /* */ } process.exit(0); });
process.on('unhandledRejection', (e) => console.error('[desk] unhandled', e?.message || e));
server.listen(PORT, HOST, () => console.log(`[desk] Studio Desk on http://${HOST}:${PORT}  (root ${R})`));
