// A line comment that has code after it on the same line turns that code into comment: the reader lost a check this way twice
// ("// Levered Project Level is levered if (!unl && !lev) continue;"). Every // comment in the reader and the app must end its line.
const fs = require('fs');let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + m); c ? pass++ : fail++ };
for (const f of ['../api/_lib/emcheck.js', '../index.html']) {
  const bad = []; fs.readFileSync(__dirname + '/' + f, 'utf8').split('\n').forEach((l, i) => {
    const m = l.match(/;\s+\/\/ (.*)$/); if (!m) return;   // a trailing comment after a statement
    const after = m[1].replace(/“[^”]*”|"[^"]*"|'[^']*'/g, '');   // quoted words are prose
    if (/\b(if|for|return|continue)\s*\(|\b(const|let)\s+\w+\s*=|\)\s*continue;|\breturn\b[^.]*;/.test(after)) bad.push(`${f}:${i + 1}: // ${m[1].slice(0, 90)}`) });
  ok(!bad.length, `${f}: no line comment hides code after it${bad.length ? '\n  ' + bad.slice(0, 8).join('\n  ') : ''}`) }
console.log(`${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
