/* Vérifie la table des vacances de La Réunion intégrée à l'application :
   - cohérence interne (pas de doublon, pas de semaine inexistante) ;
   - correspondance avec le calendrier réellement généré ;
   - recalage correct des activités après retrait des semaines de vacances.  */
const fs = require('fs'), vm = require('vm'), path = require('path');
const { buildSandbox } = require('./harness.js');

const PROJ = process.argv[2] || path.join(__dirname, '..');
const appjs = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8').replace(/\r?\nboot\(\);\r?\n?$/, '\n');
const seedjs = fs.readFileSync(path.join(PROJ, 'seed.js'), 'utf8');
const S = buildSandbox({ createClient: () => ({ from: () => ({}), auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() { } } }) });
vm.createContext(S);
vm.runInContext(seedjs, S); vm.runInContext(appjs, S);
const ev = c => vm.runInContext(c, S);

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? '  OK   ' : '  ECHEC') + '  ' + name + (cond ? '' : '   -> ' + extra));
  if (!cond) failures++;
};

const annees = ev('Object.keys(VACANCES_REUNION).map(Number).sort()');
console.log('\n[A] Coherence de la table (' + annees.length + ' annees : ' + annees[0] + ' a ' + annees[annees.length - 1] + ')');
for (const sy of annees) {
  const v = ev(`VACANCES_REUNION[${sy}]`);
  const sem = ev(`generateSchoolYearWeeks(${sy})`).map(w => String(w.week));
  const dispo = new Set(sem);

  const doublons = v.off.filter((w, i) => v.off.indexOf(w) !== i);
  const fantomes = v.off.filter(w => !dispo.has(String(w)));
  const collision = v.off.filter(w => (v.part || []).includes(w));

  check(sy + ' : aucun doublon', doublons.length === 0, doublons.join(','));
  check(sy + ' : toutes les semaines existent dans le calendrier genere', fantomes.length === 0, 'S' + fantomes.join(' S'));
  check(sy + ' : off et part disjoints', collision.length === 0, collision.join(','));
  // une annee scolaire reunionnaise compte ~11 a 14 semaines de vacances
  check(sy + ' : nombre de semaines plausible (' + v.off.length + ')', v.off.length >= 10 && v.off.length <= 15, v.off.length);
}

console.log('\n[B] Retrait effectif sur une annee complete (rentree 2026)');
{
  ev(`globalThis.__y = {label:'T', semesters:['A','B'], startYear:2026,
        weeks: generateSchoolYearWeeks(2026),
        rows:[{label:'L', activities:[]}], bands:[]};`);
  const avant = ev('__y.weeks.length');
  // une activite qui couvre les vacances d'ete austral (S52 -> S4) et deborde
  ev(`(()=>{ const w=__y.weeks.map(x=>String(x.week));
        __y.rows[0].activities.push({id:'a', text:'a cheval', start:w.indexOf('51'), end:w.indexOf('5')});
        __y.rows[0].activities.push({id:'b', text:'dans les vacances', start:w.indexOf('1'), end:w.indexOf('2')});
        __y.rows[0].activities.push({id:'c', text:'apres', start:w.indexOf('10'), end:w.indexOf('11')}); })()`);
  const otees = ev('retirerVacances(__y, 2026)');
  const apres = ev('__y.weeks.length');
  const restantes = ev("__y.weeks.map(w=>String(w.week))");
  const off = ev('VACANCES_REUNION[2026].off.map(String)');

  check('des semaines ont ete retirees', otees > 0, otees);
  check('le compte est coherent', avant - apres === otees, `${avant} - ${apres} != ${otees}`);
  check('plus aucune semaine de vacances dans le calendrier',
    !restantes.some(w => off.includes(w)), restantes.filter(w => off.includes(w)).join(','));

  const acts = ev("__y.rows[0].activities.map(a=>a.id+':'+__y.weeks[a.start].week+'->'+__y.weeks[a.end].week)");
  check("l'activite entierement en vacances est supprimee",
    !acts.some(a => a.startsWith('b:')), acts.join(' '));
  // Une activite qui enjambe les vacances garde son debut ET sa fin : elle
  // reprend apres les conges, les colonnes de vacances disparaissent entre les
  // deux. La tronquer a S51 supprimerait la partie posterieure.
  check("l'activite a cheval garde ses bornes S51->S5",
    acts.some(a => a === 'a:51->5'), acts.join(' '));
  const largeur = ev("(()=>{const a=__y.rows[0].activities.find(x=>x.id==='a'); return a.end-a.start+1;})()");
  check("...et ne couvre plus que 2 colonnes au lieu de 7", largeur === 2, largeur + ' colonnes');
  check("l'activite posterieure garde ses bornes S10->S11",
    acts.some(a => a === 'c:10->11'), acts.join(' '));
  const bornesOk = ev(`__y.rows[0].activities.every(a=>a.start>=0 && a.end<__y.weeks.length && a.start<=a.end)`);
  check('toutes les bornes restent dans le calendrier', bornesOk, 'bornes hors limites');
}

console.log('\n[C] Annee sans donnees officielles (rentree 2030)');
{
  ev(`globalThis.__z = {label:'T', semesters:['A','B'], startYear:2030,
        weeks: generateSchoolYearWeeks(2030), rows:[{label:'L', activities:[]}], bands:[]};`);
  const n = ev('__z.weeks.length');
  const otees = ev('retirerVacances(__z, 2030)');
  check('aucun retrait, aucune erreur', otees === 0 && ev('__z.weeks.length') === n, 'otees=' + otees);
  check('vacancesDe() renvoie null', ev('vacancesDe(2030)') === null, ev('JSON.stringify(vacancesDe(2030))'));
}

console.log('\n' + (failures ? failures + ' verification(s) en echec' : 'Toutes les verifications passent'));
process.exit(failures ? 1 : 0);
