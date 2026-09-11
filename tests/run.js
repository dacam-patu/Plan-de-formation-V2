/* Lance toutes les vérifications :  node tests/run.js
   Aucun navigateur, aucun réseau, aucune dépendance : app.js est exécuté dans
   un contexte Node avec un DOM minimal et un faux Supabase (tests/harness.js). */
const { execFileSync } = require('child_process');
const path = require('path');
const files = ['test-enregistrement.js', 'test-semaines.js', 'test-vacances.js'];
let ko = 0;
for (const f of files) {
  console.log('\n=== ' + f + ' ===');
  try { execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' }); }
  catch (e) { ko++; }
}
console.log('\n' + (ko ? ko + ' fichier(s) de test en echec' : 'Tout est vert.'));
process.exit(ko ? 1 : 0);
