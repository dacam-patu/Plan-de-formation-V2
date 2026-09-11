/* Vérifie le recalage des activités quand on retire ou rajoute des semaines. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const { buildSandbox } = require('./harness.js');

const PROJ = process.argv[2] || path.join(__dirname, '..');
const appjs = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8').replace(/\r?\nboot\(\);\r?\n?$/, '\n');
const seedjs = fs.readFileSync(path.join(PROJ, 'seed.js'), 'utf8');

const S = buildSandbox({ createClient: () => ({ from: () => ({}), auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() { } } }) });
vm.createContext(S);
vm.runInContext(seedjs, S, { filename: 'seed.js' });
vm.runInContext(appjs, S, { filename: 'app.js' });
const ev = c => vm.runInContext(c, S);

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? '  OK   ' : '  ECHEC') + '  ' + name + (cond ? '' : '   -> ' + extra));
  if (!cond) failures++;
};

// Année de test : 6 semaines, S1..S6 (indices 0..5)
const mkYear = () => ({
  label: 'TEST', semesters: ['S1', 'S2'],
  weeks: [1, 2, 3, 4, 5, 6].map(n => ({ week: String(n), month: 'M', semester: 1 })),
  rows: [{
    label: 'L', activities: [
      { id: 'a-avant', text: 'avant', start: 0, end: 1 },   // S1-S2, avant la coupe
      { id: 'a-chevauche', text: 'chevauche', start: 1, end: 3 },   // S2-S4, contient la coupe
      { id: 'a-dans', text: 'dans', start: 2, end: 2 },   // S3 seule = la semaine retirée
      { id: 'a-apres', text: 'apres', start: 4, end: 5 }    // S5-S6, après la coupe
    ]
  }],
  bands: [{ id: 'b1', text: 'stage', start: 3, end: 5 }]
});

console.log('\n[A] Retrait de la semaine 3 (indice 2)');
{
  ev('globalThis.__y = ' + JSON.stringify(mkYear()) + ';');
  const dropped = ev('remapWeeks(__y, __y.weeks.filter((w,i)=>i!==2))');
  const acts = ev('__y.rows[0].activities.map(a=>a.id+":"+a.start+"-"+a.end)');
  const band = ev('__y.bands.map(b=>b.id+":"+b.start+"-"+b.end)');
  check('6 semaines -> 5', ev('__y.weeks.length') === 5, ev('__y.weeks.length'));
  check('activite avant la coupe inchangee (0-1)', acts.includes('a-avant:0-1'), acts.join(' '));
  check('activite a cheval recalee (1-2)', acts.includes('a-chevauche:1-2'), acts.join(' '));
  check('activite entierement dans la semaine retiree supprimee',
    !acts.some(a => a.startsWith('a-dans')) && dropped === 1, acts.join(' ') + ' dropped=' + dropped);
  check('activite apres la coupe decalee de -1 (3-4)', acts.includes('a-apres:3-4'), acts.join(' '));
  check('bande recalee (2-4)', band.includes('b1:2-4'), band.join(' '));
}

console.log('\n[B] Retrait de plusieurs semaines puis reinsertion');
{
  ev('globalThis.__y = ' + JSON.stringify(mkYear()) + ';');
  ev('globalThis.__w1 = __y.weeks[0]; globalThis.__w6 = __y.weeks[5];');
  ev('remapWeeks(__y, [__y.weeks[0], __y.weeks[4], __y.weeks[5]])');   // ne garder que S1, S5, S6
  check('3 semaines retenues', ev('__y.weeks.length') === 3, ev('__y.weeks.length'));
  check('les identites de semaine sont conservees (largeurs reglees a la main)',
    ev('__y.weeks[0]===__w1 && __y.weeks[2]===__w6'), 'objets remplaces');
  const acts = ev('__y.rows[0].activities.map(a=>a.id+":"+a.start+"-"+a.end)');
  check('S5-S6 devient 1-2', acts.includes('a-apres:1-2'), acts.join(' '));

  // reinsertion d'une semaine au milieu
  ev("remapWeeks(__y, [__y.weeks[0], {week:'9',month:'M',semester:1}, __y.weeks[1], __y.weeks[2]])");
  const acts2 = ev('__y.rows[0].activities.map(a=>a.id+":"+a.start+"-"+a.end)');
  check('apres reinsertion, S5-S6 repasse a 2-3', acts2.includes('a-apres:2-3'), acts2.join(' '));
  check('4 semaines', ev('__y.weeks.length') === 4, ev('__y.weeks.length'));
}

console.log('\n[C] Bornes incoherentes (plan importe abime)');
{
  ev('globalThis.__y = ' + JSON.stringify(mkYear()) + ';');
  ev('__y.rows[0].activities.push({id:"a-hors", text:"hors", start:99, end:99});');
  ev('remapWeeks(__y, __y.weeks.slice(0,3))');
  const acts = ev('__y.rows[0].activities.map(a=>a.id+":"+a.start+"-"+a.end)');
  const bad = acts.filter(a => { const [, r] = a.split(':'); const [s, e] = r.split('-').map(Number); return s < 0 || e >= 3 || s > e; });
  check('aucune borne hors du nouveau calendrier', bad.length === 0, bad.join(' '));
}

console.log('\n' + (failures ? failures + ' verification(s) en echec' : 'Toutes les verifications passent'));
process.exit(failures ? 1 : 0);
