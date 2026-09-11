/* Vérifie les dates réelles affichées en info-bulle des en-têtes de semaine :
   - le lundi calculé correspond bien au numéro de semaine ISO ;
   - les plans anciens (sans startYear) retrouvent leur année de rentrée ;
   - les semaines à cheval sur deux années civiles sont libellées sans ambiguïté. */
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

console.log('\n[A] Chaque colonne porte le lundi correspondant a son numero ISO');
for (const sy of [2024, 2026]) {
  const sem = ev(`generateSchoolYearWeeks(${sy})`);
  const sansDate = sem.filter(w => !w.d);
  check(sy + ' : toutes les colonnes ont une date', sansDate.length === 0, sansDate.length + ' sans date');

  const faux = sem.filter(w => {
    const d = new Date(w.d + 'T00:00:00');
    if (d.getDay() !== 1) return true;                       // doit etre un lundi
    return String(ev(`isoWeekNum(new Date(${d.getFullYear()},${d.getMonth()},${d.getDate()}))`)) !== String(w.week);
  });
  check(sy + ' : lundi et numero ISO concordent partout', faux.length === 0,
    faux.slice(0, 3).map(w => 'S' + w.week + '=' + w.d).join(' '));
}

console.log('\n[B] Libelle affiche en info-bulle');
{
  // S42 de 2026-2027 : lundi 12 octobre 2026
  const sem = ev('generateSchoolYearWeeks(2026)');
  const s42 = sem.find(w => String(w.week) === '42');
  const lib = ev(`libelleSemaine("42", ${JSON.stringify(s42.d)})`);
  check('date de depart correcte (12 octobre 2026)', s42.d === '2026-10-12', s42.d);
  check('libelle lisible et complet', /Semaine 42 — du lundi 12 octobre au dimanche 18 octobre 2026/.test(lib), lib);

  // semaine a cheval sur deux annees civiles : l'annee doit apparaitre des le debut
  const s53 = sem.find(w => String(w.week) === '53');
  const lib53 = ev(`libelleSemaine("53", ${JSON.stringify(s53.d)})`);
  check('semaine 53 a cheval : les deux annees sont indiquees',
    /2026/.test(lib53) && /2027/.test(lib53), lib53);

  check('sans date connue, le libelle reste correct',
    ev('libelleSemaine("42", null)') === 'Semaine 42', ev('libelleSemaine("42", null)'));
}

console.log('\n[C] Plan ancien, sans annee de rentree enregistree');
{
  // le plan exemple ne connait pas sa rentree : elle doit etre deduite du titre
  ev('globalThis.__p = normalizePlan(seedData());');
  const sy0 = ev('__p.years[0].startYear'), sy1 = ev('__p.years[1].startYear');
  check('1re annee deduite du titre « 2024-2026 »', sy0 === 2024, sy0);
  check('2e annee deduite avec le decalage', sy1 === 2025, sy1);

  const couvertes = ev('(()=>{const y=__p.years[0]; const m=weekDatesFor(y,y.startYear); return m.size;})()');
  const total = ev('__p.years[0].weeks.length');
  check('toutes les colonnes recoivent une date', couvertes === total, couvertes + '/' + total);

  // controle ponctuel : la 1re colonne du plan exemple est S33
  const premier = ev('(()=>{const y=__p.years[0]; const m=weekDatesFor(y,y.startYear); return m.get(y.weeks[0]);})()');
  check('1re colonne S33 = lundi 12 aout 2024', premier === '2024-08-12', premier);
}

console.log('\n[D] Plan dont la rentree reste indeterminable');
{
  ev(`globalThis.__q = {name:'Plan sans annee', years:[{label:'ANNEE A', semesters:['a','b'],
        weeks:[{week:'40',month:'OCTOBRE',semester:1}], rows:[{label:'L',activities:[]}], bands:[]}]};
      __q = normalizePlan(__q);`);
  check('aucune annee inventee', !ev('__q.years[0].startYear'), ev('__q.years[0].startYear'));
  const m = ev('(()=>{const y=__q.years[0]; return weekDatesFor(y,y.startYear).size;})()');
  check('aucune date inventee', m === 0, m + ' dates');
  check("l'info-bulle reste utilisable", ev('libelleSemaine("40", undefined)') === 'Semaine 40', ev('libelleSemaine("40", undefined)'));
}

console.log('\n[E] Regroupement par mois : majorite des jours de classe');
{
  // Septembre 2026 va du mardi 1er au mercredi 30. La semaine du 28 septembre
  // compte 3 jours de classe en septembre contre 2 en octobre : elle est donc
  // de septembre, alors que son jeudi (1er octobre) dirait le contraire.
  const sept = ev('generateSchoolYearWeeks(2026).filter(w=>w.month==="SEPTEMBRE").map(w=>w.week).join(",")');
  check('septembre 2026 = S36 a S40', sept === '36,37,38,39,40', sept);

  const oct = ev('generateSchoolYearWeeks(2026).filter(w=>w.month==="OCTOBRE").map(w=>w.week).join(",")');
  check('octobre 2026 commence a S41', oct.indexOf('41,') === 0, oct);

  // une semaine entierement dans un mois n'est jamais deplacee
  const s39 = ev('generateSchoolYearWeeks(2026).find(w=>String(w.week)==="39").month');
  check('semaine entierement en septembre inchangee', s39 === 'SEPTEMBRE', s39);

  // le decompte porte sur lundi->vendredi, pas sur les 7 jours
  const m1 = ev('MONTHS_FR[moisDeLaSemaine(new Date(2026,8,28))]');   // lundi 28 septembre 2026
  const m2 = ev('MONTHS_FR[moisDeLaSemaine(new Date(2026,7,31))]');   // lundi 31 aout 2026
  check('lundi 28 septembre 2026 -> septembre (3 jours contre 2)', m1 === 'SEPTEMBRE', m1);
  check('lundi 31 aout 2026 -> septembre (4 jours contre 1)', m2 === 'SEPTEMBRE', m2);
}

console.log('\n[F] Recalcul des mois sur un plan saisi a la main');
{
  ev('globalThis.__s = normalizePlan(seedData());');
  // les mois du plan exemple etaient approximatifs : ils doivent etre corriges
  const mai = ev('__s.years[0].weeks.filter(w=>w.month==="MAI").map(w=>w.week).join(",")');
  check('mai 2025 corrige en S19-S22', mai === '19,20,21,22', mai);

  // chaque mois doit former un seul bloc contigu, sinon la grille afficherait
  // deux fois le meme en-tete
  for (const i of [0, 1]) {
    const mois = ev('__s.years[' + i + '].weeks.map(w=>w.month)');
    const runs = mois.filter((m, k) => k === 0 || m !== mois[k - 1]);
    const dbl = runs.filter((m, k) => runs.indexOf(m) !== k);
    check('annee ' + i + ' : aucun en-tete de mois duplique', dbl.length === 0, dbl.join(','));
  }

  // le recalcul ne touche jamais au contenu des cases
  const avant = ev('SEED.years[0].rows.reduce((n,r)=>n+r.activities.length,0)');
  const apres = ev('__s.years[0].rows.reduce((n,r)=>n+r.activities.length,0)');
  check('les activites sont intactes', avant === apres, avant + ' -> ' + apres);
}

console.log('\n' + (failures ? failures + ' verification(s) en echec' : 'Toutes les verifications passent'));
process.exit(failures ? 1 : 0);
