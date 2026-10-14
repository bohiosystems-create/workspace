// KINAN email design kit: the app's look (charcoal band with the logo, orange chevron titles, white cards with an orange
// top rule, taupe caps labels, big charcoal figures) built from tables and inline styles, so Outlook desktop, Outlook
// mobile, Apple Mail and Gmail all show it as designed. On phones (≤ 620 px) the tiles stack two by two and tables
// become cards. The logo travels as an inline attachment (see inlineImages).
const LOGO = require('./logo');

const C = {
  ink: '#2e2e2f', taupe: '#51473d', soft: '#6b6b6c', line: '#e8e6e3', bg: '#efeeeb', paper: '#ffffff',
  or: '#f15a22', orFill: '#b83d0c', orTint: '#fff1ea',
  red: '#bd2f2f', redTint: '#fbeeee', green: '#1b7a43', greenTint: '#ecf6f0', amber: '#9a6a00', amberTint: '#fdf5e3',
};
const FONT = "Montserrat,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* cut long text at a word, never mid-word, and say so with an ellipsis */
const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const c = s.slice(0, n + 1).replace(/\s+\S*$/, ''); return (c.length > n * 0.6 ? c : s.slice(0, n)).replace(/[\s,;:.–-]+$/, '') + '…'; };
/* very long raw numbers from a model (4728683.604023%) become readable (4,728,684%) */
const tidyNums = s => String(s ?? '').replace(/(-?\d{4,})(\.\d+)?(\s?%)?/g, (m, i, d, p) => { const v = parseFloat(i + (d || '')); return Number.isFinite(v) ? Math.round(v).toLocaleString('en-GB') + (p || '') : m; });
const TONE = { red: [C.red, C.redTint], orange: [C.orFill, C.orTint], green: [C.green, C.greenTint], amber: [C.amber, C.amberTint], grey: [C.soft, '#f3f2f0'], ink: [C.ink, '#f3f2f0'] };

const logoSrc = v => `data:image/png;base64,${LOGO[v === 'ink' ? 'ink' : 'white']}`;
const logo = (v, h = 30) => `<img src="${logoSrc(v)}" width="${Math.round(h * LOGO.w / LOGO.h)}" height="${h}" alt="KINAN" style="display:block;border:0;outline:none;height:${h}px;width:${Math.round(h * LOGO.w / LOGO.h)}px">`;

const pill = (t, tone = 'orange') => { const [fg, bg] = TONE[tone] || TONE.orange; return `<span style="display:inline-block;background:${bg};color:${fg};border:1px solid ${fg};font-size:9.5px;line-height:14px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;padding:2px 7px;border-radius:999px;white-space:nowrap;font-family:${FONT}">${esc(t)}</span>`; };
const label = t => `<div style="font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.taupe};font-weight:700;font-family:${FONT}">${t}</div>`;

/* a section: white card, orange top rule, "— TITLE" header like the app's cards, optional note under the title */
function section(title, inner, o = {}) {
  const acc = o.tone === 'red' ? C.red : C.or;
  return `<tr><td class="px" style="padding:0 24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};border-top:3px solid ${acc};border-radius:0 0 14px 14px"><tr><td class="cpad" style="padding:20px 22px 22px;font-family:${FONT}">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:18px;border-top:2px solid ${acc};font-size:0;line-height:0">&nbsp;</td><td style="padding-left:10px;font-size:11px;letter-spacing:.26em;text-transform:uppercase;font-weight:700;color:${o.tone === 'red' ? C.red : C.ink};font-family:${FONT}">${esc(title)}</td>${o.count != null ? `<td style="padding-left:10px">${pill(String(o.count), o.tone === 'red' ? 'red' : 'ink')}</td>` : ''}</tr></table>
${o.note ? `<div style="font-size:12.5px;color:${C.soft};margin:8px 0 0;line-height:1.5">${o.note}</div>` : ''}
<div style="margin-top:14px">${inner}</div></td></tr></table></td></tr>`;
}

/* figure tiles: label, big value, change chip; four in a row, two by two on a phone */
function kpis(list) {
  const cell = k => { const tone = k.tone === 'red' ? C.red : k.tone === 'green' ? C.green : C.ink;
    const d = k.delta ? `<div style="margin-top:6px">${pill(k.delta, k.deltaTone || 'grey')}</div>` : '';
    return `<td class="kpi" width="${Math.floor(100 / list.length)}%" valign="top" style="padding:0 6px 10px;font-family:${FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;border-radius:0 0 12px 12px"><tr><td style="padding:14px 14px 13px;border-top:2px solid ${C.or};border-radius:0 0 12px 12px">${label(esc(k.label))}<div style="font-size:24px;line-height:30px;font-weight:700;color:${tone};margin-top:6px;letter-spacing:-.01em;white-space:nowrap">${esc(k.value)}</div>${k.sub ? `<div style="font-size:11px;color:${C.soft};margin-top:2px">${k.sub}</div>` : ''}${d}</td></tr></table></td>`; };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px"><tr>${list.map(cell).join('')}</tr></table>`;
}

/* a data table: light caps header, hairline rows; on a phone each row becomes a small card with its labels */
function table(head, rows, o = {}) {
  const al = i => (o.align && o.align[i]) || 'left';
  const th = head.map((h, i) => `<th align="${al(i)}" style="font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:${C.taupe};font-weight:700;padding:0 8px 8px;border-bottom:2px solid ${C.ink};font-family:${FONT}">${h}</th>`).join('');
  const tr = rows.map(r => `<tr>${r.map((c, i) => `<td class="tcell${(o.full || []).includes(i) ? ' tfull' : ''}" data-l="${esc(String(head[i]).replace(/<[^>]+>/g, ''))}" align="${al(i)}" valign="top" style="padding:11px 8px;border-bottom:1px solid ${C.line};font-size:13px;line-height:1.45;color:${C.ink};font-family:${FONT}${(o.w && o.w[i]) ? ';width:' + o.w[i] : ''}">${c}</td>`).join('')}</tr>`).join('');
  return `<table role="presentation" class="${o.stack ? 'dtab' : 'ntab'}" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

/* an item that needs attention: coloured bar on the left, tag, title, detail, a recommendation box, who and when */
function item(o) {
  const [fg, bg] = TONE[o.tone] || TONE.orange;
  const imp = (o.impact || []).length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;background:#faf9f7;border-radius:10px"><tr><td style="padding:10px 12px;font-size:12.5px;line-height:1.6;font-family:${FONT}">${o.impact.map(m => `<span style="color:${C.soft}">${esc(m.label)}</span> ${esc(m.base)} → <b style="color:${m.below ? C.red : C.ink}">${esc(m.value)}</b>${m.below ? ' ' + pill(o.ar ? 'دون الحد' : 'below hurdle', 'red') : ''}`).join('<br>')}<div style="font-size:11px;color:${C.soft};margin-top:4px">${esc(o.impactNote || '')}</div></td></tr></table>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;background:${C.paper};border:1px solid ${C.line};border-radius:12px"><tr>
<td width="5" style="width:5px;background:${fg};border-radius:${o.ar ? '0 12px 12px 0' : '12px 0 0 12px'};font-size:0">&nbsp;</td>
<td style="padding:13px 16px 14px;font-family:${FONT}">
<div>${(o.tags || []).map(t => pill(t[0], t[1])).join(' ')}${o.id ? ` <span style="font-size:11px;color:${C.soft};font-weight:600">${esc(o.id)}</span>` : ''}</div>
<div style="font-size:15px;line-height:1.35;font-weight:700;color:${C.ink};margin-top:7px">${esc(o.title)}</div>
${o.detail ? `<div style="font-size:13px;line-height:1.5;color:${C.ink};margin-top:5px">${esc(o.detail)}</div>` : ''}
${o.reco ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:9px"><tr><td style="background:${bg};border-radius:8px;padding:9px 11px;font-size:12.5px;line-height:1.5;color:${C.ink};font-family:${FONT}"><b style="color:${fg}">${esc(o.recoLabel || 'Recommended')}:</b> ${esc(o.reco)}</td></tr></table>` : ''}
${imp}
${o.meta ? `<div style="font-size:11.5px;color:${C.soft};margin-top:8px">${o.meta}</div>` : ''}
</td></tr></table>`;
}

/* a horizontal bar against the hurdle (table cells, so Outlook draws it too) */
function bar(v, hurdle, ok, max) {
  max = max || Math.max(hurdle * 1.6, 30); const w = Math.max(2, Math.min(100, Math.round(Math.max(0, v) / max * 100))), hp = Math.min(98, Math.round(hurdle / max * 100));
  const fill = ok ? C.green : C.red;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:12px"><tr>
<td width="${Math.min(w, hp)}%" style="background:${fill};height:12px;font-size:0;border-radius:6px 0 0 6px">&nbsp;</td>
${w < hp ? `<td width="${hp - w}%" style="background:#efedea;height:12px;font-size:0">&nbsp;</td><td width="2" style="width:2px;background:${C.ink};font-size:0">&nbsp;</td><td style="background:#efedea;height:12px;font-size:0;border-radius:0 6px 6px 0">&nbsp;</td>`
    : `<td width="2" style="width:2px;background:${C.ink};font-size:0">&nbsp;</td><td width="${w - hp}%" style="background:${fill};height:12px;font-size:0">&nbsp;</td><td style="background:#efedea;height:12px;font-size:0;border-radius:0 6px 6px 0">&nbsp;</td>`}
</tr></table>`;
}

/* the whole email */
function frame({ kicker, title, sub, body, appUrl, ar, summary, from }) {
  const dir = ar ? ' dir="rtl" lang="ar"' : ' lang="en"';
  const sum = (summary || []).length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>${summary.map(s => `<td class="sum" valign="top" style="padding:0 16px 0 0;font-family:${FONT}"><div style="font-size:26px;line-height:30px;font-weight:700;color:${s.tone === 'red' ? C.red : s.tone === 'green' ? C.green : C.ink}">${esc(s.value)}</div><div style="font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:${C.taupe};font-weight:700;margin-top:4px">${esc(s.label)}</div></td>`).join('')}</tr></table>` : '';
  return `<!doctype html><html${dir}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>
body{margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%}
a{color:${C.orFill}}
@media (max-width:620px){
 .wrap{width:100%!important}.px{padding-left:12px!important;padding-right:12px!important}.cpad{padding:16px 14px 18px!important}
 .hero{padding:24px 18px 22px!important}.ttl{font-size:24px!important;line-height:29px!important}
 .kpi{display:inline-block!important;width:50%!important;box-sizing:border-box}
 .sum{display:inline-block!important;width:48%!important;padding:0 0 12px!important}
 .dtab thead{display:none!important}.dtab tr{display:block!important;border-bottom:1px solid ${C.line}!important;padding:8px 0!important}
 .dtab td.tcell{display:inline-block!important;box-sizing:border-box;width:50%!important;vertical-align:top;border:0!important;padding:5px 8px 5px 0!important;text-align:left!important}
 .dtab td.tcell:first-child,.dtab td.tfull{display:block!important;width:100%!important}
 .dtab td.tcell[data-l=""]{width:auto!important}
 .dtab td.tcell[data-l]:not([data-l=""]):before{content:attr(data-l);display:block;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${C.taupe};font-weight:700;margin-bottom:1px}
 .ntab td,.ntab th{padding-left:5px!important;padding-right:5px!important}.ntab td{font-size:12.5px!important}
 .hide-m{display:none!important}
}
</style></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${esc((summary || []).map(s => s.value + ' ' + s.label).join(' · ') || sub || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:20px 0 28px">
<table role="presentation" class="wrap" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px">
<tr><td class="px" style="padding:0 24px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ink};border-radius:14px 14px 0 0"><tr>
  <td style="padding:18px 22px">${logo('white', 30)}</td>
  <td align="${ar ? 'left' : 'right'}" style="padding:18px 22px;font-family:${FONT};font-size:9.5px;letter-spacing:.26em;text-transform:uppercase;color:#bcbec0;font-weight:700">${ar ? 'وكيل الذكاء الاصطناعي · إستيت ماستر' : 'AI agent <span style="color:' + C.or + '">❯</span> EstateMaster'}</td>
 </tr></table>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td style="height:4px;background:${C.or};font-size:0;line-height:0">&nbsp;</td></tr><tr><td class="hero" style="padding:28px 26px 24px;font-family:${FONT}">
  ${label(esc(kicker))}
  <div class="ttl" style="font-size:30px;line-height:35px;font-weight:700;text-transform:uppercase;color:${C.or};margin-top:10px;letter-spacing:-.005em"><span style="color:${C.or}">❯</span> ${esc(title)}</div>
  ${sub ? `<div style="font-size:13px;color:${C.soft};margin-top:8px">${esc(sub)}</div>` : ''}
  ${sum}
 </td></tr></table>
</td></tr>
<tr><td style="height:16px;font-size:0;line-height:0">&nbsp;</td></tr>
${body}
${appUrl ? `<tr><td class="px" align="center" style="padding:6px 24px 22px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.orFill};border-radius:999px"><a href="${esc(appUrl)}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:700;color:#ffffff;text-decoration:none">${ar ? 'افتح الوكيل' : 'Open the agent'} &nbsp;❯</a></td></tr></table></td></tr>` : ''}
<tr><td class="px" style="padding:0 24px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ink};border-radius:14px"><tr><td style="padding:20px 22px;font-family:${FONT}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="width:70px">${logo('white', 22)}</td><td valign="middle" style="padding-left:14px;font-size:11.5px;line-height:1.55;color:#bcbec0">${ar ? 'لا يتغير شيء في إستيت ماستر قبل موافقة شخص في التطبيق.' : 'Nothing changes in EstateMaster until a person approves it in the agent.'}${from ? `<br><span style="color:#8d8f92">${esc(from)}</span>` : ''}</td></tr></table>
 </td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`;
}

/* Before sending: every embedded image becomes an inline attachment (cid:), the form every mail client shows. */
function inlineImages(html) {
  const atts = [], seen = new Map();
  const out = String(html).replace(/src="data:(image\/(?:png|jpeg|gif));base64,([A-Za-z0-9+/=]+)"/g, (m, type, b64) => {
    let id = seen.get(b64); if (!id) { id = `kinan${atts.length + 1}@bohio`; seen.set(b64, id); atts.push({ name: `kinan-${atts.length + 1}.${type.split('/')[1]}`, contentType: type, base64: b64, inline: true, contentId: id }); }
    return `src="cid:${id}"`;
  });
  return { html: out, attachments: atts };
}

module.exports = { C, FONT, esc, clip, tidyNums, pill, label, section, kpis, table, item, bar, frame, inlineImages, logo, logoSrc };
