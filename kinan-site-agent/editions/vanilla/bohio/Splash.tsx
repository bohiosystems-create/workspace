// The vanilla edition's launch splash, in the Bohio website's look (scripts/edition.mjs puts it in place of the client
// edition's splash): white, the brushed-metal BOHIO letters rising one by one, a thin rule, the product line underneath. Server-
// rendered at the top of <body>, swept away by its own script once the page has loaded (and nothing is marked
// data-kloading).
const LETTERS = "BOHIO".split("");
const CSS = `#ksplash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#ffffff;color:#0f1722;font-family:"Libre Franklin",Montserrat,system-ui,sans-serif;display:grid;place-items:center;align-content:center;gap:0;padding:24px;text-align:center;-webkit-font-smoothing:antialiased}
#ksplash .ks-w{margin:0;display:flex;font-family:"Libre Franklin",Montserrat,system-ui,sans-serif;font-weight:300;font-size:clamp(56px,14vw,150px);line-height:1;letter-spacing:.06em;padding-left:.06em}
#ksplash .ks-l{display:inline-block;background-image:linear-gradient(173deg,#0f1722 0%,#2a3442 18%,#6b7785 30%,#9aa6b2 36%,#3a4656 46%,#0f1722 55%,#4a5563 68%,#8a96a3 76%,#2a3442 88%,#0f1722 100%);background-size:100% 230%;background-position:50% 32%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;transform:translate3d(0,108%,0) rotate(2deg);opacity:0;animation:ksRise 1.2s cubic-bezier(.16,1,.3,1) both,ksSheen 17s cubic-bezier(.42,0,.3,1) 1.4s infinite}
#ksplash .ks-rule{height:1px;width:min(420px,70vw);margin:26px 0 0;background:#0f1722;transform-origin:left;transform:scaleX(0);animation:ksRule 1.4s cubic-bezier(.16,1,.3,1) .9s both}
#ksplash .ks-t{margin:22px 0 0;font-weight:300;font-size:clamp(13px,2.2vw,17px);letter-spacing:.42em;text-transform:uppercase;padding-left:.42em;opacity:0;animation:ksFade 1s ease-out 1.3s both}
#ksplash .ks-sub{margin:10px 0 0;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:rgba(15,23,34,.6);opacity:0;animation:ksFade 1s ease-out 1.6s both}
#ksplash .ks-bar{width:150px;height:2px;margin-top:26px;background:rgba(15,23,34,.18);overflow:hidden;opacity:0;animation:ksFade .5s ease 1.8s forwards}
#ksplash .ks-bar span{display:block;height:100%;width:40%;background:linear-gradient(90deg,#7f93aa,#0f1722);animation:ksBar 1.25s cubic-bezier(.7,0,.2,1) 1.8s infinite;transform:translateX(-110%)}
#ksplash.ks-leave{animation:ksOut .6s ease forwards;pointer-events:none}
@keyframes ksRise{to{transform:none;opacity:1}}
@keyframes ksSheen{0%,100%{background-position:50% 14%}30%{background-position:50% 52%}62%{background-position:50% 26%}84%{background-position:50% 58%}}
@keyframes ksRule{to{transform:scaleX(1)}}@keyframes ksFade{to{opacity:1}}@keyframes ksOut{to{opacity:0}}
@keyframes ksBar{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}
@media (prefers-reduced-motion:reduce){#ksplash *{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}}`;
const HTML = `<div id="ksplash" dir="ltr" role="status" aria-live="polite" aria-label="Loading the Onsite Agent"><style>${CSS}</style><h1 class="ks-w" aria-hidden="true">${LETTERS.map((ch, i) => `<span class="ks-l" style="animation-delay:${(0.15 + 0.07 * i).toFixed(2)}s,0s">${ch}</span>`).join("")}</h1><div class="ks-rule"></div><p class="ks-t">Onsite Agent</p><p class="ks-sub">AI agent · construction &amp; operations</p><div class="ks-bar"><span></span></div></div>`;
const JS = `(function(){var el=document.getElementById("ksplash");if(!el)return;var t0=Date.now(),MIN=2600,MAX=15000;try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)MIN=500}catch(e){}try{if(navigator.webdriver)MIN=0}catch(e){}function busy(){return document.readyState!=="complete"||!!document.querySelector("[data-kloading]")}function tick(){var t=Date.now()-t0;if(t<MAX&&(t<MIN||busy())){setTimeout(tick,120);return}el.classList.add("ks-leave");setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el)},650)}tick()})();`;

export default function Splash() {
  return (
    <>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: HTML }} />
      <script dangerouslySetInnerHTML={{ __html: JS }} />
    </>
  );
}
