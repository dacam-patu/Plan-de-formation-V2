/* Verifie le calcul du decalage d'un bloc glisse a la souris.
   Le geste lui-meme (souris, survol, defilement) se verifie dans le navigateur ;
   ici on isole l'arithmetique des indices, la partie ou une erreur passerait
   inapercue : un bloc tronque, sorti du tableau, ou decale d'un cran de trop. */
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

const d = (s, e, N, v) => ev(`decalageBorne(${s},${e},${N},${v})`);

console.log('\n[A] Decalage courant, loin des bords');
{
  check('vers la droite', d(3, 5, 48, 4) === 4, d(3, 5, 48, 4));
  check('vers la gauche', d(10, 12, 48, -6) === -6, d(10, 12, 48, -6));
  check('deplacement nul', d(3, 5, 48, 0) === 0, d(3, 5, 48, 0));
}

console.log('\n[B] Butoirs : le bloc garde sa duree');
{
  // bloc de 3 colonnes (3..5) dans un calendrier de 48 : il peut aller au plus a 45..47
  check('bute a droite sans depasser', d(3, 5, 48, 999) === 42, d(3, 5, 48, 999));
  check('bute a gauche sans depasser', d(3, 5, 48, -999) === -3, d(3, 5, 48, -999));

  const N = 48, s = 3, e = 5;
  const droite = d(s, e, N, 999), gauche = d(s, e, N, -999);
  check('a droite, fin = derniere colonne', e + droite === N - 1, e + droite);
  check('a droite, duree inchangee', (e + droite) - (s + droite) === e - s, 'duree modifiee');
  check('a gauche, debut = premiere colonne', s + gauche === 0, s + gauche);
  check('a gauche, duree inchangee', (e + gauche) - (s + gauche) === e - s, 'duree modifiee');
}

console.log('\n[C] Cas limites');
{
  check('bloc d une seule colonne, jusqu au bout', d(0, 0, 48, 999) === 47, d(0, 0, 48, 999));
  check('bloc occupant tout le calendrier ne bouge pas', d(0, 47, 48, 10) === 0, d(0, 47, 48, 10));
  check('bloc deja colle a droite ne va pas plus loin', d(45, 47, 48, 5) === 0, d(45, 47, 48, 5));
  check('bloc deja colle a gauche ne recule pas', d(0, 2, 48, -5) === 0, d(0, 2, 48, -5));
  check('calendrier d une seule colonne', d(0, 0, 1, 3) === 0, d(0, 0, 1, 3));
}

console.log('\n[D] Coherence sur tout un calendrier reel');
{
  const N = ev('generateSchoolYearWeeks(2026).length');
  let mauvais = [];
  for (let s = 0; s < N; s++) {
    for (const duree of [0, 2, 6]) {
      const e = s + duree;
      if (e >= N) continue;
      for (const v of [-99, -3, -1, 0, 1, 3, 99]) {
        const dw = d(s, e, N, v);
        if (s + dw < 0 || e + dw > N - 1) mauvais.push(`[${s}-${e}] v=${v} -> ${dw}`);
      }
    }
  }
  check('aucun depassement sur ' + N + ' colonnes, toutes durees et amplitudes',
    mauvais.length === 0, mauvais.slice(0, 4).join(' | '));
}

console.log('\n' + (failures ? failures + ' verification(s) en echec' : 'Toutes les verifications passent'));
process.exit(failures ? 1 : 0);
