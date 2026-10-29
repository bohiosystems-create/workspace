// The vanilla edition's launch splash (scripts/edition.mjs puts it in place of the client edition's splash, and the
// painting in public/splash.jpg): the Bohio Systems painting, whole, on a dark ground — it fades in and slowly comes
// closer, the product line and a thin loading bar underneath. Server-rendered at the top of <body>, swept away by its own
// script once the page has loaded (and nothing is marked data-kloading), and never before 3.2 s so the painting is seen.
const CSS = `#ksplash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#0b0806;color:#e9dcc6;font-family:"Libre Franklin",Montserrat,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom));text-align:center;-webkit-font-smoothing:antialiased}
#ksplash::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(120,80,40,.18),transparent 60%);pointer-events:none}
#ksplash .ks-art{position:relative;flex:0 1 auto;min-height:0;max-height:calc(100% - 76px);max-width:100%;aspect-ratio:1122/1402;opacity:0;transform:scale(1.04);animation:ksIn 1.6s cubic-bezier(.16,1,.3,1) .1s forwards,ksNear 14s ease-out .1s forwards;box-shadow:0 30px 80px rgba(0,0,0,.6)}
#ksplash .ks-art img{display:block;width:100%;height:100%;object-fit:contain}
#ksplash .ks-t{position:relative;margin:0;font-weight:300;font-size:12px;letter-spacing:.42em;text-transform:uppercase;padding-left:.42em;opacity:0;animation:ksFade 1s ease-out 1s forwards}
#ksplash .ks-bar{position:relative;width:150px;height:2px;background:rgba(233,220,198,.18);overflow:hidden;opacity:0;animation:ksFade .5s ease 1.4s forwards}
#ksplash .ks-bar span{display:block;height:100%;width:40%;background:linear-gradient(90deg,#8a6a3e,#e9dcc6);animation:ksBar 1.25s cubic-bezier(.7,0,.2,1) 1.4s infinite;transform:translateX(-110%)}
#ksplash.ks-leave{animation:ksOut .7s ease forwards;pointer-events:none}
@keyframes ksIn{to{opacity:1}}@keyframes ksNear{to{transform:scale(1)}}@keyframes ksFade{to{opacity:1}}@keyframes ksOut{to{opacity:0}}
@keyframes ksBar{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}
@media (prefers-reduced-motion:reduce){#ksplash *{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}}`;
const HTML = `<div id="ksplash" dir="ltr" role="status" aria-live="polite" aria-label="Loading the Onsite Agent"><style>${CSS}</style><div class="ks-art"><img src="/splash.jpg" alt="Bohio Systems" width="1122" height="1402" decoding="async" fetchpriority="high"></div><p class="ks-t">Onsite Agent</p><div class="ks-bar"><span></span></div></div>`;
const JS = `(function(){var el=document.getElementById("ksplash");if(!el)return;var t0=Date.now(),MIN=3200,MAX=15000;try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)MIN=800}catch(e){}try{if(navigator.webdriver)MIN=0}catch(e){}function busy(){return document.readyState!=="complete"||!!document.querySelector("[data-kloading]")}function tick(){var t=Date.now()-t0;if(t<MAX&&(t<MIN||busy())){setTimeout(tick,120);return}el.classList.add("ks-leave");setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el)},750)}tick()})();`;

export default function Splash() {
  return (
    <>
      <link rel="preload" as="image" href="/splash.jpg" />
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: HTML }} />
      <script dangerouslySetInnerHTML={{ __html: JS }} />
    </>
  );
}
