/* ============================================================================
   BOHIO 3.0 — CLIENT DEMOS
   1) AI Deal Screening  — screens an incoming deal against the firm's mandate
                           (real AI via window.claude.complete) + animated gauge
   2) Funds & Stakeholders — multi-fund command center with an animated
                           stakeholder network + capital deployment + pipeline
   3) IC Memo generator   — real-AI investment-committee memo (screening tie-in)
   ============================================================================ */
(function () {
  'use strict';

  /* ---------- inject styles ---------- */
  const CSS = `
  /* shared */
  .dm-eyebrow { font-size:9px; letter-spacing:0.32em; text-transform:uppercase; color:var(--ink-soft); font-weight:700; }
  .dm-sub { font-size:12px; letter-spacing:0.04em; color:var(--ink-soft); max-width:560px; line-height:1.6; margin-top:8px; text-transform:none; font-weight:400; }
  .dm-new-badge { display:inline-block; font-size:7px; letter-spacing:0.22em; background:var(--ink); color:var(--bg); padding:2px 5px; margin-left:7px; vertical-align:middle; }
  .dm-card { background:var(--paper); border:1px solid var(--ink-hairline); }
  .dm-btn { background:var(--ink); color:var(--bg); border:1px solid var(--ink); font-family:inherit; font-size:10px; letter-spacing:0.26em; text-transform:uppercase; padding:13px 22px; cursor:pointer; font-weight:700; transition:all .18s ease; }
  .dm-btn:hover { background:transparent; color:var(--ink); }
  .dm-btn:disabled { opacity:0.4; cursor:default; }
  .dm-btn.ghost { background:transparent; color:var(--ink); }
  .dm-btn.ghost:hover { background:var(--ink); color:var(--bg); }

  /* ===== DEAL SCREENING ===== */
  .sc-top { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:22px; }
  @media (max-width:980px){ .sc-top{ grid-template-columns:1fr; } }
  .sc-panel { padding:22px 24px; }
  .sc-panel-h { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--ink-hairline); }
  .sc-panel-h .t { font-size:11px; letter-spacing:0.26em; text-transform:uppercase; font-weight:700; }
  .sc-mandate-row { display:flex; justify-content:space-between; gap:14px; padding:9px 0; border-bottom:1px dotted var(--ink-hairline); font-size:12px; }
  .sc-mandate-row:last-child { border-bottom:none; }
  .sc-mandate-row .k { color:var(--ink-soft); letter-spacing:0.06em; }
  .sc-mandate-row .v { text-align:right; font-weight:500; max-width:60%; }
  .sc-deal-tabs { display:flex; gap:7px; margin-bottom:16px; flex-wrap:wrap; }
  .sc-deal-tab { border:1px solid var(--ink-hairline); background:transparent; color:var(--ink-soft); font-family:inherit; font-size:9px; letter-spacing:0.14em; text-transform:uppercase; padding:7px 12px; cursor:pointer; transition:all .15s; }
  .sc-deal-tab:hover { border-color:var(--ink); color:var(--ink); }
  .sc-deal-tab.active { background:var(--ink); color:var(--bg); border-color:var(--ink); }
  .sc-deal-facts { display:grid; grid-template-columns:1fr 1fr; gap:0 22px; }
  .sc-fact { display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px dotted var(--ink-hairline); font-size:12px; }
  .sc-fact .k { color:var(--ink-soft); }
  .sc-fact .v { font-weight:500; text-align:right; }
  .sc-deal-name { font-family:var(--font-display); font-size:21px; letter-spacing:0.02em; margin-bottom:3px; }
  .sc-deal-loc { font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink-soft); margin-bottom:16px; }
  .sc-run { display:flex; align-items:center; gap:16px; margin-bottom:26px; }
  .sc-run .hint { font-size:11px; color:var(--ink-soft); letter-spacing:0.04em; }

  /* result */
  .sc-result { display:none; }
  .sc-result.show { display:block; animation:dm-fade .5s ease; }
  @keyframes dm-fade { from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:none;} }
  .sc-verdict-wrap { display:grid; grid-template-columns:240px 1fr; gap:28px; align-items:center; padding:28px; margin-bottom:20px; }
  @media (max-width:820px){ .sc-verdict-wrap{ grid-template-columns:1fr; } }
  .sc-gauge { position:relative; width:200px; height:200px; margin:0 auto; }
  .sc-gauge svg { transform:rotate(-90deg); }
  .sc-gauge-num { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .sc-gauge-num .n { font-family:var(--font-display); font-size:52px; line-height:1; }
  .sc-gauge-num .l { font-size:8px; letter-spacing:0.28em; text-transform:uppercase; color:var(--ink-soft); margin-top:6px; }
  .sc-stamp { display:inline-block; font-family:var(--font-display); font-size:30px; letter-spacing:0.08em; padding:7px 20px; border:2.5px solid currentColor; transform:rotate(-3deg); opacity:0; }
  .sc-stamp.in { animation:dm-stamp .45s cubic-bezier(.2,1.4,.4,1) forwards; }
  @keyframes dm-stamp { 0%{opacity:0; transform:rotate(-3deg) scale(1.6);} 100%{opacity:1; transform:rotate(-3deg) scale(1);} }
  .v-proceed { color:#1F8A5B; } .v-review { color:#B7791F; } .v-pass { color:#C0392B; }
  .sc-headline { font-family:var(--font-display); font-size:23px; line-height:1.35; margin:14px 0 0; letter-spacing:0.01em; text-wrap:pretty; }

  .sc-crit { margin-top:4px; }
  .sc-crit-row { display:grid; grid-template-columns:18px 150px 1fr; gap:12px; align-items:start; padding:11px 0; border-bottom:1px solid var(--ink-hairline); opacity:0; transform:translateX(-6px); }
  .sc-crit-row.in { animation:dm-row .4s ease forwards; }
  @keyframes dm-row { to{opacity:1; transform:none;} }
  .sc-crit-dot { width:11px; height:11px; border-radius:50%; margin-top:3px; }
  .d-aligned { background:#1F8A5B; } .d-partial { background:#B7791F; } .d-breach { background:#C0392B; }
  .sc-crit-name { font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:var(--ink); font-weight:500; }
  .sc-crit-note { font-size:12px; color:var(--ink-soft); line-height:1.5; }
  .sc-cols { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:22px; }
  @media (max-width:820px){ .sc-cols{ grid-template-columns:1fr; } }
  .sc-list-h { font-size:10px; letter-spacing:0.24em; text-transform:uppercase; font-weight:700; margin-bottom:12px; display:flex; align-items:center; gap:8px; }
  .sc-li { font-size:12.5px; line-height:1.55; padding:8px 0 8px 16px; position:relative; border-bottom:1px dotted var(--ink-hairline); }
  .sc-li::before { content:""; position:absolute; left:0; top:14px; width:6px; height:6px; }
  .sc-li.good::before { background:#1F8A5B; } .sc-li.bad::before { background:#C0392B; }
  .sc-rec { margin-top:22px; padding:20px 24px; background:var(--ink); color:var(--bg); }
  .sc-rec .l { font-size:9px; letter-spacing:0.3em; text-transform:uppercase; opacity:0.6; margin-bottom:8px; }
  .sc-rec .t { font-size:15px; line-height:1.6; letter-spacing:0.02em; }
  .sc-actions { display:flex; gap:12px; margin-top:20px; flex-wrap:wrap; }

  /* scanning state */
  .sc-scan { display:none; padding:40px 28px; text-align:center; }
  .sc-scan.show { display:block; }
  .sc-scan .orb { width:64px; height:64px; margin:0 auto 22px; border:2px solid var(--ink-hairline); border-top-color:var(--ink); border-radius:50%; animation:dm-spin .9s linear infinite; }
  @keyframes dm-spin { to{ transform:rotate(360deg);} }
  .sc-scan .msg { font-size:12px; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink-soft); }
  .sc-scan .crit-scan { max-width:520px; margin:24px auto 0; text-align:left; }
  .sc-scan .cs-row { display:flex; align-items:center; gap:12px; padding:8px 0; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-faint); opacity:0; }
  .sc-scan .cs-row.in { opacity:1; color:var(--ink-soft); transition:all .3s; }
  .sc-scan .cs-row .tick { width:14px; height:14px; border:1px solid currentColor; display:grid; place-items:center; font-size:9px; }

  /* follow-up chat */
  .sc-chat { margin-top:20px; padding:22px 24px; }
  .sc-chat-thread { display:flex; flex-direction:column; gap:12px; margin:14px 0; max-height:340px; overflow-y:auto; }
  .sc-msg { font-size:12.5px; line-height:1.6; padding:11px 14px; max-width:86%; letter-spacing:0.02em; }
  .sc-msg.user { align-self:flex-end; background:var(--ink); color:var(--bg); }
  .sc-msg.bot { align-self:flex-start; background:rgba(0,9,25,0.05); border:1px solid var(--ink-hairline); }
  .sc-msg .who { font-size:7px; letter-spacing:0.28em; text-transform:uppercase; opacity:0.55; display:block; margin-top:7px; }
  .sc-chat-in { display:flex; gap:8px; }
  .sc-chat-in input { flex:1; background:transparent; border:1px solid var(--ink-hairline); padding:12px 14px; font-family:inherit; font-size:12px; color:var(--ink); outline:none; letter-spacing:0.04em; }
  .sc-chat-in input:focus { border-color:var(--ink); }

  /* IC memo modal */
  .icm-overlay { position:fixed; inset:0; background:rgba(0,9,25,0.4); z-index:460; display:none; align-items:center; justify-content:center; padding:40px; }
  .icm-overlay.show { display:flex; }
  .icm-doc { background:#fbfaf8; width:min(760px,94vw); max-height:88vh; overflow-y:auto; box-shadow:0 30px 80px rgba(0,9,25,0.4); }
  .icm-head { display:flex; align-items:center; justify-content:space-between; padding:18px 28px; border-bottom:1px solid var(--ink-hairline); position:sticky; top:0; background:#fbfaf8; }
  .icm-head .t { font-size:10px; letter-spacing:0.26em; text-transform:uppercase; font-weight:700; }
  .icm-head .x { cursor:pointer; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink-soft); background:none; border:none; font-family:inherit; }
  .icm-body { padding:34px 44px 48px; }
  .icm-body .m-title { font-family:var(--font-display); font-size:26px; letter-spacing:0.01em; margin-bottom:6px; }
  .icm-body .m-meta { font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-soft); margin-bottom:26px; padding-bottom:18px; border-bottom:1px solid var(--ink-hairline); }
  .icm-body h4 { font-size:10px; letter-spacing:0.24em; text-transform:uppercase; margin:24px 0 9px; }
  .icm-body p { font-size:13.5px; line-height:1.72; letter-spacing:0.01em; margin-bottom:10px; white-space:pre-wrap; }
  .icm-gen { padding:60px; text-align:center; }
  .icm-gen .orb { width:54px; height:54px; margin:0 auto 20px; border:2px solid var(--ink-hairline); border-top-color:var(--ink); border-radius:50%; animation:dm-spin .9s linear infinite; }
  .icm-gen .msg { font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink-soft); }

  /* ===== FUNDS & STAKEHOLDERS ===== */
  .fd-kpis { display:grid; grid-template-columns:repeat(6,1fr); gap:1px; background:var(--ink-hairline); border:1px solid var(--ink-hairline); margin-bottom:24px; }
  @media (max-width:980px){ .fd-kpis{ grid-template-columns:repeat(3,1fr);} }
  .fd-kpi { background:var(--bg); padding:18px 16px; }
  .fd-kpi .n { font-family:var(--font-display); font-size:27px; line-height:1; letter-spacing:0.01em; }
  .fd-kpi .l { font-size:8px; letter-spacing:0.22em; text-transform:uppercase; color:var(--ink-soft); margin-top:8px; }
  .fd-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; margin-bottom:8px; }
  .fd-fund { padding:20px 22px; cursor:pointer; transition:all .18s ease; border:1px solid var(--ink-hairline); background:var(--paper); position:relative; }
  .fd-fund:hover { transform:translateY(-3px); box-shadow:0 12px 30px rgba(0,9,25,0.1); }
  .fd-fund.active { background:var(--ink); color:var(--bg); }
  .fd-fund.active .fd-fund-meta, .fd-fund.active .fd-bar-k { color:rgba(230,226,226,0.6); }
  .fd-fund.active .fd-bar-track { background:rgba(230,226,226,0.18); }
  .fd-fund-name { font-family:var(--font-display); font-size:19px; letter-spacing:0.01em; margin-bottom:4px; text-wrap:pretty; }
  .fd-fund-meta { font-size:9px; letter-spacing:0.16em; text-transform:uppercase; color:var(--ink-soft); margin-bottom:16px; }
  .fd-fund-stats { display:flex; gap:18px; margin-bottom:16px; }
  .fd-fund-stat .n { font-family:var(--font-display); font-size:22px; line-height:1; }
  .fd-fund-stat .l { font-size:7.5px; letter-spacing:0.2em; text-transform:uppercase; opacity:0.6; margin-top:5px; }
  .fd-bar { margin-bottom:9px; }
  .fd-bar-top { display:flex; justify-content:space-between; font-size:9px; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px; }
  .fd-bar-k { color:var(--ink-soft); }
  .fd-bar-track { height:5px; background:rgba(0,9,25,0.08); position:relative; overflow:hidden; }
  .fd-bar-fill { position:absolute; left:0; top:0; bottom:0; width:0; background:currentColor; transition:width 1s cubic-bezier(.4,0,.2,1); }

  /* detail */
  .fd-detail { margin-top:26px; display:none; }
  .fd-detail.show { display:block; animation:dm-fade .5s ease; }
  .fd-detail-h { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:1px solid var(--ink); padding-bottom:14px; margin-bottom:22px; gap:16px; flex-wrap:wrap; }
  .fd-detail-h .nm { font-family:var(--font-display); font-size:30px; letter-spacing:0.01em; }
  .fd-detail-h .mt { font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-soft); margin-top:6px; }
  .fd-two { display:grid; grid-template-columns:1.15fr 1fr; gap:22px; margin-bottom:24px; }
  @media (max-width:980px){ .fd-two{ grid-template-columns:1fr; } }
  .fd-block { border:1px solid var(--ink-hairline); background:var(--paper); padding:20px 22px; }
  .fd-block-h { font-size:10px; letter-spacing:0.24em; text-transform:uppercase; font-weight:700; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; }
  .fd-block-h .tag { font-size:8px; color:var(--ink-soft); letter-spacing:0.14em; }

  /* capital deployment flow */
  .fd-flow-row { margin-bottom:16px; }
  .fd-flow-top { display:flex; justify-content:space-between; font-size:10px; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:6px; }
  .fd-flow-top .k { color:var(--ink-soft); }
  .fd-flow-top .v { font-weight:600; font-variant-numeric:tabular-nums; }
  .fd-flow-track { height:22px; background:rgba(0,9,25,0.06); position:relative; }
  .fd-flow-fill { position:absolute; left:0; top:0; bottom:0; width:0; transition:width 1.1s cubic-bezier(.4,0,.2,1); }

  /* network (legacy, unused) */
  .fd-net-wrap { position:relative; }
  .fd-net { width:100%; height:430px; display:block; }
  .fd-net-legend { display:flex; flex-wrap:wrap; gap:12px 18px; margin-top:6px; padding-top:14px; border-top:1px solid var(--ink-hairline); }
  .fd-leg { display:flex; align-items:center; gap:7px; font-size:9px; letter-spacing:0.12em; text-transform:uppercase; color:var(--ink-soft); }
  .fd-leg .sw { width:10px; height:10px; border-radius:50%; }
  /* stakeholder cards — match workspace project stakeholder grid */
  .fd-sh-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }
  .fd-sh-card { border:1px solid var(--ink-hairline); padding:14px; display:flex; flex-direction:column; gap:12px; background:var(--bg); }
  .fd-sh-top { display:flex; align-items:center; gap:10px; }
  .fd-sh-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .fd-sh-name { font-size:11px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; line-height:1.3; }
  .fd-sh-role { font-size:7px; letter-spacing:0.25em; text-transform:uppercase; color:var(--ink-soft); margin-top:3px; }
  .fd-sh-btn { font-size:8px; letter-spacing:0.18em; text-transform:uppercase; padding:6px 10px; align-self:flex-start; border:1px solid var(--ink-hairline); background:transparent; color:var(--ink); cursor:pointer; font-family:inherit; transition:all .15s ease; }
  .fd-sh-btn:hover { background:var(--ink); color:var(--bg); border-color:var(--ink); }
  .fd-sh-legend { display:flex; flex-wrap:wrap; gap:10px 14px; margin-top:18px; padding-top:16px; border-top:1px solid var(--ink-hairline); }
  .fd-cap-cols { display:grid; grid-template-columns:1.4fr 1fr; gap:28px; align-items:start; }
  @media (max-width:820px){ .fd-cap-cols{ grid-template-columns:1fr; } }
  /* stakeholder agent modal */
  .fa-overlay { position:fixed; inset:0; background:rgba(0,9,25,0.4); z-index:470; display:none; align-items:center; justify-content:center; padding:40px; }
  .fa-overlay.show { display:flex; }
  .fa-modal { background:var(--paper); width:min(540px,94vw); max-height:84vh; display:flex; flex-direction:column; box-shadow:0 30px 80px rgba(0,9,25,0.4); }
  .fa-head { display:flex; align-items:center; justify-content:space-between; padding:18px 24px; border-bottom:1px solid var(--ink); }
  .fa-name { font-family:var(--font-display); font-size:20px; letter-spacing:0.02em; }
  .fa-role { font-size:9px; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-soft); margin-top:5px; }
  .fa-x { background:none; border:none; cursor:pointer; font-family:inherit; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink-soft); }
  .fa-thread { flex:1; overflow-y:auto; padding:20px 24px; display:flex; flex-direction:column; gap:12px; min-height:160px; }
  .fa-in { display:flex; gap:8px; padding:16px 24px; border-top:1px solid var(--ink-hairline); }
  .fa-in input { flex:1; background:transparent; border:1px solid var(--ink-hairline); padding:12px 14px; font-family:inherit; font-size:12px; color:var(--ink); outline:none; letter-spacing:0.04em; }
  .fa-in input:focus { border-color:var(--ink); }
  .fd-net text { font-family:var(--font-body); }
  .fd-node { cursor:pointer; }
  .fd-node circle { transition:all .2s ease; }
  .fd-link { transition:opacity .25s ease, stroke-width .25s ease; }
  .fd-tip { position:absolute; pointer-events:none; background:var(--ink); color:var(--bg); padding:9px 13px; font-size:10px; letter-spacing:0.06em; max-width:220px; opacity:0; transform:translateY(4px); transition:opacity .15s, transform .15s; z-index:5; line-height:1.5; }
  .fd-tip.show { opacity:1; transform:none; }
  .fd-tip .r { font-size:7.5px; letter-spacing:0.2em; text-transform:uppercase; opacity:0.6; display:block; margin-bottom:3px; }

  /* pipeline */
  .fd-pipe { display:grid; grid-template-columns:repeat(5,1fr); gap:1px; background:var(--ink-hairline); border:1px solid var(--ink-hairline); }
  @media (max-width:980px){ .fd-pipe{ grid-template-columns:1fr 1fr; } }
  .fd-stage { background:var(--bg); padding:14px 12px; min-height:140px; }
  .fd-stage-h { font-size:8px; letter-spacing:0.16em; text-transform:uppercase; color:var(--ink-soft); margin-bottom:12px; display:flex; justify-content:space-between; }
  .fd-stage-h .ct { background:var(--ink); color:var(--bg); padding:1px 6px; font-size:8px; }
  .fd-proj { background:var(--paper); border:1px solid var(--ink-hairline); padding:9px 11px; margin-bottom:8px; font-size:11px; letter-spacing:0.02em; cursor:default; transition:all .15s; }
  .fd-proj:hover { border-color:var(--ink); transform:translateX(2px); }
  .fd-proj .e { font-size:8.5px; letter-spacing:0.12em; text-transform:uppercase; color:var(--ink-soft); margin-top:4px; }

  /* ===== NEW OPPORTUNITY squircle (in workspace projects grid) ===== */
  .proj-squircle.psq-opportunity { box-shadow:0 0 0 1px var(--ink) inset, 0 8px 22px rgba(0,9,25,0.10); animation:opp-glow 3.2s ease-in-out infinite; }
  @keyframes opp-glow { 0%,100%{ box-shadow:0 0 0 1px var(--ink) inset, 0 6px 16px rgba(0,9,25,0.07);} 50%{ box-shadow:0 0 0 1px var(--ink) inset, 0 12px 32px rgba(0,9,25,0.18);} }
  .psq-new-pill { font-size:7px; letter-spacing:0.22em; text-transform:uppercase; font-weight:700; background:var(--ink); color:var(--bg); padding:4px 9px; border-radius:999px; }
  .proj-squircle.psq-opportunity:hover .psq-new-pill { background:var(--bg); color:var(--ink); }
  .psq-dot.opp { background:#C0392B; animation:opp-pulse 1.8s infinite; }
  @keyframes opp-pulse { 0%,100%{opacity:1;} 50%{opacity:0.3;} }

  /* ===== OPPORTUNITY HUB overlay ===== */
  .opp-overlay { position:fixed; inset:0; background:rgba(0,9,25,0.5); z-index:455; display:none; align-items:flex-start; justify-content:center; padding:40px 20px; overflow-y:auto; }
  .opp-overlay.show { display:flex; }
  .opp-sheet { background:var(--bg); width:min(1020px,96vw); margin:auto; box-shadow:0 30px 90px rgba(0,9,25,0.45); }
  .opp-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; padding:26px 32px; border-bottom:1px solid var(--ink); }
  .opp-eyebrow { font-size:8px; letter-spacing:0.3em; text-transform:uppercase; color:var(--ink-soft); font-weight:700; }
  .opp-title { font-family:var(--font-display); font-size:30px; letter-spacing:0.02em; margin:8px 0 0; }
  .opp-pill { display:inline-block; font-size:7px; letter-spacing:0.22em; text-transform:uppercase; font-weight:700; background:#C0392B; color:#fff; padding:4px 10px; border-radius:999px; margin-left:12px; vertical-align:middle; }
  .opp-x { background:none; border:none; cursor:pointer; font-family:inherit; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink-soft); flex-shrink:0; }
  .opp-meta { display:flex; gap:0; border-bottom:1px solid var(--ink-hairline); }
  .opp-meta div { flex:1; padding:14px 32px; border-right:1px solid var(--ink-hairline); }
  .opp-meta div:last-child { border-right:none; }
  .opp-meta .k { font-size:7px; letter-spacing:0.24em; text-transform:uppercase; color:var(--ink-soft); }
  .opp-meta .v { font-size:12px; font-weight:600; margin-top:5px; letter-spacing:0.02em; }
  .opp-body { padding:28px 32px 34px; }
  .opp-teaser { display:grid; grid-template-columns:1.1fr 1fr; gap:28px; padding-bottom:26px; margin-bottom:26px; border-bottom:1px solid var(--ink-hairline); }
  @media (max-width:820px){ .opp-teaser{ grid-template-columns:1fr; } }
  .opp-blurb-h { font-size:9px; letter-spacing:0.26em; text-transform:uppercase; font-weight:700; color:var(--ink-soft); margin-bottom:12px; }
  .opp-blurb { font-size:13.5px; line-height:1.7; letter-spacing:0.01em; text-wrap:pretty; }
  .opp-facts { display:grid; grid-template-columns:1fr 1fr; gap:0 20px; align-content:start; }
  .opp-fact { display:flex; justify-content:space-between; gap:10px; padding:9px 0; border-bottom:1px dotted var(--ink-hairline); font-size:12px; }
  .opp-fact .k { color:var(--ink-soft); }
  .opp-fact .v { font-weight:600; text-align:right; }
  .opp-actions-h { font-size:9px; letter-spacing:0.26em; text-transform:uppercase; font-weight:700; color:var(--ink-soft); margin-bottom:14px; }
  .opp-actions { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  @media (max-width:820px){ .opp-actions{ grid-template-columns:1fr; } }
  .opp-act { text-align:left; border:1px solid var(--ink); background:var(--paper); padding:20px; cursor:pointer; font-family:inherit; color:var(--ink); transition:all .18s ease; display:flex; flex-direction:column; gap:8px; }
  .opp-act:hover { background:var(--ink); color:var(--bg); transform:translateY(-3px); box-shadow:0 14px 32px rgba(0,9,25,0.18); }
  .opp-act.primary { background:var(--ink); color:var(--bg); }
  .opp-act.primary:hover { opacity:0.9; }
  .opp-act .num { font-family:var(--font-display); font-size:22px; }
  .opp-act .t { font-size:13px; letter-spacing:0.06em; text-transform:uppercase; font-weight:700; }
  .opp-act .s { font-size:11px; line-height:1.5; opacity:0.7; letter-spacing:0.02em; }
  .opp-result { margin-top:24px; }
  .opp-sumcard { border:1px solid var(--ink); background:var(--paper); padding:24px 26px; animation:dm-fade .4s ease; }
  .opp-sumcard .h { font-size:9px; letter-spacing:0.28em; text-transform:uppercase; color:var(--ink-soft); font-weight:700; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
  .opp-sumcard .h .dot { width:6px; height:6px; border-radius:50%; background:var(--ink); animation:opp-pulse 2s infinite; }
  .opp-sumcard p { font-size:13.5px; line-height:1.72; letter-spacing:0.01em; margin-bottom:10px; }
  .opp-sumcard .gen { display:flex; flex-direction:column; align-items:center; gap:14px; padding:30px 0; color:var(--ink-soft); }
  .opp-sumcard .gen .orb { width:30px; height:30px; border:2px solid var(--ink-hairline); border-top-color:var(--ink); border-radius:50%; animation:dm-spin .9s linear infinite; }
  .opp-sumcard .gen .msg { font-size:10px; letter-spacing:0.22em; text-transform:uppercase; }
  `;
  const st = document.createElement('style');
  st.id = 'bohio-demos-style';
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ===================== DATA ===================== */
  const MANDATE = {
    items: [
      ['Strategy', 'Value-add & opportunistic development'],
      ['Target sectors', 'Residential · Mixed-use · Hospitality · Logistics'],
      ['Geographies', 'GCC — primarily KSA & UAE'],
      ['Equity ticket', 'SAR 150M – 800M'],
      ['Target net IRR', '≥ 18%'],
      ['Equity multiple', '≥ 1.8×'],
      ['Max LTV', '60%'],
      ['Hold period', '4 – 6 years'],
      ['Constraints', 'Sharia-compliant · ESG screened · no speculative single-tenant office'],
    ],
    text: 'Strategy: value-add & opportunistic development. Target sectors: residential, mixed-use, hospitality, logistics. Geographies: GCC, primarily Saudi Arabia and UAE. Equity ticket SAR 150M-800M. Target net IRR >=18%. Target equity multiple >=1.8x. Max LTV 60%. Hold 4-6 years. Must be Sharia-compliant and ESG screened. Avoid speculative single-tenant office.'
  };

  const DEALS = {
    marina: {
      name: 'Marina Tower', loc: 'Jeddah · Corniche', sector: 'Mixed-use waterfront',
      facts: [['GDV', 'SAR 1.78bn'], ['Equity', 'SAR 520M'], ['Base IRR', '18.4%'], ['Equity multiple', '1.9×'],
              ['LTV', '58%'], ['Hold', '5 years'], ['Geography', 'KSA'], ['Hospitality split', '18% of GFA']],
      text: 'Marina Tower, Jeddah Corniche. 47-storey mixed-use waterfront (residential, branded hospitality, retail podium). GDV SAR 1.78bn, equity SAR 520M, base-case net IRR 18.4%, equity multiple 1.9x, LTV 58%, hold 5 years, hospitality 18% of GFA, Sharia-compliant structure. Saudi Arabia.',
      fallback: { verdict:'PROCEED', fitScore:86, headline:'Squarely in mandate — returns clear the hurdle with a Sharia-compliant structure; underwrite the hospitality split.',
        criteria:[['Strategy','aligned','Opportunistic mixed-use development.'],['Sector','aligned','Residential + hospitality + retail — all in scope.'],['Geography','aligned','Jeddah, KSA — core market.'],['Equity ticket','aligned','SAR 520M within the 150–800M band.'],['Net IRR','aligned','18.4% clears the 18% hurdle.'],['Equity multiple','aligned','1.9× above the 1.8× floor.'],['LTV','aligned','58% inside the 60% cap.'],['Hold','aligned','5-year hold within the 4–6yr window.']],
        strengths:['Waterfront mixed-use in a core KSA market with scarce comparable supply.','Returns clear both the IRR and multiple hurdles with headroom.','Sharia-compliant capital structure already in place.'],
        flags:['Hospitality demand is the dominant swing factor at 18% of GFA.','Construction escalation running ahead of the underwritten base.'],
        recommendation:'Advance to IC. Underwrite a hospitality-occupancy downside and confirm the construction contingency before committing.' } },
    aurora: {
      name: 'Aurora Logistics Park', loc: 'Riyadh · SPARK corridor', sector: 'Last-mile logistics',
      facts: [['GDV', 'SAR 640M'], ['Equity', 'SAR 210M'], ['Base IRR', '21.0%'], ['Equity multiple', '2.1×'],
              ['LTV', '55%'], ['Hold', '4 years'], ['Geography', 'KSA'], ['Pre-let', '65%']],
      text: 'Aurora Logistics Park, Riyadh logistics corridor. Last-mile logistics + light industrial, GDV SAR 640M, equity SAR 210M, base-case net IRR 21%, equity multiple 2.1x, LTV 55%, hold 4 years, 65% pre-let to two investment-grade tenants, Sharia-compliant. Saudi Arabia.',
      fallback: { verdict:'PROCEED', fitScore:82, headline:'Strong-return logistics play in mandate — the open 35% of space is the underwriting question.',
        criteria:[['Strategy','aligned','Development with a value-add lease-up.'],['Sector','aligned','Logistics is a target sector.'],['Geography','aligned','Riyadh, KSA — core market.'],['Equity ticket','aligned','SAR 210M within band.'],['Net IRR','aligned','21% well above the hurdle.'],['Equity multiple','aligned','2.1× above the floor.'],['LTV','aligned','55% inside the cap.'],['Pre-let','partial','65% pre-let; 35% speculative on delivery.']],
        strengths:['Returns are the highest in the current pipeline.','65% pre-let to investment-grade covenants de-risks day-one income.','Structural tailwind from e-commerce and 3PL demand in Riyadh.'],
        flags:['35% of GLA delivered speculative — lease-up timing risk.','Single-corridor concentration with new competing supply.'],
        recommendation:'Advance to IC. Size the speculative lease-up downside and confirm tenant covenant strength before committing.' } },
    helios: {
      name: 'Helios Office Tower', loc: 'Dubai · Business Bay', sector: 'Core single-tenant office',
      facts: [['GDV', 'AED 1.20bn'], ['Equity', 'AED 600M'], ['Base IRR', '11.8%'], ['Equity multiple', '1.5×'],
              ['LTV', '65%'], ['Hold', '7 years'], ['Geography', 'UAE'], ['Pre-let', 'Spec — 0%']],
      text: 'Helios Office Tower, Business Bay Dubai. Core, speculative single-tenant Grade-A office. GDV AED 1.20bn, equity AED 600M (~SAR 612M), base-case net IRR 11.8%, equity multiple 1.5x, LTV 65%, hold 7 years, delivered fully speculative with no pre-leasing. UAE.',
      fallback: { verdict:'PASS', fitScore:34, headline:'Multiple mandate breaches — sub-hurdle returns, excluded sector, LTV and hold both outside policy.',
        criteria:[['Strategy','partial','Core profile, not value-add/opportunistic.'],['Sector','breach','Speculative single-tenant office is explicitly excluded.'],['Geography','aligned','Dubai, UAE — in scope.'],['Equity ticket','aligned','~SAR 612M within band.'],['Net IRR','breach','11.8% falls short of the 18% hurdle.'],['Equity multiple','breach','1.5× below the 1.8× floor.'],['LTV','breach','65% exceeds the 60% cap.'],['Hold','breach','7-year hold beyond the 4–6yr window.']],
        strengths:['Prime Business Bay location with Grade-A specification.','Large, institutional-scale lot size.'],
        flags:['Excluded sector: speculative single-tenant office.','Returns clear neither the IRR nor the multiple hurdle.','LTV and hold period both breach policy limits.'],
        recommendation:'Decline. The deal breaches sector, return, leverage and hold criteria simultaneously — outside mandate without a fundamental re-trade.' } },
  };

  const FUND_C = { lp:'#2A6FA8', co:'#1F8A5B', lender:'#B7791F', jv:'#8F4699', consult:'#3C7C6E', authority:'#C0392B', contractor:'#5A6470' };
  const CAT_LABEL = { lp:'LP Investors', co:'Co-Investors', lender:'Lenders', jv:'JV Partners', consult:'Consultants', authority:'Authorities', contractor:'Contractors' };

  const FUNDS = [
    { id:'f1', name:'Bohio Development Fund I', vintage:'Vintage 2021', strat:'Opportunistic development',
      committed:1.20, called:0.95, deployed:0.88, irr:'19.2%', tvpi:'1.6×', dpi:'0.4×', assets:6,
      pipeline:[ ['Marina Tower','Construction','SAR 520M'], ['Corniche Residences','Lease-up','SAR 180M'],
                 ['Jeddah Logistics Hub','Stabilized','SAR 96M'], ['Al Khobar Mixed-Use','Entitlement','SAR 140M'],
                 ['Riyadh Branded Residences','Construction','SAR 220M'], ['Red Sea Resort JV','Land','SAR 150M'] ],
      stake:{ lp:['Meridian Pension','Gulf Sovereign Co-Mingle','Cedar Family Office'], co:['Aldar Co-Invest','Saudi REIT Sleeve'],
              lender:['SNB Project Finance','Riyad Bank Syndicate'], jv:['Emaar Hospitality','Dar Al Arkan'],
              consult:['Cordoba Capital Markets','JLL Valuation','WSP Engineering'], authority:['Jeddah Municipality','SAGIA'],
              contractor:['Saudi Binladin','Nesma & Partners'] } },
    { id:'f2', name:'Bohio Development Fund II', vintage:'Vintage 2024', strat:'Value-add & development',
      committed:2.10, called:0.84, deployed:0.72, irr:'14.5%', tvpi:'1.2×', dpi:'0.0×', assets:5,
      pipeline:[ ['Aurora Logistics Park','Construction','SAR 210M'], ['NEOM Adjacent Land','Land','SAR 300M'],
                 ['Dammam Waterfront','Entitlement','SAR 240M'], ['Riyadh Office Repositioning','Lease-up','SAR 160M'],
                 ['Madinah Hospitality','Construction','SAR 190M'] ],
      stake:{ lp:['Meridian Pension','Nordic Pension Alliance','GCC Insurance Pool','Khalij Endowment'], co:['PIF Co-Invest Sleeve'],
              lender:['HSBC Middle East','Standard Chartered','SNB Project Finance'], jv:['Majid Al Futtaim','ROSHN'],
              consult:['Cordoba Capital Markets','Knight Frank','AECOM'], authority:['ROSHN Regulatory','MOMRA'],
              contractor:['El Seif Engineering','Almabani'] } },
    { id:'f3', name:'Levant Opportunistic Co-Invest', vintage:'Vintage 2023', strat:'Opportunistic',
      committed:0.65, called:0.52, deployed:0.50, irr:'22.8%', tvpi:'1.7×', dpi:'0.6×', assets:3,
      pipeline:[ ['Amman Mixed-Use','Stabilized','SAR 120M'], ['Beirut Marina Retail','Lease-up','SAR 90M'],
                 ['Cairo New Capital Plot','Construction','SAR 140M'] ],
      stake:{ lp:['Cedar Family Office','Levant Diaspora SPV'], co:['Regional HNW Club'],
              lender:['Arab Bank Syndicate','Audi Project Finance'], jv:['SODIC','Talaat Moustafa'],
              consult:['Cordoba Capital Markets','Savills MENA'], authority:['New Capital Authority'],
              contractor:['Orascom Construction'] } },
    { id:'f4', name:'Bevilacqua Family Office SMA', vintage:'Vintage 2022', strat:'Core-plus & strategic',
      committed:0.90, called:0.74, deployed:0.70, irr:'16.1%', tvpi:'1.4×', dpi:'0.5×', assets:7,
      pipeline:[ ['Milan Brera Residences','Stabilized','SAR 110M'], ['London Build-to-Rent','Lease-up','SAR 130M'],
                 ['Lisbon Mixed-Use','Construction','SAR 95M'], ['Dubai Hills Villas','Stabilized','SAR 85M'],
                 ['Riyadh Logistics Box','Entitlement','SAR 70M'] ],
      stake:{ lp:['Bevilacqua Holdings'], co:['Single-Family Partner Club'],
              lender:['UBS Real Estate','Intesa Sanpaolo'], jv:['Hines Europe','Related Midwest'],
              consult:['Cordoba Capital Markets','CBRE Advisory','Arup'], authority:['Comune di Milano'],
              contractor:['Webuild S.p.A.'] } },
  ];

  /* ===================== DEAL SCREENING ===================== */
  let currentDeal = 'helios';
  let lastScreen = null;

  window.renderScreening = function () {
    const page = document.getElementById('page-screening');
    if (!page) return;
    if (page.dataset.built === '1') return;
    page.dataset.built = '1';
    page.innerHTML = `
      <div class="section-header">
        <div>
          <span class="dm-eyebrow">Karaya Intelligence <span class="dm-new-badge">New</span></span>
          <h2 class="section-title" style="margin-top:8px;">AI Deal Screening</h2>
          <p class="dm-sub">Drop in an incoming opportunity and Karaya screens it against your investment mandate in seconds — sector, geography, ticket, returns, leverage and hold — then gives a committee-ready verdict.</p>
        </div>
      </div>

      <div class="sc-top">
        <div class="sc-panel dm-card">
          <div class="sc-panel-h"><span class="t">Investment Mandate</span><span style="font-size:9px;letter-spacing:0.16em;color:var(--ink-soft);text-transform:uppercase;">Bohio Capital</span></div>
          <div id="sc-mandate"></div>
        </div>
        <div class="sc-panel dm-card">
          <div class="sc-panel-h"><span class="t">Incoming Deal</span><span style="font-size:9px;letter-spacing:0.16em;color:var(--ink-soft);text-transform:uppercase;">Deal inbox</span></div>
          <div class="sc-deal-tabs" id="sc-deal-tabs"></div>
          <div id="sc-deal-body"></div>
        </div>
      </div>

      <div class="sc-run">
        <button class="dm-btn" id="sc-run-btn" onclick="screenDeal()">Screen against mandate</button>
        <span class="hint">Karaya reads the deal and scores it live against all nine mandate criteria.</span>
      </div>

      <div class="sc-scan dm-card" id="sc-scan">
        <div class="orb"></div>
        <div class="msg" id="sc-scan-msg">Karaya is screening the deal…</div>
        <div class="crit-scan" id="sc-scan-list"></div>
      </div>

      <div class="sc-result" id="sc-result"></div>`;

    document.getElementById('sc-mandate').innerHTML = MANDATE.items.map(
      ([k, v]) => `<div class="sc-mandate-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
    document.getElementById('sc-deal-tabs').innerHTML = Object.keys(DEALS).map(
      k => `<button class="sc-deal-tab${k === currentDeal ? ' active' : ''}" onclick="pickDeal('${k}')">${DEALS[k].name}</button>`).join('');
    renderDealBody();
  };

  function renderDealBody() {
    const d = DEALS[currentDeal];
    document.getElementById('sc-deal-body').innerHTML = `
      <div class="sc-deal-name">${d.name}</div>
      <div class="sc-deal-loc">${d.loc} · ${d.sector}</div>
      <div class="sc-deal-facts">${d.facts.map(([k, v]) => `<div class="sc-fact"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>`;
  }

  window.pickDeal = function (k) {
    currentDeal = k;
    document.querySelectorAll('#sc-deal-tabs .sc-deal-tab').forEach(t => t.classList.toggle('active', t.textContent === DEALS[k].name));
    renderDealBody();
    const res = document.getElementById('sc-result'); res.classList.remove('show'); res.innerHTML = '';
  };

  const SCAN_STEPS = ['Parsing deal terms', 'Matching sector & geography', 'Testing return hurdles', 'Checking leverage & hold', 'Screening constraints', 'Forming verdict'];

  window.screenDeal = async function () {
    const btn = document.getElementById('sc-run-btn');
    const scan = document.getElementById('sc-scan');
    const res = document.getElementById('sc-result');
    res.classList.remove('show'); res.innerHTML = '';
    btn.disabled = true;
    scan.classList.add('show');
    const list = document.getElementById('sc-scan-list');
    list.innerHTML = SCAN_STEPS.map((s, i) => `<div class="cs-row" id="cs-${i}"><span class="tick"></span>${s}</div>`).join('');
    let si = 0;
    const scanTimer = setInterval(() => {
      if (si > 0) { const p = document.getElementById('cs-' + (si - 1)); if (p) p.querySelector('.tick').textContent = '✓'; }
      const cur = document.getElementById('cs-' + si);
      if (cur) cur.classList.add('in');
      si++;
      if (si > SCAN_STEPS.length) clearInterval(scanTimer);
    }, 520);

    const d = DEALS[currentDeal];
    let result = null;
    try {
      const prompt = `You are Karaya, an institutional real-estate investment AI. Screen the DEAL against the firm's MANDATE and return ONLY valid minified JSON — no markdown, no prose outside JSON.

MANDATE: ${MANDATE.text}

DEAL: ${d.text}

Return exactly this shape:
{"verdict":"PROCEED"|"REVIEW"|"PASS","fitScore":<integer 0-100>,"headline":"<=140 chars","criteria":[{"name":"Strategy","status":"aligned"|"partial"|"breach","note":"<=90 chars"}, ... one row each for Strategy, Sector, Geography, Equity ticket, Net IRR, Equity multiple, LTV, Hold],"strengths":["",""],"flags":["",""],"recommendation":"<=200 chars, committee-ready"}
verdict logic: PROCEED if it broadly fits and clears return hurdles; REVIEW if mixed/partial; PASS if multiple breaches. Be rigorous and specific to the numbers.`;
      const raw = await window.claude.complete({ messages: [{ role: 'user', content: prompt }] });
      result = parseScreen(raw);
    } catch (e) { result = null; }
    if (!result) result = normalizeFallback(d.fallback);
    // if the model omitted/zeroed the score, derive one from the criteria mix
    if (!result.fitScore) {
      const wt = { aligned: 100, partial: 55, breach: 10 };
      const vals = (result.criteria || []).map(c => wt[c.status] != null ? wt[c.status] : 55);
      result.fitScore = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : d.fallback.fitScore;
    }

    // ensure scan visibly completes
    await wait(Math.max(0, (SCAN_STEPS.length * 520) - (Date.now() % 1)) > 1400 ? 600 : 900);
    clearInterval(scanTimer);
    document.querySelectorAll('#sc-scan-list .tick').forEach(t => t.textContent = '✓');
    await wait(350);
    scan.classList.remove('show');
    btn.disabled = false;
    lastScreen = result;
    paintResult(result, d);
  };

  function parseScreen(raw) {
    if (!raw) return null;
    try {
      let s = String(raw).trim().replace(/^```(json)?/i, '').replace(/```$/,'').trim();
      const a = s.indexOf('{'), b = s.lastIndexOf('}');
      if (a < 0 || b < 0) return null;
      const obj = JSON.parse(s.slice(a, b + 1));
      if (!obj.verdict || !Array.isArray(obj.criteria)) return null;
      obj.verdict = String(obj.verdict).toUpperCase();
      obj.fitScore = Math.max(0, Math.min(100, parseInt(obj.fitScore) || 0));
      obj.criteria = obj.criteria.map(c => ({ name: c.name || '', status: (c.status || 'partial').toLowerCase(), note: c.note || '' }));
      obj.strengths = obj.strengths || []; obj.flags = obj.flags || [];
      return obj;
    } catch (e) { return null; }
  }
  function normalizeFallback(f) {
    return { verdict: f.verdict, fitScore: f.fitScore, headline: f.headline,
      criteria: f.criteria.map(c => ({ name: c[0], status: c[1], note: c[2] })),
      strengths: f.strengths, flags: f.flags, recommendation: f.recommendation };
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function paintResult(r, d) {
    const vClass = r.verdict === 'PROCEED' ? 'v-proceed' : r.verdict === 'PASS' ? 'v-pass' : 'v-review';
    const res = document.getElementById('sc-result');
    res.innerHTML = `
      <div class="sc-verdict-wrap dm-card">
        <div>
          <div class="sc-gauge">
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(0,9,25,0.08)" stroke-width="14"/>
              <circle id="sc-gauge-arc" cx="100" cy="100" r="80" fill="none" stroke-width="14" stroke-linecap="butt"
                      stroke-dasharray="502.6" stroke-dashoffset="502.6"/>
            </svg>
            <div class="sc-gauge-num"><span class="n" id="sc-gauge-n">0</span><span class="l">Mandate fit</span></div>
          </div>
        </div>
        <div>
          <div class="dm-eyebrow">Verdict · ${d.name}</div>
          <div style="margin:14px 0 6px;"><span class="sc-stamp ${vClass}" id="sc-stamp">${r.verdict}</span></div>
          <p class="sc-headline">${esc(r.headline)}</p>
        </div>
      </div>

      <div class="sc-cols">
        <div class="sc-panel dm-card">
          <div class="sc-panel-h"><span class="t">Criteria alignment</span></div>
          <div class="sc-crit" id="sc-crit"></div>
        </div>
        <div>
          <div class="sc-panel dm-card" style="margin-bottom:20px;">
            <div class="sc-list-h"><span class="d-aligned" style="width:8px;height:8px;border-radius:50%;display:inline-block;"></span> What works</div>
            ${(r.strengths||[]).map(s => `<div class="sc-li good">${esc(s)}</div>`).join('') || '<div class="sc-li">—</div>'}
          </div>
          <div class="sc-panel dm-card">
            <div class="sc-list-h"><span class="d-breach" style="width:8px;height:8px;border-radius:50%;display:inline-block;"></span> Watch-outs</div>
            ${(r.flags||[]).map(s => `<div class="sc-li bad">${esc(s)}</div>`).join('') || '<div class="sc-li">—</div>'}
          </div>
        </div>
      </div>

      <div class="sc-rec">
        <div class="l">Karaya recommendation</div>
        <div class="t">${esc(r.recommendation)}</div>
      </div>

      <div class="sc-actions">
        <button class="dm-btn" onclick="generateICMemo()">Generate IC memo</button>
        <button class="dm-btn ghost" onclick="document.getElementById('sc-chat-input').focus()">Ask a follow-up</button>
      </div>

      <div class="sc-chat dm-card">
        <div class="sc-panel-h"><span class="t">Ask Karaya about this deal</span></div>
        <div class="sc-chat-thread" id="sc-chat-thread"></div>
        <div class="sc-chat-in">
          <input id="sc-chat-input" placeholder="e.g. What would have to be true for this to clear our hurdle?" onkeypress="if(event.key==='Enter')screeningChatSend()"/>
          <button class="dm-btn" onclick="screeningChatSend()">Ask</button>
        </div>
      </div>`;
    res.classList.add('show');

    const arc = document.getElementById('sc-gauge-arc');
    const col = r.verdict === 'PROCEED' ? '#1F8A5B' : r.verdict === 'PASS' ? '#C0392B' : '#B7791F';
    arc.setAttribute('stroke', col);
    const C = 502.6;
    setTimeout(() => { arc.style.transition = 'stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)'; arc.style.strokeDashoffset = String(C * (1 - r.fitScore / 100)); }, 120);
    animateCount(document.getElementById('sc-gauge-n'), r.fitScore, 1300);
    setTimeout(() => document.getElementById('sc-stamp').classList.add('in'), 380);

    const crit = document.getElementById('sc-crit');
    crit.innerHTML = r.criteria.map(c => {
      const dc = c.status === 'aligned' ? 'd-aligned' : c.status === 'breach' ? 'd-breach' : 'd-partial';
      return `<div class="sc-crit-row"><span class="sc-crit-dot ${dc}"></span><span class="sc-crit-name">${esc(c.name)}</span><span class="sc-crit-note">${esc(c.note)}</span></div>`;
    }).join('');
    [...crit.children].forEach((row, i) => setTimeout(() => row.classList.add('in'), 500 + i * 110));
  }

  function animateCount(el, to, dur) {
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    // guarantee the terminal value even if rAF is throttled/never fires
    setTimeout(() => { el.textContent = Math.round(to); }, dur + 60);
  }

  window.screeningChatSend = async function () {
    const inp = document.getElementById('sc-chat-input');
    const q = inp.value.trim(); if (!q) return;
    inp.value = '';
    const thread = document.getElementById('sc-chat-thread');
    thread.insertAdjacentHTML('beforeend', `<div class="sc-msg user">${esc(q)}</div>`);
    const id = 'm' + Date.now();
    thread.insertAdjacentHTML('beforeend', `<div class="sc-msg bot" id="${id}"><em style="opacity:.6">Karaya is thinking…</em></div>`);
    thread.scrollTop = thread.scrollHeight;
    const d = DEALS[currentDeal];
    let ans = '';
    try {
      const ctx = `You are Karaya, an institutional real-estate investment AI. The firm's mandate: ${MANDATE.text}\nThe deal under review: ${d.text}\nYour screening verdict was ${lastScreen ? lastScreen.verdict + ' (' + lastScreen.fitScore + '/100): ' + lastScreen.headline : 'n/a'}.\nAnswer the user concisely (max 90 words), specific to the numbers, in a professional investment tone.`;
      ans = await window.claude.complete({ messages: [{ role: 'user', content: ctx + '\n\nQuestion: ' + q }] });
    } catch (e) { ans = 'I lost connection to the model for a moment — please ask that again.'; }
    const el = document.getElementById(id);
    el.innerHTML = esc(ans) + '<span class="who">Karaya</span>';
    thread.scrollTop = thread.scrollHeight;
  };

  /* ===================== IC MEMO ===================== */
  window.generateICMemo = async function () {
    let ov = document.getElementById('icm-overlay');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'icm-overlay'; ov.className = 'icm-overlay';
      ov.innerHTML = `<div class="icm-doc"><div class="icm-head"><span class="t">Investment Committee Memo · Draft</span><button class="x" onclick="closeICMemo()">Close</button></div><div id="icm-content"></div></div>`;
      ov.addEventListener('click', e => { if (e.target === ov) closeICMemo(); });
      document.body.appendChild(ov);
    }
    ov.classList.add('show');
    const c = document.getElementById('icm-content');
    c.innerHTML = `<div class="icm-gen"><div class="orb"></div><div class="msg">Karaya is drafting the committee memo…</div></div>`;
    const d = DEALS[currentDeal];
    const r = lastScreen || normalizeFallback(d.fallback);
    let memo = '';
    try {
      const prompt = `You are Karaya drafting a concise institutional Investment Committee memo for the deal below, written for a real-estate private-equity IC. Use the screening result. Return PLAIN TEXT with these section headers on their own lines exactly: RECOMMENDATION, OPPORTUNITY, MANDATE FIT, RETURNS, KEY RISKS, CONDITIONS. Keep each section 2-4 sentences, specific to the numbers, no markdown symbols.

DEAL: ${d.text}
SCREENING: verdict ${r.verdict}, fit ${r.fitScore}/100. ${r.headline} Recommendation: ${r.recommendation}
STRENGTHS: ${(r.strengths||[]).join('; ')}
FLAGS: ${(r.flags||[]).join('; ')}`;
      memo = await window.claude.complete({ messages: [{ role: 'user', content: prompt }] });
    } catch (e) { memo = ''; }
    if (!memo || memo.length < 40) memo = fallbackMemo(d, r);
    c.innerHTML = `<div class="icm-body">
      <div class="m-title">${d.name}</div>
      <div class="m-meta">Investment Committee Memo · ${d.loc} · Prepared by Karaya · Confidential</div>
      ${memoToHtml(memo)}
    </div>`;
  };
  window.closeICMemo = function () { const ov = document.getElementById('icm-overlay'); if (ov) ov.classList.remove('show'); };

  function memoToHtml(text) {
    const heads = ['RECOMMENDATION','OPPORTUNITY','MANDATE FIT','RETURNS','KEY RISKS','CONDITIONS'];
    let html = ''; const lines = String(text).split(/\n+/); let buf = [];
    function flush(h) { if (h) html += `<h4>${h}</h4>`; if (buf.length) { html += `<p>${esc(buf.join(' ')).trim()}</p>`; buf = []; } }
    let started = false, curHead = null;
    lines.forEach(line => {
      const t = line.trim(); if (!t) return;
      const m = heads.find(h => t.toUpperCase().replace(/[:\s]+$/,'') === h || t.toUpperCase().startsWith(h));
      if (m) { flush(null); if (curHead !== null || started) {} curHead = m; html += `<h4>${m}</h4>`; started = true;
        const rest = t.slice(m.length).replace(/^[:\-\s]+/, ''); if (rest) buf.push(rest); }
      else buf.push(t);
    });
    flush(null);
    return html || `<p>${esc(text)}</p>`;
  }
  function fallbackMemo(d, r) {
    return `RECOMMENDATION
${r.recommendation}

OPPORTUNITY
${d.name} (${d.loc}) — ${d.sector}. ${d.facts.map(f=>f[0]+' '+f[1]).slice(0,4).join(', ')}.

MANDATE FIT
Karaya scored the deal ${r.fitScore}/100 against the firm's mandate, returning a ${r.verdict} verdict. ${r.headline}

RETURNS
${d.facts.filter(f=>/IRR|multiple|Equity|GDV/i.test(f[0])).map(f=>f[0]+': '+f[1]).join('. ')}.

KEY RISKS
${(r.flags||[]).join(' ')}

CONDITIONS
Advance subject to confirmatory due diligence on the flagged items, final legal and a downside sensitivity pack before capital is committed.`;
  }

  /* ===================== OPPORTUNITY HUB (workspace tie-in) ===================== */
  // A new deal lands as a project squircle; this hub gives the document-style
  // actions: Summarise · Generate deliverable · Screen with AI.
  const OPP_META = {
    aurora: { via: 'Cordoba Capital Markets', received: 'Today · 09:12', asset: 'Last-mile logistics', stage: 'Teaser + OM received' },
    helios: { via: 'Crescent Advisory', received: 'Today · 11:40', asset: 'Core office', stage: 'Teaser received' },
    marina: { via: 'Cordoba Capital Markets', received: 'Yesterday', asset: 'Mixed-use waterfront', stage: 'OM received' },
  };

  window.openOpportunity = function (key) {
    currentDeal = key;
    const d = DEALS[key]; if (!d) return;
    const m = OPP_META[key] || { via: 'Deal inbox', received: 'Today', asset: d.sector, stage: 'Received' };
    let ov = document.getElementById('opp-overlay');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'opp-overlay'; ov.className = 'opp-overlay';
      ov.addEventListener('click', e => { if (e.target === ov) closeOpportunity(); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = `
      <div class="opp-sheet">
        <div class="opp-head">
          <div>
            <div class="opp-eyebrow">Inbound deal · Bohio</div>
            <h2 class="opp-title">${esc(d.name)}<span class="opp-pill">New Opportunity</span></h2>
          </div>
          <button class="opp-x" onclick="closeOpportunity()">Close</button>
        </div>
        <div class="opp-meta">
          <div><div class="k">Received via</div><div class="v">${esc(m.via)}</div></div>
          <div><div class="k">When</div><div class="v">${esc(m.received)}</div></div>
          <div><div class="k">Location</div><div class="v">${esc(d.loc)}</div></div>
          <div><div class="k">Status</div><div class="v">${esc(m.stage)}</div></div>
        </div>
        <div class="opp-body">
          <div class="opp-teaser">
            <div>
              <div class="opp-blurb-h">The opportunity</div>
              <p class="opp-blurb">${esc(d.text)}</p>
            </div>
            <div>
              <div class="opp-blurb-h">Headline terms</div>
              <div class="opp-facts">${d.facts.map(f => `<div class="opp-fact"><span class="k">${esc(f[0])}</span><span class="v">${esc(f[1])}</span></div>`).join('')}</div>
            </div>
          </div>
          <div class="opp-actions-h">What would you like Karaya to do?</div>
          <div class="opp-actions">
            <button class="opp-act" onclick="oppSummarise()">
              <span class="num">01</span><span class="t">Summarise</span>
              <span class="s">Karaya reads the OM and distils the opportunity into a short briefing.</span>
            </button>
            <button class="opp-act" onclick="oppDeliverable()">
              <span class="num">02</span><span class="t">Generate Deliverable</span>
              <span class="s">Draft an investment-committee memo, ready to circulate.</span>
            </button>
            <button class="opp-act primary" onclick="oppScreen()">
              <span class="num">03</span><span class="t">Screen with AI →</span>
              <span class="s">Score it against your mandate for a PROCEED / PASS verdict.</span>
            </button>
          </div>
          <div class="opp-result" id="opp-result"></div>
        </div>
      </div>`;
    ov.classList.add('show');
    ov.querySelector('.opp-sheet').scrollTop = 0;
  };
  window.closeOpportunity = function () { const o = document.getElementById('opp-overlay'); if (o) o.classList.remove('show'); };

  window.oppSummarise = async function () {
    const host = document.getElementById('opp-result'); if (!host) return;
    const d = DEALS[currentDeal];
    host.innerHTML = `<div class="opp-sumcard"><div class="h"><span class="dot"></span>Karaya is reading the opportunity…</div><div class="gen"><div class="orb"></div><div class="msg">Distilling the OM</div></div></div>`;
    host.scrollIntoView({ block: 'nearest' });
    let txt = '';
    try {
      const prompt = `You are Karaya, an institutional real-estate investment AI. In 3 short paragraphs, summarise this incoming deal for a busy principal: (1) what the opportunity is, (2) the headline economics, (3) the single biggest thing to verify. Plain text, no markdown headers.\n\nDEAL: ${d.text}`;
      txt = await window.claude.complete({ messages: [{ role: 'user', content: prompt }] });
    } catch (e) { txt = ''; }
    if (!txt || txt.length < 30) {
      txt = `${d.name} (${d.loc}) is a ${d.sector.toLowerCase()} opportunity sourced via ${(OPP_META[currentDeal]||{}).via || 'the deal inbox'}.\n\nHeadline economics: ${d.facts.map(f=>f[0]+' '+f[1]).slice(0,5).join(', ')}.\n\n${d.fallback.headline} The key item to verify before committing is the assumption highlighted in the flags: ${(d.fallback.flags||[])[0]||'the base-case demand assumption'}.`;
    }
    const paras = String(txt).split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
    host.innerHTML = `<div class="opp-sumcard"><div class="h"><span class="dot"></span>Karaya briefing · ${esc(d.name)}</div>${paras}
      <div style="display:flex;gap:12px;margin-top:18px;flex-wrap:wrap;">
        <button class="dm-btn" onclick="oppScreen()">Screen against mandate →</button>
        <button class="dm-btn ghost" onclick="oppDeliverable()">Generate IC memo</button>
      </div></div>`;
    host.scrollIntoView({ block: 'nearest' });
  };

  window.oppDeliverable = function () {
    // reuse the real-AI IC memo generator, scoped to this deal
    if (typeof window.generateICMemo === 'function') window.generateICMemo();
  };

  window.oppScreen = function () {
    closeOpportunity();
    if (typeof goTo === 'function') goTo('screening');
    setTimeout(() => {
      if (typeof window.pickDeal === 'function') window.pickDeal(currentDeal);
      if (typeof window.screenDeal === 'function') window.screenDeal();
    }, 120);
  };

  /* ===================== FUNDS & STAKEHOLDERS ===================== */
  let currentFund = null;

  window.renderFunds = function () {
    const page = document.getElementById('page-funds');
    if (!page) return;
    if (page.dataset.built === '1') { /* re-animate bars */ requestAnimationFrame(animateFundBars); return; }
    page.dataset.built = '1';

    const totCommit = FUNDS.reduce((s, f) => s + f.committed, 0);
    const totDeploy = FUNDS.reduce((s, f) => s + f.deployed, 0);
    const totCalled = FUNDS.reduce((s, f) => s + f.called, 0);
    const totAssets = FUNDS.reduce((s, f) => s + f.assets, 0);
    const totStake = FUNDS.reduce((s, f) => s + Object.values(f.stake).reduce((a, b) => a + b.length, 0), 0);
    const wIrr = (FUNDS.reduce((s, f) => s + parseFloat(f.irr) * f.committed, 0) / totCommit).toFixed(1);

    page.innerHTML = `
      <div class="section-header">
        <div>
          <span class="dm-eyebrow">Capital & Stakeholders <span class="dm-new-badge">New</span></span>
          <h2 class="section-title" style="margin-top:8px;">Funds & Stakeholders</h2>
          <p class="dm-sub">One command center for every development fund — capital deployed, the live project pipeline, and the full web of LPs, lenders, JV partners, consultants and authorities behind each mandate.</p>
        </div>
      </div>

      <div class="fd-kpis">
        <div class="fd-kpi"><div class="n">SAR ${totCommit.toFixed(2)}bn</div><div class="l">Committed capital</div></div>
        <div class="fd-kpi"><div class="n">SAR ${totDeploy.toFixed(2)}bn</div><div class="l">Deployed</div></div>
        <div class="fd-kpi"><div class="n">SAR ${(totCommit - totCalled).toFixed(2)}bn</div><div class="l">Dry powder</div></div>
        <div class="fd-kpi"><div class="n">${wIrr}%</div><div class="l">Wtd net IRR</div></div>
        <div class="fd-kpi"><div class="n">${totAssets}</div><div class="l">Active developments</div></div>
        <div class="fd-kpi"><div class="n">${totStake}</div><div class="l">Stakeholders</div></div>
      </div>

      <div class="fd-grid" id="fd-grid"></div>
      <div class="fd-detail" id="fd-detail"></div>`;

    document.getElementById('fd-grid').innerHTML = FUNDS.map(f => {
      const calledPct = Math.round(f.called / f.committed * 100);
      const deployPct = Math.round(f.deployed / f.committed * 100);
      return `<div class="fd-fund" id="fund-${f.id}" onclick="selectFund('${f.id}')">
        <div class="fd-fund-name">${f.name}</div>
        <div class="fd-fund-meta">${f.vintage} · ${f.strat}</div>
        <div class="fd-fund-stats">
          <div class="fd-fund-stat"><div class="n">${f.irr}</div><div class="l">Net IRR</div></div>
          <div class="fd-fund-stat"><div class="n">${f.tvpi}</div><div class="l">TVPI</div></div>
          <div class="fd-fund-stat"><div class="n">${f.assets}</div><div class="l">Assets</div></div>
        </div>
        <div class="fd-bar"><div class="fd-bar-top"><span class="fd-bar-k">Called</span><span>${calledPct}%</span></div><div class="fd-bar-track"><div class="fd-bar-fill" data-pct="${calledPct}"></div></div></div>
        <div class="fd-bar"><div class="fd-bar-top"><span class="fd-bar-k">Deployed</span><span>${deployPct}%</span></div><div class="fd-bar-track"><div class="fd-bar-fill" data-pct="${deployPct}"></div></div></div>
      </div>`;
    }).join('');
    requestAnimationFrame(animateFundBars);
    // open the first fund by default for an immediate "wow"
    selectFund(FUNDS[0].id);
  };

  function animateFundBars() {
    document.querySelectorAll('#fd-grid .fd-bar-fill').forEach(b => { b.style.width = (b.dataset.pct || 0) + '%'; });
  }

  window.selectFund = function (id) {
    currentFund = id;
    const f = FUNDS.find(x => x.id === id); if (!f) return;
    document.querySelectorAll('.fd-fund').forEach(c => c.classList.toggle('active', c.id === 'fund-' + id));
    const stakeCount = Object.values(f.stake).reduce((a, b) => a + b.length, 0);
    const stages = ['Land', 'Entitlement', 'Construction', 'Lease-up', 'Stabilized'];
    const detail = document.getElementById('fd-detail');
    detail.innerHTML = `
      <div class="fd-detail-h">
        <div><div class="nm">${f.name}</div><div class="mt">${f.vintage} · ${f.strat} · ${f.assets} active developments · ${stakeCount} stakeholders</div></div>
        <div style="display:flex;gap:22px;">
          <div style="text-align:right;"><div style="font-family:var(--font-display);font-size:24px;">${f.irr}</div><div style="font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-top:4px;">Net IRR</div></div>
          <div style="text-align:right;"><div style="font-family:var(--font-display);font-size:24px;">${f.tvpi}</div><div style="font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-top:4px;">TVPI</div></div>
          <div style="text-align:right;"><div style="font-family:var(--font-display);font-size:24px;">${f.dpi}</div><div style="font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-top:4px;">DPI</div></div>
        </div>
      </div>

      <div class="fd-block" style="margin-bottom:22px;">
        <div class="fd-block-h"><span>Capital deployment</span><span class="tag">SAR bn</span></div>
        <div class="fd-cap-cols">
          <div>
            ${capRow('Committed', f.committed, f.committed, '#000919')}
            ${capRow('Called', f.called, f.committed, '#2A6FA8')}
            ${capRow('Deployed', f.deployed, f.committed, '#1F8A5B')}
            ${capRow('Dry powder', f.committed - f.called, f.committed, '#B7791F')}
          </div>
          <div style="font-size:11px;line-height:1.7;color:var(--ink-soft);align-self:center;">
            <strong style="color:var(--ink);font-weight:600;">${Math.round(f.deployed / f.committed * 100)}%</strong> of committed capital is at work across <strong style="color:var(--ink);font-weight:600;">${f.assets}</strong> developments, with <strong style="color:var(--ink);font-weight:600;">SAR ${(f.committed - f.called).toFixed(2)}bn</strong> of dry powder still to call.
          </div>
        </div>
      </div>

      <div class="fd-block" style="margin-bottom:22px;">
        <div class="fd-block-h"><span>Stakeholder structure</span><span class="tag" style="letter-spacing:0.2em;">CAPITAL · FUND · PORTFOLIO · DELIVERY</span></div>
        <div style="border:1px solid var(--ink-hairline);background:var(--bg);overflow:hidden;">${buildFundStructureSVG(f)}</div>
        <div class="fd-sh-legend">${Object.keys(CAT_LABEL).map(k => `<span class="fd-leg"><span class="sw" style="background:${FUND_C[k]}"></span>${CAT_LABEL[k]}</span>`).join('')}</div>
        <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--ink-hairline);">
          <div style="font-size:8px;letter-spacing:0.3em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px;">Ask a stakeholder's AI agent</div>
          <div class="fd-sh-grid">${stakeCards(f)}</div>
        </div>
      </div>

      <div class="fd-block" style="padding-bottom:8px;">
        <div class="fd-block-h"><span>Development pipeline</span><span class="tag">${f.assets} projects · by stage</span></div>
        <div class="fd-pipe">
          ${stages.map(stg => {
            const items = f.pipeline.filter(p => p[1] === stg);
            return `<div class="fd-stage"><div class="fd-stage-h"><span>${stg}</span><span class="ct">${items.length}</span></div>
              ${items.map(p => `<div class="fd-proj">${p[0]}<div class="e">${p[2]}</div></div>`).join('')}</div>`;
          }).join('')}
        </div>
      </div>`;
    detail.classList.add('show');
    // animate capital fills
    requestAnimationFrame(() => detail.querySelectorAll('.fd-flow-fill').forEach(el => { el.style.width = el.dataset.w + '%'; }));
  };

  // colorful tiered structure chart — mirrors the workspace project Deal Structure Chart
  function buildFundStructureSVG(f) {
    const RB_GREEN = '#61BB46', RB_YELLOW = '#FDB827', RB_ORANGE = '#F58220',
          RB_RED = '#E03A3C', RB_VIOLET = '#963D97', RB_BLUE = '#009DDC',
          WHITE = '#ffffff', SOFT_WHITE = 'rgba(255,255,255,0.78)';
    const INK = '#000919', SOFT = 'rgba(0,9,25,0.55)', BG = '#F5F2ED';
    const W = 1100, PAD = 30;

    const lps = (f.stake.lp || []).map(n => ({ name: n, role: 'LP Investor' }));
    const cos = (f.stake.co || []).map(n => ({ name: n, role: 'Co-Investor' }));
    const equity = [...lps, ...cos];
    const lenders = (f.stake.lender || []);
    const advisors = [...(f.stake.consult || []).map(n => ({ name: n, role: 'Consultant' })),
                      ...(f.stake.authority || []).map(n => ({ name: n, role: 'Authority' }))];
    const delivery = [...(f.stake.jv || []).map(n => ({ name: n, role: 'JV Partner' })),
                      ...(f.stake.contractor || []).map(n => ({ name: n, role: 'Contractor' }))];

    const eqCount = equity.length, eqGap = 14, maxEqW = 195, minEqW = 128;
    const eqAvail = W - PAD * 2 - 200 - 200 - (eqCount - 1) * eqGap;
    const eqW = Math.max(minEqW, Math.min(maxEqW, Math.floor(eqAvail / Math.max(eqCount, 1))));
    const eqH = 64, eqTotalW = eqCount * eqW + (eqCount - 1) * eqGap, eqStartX = (W - eqTotalW) / 2, eqY = 36;
    const spvW = 320, spvH = 76, spvX = (W - spvW) / 2, spvY = 178;
    const portW = 340, portH = 70, portX = (W - portW) / 2, portY = 316;
    const delW = 196, delH = 58, delGap = 16;
    const delCount = delivery.length, delTotalW = delCount * delW + (delCount - 1) * delGap;
    const delStartX = (W - delTotalW) / 2, delY = 448;
    const sideW = 190, sideH = 54, sideGap = 12;
    const debtX = W - sideW - PAD, sideStartY = 178;
    const advX = PAD;

    const bottomMost = Math.max(
      delivery.length ? delY + delH : portY + portH,
      sideStartY + lenders.length * (sideH + sideGap) - sideGap,
      sideStartY + advisors.length * (sideH + sideGap) - sideGap
    );
    const H = bottomMost + 34;

    const esc2 = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const trunc = (t, m) => { t = t || ''; return t.length > m ? t.slice(0, m - 1) + '…' : t; };
    function box(x, y, w, h, eyebrow, label, sub, fill, labelCol, eyeCol, stroke, sw) {
      fill = fill || '#fff'; labelCol = labelCol || INK; eyeCol = eyeCol || SOFT;
      const px = 11;
      const eM = Math.floor((w - px * 2) / 4.4), lM = Math.floor((w - px * 2) / 6.3), sM = Math.floor((w - px * 2) / 4.8);
      return `<g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke || INK}" stroke-width="${sw || 1.2}" rx="12" ry="12"/>
        <text x="${x + px}" y="${y + 15}" font-size="7" letter-spacing="1.8" fill="${eyeCol}" font-weight="600">${esc2(trunc(eyebrow, eM).toUpperCase())}</text>
        <text x="${x + px}" y="${y + 32}" font-size="10.5" letter-spacing="1" fill="${labelCol}" font-weight="700">${esc2(trunc(label, lM).toUpperCase())}</text>
        ${sub ? `<text x="${x + px}" y="${y + h - 10}" font-size="7.5" letter-spacing="1.2" fill="${eyeCol}">${esc2(trunc(sub, sM).toUpperCase())}</text>` : ''}
      </g>`;
    }
    const ln = (d, dash) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1"${dash ? ' stroke-dasharray="3 3" opacity="0.55"' : ''}/>`;

    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block;font-family:inherit;background:${BG};">`;

    // connectors
    const busY = (eqY + eqH + spvY) / 2;
    const spvCx = spvX + spvW / 2, spvCy = spvY + spvH / 2;
    equity.forEach((t, i) => {
      const cx = eqStartX + i * (eqW + eqGap) + eqW / 2;
      svg += ln(`M ${cx} ${eqY + eqH} L ${cx} ${busY} L ${spvCx} ${busY} L ${spvCx} ${spvY}`);
    });
    svg += ln(`M ${spvCx} ${spvY + spvH} L ${spvCx} ${portY}`);
    const portCy = portY + portH / 2;
    if (delivery.length) {
      const delBusY = (portY + portH + delY) / 2;
      svg += ln(`M ${spvCx} ${portY + portH} L ${spvCx} ${delBusY}`);
      delivery.forEach((t, i) => {
        const cx = delStartX + i * (delW + delGap) + delW / 2;
        svg += ln(`M ${spvCx} ${delBusY} L ${cx} ${delBusY} L ${cx} ${delY}`);
      });
    }
    // lenders -> vehicle (right)
    const spvRight = spvX + spvW;
    lenders.forEach((t, i) => {
      const y = sideStartY + i * (sideH + sideGap) + sideH / 2;
      svg += ln(`M ${debtX} ${y} L ${spvRight + 22} ${y} L ${spvRight + 22} ${spvCy} L ${spvRight} ${spvCy}`);
    });
    // advisors -> portfolio (left, dashed)
    advisors.forEach((a, i) => {
      const y = sideStartY + i * (sideH + sideGap) + sideH / 2;
      svg += `<path d="M ${advX + sideW} ${y} L ${portX - 22} ${y} L ${portX - 22} ${portCy} L ${portX} ${portCy}" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="3 3" opacity="0.55"/>`;
    });

    // equity boxes
    const LP_FILLS = [RB_YELLOW, RB_ORANGE];
    let lpIdx = 0;
    equity.forEach((t, i) => {
      const x = eqStartX + i * (eqW + eqGap);
      const isLead = i === 0;
      let fill, lc, ec;
      if (isLead) { fill = RB_GREEN; lc = WHITE; ec = SOFT_WHITE; }
      else { fill = LP_FILLS[lpIdx % LP_FILLS.length]; lpIdx++; if (fill === RB_YELLOW) { lc = INK; ec = SOFT; } else { lc = WHITE; ec = SOFT_WHITE; } }
      svg += box(x, eqY, eqW, eqH, isLead ? 'Lead investor' : t.role, t.name, '', fill, lc, ec);
    });
    // spine: fund, portfolio, delivery
    svg += box(spvX, spvY, spvW, spvH, 'Fund vehicle', f.name, `SAR ${f.committed.toFixed(2)}bn · ${f.strat}`, RB_RED, WHITE, SOFT_WHITE, INK, 1.4);
    svg += box(portX, portY, portW, portH, 'Portfolio', `${f.assets} developments`, `SAR ${f.deployed.toFixed(2)}bn deployed · ${f.irr} IRR`, RB_VIOLET, WHITE, SOFT_WHITE, INK, 1.4);
    delivery.forEach((t, i) => {
      const x = delStartX + i * (delW + delGap);
      const isJV = t.role === 'JV Partner';
      if (isJV) svg += box(x, delY, delW, delH, t.role, t.name, '', RB_BLUE, WHITE, SOFT_WHITE);
      else svg += box(x, delY, delW, delH, t.role, t.name, '', '#fff', INK, SOFT, RB_BLUE, 1.4);
    });
    // lenders (right) — white + blue hairline
    lenders.forEach((t, i) => {
      const y = sideStartY + i * (sideH + sideGap);
      svg += box(debtX, y, sideW, sideH, 'Lender', t, '', '#fff', INK, SOFT, RB_BLUE, 1.4);
    });
    // advisors (left) — green (consultant) / red (authority) hairline
    advisors.forEach((a, i) => {
      const y = sideStartY + i * (sideH + sideGap);
      const stroke = a.role === 'Authority' ? RB_RED : RB_GREEN;
      svg += box(advX, y, sideW, sideH, a.role, a.name, '', '#fff', INK, SOFT, stroke, 1.4);
    });

    // rotated tier labels
    const tiers = [
      { y: eqY + eqH / 2 + 4, t: 'CAPITAL' },
      { y: spvCy + 4, t: 'FUND' },
      { y: portCy + 4, t: 'PORTFOLIO' },
    ];
    if (delivery.length) tiers.push({ y: delY + delH / 2 + 4, t: 'DELIVERY' });
    tiers.forEach(l => {
      svg += `<text x="${PAD - 16}" y="${l.y}" font-size="7" letter-spacing="2" fill="${SOFT}" font-weight="600" transform="rotate(-90 ${PAD - 16} ${l.y})">${l.t}</text>`;
    });

    svg += `</svg>`;
    return svg;
  }

  // stakeholder cards — match workspace project stakeholder grid
  function stakeCards(f) {
    const order = ['lp', 'co', 'lender', 'jv', 'consult', 'authority', 'contractor'];
    const cards = [];
    order.forEach(cat => (f.stake[cat] || []).forEach(name => {
      cards.push(`<div class="fd-sh-card">
        <div class="fd-sh-top">
          <div class="fd-sh-dot" style="background:${FUND_C[cat]}"></div>
          <div style="flex:1;">
            <div class="fd-sh-name">${esc(name)}</div>
            <div class="fd-sh-role">${CAT_LABEL[cat]}</div>
          </div>
        </div>
        <button class="fd-sh-btn" onclick="fundAgent('${esc(name).replace(/'/g, "\\'")}','${CAT_LABEL[cat]}','${f.id}')">▸ Ask AI Agent</button>
      </div>`);
    }));
    return cards.join('');
  }

  /* ---------- stakeholder AI agent (real AI) ---------- */
  window.fundAgent = function (name, role, fundId) {
    const f = FUNDS.find(x => x.id === fundId);
    let ov = document.getElementById('fa-overlay');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'fa-overlay'; ov.className = 'fa-overlay';
      ov.innerHTML = `<div class="fa-modal">
        <div class="fa-head"><div><div class="fa-name" id="fa-name"></div><div class="fa-role" id="fa-role"></div></div><button class="fa-x" onclick="closeFundAgent()">Close</button></div>
        <div class="fa-thread" id="fa-thread"></div>
        <div class="fa-in"><input id="fa-input" placeholder="Ask this stakeholder's agent…" onkeypress="if(event.key==='Enter')fundAgentSend()"/><button class="dm-btn" onclick="fundAgentSend()">Ask</button></div>
      </div>`;
      ov.addEventListener('click', e => { if (e.target === ov) closeFundAgent(); });
      document.body.appendChild(ov);
    }
    ov.dataset.name = name; ov.dataset.role = role; ov.dataset.fund = f ? f.name : '';
    document.getElementById('fa-name').textContent = name;
    document.getElementById('fa-role').textContent = role + (f ? ' · ' + f.name : '');
    document.getElementById('fa-thread').innerHTML = `<div class="sc-msg bot">I'm the AI agent for ${esc(name)}, ${esc(role)} on ${esc(f ? f.name : 'this fund')}. Ask me about our position, terms, or involvement.<span class="who">${esc(name)}</span></div>`;
    ov.classList.add('show');
    setTimeout(() => document.getElementById('fa-input').focus(), 50);
  };
  window.closeFundAgent = function () { const o = document.getElementById('fa-overlay'); if (o) o.classList.remove('show'); };
  window.fundAgentSend = async function () {
    const ov = document.getElementById('fa-overlay');
    const inp = document.getElementById('fa-input');
    const q = inp.value.trim(); if (!q) return; inp.value = '';
    const thread = document.getElementById('fa-thread');
    thread.insertAdjacentHTML('beforeend', `<div class="sc-msg user">${esc(q)}</div>`);
    const id = 'fa' + Date.now();
    thread.insertAdjacentHTML('beforeend', `<div class="sc-msg bot" id="${id}"><em style="opacity:.6">Thinking…</em></div>`);
    thread.scrollTop = thread.scrollHeight;
    let ans = '';
    try {
      const persona = `You are the AI agent representing ${ov.dataset.name}, acting as ${ov.dataset.role} on the real-estate development fund "${ov.dataset.fund}" managed by Bohio. Answer the fund manager's question in-character, concisely (max 80 words), in a professional institutional tone. Stay consistent with that role's typical interests.`;
      ans = await window.claude.complete({ messages: [{ role: 'user', content: persona + '\n\nQuestion: ' + q }] });
    } catch (e) { ans = 'I couldn’t reach the agent network just now — please try again in a moment.'; }
    document.getElementById(id).innerHTML = esc(ans) + `<span class="who">${esc(ov.dataset.name)}</span>`;
    thread.scrollTop = thread.scrollHeight;
  };

  function capRow(label, val, max, color) {
    const pct = Math.round(val / max * 100);
    return `<div class="fd-flow-row">
      <div class="fd-flow-top"><span class="k">${label}</span><span class="v">SAR ${val.toFixed(2)}bn · ${pct}%</span></div>
      <div class="fd-flow-track"><div class="fd-flow-fill" data-w="${pct}" style="background:${color};"></div></div>
    </div>`;
  }

  /* ---------- stakeholder network ---------- */
  function buildNetwork(f) {
    const svg = document.getElementById('fd-net');
    if (!svg) return;
    const W = 900, H = 430, cx = W / 2, cy = H / 2;
    // flatten nodes
    const nodes = [];
    Object.keys(f.stake).forEach(cat => f.stake[cat].forEach(name => nodes.push({ name, cat })));
    const N = nodes.length;
    // positions: organic two-radius ring
    nodes.forEach((n, i) => {
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const rad = (i % 2 === 0) ? 0.74 : 1.0;
      n.x = cx + Math.cos(ang) * 330 * rad;
      n.y = cy + Math.sin(ang) * 168 * rad;
    });

    const NS = 'http://www.w3.org/2000/svg';
    svg.innerHTML = '';
    // links
    const linkEls = [];
    nodes.forEach((n, i) => {
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', cx); ln.setAttribute('y1', cy);
      ln.setAttribute('x2', n.x); ln.setAttribute('y2', n.y);
      ln.setAttribute('stroke', FUND_C[n.cat]); ln.setAttribute('stroke-width', '1.2');
      ln.setAttribute('class', 'fd-link'); ln.setAttribute('opacity', '0');
      const len = Math.hypot(n.x - cx, n.y - cy);
      ln.setAttribute('stroke-dasharray', len); ln.setAttribute('stroke-dashoffset', len);
      ln.style.transition = 'stroke-dashoffset .7s ease, opacity .3s';
      svg.appendChild(ln); linkEls.push({ ln, len });
      n._link = ln;
    });
    // center node
    const cg = document.createElementNS(NS, 'g');
    const cOuter = document.createElementNS(NS, 'circle');
    cOuter.setAttribute('cx', cx); cOuter.setAttribute('cy', cy); cOuter.setAttribute('r', '46');
    cOuter.setAttribute('fill', '#000919');
    const cPulse = document.createElementNS(NS, 'circle');
    cPulse.setAttribute('cx', cx); cPulse.setAttribute('cy', cy); cPulse.setAttribute('r', '46');
    cPulse.setAttribute('fill', 'none'); cPulse.setAttribute('stroke', '#000919'); cPulse.setAttribute('stroke-width', '1.5');
    cPulse.innerHTML = `<animate attributeName="r" from="46" to="74" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.5" to="0" dur="2.4s" repeatCount="indefinite"/>`;
    const ct1 = document.createElementNS(NS, 'text');
    ct1.setAttribute('x', cx); ct1.setAttribute('y', cy - 3); ct1.setAttribute('text-anchor', 'middle');
    ct1.setAttribute('fill', '#e6e2e2'); ct1.setAttribute('font-size', '12'); ct1.setAttribute('letter-spacing', '1');
    ct1.setAttribute('font-weight', '700'); ct1.textContent = 'FUND';
    const ct2 = document.createElementNS(NS, 'text');
    ct2.setAttribute('x', cx); ct2.setAttribute('y', cy + 13); ct2.setAttribute('text-anchor', 'middle');
    ct2.setAttribute('fill', 'rgba(230,226,226,0.65)'); ct2.setAttribute('font-size', '9'); ct2.setAttribute('letter-spacing', '0.5');
    ct2.textContent = f.id.toUpperCase().replace('F', 'No.');
    cg.appendChild(cPulse); cg.appendChild(cOuter); cg.appendChild(ct1); cg.appendChild(ct2);
    svg.appendChild(cg);

    // nodes
    nodes.forEach((n, i) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'fd-node');
      g.setAttribute('transform', `translate(${n.x},${n.y})`);
      g.style.opacity = '0'; g.style.transformOrigin = `${n.x}px ${n.y}px`;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', '7'); c.setAttribute('fill', FUND_C[n.cat]);
      c.setAttribute('stroke', '#e6e2e2'); c.setAttribute('stroke-width', '2');
      const right = n.x >= cx;
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', right ? 13 : -13); t.setAttribute('y', 4);
      t.setAttribute('text-anchor', right ? 'start' : 'end');
      t.setAttribute('font-size', '10.5'); t.setAttribute('fill', '#000919'); t.setAttribute('letter-spacing', '0.3');
      t.textContent = n.name;
      g.appendChild(c); g.appendChild(t);
      svg.appendChild(g);
      n._g = g; n._c = c;
      g.addEventListener('mouseenter', e => hoverNode(n, nodes, true));
      g.addEventListener('mouseleave', e => hoverNode(n, nodes, false));
      g.addEventListener('mousemove', e => moveTip(e, n));
      // stagger reveal
      setTimeout(() => {
        g.style.transition = 'opacity .4s ease';
        g.style.opacity = '1';
        const l = linkEls[i]; l.ln.setAttribute('opacity', '0.5'); l.ln.setAttribute('stroke-dashoffset', '0');
      }, 200 + i * 70);
    });
  }

  function hoverNode(n, nodes, on) {
    const svg = document.getElementById('fd-net');
    const tip = document.getElementById('fd-tip');
    nodes.forEach(o => {
      const dim = on && o !== n;
      if (o._link) o._link.setAttribute('opacity', on ? (o === n ? '1' : '0.08') : '0.5');
      if (o._link) o._link.setAttribute('stroke-width', on && o === n ? '2.4' : '1.2');
      o._g.style.opacity = dim ? '0.25' : '1';
    });
    if (on) { n._c.setAttribute('r', '10'); tip.innerHTML = `<span class="r">${CAT_LABEL[n.cat]}</span>${n.name}`; tip.classList.add('show'); }
    else { n._c.setAttribute('r', '7'); tip.classList.remove('show'); }
  }
  function moveTip(e, n) {
    const tip = document.getElementById('fd-tip');
    const wrap = tip.parentElement.getBoundingClientRect();
    tip.style.left = (e.clientX - wrap.left + 14) + 'px';
    tip.style.top = (e.clientY - wrap.top + 12) + 'px';
  }

  /* ---------- util ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

})();
