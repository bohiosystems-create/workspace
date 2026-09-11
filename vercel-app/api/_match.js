/* Typo-tolerant matching for WhatsApp.
 *
 * Messages are typed one-handed in gloves and voice notes come back from
 * speech recognition with words mangled, so exact keywords are useless here.
 * Damerau-Levenshtein is used because a transposition ("strat" for "start")
 * is the commonest typo and must cost one edit, not two. Keyword phrases are
 * matched in order with a small gap budget, so "why hasnt THE STAUS updated"
 * still lands.
 */
const SYN={ drawing:['dwg','dwgs'], specification:['spec','specs'], permit:['ptw','permits'],
  regulation:['reg','regs','regulations'], percent:['pct','percentage'],
  evidence:['photo','photos','picture','pictures','pic','pics','image','images'],
  programme:['program'], procurement:['purchasing'], telephone:['phone','tel'],
  contractor:['subbie','subcontractor'], activity:['task'], delay:['delays','slippage','slip'] };
const SYN_OF={};
Object.entries(SYN).forEach(([b,l])=>{SYN_OF[b]=b;l.forEach(v=>{SYN_OF[v]=b;});});

const SHORTHAND={r:'are',u:'you',ur:'your',n:'and',y:'why',k:'ok',pls:'please',plz:'please',
  thx:'thanks',msg:'message',info:'information',qty:'quantity',asap:'urgent',b4:'before',
  '2':'to','4':'for',w:'with',abt:'about',rn:'now',tmrw:'tomorrow',wk:'week'};
function norm(s){
  return String(s||'').toLowerCase().replace(/[’']/g,'')
    .replace(/[^a-z0-9%+\/\-\s]/g,' ').replace(/\s+/g,' ').trim()
    .split(' ').map(w=>SHORTHAND[w]||w).join(' ');
}
function stem(w){
  if(w.length>4&&w.endsWith('ies')) return w.slice(0,-3)+'y';
  if(w.length>4&&/(ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0,-2);
  if(w.length>3&&w.endsWith('s')&&!w.endsWith('ss')) return w.slice(0,-1);
  if(w.length>5&&w.endsWith('ing')) return w.slice(0,-3);
  if(w.length>5&&w.endsWith('ed')) return w.slice(0,-2);
  return w;
}
const canon=w=>{const b=stem(w);return SYN_OF[b]||SYN_OF[w]||b;};
const tol=n=>{const L=typeof n==='number'?n:String(n).length;return L<=2?0:L<=5?1:L<=8?2:3;};

function lev(a,b,max){
  if(a===b) return 0;
  if(Math.abs(a.length-b.length)>max) return max+1;
  const m=a.length,n=b.length;
  let p2=null,p=Array.from({length:n+1},(_,i)=>i);
  for(let i=1;i<=m;i++){
    const c=new Array(n+1);c[0]=i;let best=i;
    for(let j=1;j<=n;j++){
      const cost=a[i-1]===b[j-1]?0:1;
      let v=Math.min(p[j]+1,c[j-1]+1,p[j-1]+cost);
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]) v=Math.min(v,p2[j-2]+1);
      c[j]=v; if(v<best) best=v;
    }
    if(best>max) return max+1;
    p2=p;p=c;
  }
  return p[n];
}
function tokEq(q,k){
  if(q===k) return true;
  const sq=stem(q),sk=stem(k),cq=canon(q),ck=canon(k);
  if(sq===sk||cq===ck) return true;
  const [s1,l1]=q.length<=k.length?[q,k]:[k,q];
  if(s1.length>=4&&l1.length-s1.length<=3&&l1.startsWith(s1)) return true;
  if(s1.length===3&&l1.length-s1.length<=1&&l1.startsWith(s1)) return true;
  const [s2,l2]=sq.length<=sk.length?[sq,sk]:[sk,sq];
  if(s2.length>=4&&l2.length-s2.length<=3&&l2.startsWith(s2)) return true;
  const near=(a,b)=>{ if(Math.abs(a.length-b.length)>3) return false;
    const t=tol(Math.min(a.length,b.length)); return t>0&&lev(a,b,t)<=t; };
  return near(q,k)||near(sq,sk)||near(cq,ck);
}
function phraseScore(qt,kw){
  const kt=norm(kw).split(' ').filter(Boolean);
  if(!kt.length) return 0;
  const base=kw.replace(/\s/g,'').length*2;
  let best=0;
  for(let i=0;i<qt.length;i++){
    let qi=i,ki=0,pen=0,gaps=0;
    while(qi<qt.length&&ki<kt.length){
      if(tokEq(qt[qi],kt[ki])){ if(qt[qi]!==kt[ki]&&canon(qt[qi])!==canon(kt[ki])) pen++; qi++;ki++; }
      else if(ki>0&&gaps<2){ gaps++;qi++; } else break;
    }
    if(ki===kt.length){ const sc=base-pen*2-gaps*2; if(sc>best) best=sc; }
  }
  if(best) return best;
  const sq=kw.replace(/\s/g,'');
  if(sq.length>=6&&qt.join('').includes(sq)) return sq.length*2-1;
  return 0;
}
function score(q,keys){ const qt=norm(q).split(' ').filter(Boolean);
  let b=0; for(const k of keys){ const s=phraseScore(qt,k); if(s>b) b=s; } return b; }

/* Pick the best entry from [{keys:[...], ...}] above a confidence floor. */
function pick(q,entries,floor=6){
  let best=null,bs=0;
  for(const e of entries){ const s=score(q,e.keys)*(e.weight||1); if(s>bs){bs=s;best=e;} }
  return bs>=floor?best:null;
}
module.exports={norm,stem,canon,lev,tokEq,phraseScore,score,pick};
