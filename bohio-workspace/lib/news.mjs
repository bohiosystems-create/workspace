/* Saudi / GCC real-estate and geopolitical news connector.
 *
 * Deliberately NOT an HTML scraper. It reads syndication feeds and GDELT's
 * public API — sources that are published for machine consumption. Scraping
 * article pages would break on every redesign, trip robots.txt and paywalls,
 * and put the demo on the wrong side of most outlets' terms.
 *
 * Order of preference:
 *   1. NEWSAPI_KEY, if set — a licensed feed, best coverage and metadata.
 *   2. GDELT DOC 2.0 — free, no key, strong on geopolitical signal.
 *   3. RSS — Google News queries plus regional outlets.
 * Whatever answers first and returns usable items wins; the rest are merged in.
 * If nothing is reachable the caller gets { live:false, items:[] } and the app
 * falls back to its curated market data set.
 */

const UA = 'BohioWorkspace/1.0 (market-news connector)';
const TIMEOUT_MS = 8000;

// What the fund actually cares about, expressed once.
export const TOPICS = {
  realestate: {
    label: 'Real estate',
    gdelt: '(saudi OR riyadh OR jeddah OR "saudi arabia") (("real estate") OR property OR housing OR construction OR REIT OR "office market" OR residential)',
    rss: ['saudi real estate market', 'saudi arabia property prices', 'riyadh construction contracts'],
  },
  geopolitical: {
    label: 'Geopolitical',
    gdelt: '(saudi OR "saudi arabia" OR gcc OR gulf) (opec OR oil OR sanctions OR diplomacy OR "foreign policy" OR security OR conflict OR "interest rate")',
    rss: ['saudi arabia geopolitics', 'gulf oil policy OPEC', 'saudi arabia economy policy'],
  },
};

const SECTOR_RULES = [
  [/reit|fund|investment|acquisition|capital|ipo/i, 'Investment'],
  [/office|commercial|retail|mall/i, 'Commercial'],
  [/residential|housing|home|apartment|villa/i, 'Residential'],
  [/construction|contract|contractor|project|infrastructure|giga/i, 'Construction'],
  [/hotel|hospitality|tourism|adr|revpar/i, 'Hospitality'],
  [/logistics|warehouse|industrial/i, 'Logistics'],
  [/rate|inflation|sama|central bank|saibor|monetary/i, 'Rates'],
  [/oil|opec|crude|energy|barrel/i, 'Energy'],
  [/sanction|conflict|security|diplomat|tension|treaty|border/i, 'Geopolitical'],
  [/regulation|law|permit|zoning|policy|ministry/i, 'Regulation'],
];
export function classify(text) {
  for (const [re, sector] of SECTOR_RULES) if (re.test(text)) return sector;
  return 'Market';
}

// Deliberately conservative: only obvious directional language moves this off
// neutral. A wrong sentiment label on a risk radar is worse than none.
const POS = /\b(rise[sn]?|rising|rose|surge[sd]?|surging|growth|grew|grow(?:s|ing)?|gain(?:s|ed|ing)?|record|boost(?:s|ed)?|strong(?:er|est)?|expand(?:s|ed|ing)?|expansion|upgrade[sd]?|recovery|recover(?:s|ing)?|inflow[s]?|demand|rally|rallie[sd]|firm(?:s|ing|er)?|outperform(?:s|ed)?)\b/i;
const NEG = /\b(fall(?:s|ing)?|fell|drop(?:s|ped|ping)?|decline[sd]?|declining|slump(?:s|ed)?|slip(?:s|ped|ping)?|slid(?:e|es)?|ease[sd]?|easing|soften(?:s|ed|ing)?|weak(?:en|ens|ened|ening|er)?|cut(?:s|ting)?|risk[s]?|delay(?:s|ed)?|oversupply|glut|downgrade[sd]?|tension[s]?|conflict[s]?|sanction[s]?|unrest|disrupt(?:s|ed|ion|ions)?|halt(?:s|ed)?|strain(?:s|ed)?|pressure[sd]?|weigh(?:s|ed|ing)?\s+on|shortfall|default[s]?)\b/i;
export function sentiment(text) {
  const p = POS.test(text), n = NEG.test(text);
  return p && !n ? 'positive' : n && !p ? 'negative' : 'neutral';
}

async function get(url, headers = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

// Entities are decoded BEFORE tags are stripped: feeds routinely deliver their
// HTML entity-encoded, so stripping first left "&lt;p&gt;" behind as "<p>".
// &amp; is decoded last so "&amp;lt;" doesn't turn into a real tag.
const decodeEnt = s => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;|&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&');
const stripTags = s => decodeEnt(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// --- RSS / Atom ------------------------------------------------------------
export function parseRss(xml, fallbackSrc) {
  const items = [];
  const blocks = String(xml || '').split(/<item[\s>]|<entry[\s>]/i).slice(1);
  for (const b of blocks) {
    const pick = (tag) => { const m = b.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i')); return m ? stripTags(m[1]) : ''; };
    const title = pick('title'); if (!title) continue;
    let link = pick('link');
    if (!link) { const m = b.match(/<link[^>]*href=["']([^"']+)["']/i); if (m) link = m[1]; }
    const date = pick('pubDate') || pick('published') || pick('updated');
    // Google News wraps the outlet name in the title after a hyphen.
    let src = pick('source') || fallbackSrc;
    let clean = title;
    const dash = title.lastIndexOf(' - ');
    if (!pick('source') && dash > 20) { src = title.slice(dash + 3).trim(); clean = title.slice(0, dash).trim(); }
    items.push({ title: clean, url: link, src, date, body: pick('description').slice(0, 400) });
  }
  return items;
}

// --- GDELT -----------------------------------------------------------------
export function parseGdelt(json) {
  let j; try { j = JSON.parse(json); } catch { return []; }
  return (j.articles || []).map(a => ({
    title: a.title || '', url: a.url || '', src: a.domain || 'GDELT',
    date: a.seendate || '', body: '',
  })).filter(a => a.title);
}

// --- NewsAPI (only when a key is configured) -------------------------------
export function parseNewsApi(json) {
  let j; try { j = JSON.parse(json); } catch { return []; }
  return (j.articles || []).map(a => ({
    title: a.title || '', url: a.url || '', src: (a.source && a.source.name) || 'NewsAPI',
    date: a.publishedAt || '', body: (a.description || '').slice(0, 400),
  })).filter(a => a.title);
}

function normDate(d) {
  if (!d) return '';
  // GDELT stamps as 20260428T104500Z
  const g = String(d).match(/^(\d{4})(\d{2})(\d{2})T/);
  if (g) return `${g[3]} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+g[2]-1]} ${g[1]}`;
  const t = Date.parse(d);
  if (!isNaN(t)) { const x = new Date(t); return `${String(x.getUTCDate()).padStart(2,'0')} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][x.getUTCMonth()]} ${x.getUTCFullYear()}`; }
  return String(d).slice(0, 24);
}

export function normalise(raw, topic) {
  const seen = new Set(); const out = [];
  for (const a of raw) {
    const key = String(a.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const blob = a.title + ' ' + (a.body || '');
    out.push({
      date: normDate(a.date), src: a.src || 'Market news', title: a.title,
      url: a.url || '', body: a.body || '',
      topic, sector: classify(blob), sentiment: sentiment(blob),
    });
  }
  return out;
}

const FEEDS = [
  { url: 'https://www.arabnews.com/rss.xml', src: 'Arab News' },
  { url: 'https://saudigazette.com.sa/rssFeed/74', src: 'Saudi Gazette' },
  { url: 'https://www.zawya.com/en/rss/news', src: 'Zawya' },
];

export async function fetchNews({ topic = 'realestate', limit = 12, key = null } = {}) {
  const spec = TOPICS[topic] || TOPICS.realestate;
  const collected = []; const usedSources = []; const errors = [];

  if (key) {
    try {
      const q = encodeURIComponent(spec.rss[0]);
      const txt = await get(`https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=${limit}`, { 'x-api-key': key });
      const a = parseNewsApi(txt); if (a.length) { collected.push(...a); usedSources.push('NewsAPI'); }
    } catch (e) { errors.push('newsapi: ' + e.message); }
  }

  try {
    const txt = await get(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(spec.gdelt)}&mode=artlist&format=json&maxrecords=${limit}&sort=datedesc`);
    const a = parseGdelt(txt); if (a.length) { collected.push(...a); usedSources.push('GDELT'); }
  } catch (e) { errors.push('gdelt: ' + e.message); }

  if (collected.length < limit) {
    for (const q of spec.rss) {
      try {
        const txt = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`);
        const a = parseRss(txt, 'Google News'); if (a.length) { collected.push(...a); if (!usedSources.includes('Google News')) usedSources.push('Google News'); }
      } catch (e) { errors.push('gnews: ' + e.message); }
      if (collected.length >= limit * 2) break;
    }
  }
  if (collected.length < limit) {
    for (const f of FEEDS) {
      try {
        const txt = await get(f.url);
        const a = parseRss(txt, f.src); if (a.length) { collected.push(...a); usedSources.push(f.src); }
      } catch (e) { errors.push(f.src + ': ' + e.message); }
    }
  }

  const items = normalise(collected, topic).slice(0, limit);
  return { live: items.length > 0, items, sources: usedSources, errors: errors.slice(0, 6) };
}

// Small in-process cache so a page full of widgets doesn't hammer the sources.
const CACHE = new Map(); const TTL = 5 * 60 * 1000;
export async function fetchNewsCached(opts = {}) {
  const k = JSON.stringify(opts);
  const hit = CACHE.get(k);
  if (hit && Date.now() - hit.at < TTL) return { ...hit.val, cached: true };
  const val = await fetchNews(opts);
  if (val.live) CACHE.set(k, { at: Date.now(), val });
  return val;
}
