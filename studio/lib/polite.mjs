// Politeness layer shared by browse.mjs, collect.mjs and map_sources.mjs.
//  - one honest user agent (says it is an automated headless browser, no email, no person)
//  - robots.txt check (RFC 9309 matching, cached 24 h per host)
//  - per-host rate limit: at most 1 request every 3 s (or the site's Crawl-delay if longer),
//    persisted in .state/hosts.json so separate processes (parallel collectors) share it
//  - hard policy refusals for sites whose terms forbid automated collection
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = path.join(TOOLS, '.state');
const HOSTS_FILE = path.join(STATE_DIR, 'hosts.json');
const ROBOTS_FILE = path.join(STATE_DIR, 'robots.json');
const LOCK_DIR = path.join(STATE_DIR, 'lock');

export const BOT_TOKEN = 'ContentDeskBot';
export const BOT_VERSION = '0.1';
export const MIN_GAP_MS = 3000;          // never more than 1 request per host every 3 s
const MAX_CRAWL_DELAY_MS = 30000;        // honour Crawl-delay up to 30 s
const ROBOTS_TTL_MS = 24 * 3600 * 1000;

const NOTE = 'automated nightly news digest; headless; respects robots.txt';
// Plain-HTTP requests (robots.txt, RSS, JSON APIs, --fetch mode).
export const FETCH_UA = `${BOT_TOKEN}/${BOT_VERSION} (+${NOTE})`;
// Browser requests: Chromium's own engine string, which already says "HeadlessChrome",
// plus the bot token. No person, no email, no spoofed desktop browser.
export function browserUA(chromeVersion) {
  const major = String(chromeVersion || '').split('.')[0] || '0';
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/${major}.0.0.0 Safari/537.36 ${BOT_TOKEN}/${BOT_VERSION} (+${NOTE})`;
}

// Sites whose terms forbid automated collection. These are refused before any request.
// Instagram/Facebook/Threads are not in this list on purpose: the guardrail allows recording
// what ONE logged-out page view shows, and robots.txt decides whether even that is allowed.
const POLICY = [
  { re: /(^|\.)reddit\.com$|(^|\.)redd\.it$/i, reason: "Reddit's terms and robots.txt disallow automated collection of public pages. Check by hand, or use the official Reddit API with approved access." },
  { re: /(^|\.)(x|twitter)\.com$/i, reason: "X's terms forbid scraping. Check by hand." },
  { re: /(^|\.)linkedin\.com$/i, reason: "LinkedIn's terms forbid scraping. Check by hand." },
  { re: /(^|\.)tiktok\.com$/i, reason: "TikTok's terms forbid automated access. Use only what search results show, or check by hand." },
  // YouTube's Terms forbid automated access except public search engines, and its robots.txt
  // disallows /feeds/videos.xml (channel RSS) and /youtubei/. Tested once on 2026-11-16 (see
  // source_map.json), then refused. Use the official YouTube Data API v3 instead (collect.mjs
  // fetch "youtube-api" with YOUTUBE_API_KEY) or WebSearch results.
  { re: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, reason: "YouTube's Terms forbid automated access except search engines, and robots.txt disallows the channel RSS feeds (/feeds/videos.xml). Use the YouTube Data API v3 (collect.mjs, needs YOUTUBE_API_KEY), WebSearch results, or check by hand." },
];
const META_HOSTS = /(^|\.)(instagram\.com|facebook\.com|fb\.com|threads\.net|threads\.com)$/i;

export function policyFor(urlStr) {
  const u = new URL(urlStr);
  if (/(^|\.)facebook\.com$/i.test(u.hostname) && u.pathname.startsWith('/ads/library')) {
    return { refuse: true, reason: 'Meta Ad Library: automated collection is not permitted. Manual check only (or the official Ad Library API with approved access).' };
  }
  for (const p of POLICY) if (p.re.test(u.hostname)) return { refuse: true, reason: p.reason };
  if (META_HOSTS.test(u.hostname)) return { refuse: false, meta: true, reason: 'Meta property: one logged-out page view only, no scrolling, no clicking.' };
  return { refuse: false };
}

export function hostKey(urlStr) {
  return new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '');
}

// ---------- small JSON state with a cross-process lock ----------
function ensureState() { fs.mkdirSync(STATE_DIR, { recursive: true }); }
function readJSON(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } }
function writeJSON(f, v) {
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 1));
  fs.renameSync(tmp, f);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withLock(fn) {
  ensureState();
  const start = Date.now();
  for (;;) {
    try { fs.mkdirSync(LOCK_DIR); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(LOCK_DIR).mtimeMs > 15000) fs.rmSync(LOCK_DIR, { recursive: true, force: true }); } catch {}
      if (Date.now() - start > 30000) throw new Error('could not acquire rate-limit lock');
      await sleep(50 + Math.random() * 100);
    }
  }
  try { return await fn(); } finally { try { fs.rmSync(LOCK_DIR, { recursive: true, force: true }); } catch {} }
}

// Reserve the next allowed slot for this host and wait for it. Atomic across processes:
// two collectors asking for the same host get slots at least gapMs apart.
export async function waitTurn(urlStr, gapMs = MIN_GAP_MS) {
  const key = hostKey(urlStr);
  const gap = Math.max(MIN_GAP_MS, Math.min(gapMs || 0, MAX_CRAWL_DELAY_MS));
  const at = await withLock(() => {
    const st = readJSON(HOSTS_FILE, {});
    const now = Date.now();
    const last = st[key]?.lastHit || 0;
    const slot = Math.max(now, last + gap);
    st[key] = { lastHit: slot, gapMs: gap };
    writeJSON(HOSTS_FILE, st);
    return slot;
  });
  const wait = at - Date.now();
  if (wait > 0) await sleep(wait);
  return { host: key, waitedMs: Math.max(0, wait) };
}

// ---------- robots.txt (RFC 9309) ----------
export function parseRobots(txt) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (let raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase(), value = m[2].trim();
    if (field === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], crawlDelay: null }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (field === 'allow' || field === 'disallow') cur.rules.push({ allow: field === 'allow', path: value });
    else if (field === 'crawl-delay') { const n = parseFloat(value); if (!Number.isNaN(n)) cur.crawlDelay = n; }
  }
  return groups;
}

function ruleMatches(pattern, target) {
  if (pattern === '') return false;
  let re = '';
  for (const ch of pattern) {
    if (ch === '*') re += '.*';
    else if (ch === '$') re += '$';
    else re += ch.replace(/[.+?^{}()|[\]\\]/g, '\\$&');
  }
  try { return new RegExp('^' + re).test(target); } catch { return target.startsWith(pattern); }
}

export function robotsVerdict(groups, urlStr, token = BOT_TOKEN) {
  const t = token.toLowerCase();
  let chosen = groups.filter((g) => g.agents.some((a) => a !== '*' && t.includes(a)));
  let matchedAgent = token;
  if (!chosen.length) { chosen = groups.filter((g) => g.agents.includes('*')); matchedAgent = '*'; }
  if (!chosen.length) return { allowed: true, agent: null, rule: null, crawlDelay: null };
  const rules = chosen.flatMap((g) => g.rules);
  const crawlDelay = chosen.map((g) => g.crawlDelay).find((x) => x != null) ?? null;
  const u = new URL(urlStr);
  let target = u.pathname + u.search;
  try { target = decodeURIComponent(target); } catch {}
  let best = null;
  for (const r of rules) {
    let p = r.path;
    try { p = decodeURIComponent(p); } catch {}
    if (!ruleMatches(p, target)) continue;
    if (!best || p.length > best.len || (p.length === best.len && r.allow)) best = { ...r, len: p.length };
  }
  return { allowed: !best || best.allow, agent: matchedAgent, rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` : null, crawlDelay };
}

// Fetch (or reuse cached) robots.txt for the URL's origin. Counts as a request to the host.
export async function robotsCheck(urlStr) {
  const u = new URL(urlStr);
  const origin = u.origin;
  const cache = readJSON(ROBOTS_FILE, {});
  let entry = cache[origin];
  if (!entry || Date.now() - entry.fetchedAt > ROBOTS_TTL_MS) {
    const robotsUrl = origin + '/robots.txt';
    await waitTurn(robotsUrl);
    let status = 0, body = '', error = null;
    try {
      const res = await fetch(robotsUrl, { headers: { 'User-Agent': FETCH_UA, Accept: 'text/plain,*/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      status = res.status;
      body = status === 200 ? (await res.text()).slice(0, 500000) : '';
    } catch (e) { error = String(e.message || e); }
    entry = { fetchedAt: Date.now(), status, body, error };
    await withLock(() => { const c = readJSON(ROBOTS_FILE, {}); c[origin] = entry; writeJSON(ROBOTS_FILE, c); });
  }
  // RFC 9309: 4xx = no restrictions; 5xx or unreachable = assume full disallow.
  if (entry.error || entry.status >= 500) {
    return { allowed: false, reason: `robots.txt unreachable (${entry.error || 'HTTP ' + entry.status}); treated as disallow`, status: entry.status, crawlDelay: null };
  }
  if (entry.status >= 400 || entry.status === 0) return { allowed: true, reason: `no robots.txt (HTTP ${entry.status})`, status: entry.status, crawlDelay: null };
  const v = robotsVerdict(parseRobots(entry.body), urlStr);
  return { allowed: v.allowed, reason: v.rule ? `${v.rule} (User-agent: ${v.agent})` : 'no matching rule', status: entry.status, crawlDelay: v.crawlDelay };
}

// Synchronous check against the cached robots.txt (used to block disallowed same-origin
// subresource requests while a page renders, as Google's renderer does). No cache = allow.
const _robotsMem = new Map();
export function robotsAllowsCached(urlStr) {
  let origin;
  try { origin = new URL(urlStr).origin; } catch { return true; }
  if (!_robotsMem.has(origin)) {
    const entry = readJSON(ROBOTS_FILE, {})[origin];
    _robotsMem.set(origin, entry && entry.status === 200 ? parseRobots(entry.body) : null);
  }
  const groups = _robotsMem.get(origin);
  return groups ? robotsVerdict(groups, urlStr).allowed : true;
}
