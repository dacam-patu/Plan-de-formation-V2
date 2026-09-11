/* Vérifie la file d'enregistrement d'app.js :
   1. changer de plan pendant le délai de 600 ms enregistre bien LE BON plan
   2. un échec réseau conserve le travail (cache local) et réessaie
   3. une version concurrente ne l'écrase pas en silence               */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { buildSandbox } = require('./harness.js');

const PROJ = process.argv[2] || path.join(__dirname, '..');
const appjs = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8').replace(/\r?\nboot\(\);\r?\n?$/, '\n');
const seedjs = fs.readFileSync(path.join(PROJ, 'seed.js'), 'utf8');

// ---- faux Supabase : table `plans` en mémoire ------------------------------
function makeDb() { return { rows: new Map(), log: [], fail: false }; }

function makeStub(db) {
  let bump = 0;
  const table = () => {
    const st = { filters: {}, op: null, payload: null };
    async function run(single) {
      if (db.fail) return { data: null, error: { message: 'réseau indisponible' } };
      if (st.op === 'select' && !st.filters.id) return { data: [...db.rows.values()], error: null };
      if (st.op === 'select') return { data: db.rows.get(st.filters.id) || null, error: null };
      if (st.op === 'insert') {
        const row = Object.assign({ created_at: new Date().toISOString() }, st.payload,
          { updated_at: new Date(Date.now() + (++bump)).toISOString() });
        db.rows.set(row.id, row); db.log.push('insert ' + row.name);
        return { data: single ? { updated_at: row.updated_at } : [row], error: null };
      }
      if (st.op === 'update') {
        const r = db.rows.get(st.filters.id);
        if (!r) return { data: null, error: null };
        if ('updated_at' in st.filters && r.updated_at !== st.filters.updated_at) {
          db.log.push('CONFLIT ' + (r.name || ''));
          return { data: null, error: null };                     // 0 ligne : verrou déclenché
        }
        Object.assign(r, st.payload);
        r.updated_at = new Date(Date.now() + (++bump)).toISOString();   // ce que fait le trigger SQL
        db.log.push('update ' + r.name);
        return { data: single ? { updated_at: r.updated_at } : [r], error: null };
      }
      if (st.op === 'delete') { db.rows.delete(st.filters.id); return { data: null, error: null }; }
      return { data: null, error: null };
    }
    const api = {
      select() { if (!st.op) st.op = 'select'; return api; },
      insert(p) { st.op = 'insert'; st.payload = p; return api; },
      update(p) { st.op = 'update'; st.payload = p; return api; },
      delete() { st.op = 'delete'; return api; },
      eq(k, v) { st.filters[k] = v; return api; },
      order() { return run(); },
      maybeSingle() { return run(true); },
      single() { return run(true); },
      then(res, rej) { return run().then(res, rej); }
    };
    return api;
  };
  return {
    createClient: () => ({
      from: table,
      auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() { }, signOut: async () => { } }
    })
  };
}

function load(db) {
  const S = buildSandbox(makeStub(db));
  vm.createContext(S);
  vm.runInContext(seedjs, S, { filename: 'seed.js' });
  vm.runInContext(appjs, S, { filename: 'app.js' });
  // `sb` et `me` sont des `let` de portée lexicale globale : on les affecte
  // depuis le même contexte, pas via une propriété du sandbox.
  vm.runInContext("sb = supabase.createClient(); me = {id:'u1', role:'prof', email:'p@x', name:'P'};", S);
  return S;
}
const ev = (S, code) => vm.runInContext(code, S);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? '  OK   ' : '  ECHEC') + '  ' + name + (cond ? '' : '   -> ' + extra));
  if (!cond) failures++;
}

(async () => {
  // ===== 1) changement de plan pendant le délai de 600 ms ===================
  console.log('\n[1] Modification du plan A puis passage immediat au plan B');
  {
    const db = makeDb(); const S = load(db);
    await ev(S, 'cloudLoad()');                       // crée le plan exemple
    const A = ev(S, 'DB.order[0]');
    const B = ev(S, "(()=>{const id=createLocalPlan(normalizePlan(seedData())); DB.plans[id].name='PLAN B'; return id;})()");
    await ev(S, 'flushSaves()');
    db.log.length = 0;

    ev(S, `DB.currentId=${JSON.stringify(A)}; plan=DB.plans[DB.currentId]; plan.name='PLAN A MODIFIE';`);
    ev(S, 'persistDebounced()');                      // minuteur armé sur A
    ev(S, `switchPlan(${JSON.stringify(B)})`);        // ... on part sur B aussitôt
    await sleep(900);
    await ev(S, 'flushSaves()');

    const rowA = db.rows.get(A);
    check('le plan A est enregistre avec sa modification',
      rowA && rowA.name === 'PLAN A MODIFIE', 'nom en base = ' + (rowA && rowA.name));
    check('rien ne reste en attente', ev(S, 'dirty.size') === 0, ev(S, 'dirty.size') + ' en attente');
  }

  // ===== 2) panne réseau ====================================================
  console.log('\n[2] Panne reseau pendant une modification');
  {
    const db = makeDb(); const S = load(db);
    await ev(S, 'cloudLoad()');
    const A = ev(S, 'DB.order[0]');
    await ev(S, 'flushSaves()');

    db.fail = true;                                   // le réseau tombe
    ev(S, "plan.name='ECRIT HORS LIGNE'; persist();");
    await sleep(200);

    check('la modification reste en file d attente', ev(S, `dirty.has(${JSON.stringify(A)})`), 'file vide');
    const cache = JSON.parse(S.__store['pdf_v2_cache'] || '{}');
    check('la modification est copiee dans le cache local',
      cache[A] && cache[A].data.name === 'ECRIT HORS LIGNE', 'cache = ' + Object.keys(cache).join(','));
    check('le temoin passe en « non enregistre »', ev(S, 'saveStateNow()') === 'error', ev(S, 'saveStateNow()'));

    db.fail = false;                                  // le réseau revient
    await sleep(3400);                                // 1re nouvelle tentative à 3 s
    check('renvoye automatiquement au retour du reseau',
      db.rows.get(A).name === 'ECRIT HORS LIGNE', 'nom en base = ' + db.rows.get(A).name);
    check('le cache local est vide une fois confirme',
      !JSON.parse(S.__store['pdf_v2_cache'] || '{}')[A], 'encore en cache');
  }

  // ===== 3) enregistrement concurrent =======================================
  console.log('\n[3] Enregistrement concurrent par un autre compte');
  {
    const db = makeDb(); const S = load(db);
    await ev(S, 'cloudLoad()');
    const A = ev(S, 'DB.order[0]');
    await ev(S, 'flushSaves()');

    const row = db.rows.get(A);                       // le collègue écrit directement en base
    row.name = 'VERSION DU COLLEGUE';
    row.updated_at = new Date(Date.now() + 100000).toISOString();

    ev(S, "plan.name='MA VERSION'; persist();");
    await sleep(400);

    check('la base n a PAS ete ecrasee', db.rows.get(A).name === 'VERSION DU COLLEGUE', db.rows.get(A).name);
    check('le verrou a bien ete declenche', db.log.includes('CONFLIT VERSION DU COLLEGUE'), db.log.join(' | '));
    check('mon travail est conserve dans le cache local',
      (JSON.parse(S.__store['pdf_v2_cache'] || '{}')[A] || {}).name === 'MA VERSION', 'absent du cache');
  }

  console.log('\n' + (failures ? failures + ' verification(s) en echec' : 'Toutes les verifications passent'));
  process.exit(failures ? 1 : 0);
})();
