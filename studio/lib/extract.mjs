// Turn a fetched page (HTML, RSS/Atom, or JSON) into the fields the collectors need.
// Shared by browser mode and plain-fetch mode so the two can be compared fairly.
import { DOMParser, parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'TR', 'TABLE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'BLOCKQUOTE', 'PRE', 'DT', 'DD', 'FIGCAPTION', 'TIME', 'MAIN', 'ASIDE', 'NAV', 'FORM', 'HR']);
const DROP_TAGS = 'script,style,noscript,template,svg,iframe,canvas,link,meta';

export function cleanText(s) {
  return String(s || '')
    .replace(/ /g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Text with line breaks at block boundaries (linkedom has no innerText).
function blockText(node) {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { out.push(n.textContent); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName?.toUpperCase();
    const block = BLOCK_TAGS.has(tag);
    if (block) out.push('\n');
    for (const c of n.childNodes) walk(c);
    if (block) out.push('\n');
  };
  walk(node);
  return cleanText(out.join(''));
}

function toISO(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;            // already ISO-like; keep the site's own value
  if (/^\d{10}$/.test(s) || /^\d{13}$/.test(s)) return new Date(Number(s) * (s.length === 10 ? 1000 : 1)).toISOString(); // epoch
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? s : new Date(t).toISOString();
}

// ---------- dates ----------
const MONTHS_EN = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec';
const MONTHS_FR = 'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre';
const DATE_RES = [
  new RegExp(`\\b(?:${MONTHS_EN})\\.? \\d{1,2},? \\d{4}\\b`, 'i'),
  new RegExp(`\\b\\d{1,2} (?:${MONTHS_EN})\\.? \\d{4}\\b`, 'i'),
  new RegExp(`\\b(?:1er|\\d{1,2}) (?:${MONTHS_FR}) \\d{4}\\b`, 'i'),
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{4}\/\d{2}\/\d{2}\b/,
  /\b(?:\d+|an?) (?:second|minute|hour|day|week|month|year)s? ago\b/i,
  /\bil y a (?:\d+|une?) (?:seconde|minute|heure|jour|semaine|mois|année|an)s?\b/i,
];
export function findDate(s) {
  if (!s) return null;
  for (const re of DATE_RES) { const m = String(s).match(re); if (m) return m[0]; }
  return null;
}

const PUB_META = ['article:published_time', 'og:published_time', 'og:article:published_time', 'datepublished', 'publishdate', 'publish-date', 'publish_date', 'pubdate', 'dcterms.issued', 'dc.date.issued', 'dcterms.created', 'dc.date.created', 'dc.date', 'dcterms.date', 'date', 'sailthru.date', 'parsely-pub-date', 'article.published', 'citation_publication_date', 'cxenseparse:recs:publishtime', 'uploaddate'];
const MOD_META = ['article:modified_time', 'og:updated_time', 'datemodified', 'dcterms.modified', 'dc.date.modified', 'last-modified', 'lastmod'];

function jsonLdNodes(document) {
  const nodes = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let j; try { j = JSON.parse(s.textContent.trim()); } catch { continue; }
    const stack = [j];
    while (stack.length) {
      const x = stack.pop();
      if (Array.isArray(x)) { stack.push(...x); continue; }
      if (x && typeof x === 'object') {
        nodes.push(x);
        if (x['@graph']) stack.push(x['@graph']);
        if (x.mainEntity) stack.push(x.mainEntity);
      }
    }
  }
  return nodes;
}

function extractDates(document) {
  const ld = jsonLdNodes(document);
  const prefer = /Article|BlogPosting|Report|VideoObject|PressRelease|Event|Dataset/i;
  const sorted = [...ld.filter((n) => prefer.test(String(n['@type']))), ...ld];
  for (const n of sorted) {
    const v = n.datePublished || n.uploadDate || n.dateCreated;
    if (v) return { published: toISO(v), publishedSource: `json-ld ${n['@type'] || ''}`.trim(), modified: toISO(n.dateModified) || null };
  }
  const metas = [...document.querySelectorAll('meta')].map((m) => ({
    k: (m.getAttribute('property') || m.getAttribute('name') || m.getAttribute('itemprop') || '').toLowerCase(),
    v: m.getAttribute('content'),
  })).filter((m) => m.k && m.v);
  const modified = MOD_META.map((k) => metas.find((m) => m.k === k)).find(Boolean)?.v || null;
  for (const k of PUB_META) {
    const m = metas.find((x) => x.k === k);
    if (m) return { published: toISO(m.v), publishedSource: `meta ${k}`, modified: toISO(modified) };
  }
  const time = document.querySelector('article time[datetime], main time[datetime], time[pubdate], time[itemprop="datePublished"], time[datetime]');
  if (time) return { published: toISO(time.getAttribute('datetime')), publishedSource: 'time tag', modified: toISO(modified) };
  return { published: null, publishedSource: null, modified: toISO(modified) };
}

// ---------- links ----------
function siteRoot(host) {
  const h = host.toLowerCase().replace(/^www\d*\./, '');
  const parts = h.split('.');
  // keep gc.ca / gov.bc.ca style suffixes intact: use the last 3 labels for *.gc.ca, *.gov.xx.ca, *.co.uk
  if (/\.(gc|gov\.[a-z]{2}|co|com|org|net)\.[a-z]{2}$/.test(h) && parts.length >= 3) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}
function sameSite(a, b) { return siteRoot(a) === siteRoot(b); }

function allDates(s) {
  const found = new Set();
  for (const re of DATE_RES) for (const m of String(s).matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) found.add(m[0]);
  return [...found];
}
// Date shown next to a link on a listing page: climb a few ancestors and accept a date only when
// exactly one distinct date is in that block (so it can't belong to a neighbouring item).
function linkDate(a) {
  let n = a.parentElement;
  for (let i = 0; i < 7 && n; i++, n = n.parentElement) {
    const times = [...n.querySelectorAll('time[datetime]')];
    if (times.length === 1) return toISO(times[0].getAttribute('datetime'));
    if (times.length > 1) return null;
    const txt = n.textContent || '';
    if (txt.length > 1500) return null;
    const ds = allDates(txt);
    if (ds.length === 1) return ds[0];
    if (ds.length > 1) return null;
  }
  return null;
}

const WEAK_LABEL = /^(read|learn|continue|see|view|watch|listen|more|details|click)\b|^\d+\s*(min|mins|minutes)\b|^[\d:]+$/i;
function labelWeight(t) { return !t || WEAK_LABEL.test(t) || findDate(t) === t ? 0 : t.length; }

function extractLinks(document, baseUrl, max = 50) {
  const base = new URL(baseUrl);
  const seen = new Map();
  const inMain = [], rest = [];
  const mainEl = document.querySelector('main, [role="main"], article, #main, #content, .main-content');
  for (const a of document.querySelectorAll('a[href]')) {
    const href = (a.getAttribute('href') || '').trim();
    if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    let u; try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || !sameSite(u.hostname, base.hostname)) continue;
    if (/\.(jpe?g|png|gif|webp|svg|css|js|ico|woff2?|mp4|zip)(\?|$)/i.test(u.pathname)) continue;
    if (/\/(login|signin|sign-in|signup|register|account|cart|search)\b/i.test(u.pathname)) continue;
    if (/\/(tag|tags|topic|topics|category|categories|author|authors|editor|editors|location|locations)\//i.test(u.pathname)) continue;   // taxonomy links are not items
    u.hash = '';
    const key = u.href;
    if (key === base.href.replace(/#.*$/, '')) continue;
    const text = cleanText(a.textContent || a.getAttribute('aria-label') || a.getAttribute('title') || '').replace(/\s*\n\s*/g, ' ').slice(0, 160);
    if (!text || /^\d{1,3}$/.test(text)) continue;   // skip pager numbers
    if (seen.has(key)) {                               // same URL again: keep the better label ("6 mins" -> headline)
      const prev = seen.get(key);
      if (labelWeight(text) > labelWeight(prev.text)) prev.text = text;
      if (!prev.date) { const d = linkDate(a); if (d) prev.date = d; }
      continue;
    }
    const item = { text, url: key };
    seen.set(key, item);
    const d = linkDate(a);
    if (d) item.date = d;
    (mainEl && mainEl.contains(a) ? inMain : rest).push(item);
  }
  // Dated links (listing items) first so the cap never drops them behind long nav menus.
  const dated = (l) => !!l.date;
  return [...inMain.filter(dated), ...rest.filter(dated), ...inMain.filter((l) => !dated(l)), ...rest.filter((l) => !dated(l))].slice(0, max);
}

// ---------- readable text ----------
function mainText(document) {
  const clone = parseHTML(document.toString()).document;
  clone.querySelectorAll(DROP_TAGS + ',nav,header,footer,[role="navigation"],[aria-hidden="true"],.skip-link,#cookie-banner,.cookie-banner').forEach((n) => n.remove());
  const m = clone.querySelector('main, [role="main"], #main-content, #main, #content') || clone.body;
  return m ? blockText(m) : '';
}

function readable(html, url) {
  try {
    const { document } = parseHTML(html);
    document.querySelectorAll(DROP_TAGS).forEach((n) => { if (n.getAttribute?.('type') !== 'application/ld+json') n.remove(); });
    const art = new Readability(document, { charThreshold: 300 }).parse();
    if (!art || !art.content) return null;
    const { document: d2 } = parseHTML(`<html><body>${art.content}</body></html>`);
    return { title: art.title, byline: art.byline, text: blockText(d2.body), excerpt: art.excerpt };
  } catch { return null; }
}

// ---------- block / login-wall detection ----------
const CHALLENGE_TITLE = /just a moment|attention required|checking your browser|verify you are (a )?human|are you a robot|access denied|request blocked|pardon our interruption|security check|captcha|unusual traffic|bot detection|forbidden/i;
const CHALLENGE_HTML = /cf-chl-|challenge-platform|px-captcha|captcha-delivery\.com|_Incapsula_Resource|perimeterx|datadome|hcaptcha\.com\/1\/api|Request unsuccessful\. Incapsula/i;
const LOGIN_URL = /\/(login|signin|sign-in|sign_in|accounts\/login|auth\/|checkpoint)/i;
const LOGIN_TEXT = /\b(log ?in|sign ?in) to (continue|see|view|watch)|you must (log|sign) ?in|log into facebook|create an account or log in|see more from .* on instagram/i;

export function detectBlock({ status, title = '', text = '', html = '', finalUrl = '' }) {
  if (status === 401) return 'login wall (HTTP 401)';
  if (status === 429) return 'rate limited (HTTP 429)';
  if (LOGIN_URL.test(new URL(finalUrl || 'http://x/').pathname)) return 'login wall (redirected to a sign-in page)';
  const short = (text || '').length < 1500;
  if (CHALLENGE_HTML.test(html) && short) return 'bot challenge or captcha page';
  if (CHALLENGE_TITLE.test(title) && short) return `blocked page ("${title.slice(0, 80)}")`;
  if (status === 403) return 'HTTP 403 forbidden';
  if (status === 503 && short) return 'HTTP 503 (likely a bot challenge)';
  if (status >= 400) return `HTTP ${status}`;
  if (LOGIN_TEXT.test(text.slice(0, 4000)) && short) return 'login wall (content hidden behind sign-in)';
  if (/<input[^>]+type=["']?password/i.test(html) && short) return 'login wall (password form, little content)';
  return null;
}

// ---------- feeds ----------
function tagText(el, name) {
  const n = el.getElementsByTagName(name)[0];
  return n ? cleanText(n.textContent) : null;
}
export function parseFeed(xml, url) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const atomEntries = doc.getElementsByTagName('entry');
  const rssItems = doc.getElementsByTagName('item');
  const feedTitle = tagText(doc.documentElement, 'title');
  const items = [];
  if (atomEntries.length) {
    for (const e of atomEntries) {
      const link = [...e.getElementsByTagName('link')].find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate');
      const stats = e.getElementsByTagName('media:statistics')[0];
      const it = {
        title: tagText(e, 'title'),
        url: link?.getAttribute('href') || null,
        published: toISO(tagText(e, 'published')) || toISO(tagText(e, 'updated')),
        updated: toISO(tagText(e, 'updated')),
      };
      const author = e.getElementsByTagName('author')[0];
      if (author) it.author = tagText(author, 'name');
      if (stats) it.views = stats.getAttribute('views');
      const vid = tagText(e, 'yt:videoId');
      if (vid) it.videoId = vid;
      const summary = tagText(e, 'summary') || tagText(e, 'media:description') || tagText(e, 'content');
      if (summary) it.summary = stripTags(summary).slice(0, 300);
      items.push(it);
    }
  } else {
    for (const e of rssItems) {
      const it = {
        title: stripTags(tagText(e, 'title') || ''),
        url: tagText(e, 'link') || tagText(e, 'guid'),
        published: toISO(tagText(e, 'pubDate') || tagText(e, 'dc:date') || tagText(e, 'published')),
      };
      const author = tagText(e, 'dc:creator') || tagText(e, 'author');
      if (author) it.author = author;
      const summary = tagText(e, 'description');
      if (summary) it.summary = stripTags(summary).slice(0, 300);
      items.push(it);
    }
  }
  return { feedTitle, items };
}
function stripTags(s) { return cleanText(String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&quot;/g, '"')); }

export function looksLikeFeed(contentType, body) {
  if (/(rss|atom|xml)/i.test(contentType || '')) return /<(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 2000));
  return /^\s*(<\?xml[^>]*>\s*)?<(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 2000));
}

// ---------- JSON (BoC Valet and other APIs) ----------
export function summarizeJson(data, url) {
  if (data && data.seriesDetail && Array.isArray(data.observations)) {
    const series = Object.keys(data.seriesDetail);
    const sortedObs = [...data.observations].sort((x, y) => String(x.d).localeCompare(String(y.d)));
    const obs = sortedObs.slice(-15).map((o) => {
      const row = { date: o.d };
      for (const s of series) row[s] = o[s]?.v ?? null;
      return row;
    });
    const latest = obs[obs.length - 1] || null;
    return {
      title: series.map((s) => `${s}: ${data.seriesDetail[s].label} (${data.seriesDetail[s].description || ''})`.trim()).join('; '),
      published: latest?.date || null,
      summary: { source: 'Bank of Canada Valet', series: Object.fromEntries(series.map((s) => [s, data.seriesDetail[s]])), latest, recent: obs },
    };
  }
  const s = JSON.stringify(data);
  return { title: null, published: null, summary: s.length > 20000 ? JSON.parse(JSON.stringify(data, (k, v) => (Array.isArray(v) ? v.slice(0, 20) : v))) : data };
}

// ---------- the main entry ----------
export function extractHtml(html, url, { innerText = null, maxLinks = 50 } = {}) {
  const { document } = parseHTML(html);
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const title = cleanText(document.querySelector('title')?.textContent || ogTitle || '');
  let canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null;
  if (canonical) { try { canonical = new URL(canonical, url).href; } catch {} }
  const dates = extractDates(document);
  document.querySelectorAll(DROP_TAGS).forEach((n) => n.remove());   // keep <style>/<script> text out of link labels
  const r = readable(html, url);
  const fallback = innerText ? cleanText(innerText) : mainText(document);
  // Readability is cleaner for articles; for listing pages (news indexes) it often keeps only one
  // block, so fall back to the page's main text when Readability caught less than half of it.
  let text = r?.text || '';
  let textSource = 'readability';
  if (!text || text.length < 0.5 * fallback.length) { text = fallback; textSource = innerText ? 'rendered main text' : 'main text'; }
  const links = extractLinks(document, url, maxLinks);
  return { title, ogTitle: ogTitle || null, canonical, ...dates, text, textSource, links, lang: document.documentElement?.getAttribute('lang') || null };
}
