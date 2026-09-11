"use strict";
/* =========================================================================
   Plan de formation — application autonome (vanilla JS)
   ========================================================================= */

/* ---------- Palette ---------- */
const PALETTE = ["#dbeafe","#dcfce7","#fef9c3","#fce7f3","#e0e7ff","#ffedd5",
                 "#cffafe","#f3e8ff","#fee2e2","#d1fae5","#ede9fe","#fef3c7","#e2e8f0"];
// Palette étendue du sélecteur : 18 teintes × 3 intensités (claire / moyenne / soutenue) + gris
const SWATCH_COLORS = [
  // clair (pastel)
  "#fecaca","#fed7aa","#fde68a","#fef08a","#d9f99d","#bbf7d0","#a7f3d0","#99f6e4","#a5f3fc",
  "#bae6fd","#bfdbfe","#c7d2fe","#ddd6fe","#e9d5ff","#f5d0fe","#fbcfe8","#fecdd3","#e5e7eb",
  // moyen
  "#fca5a5","#fdba74","#fcd34d","#fde047","#bef264","#86efac","#6ee7b7","#5eead4","#67e8f9",
  "#7dd3fc","#93c5fd","#a5b4fc","#c4b5fd","#d8b4fe","#f0abfc","#f9a8d4","#fda4af","#cbd5e1",
  // soutenu
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981","#14b8a6","#06b6d4",
  "#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899","#f43f5e","#64748b"];
// Polices web-safe (aucun téléchargement, fonctionne hors ligne). value = pile CSS ; name = nom Excel
const FONTS = [
  {label:"Système (par défaut)", value:"", xlsx:"Calibri"},
  {label:"Arial",            value:"Arial, sans-serif", xlsx:"Arial"},
  {label:"Calibri",          value:"Calibri, sans-serif", xlsx:"Calibri"},
  {label:"Verdana",          value:"Verdana, sans-serif", xlsx:"Verdana"},
  {label:"Tahoma",           value:"Tahoma, sans-serif", xlsx:"Tahoma"},
  {label:"Trebuchet MS",     value:"'Trebuchet MS', sans-serif", xlsx:"Trebuchet MS"},
  {label:"Segoe UI",         value:"'Segoe UI', sans-serif", xlsx:"Segoe UI"},
  {label:"Times New Roman",  value:"'Times New Roman', serif", xlsx:"Times New Roman"},
  {label:"Georgia",          value:"Georgia, serif", xlsx:"Georgia"},
  {label:"Cambria",          value:"Cambria, serif", xlsx:"Cambria"},
  {label:"Garamond",         value:"Garamond, serif", xlsx:"Garamond"},
  {label:"Courier New",      value:"'Courier New', monospace", xlsx:"Courier New"},
  {label:"Comic Sans MS",    value:"'Comic Sans MS', cursive", xlsx:"Comic Sans MS"}
];
const SIZES = [8,9,10,11,12,13,14,16,18,20,24];
const uid = () => Math.random().toString(36).slice(2,9);
const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
/* Plan d'exemple, fourni par seed.js (window.SEED) : toujours renvoyé sous forme de copie,
   pour qu'une modification du plan restauré ne contamine pas le modèle. */
function seedData(){ if(!window.SEED) throw new Error("seed.js n'est pas chargé"); return clone(window.SEED); }
/* Nom du plan d'exemple, déduit de SON PROPRE titre : les années affichées
   doivent correspondre au calendrier réellement contenu dans les données,
   sinon les dates en info-bulle contrediraient le nom du plan. */
function nomDuSeed(){
  const m=/(20\d{2})\s*[-–—]\s*(20\d{2})/.exec((window.SEED&&window.SEED.title)||"");
  return m ? "BTS Électrotechnique "+m[1]+"-"+m[2] : "BTS Électrotechnique (exemple)";
}

/* ---------- State ---------- */
let DB = null;          // {order:[ids], plans:{id:plan}, currentId}
let plan = null;        // current plan
let activeYear = 0;
let editMode = false;
let zoom = 100;
let drawerCtx = null;   // {kind:'act'|'band', yearIdx, rowIdx, index|null, draft}
let selecting = null;   // {rowIdx, a, b} during drag
let filterTeacher = ""; // id du prof filtré ("" = tous)

/* ========================================================================
   AUTHENTIFICATION + STOCKAGE EN BASE (Supabase)
   ======================================================================== */
const PREF_KEY = "pdf_v2_prefs";
let sb=null, me=null, appWired=false;

const uuidv4 = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);}));

function loadPref(){ try{ return JSON.parse(localStorage.getItem(PREF_KEY))||{}; }catch(e){ return {}; } }
function savePref(){ try{ localStorage.setItem(PREF_KEY, JSON.stringify({currentId:DB&&DB.currentId, library:(DB&&DB.library)||[]})); }catch(e){} }

function canEditPlan(id){ const m=DB&&DB.meta&&DB.meta[id]; return !!(m && m.canEdit); }
function canEditCurrent(){ return !!(plan && canEditPlan(DB.currentId)); }
function isOwnerOrAdmin(id){ const m=DB.meta&&DB.meta[id]; return !!(m && (m.owner===me.id || (me&&me.role==='admin'))); }

async function cloudLoad(){
  DB={order:[],plans:{},meta:{},currentId:null,library:[]};
  const pref=loadPref(); DB.library=Array.isArray(pref.library)?pref.library:[];
  const {data,error}=await sb.from('plans').select('id,owner,name,data,published,updated_at').order('created_at',{ascending:true});
  if(error){
    /* Réseau ou base injoignable : on signale l'échec au lieu de laisser croire
       que le compte ne contient aucun plan (l'utilisateur en recréerait). */
    cloudLoadFailed=true;
    toast("Erreur de chargement : "+error.message);
    return false;
  }
  cloudLoadFailed=false;
  /* Plans qu'un collègue m'a explicitement autorisé à modifier (table plan_editors). */
  const shared=new Set();
  const ed=await sb.from('plan_editors').select('plan_id').eq('user_id',me.id);
  if(!ed.error) (ed.data||[]).forEach(r=>shared.add(r.plan_id));
  (data||[]).forEach(row=>{
    let p; try{ p=normalizePlan(row.data && row.data.years ? row.data : {years:[]}); }catch(e){ return; }
    p.name=row.name||p.name;
    DB.plans[row.id]=p; DB.order.push(row.id);
    DB.meta[row.id]={owner:row.owner,published:!!row.published,
                     canEdit:(row.owner===me.id||me.role==='admin'||shared.has(row.id)),
                     shared:shared.has(row.id),isNew:false,rev:row.updated_at||null};
  });
  if(!DB.order.length){   // premier usage : on crée le plan exemple
    const seed=normalizePlan(seedData());
    seed.name=nomDuSeed();
    const id=createLocalPlan(seed); await savePlanCloud(id);
  }
  DB.currentId=(pref.currentId&&DB.plans[pref.currentId])?pref.currentId:DB.order[0];
  plan=DB.plans[DB.currentId]||null;
  return true;
}
function createLocalPlan(p){
  const id=uuidv4();
  DB.plans[id]=p; DB.meta[id]={owner:me.id,published:false,canEdit:true,isNew:true,rev:null}; DB.order.push(id);
  return id;
}

/* =========================================================================
   ENREGISTREMENT — file d'attente, cache de secours, verrou anti-écrasement
   -------------------------------------------------------------------------
   Trois garde-fous :
   1. la file `dirty` retient l'identifiant du plan modifié AU MOMENT de la
      modification. Avant, le minuteur lisait DB.currentId 600 ms plus tard :
      changer de plan pendant ce délai enregistrait le mauvais plan ;
   2. chaque modification est recopiée dans localStorage et n'en est retirée
      qu'une fois l'enregistrement en base confirmé — une coupure réseau ne
      fait donc plus perdre le travail ;
   3. l'enregistrement compare `updated_at` à la version chargée : si un
      collègue a enregistré entre-temps, on ne l'écrase pas en silence.
   ========================================================================= */
const CACHE_KEY="pdf_v2_cache";
const dirty=new Set();            // plans modifiés, pas encore confirmés en base
let saveTimer=null, saveRunning=false, retryTimer=null, retryDelay=0;
let conflictOpen=false, cloudLoadFailed=false;

function loadCache(){ try{ return JSON.parse(localStorage.getItem(CACHE_KEY))||{}; }catch(e){ return {}; } }
function writeCache(c){ try{ localStorage.setItem(CACHE_KEY, JSON.stringify(c)); return true; }
                        catch(e){ return false; } }   // quota dépassé : il ne reste que la base
function cacheLocal(id){
  const p=DB.plans[id]; if(!p) return;
  const c=loadCache();
  c[id]={name:p.name, data:p, at:Date.now(), user:me&&me.id, isNew:!!(DB.meta[id]&&DB.meta[id].isNew)};
  writeCache(c);
}
function cacheClear(id){ const c=loadCache(); if(c[id]){ delete c[id]; writeCache(c); } }

/* Marque un plan comme modifié. L'identifiant est figé ici, pas au déclenchement du minuteur. */
function markDirty(id){
  if(!id || !DB.plans[id] || !canEditPlan(id)) return;
  dirty.add(id); cacheLocal(id); setSaveState("pending");
}
/* persist() = enregistrer tout de suite ; persistDebounced() = dans 600 ms */
function persist(){ savePref(); markDirty(DB.currentId); flushSaves(); }
function persistDebounced(){ savePref(); markDirty(DB.currentId);
  clearTimeout(saveTimer); saveTimer=setTimeout(flushSaves,600); }

async function flushSaves(){
  clearTimeout(saveTimer); saveTimer=null;
  if(saveRunning || conflictOpen || !sb || !me) return;
  saveRunning=true;
  try{
    while(dirty.size){
      const id=dirty.values().next().value;
      dirty.delete(id);
      /* Le droit d'écriture a pu être retiré entre-temps : insister ferait
         boucler indéfiniment sur un refus du serveur. */
      if(!DB.plans[id] || !canEditPlan(id)){ cacheClear(id); continue; }
      const ok=await savePlanCloud(id);
      if(!ok){ if(DB.plans[id]) dirty.add(id); break; }   // on réessaiera
    }
  } finally { saveRunning=false; }
  if(dirty.size && !conflictOpen){ setSaveState("error"); scheduleRetry(); }
  else if(!dirty.size){ retryDelay=0; setSaveState("saved"); }
}
/* Nouvelle tentative espacée : 3 s, 7,5 s, 19 s, puis toutes les minutes. */
function scheduleRetry(){
  if(retryTimer) return;
  retryDelay = retryDelay ? Math.min(retryDelay*2.5, 60000) : 3000;
  retryTimer=setTimeout(()=>{ retryTimer=null; flushSaves(); }, retryDelay);
}

async function savePlanCloud(id){
  const p=DB.plans[id], m=DB.meta[id]; if(!p||!m||!sb||!me) return false;
  if(m.isNew){
    const {data,error}=await sb.from('plans')
      .insert({id, owner:me.id, name:p.name, data:p, published:!!m.published})
      .select('updated_at').maybeSingle();
    if(error){ toast("Enregistrement impossible : "+error.message); return false; }
    m.isNew=false; m.rev=(data&&data.updated_at)||null; cacheClear(id); return true;
  }
  let q=sb.from('plans').update({name:p.name, data:p, published:!!m.published}).eq('id',id);
  if(m.rev) q=q.eq('updated_at', m.rev);          // verrou : n'écraser que la version qu'on a lue
  const {data,error}=await q.select('updated_at').maybeSingle();
  if(error){ toast("Enregistrement impossible : "+error.message); return false; }
  if(!data){ await handleSaveConflict(id); return false; }
  m.rev=data.updated_at; cacheClear(id); return true;
}

/* Fermer la modale de conflit sans choisir ne doit pas geler les enregistrements :
   on relâche le verrou et on programme une nouvelle tentative. */
function releaseConflict(){ if(!conflictOpen) return; conflictOpen=false; if(dirty.size){ setSaveState("error"); scheduleRetry(); } }

/* Aucune ligne mise à jour : soit un collègue a enregistré depuis, soit le plan a été supprimé. */
async function handleSaveConflict(id){
  if(conflictOpen) return;
  const {data}=await sb.from('plans').select('name,data,published,updated_at').eq('id',id).maybeSingle();
  conflictOpen=true; setSaveState("error");
  if(!data){
    openModal("⚠️ Ce plan n'existe plus en base", (body,foot,close)=>{
      body.innerHTML="<p>Le plan <b>"+esc(DB.plans[id]?DB.plans[id].name:"")+"</b> a été supprimé par son propriétaire "+
        "pendant que vous le modifiiez.</p><p class=\"hint\">Vos modifications sont encore à l'écran : vous pouvez les "+
        "réenregistrer sous forme de nouveau plan, qui vous appartiendra.</p>";
      const again=document.createElement("button"); again.className="primary"; again.textContent="Réenregistrer comme nouveau plan";
      again.onclick=()=>{ const m=DB.meta[id]; m.isNew=true; m.owner=me.id; m.rev=null; m.canEdit=true;
                          conflictOpen=false; close(); markDirty(id); flushSaves(); };
      const giveUp=document.createElement("button"); giveUp.textContent="Abandonner ce plan";
      giveUp.onclick=()=>{ conflictOpen=false; close(); dropPlanLocally(id); };
      foot.append(giveUp,again);
    }, releaseConflict);
    return;
  }
  const when=new Date(data.updated_at).toLocaleString("fr-FR");
  openModal("⚠️ Modifié par quelqu'un d'autre", (body,foot,close)=>{
    body.innerHTML="<p>Le plan <b>"+esc(data.name||"")+"</b> a été enregistré par un autre compte le <b>"+esc(when)+"</b>, "+
      "après le moment où vous l'avez ouvert.</p>"+
      "<p class=\"hint\">Pour ne rien écraser par accident, votre enregistrement est suspendu. Choisissez :</p>"+
      "<ul class=\"hint\" style=\"margin:0;padding-left:18px\">"+
      "<li><b>Garder la version du serveur</b> : vos modifications en cours sont abandonnées.</li>"+
      "<li><b>Imposer ma version</b> : le travail de l'autre personne est remplacé par le vôtre.</li></ul>";
    const takeTheirs=document.createElement("button"); takeTheirs.textContent="Garder la version du serveur";
    takeTheirs.onclick=()=>{
      const p=normalizePlan(data.data&&data.data.years?data.data:{years:[]}); p.name=data.name||p.name;
      DB.plans[id]=p; DB.meta[id].rev=data.updated_at; DB.meta[id].published=!!data.published;
      dirty.delete(id); cacheClear(id);
      if(id===DB.currentId){ plan=p; activeYear=0; }
      conflictOpen=false; close(); render(); setSaveState("saved"); toast("Version du serveur rechargée");
    };
    const takeMine=document.createElement("button"); takeMine.className="primary"; takeMine.textContent="Imposer ma version";
    takeMine.onclick=()=>{ DB.meta[id].rev=data.updated_at;   // repartir de la version serveur pour réécrire par-dessus
                           conflictOpen=false; close(); markDirty(id); flushSaves(); };
    foot.append(takeTheirs,takeMine);
  }, releaseConflict);
}

/* Retire un plan de la session sans toucher à la base (il n'y est plus). */
function dropPlanLocally(id){
  dirty.delete(id); cacheClear(id);
  delete DB.plans[id]; delete DB.meta[id];
  DB.order=DB.order.filter(x=>x!==id);
  if(DB.currentId===id){ DB.currentId=DB.order[0]||null; plan=DB.currentId?DB.plans[DB.currentId]:null; activeYear=0; }
  savePref(); render();
}

async function deletePlanCloud(id){ const {error}=await sb.from('plans').delete().eq('id',id); if(error) toast("Suppression impossible : "+error.message); }
async function setPublished(id, val){
  const m=DB.meta[id]; if(!m) return; m.published=val;
  const {data,error}=await sb.from('plans').update({published:val}).eq('id',id).select('updated_at').maybeSingle();
  if(error||!data){ toast("Publication impossible : "+((error&&error.message)||"plan introuvable")); m.published=!val; return; }
  m.rev=data.updated_at;
}

/* Give every entity an id + default colors so the app has stable references */
function normalizePlan(p){
  p = clone(p);
  p.name = p.name || p.title || "Plan de formation";
  if(typeof p.font !== "string") p.font = "";     // "" = police par défaut de l'appli
  p.fontSize = p.fontSize || 12;                   // taille de base du texte des cases
  p.colWidth = p.colWidth || 48;                   // largeur d'une colonne semaine (px)
  p.teachers = Array.isArray(p.teachers) ? p.teachers : [];
  p.teachers.forEach((t,i)=>{ t.id=t.id||uid(); t.color=t.color||TEACHER_COLORS[i%TEACHER_COLORS.length]; });
  p.years.forEach((y,yi)=>{
    // année de rentrée : sert aux dates réelles et au retrait des vacances
    if(!y.startYear){ const sy=inferStartYear(p,y,yi); if(sy) y.startYear=sy; }
    /* Découpage par mois recalculé sur la règle « majorité de jours de classe »
       dès que la date de la colonne est connue, pour que les plans anciens et
       les nouveaux soient regroupés de la même façon. Le contenu des cases
       n'est pas touché : seuls les en-têtes de mois peuvent changer. */
    const datesY=weekDatesFor(y, y.startYear);
    y.weeks.forEach(w=>{
      const iso=datesY.get(w); if(!iso) return;
      if(!w.d) w.d=iso;
      w.month=MONTHS_FR[moisDeLaSemaine(new Date(iso+"T00:00:00"))];
    });
    y.rows.forEach((r,ri)=>{
      r.id = r.id || uid();
      r.color = r.color || PALETTE[ri % PALETTE.length];
      r.activities.forEach(a=>{ a.id=a.id||uid(); if(a.teachers&&!Array.isArray(a.teachers))a.teachers=[]; });
    });
    (y.bands=y.bands||[]).forEach(b=> b.id=b.id||uid());
  });
  return p;
}
const TEACHER_COLORS=["#4f46e5","#0891b2","#059669","#ca8a04","#dc2626","#db2777","#7c3aed","#ea580c","#0d9488","#2563eb","#65a30d","#9333ea","#e11d48","#0284c7","#b45309","#16a34a"];
function teacherById(id){ return (plan.teachers||[]).find(t=>t.id===id); }
function teacherInitials(name){ return (name||"").split(/[\s.\-]+/).filter(Boolean).map(w=>w[0]).slice(0,3).join("").toUpperCase()||"?"; }

/* ===== Référentiel BTS Électrotechnique : compétences & tâches ===== */
const COMPETENCES=[
  {code:"C1",label:"recenser et prendre en compte les normes, les réglementations applicables au projet/chantier"},
  {code:"C2",label:"extraire les informations nécessaires à la réalisation des tâches"},
  {code:"C3",label:"gérer les risques et les aléas liés à la réalisation des tâches"},
  {code:"C4",label:"communiquer de manière adaptée à l'oral, à l'écrit, y compris en langue anglaise"},
  {code:"C5",label:"interpréter un besoin client/utilisateur, un CCTP, un cahier des charges"},
  {code:"C6",label:"modéliser le comportement de tout ou partie d'un ouvrage, d'une installation, d'un équipement électrique"},
  {code:"C7",label:"simuler le comportement de tout ou partie d'un ouvrage, d'une installation, d'un équipement électrique"},
  {code:"C8",label:"dimensionner les constituants d'un ouvrage, d'une installation, d'un équipement électrique"},
  {code:"C9",label:"choisir les constituants d'un ouvrage, d'une installation, d'un équipement électrique"},
  {code:"C10",label:"proposer l'architecture d'un ouvrage, d'une installation, d'un équipement électrique"},
  {code:"C11",label:"réaliser les documents du projet/chantier (plans, schémas, maquette virtuelle, etc.)"},
  {code:"C12",label:"gérer et conduire (organisation, planification, suivi, pilotage, réception…) le projet/chantier"},
  {code:"C13",label:"mesurer les grandeurs caractéristiques d'un ouvrage, d'une installation, d'un équipement électrique"},
  {code:"C14",label:"réaliser un ouvrage, une installation, un équipement électrique"},
  {code:"C15",label:"configurer et programmer les matériels dans le cadre du projet/chantier"},
  {code:"C16",label:"appliquer un protocole pour mettre en service un ouvrage, une installation, un équipement électrique"},
  {code:"C17",label:"réaliser un diagnostic de performance (énergétique, de sécurité) d'un ouvrage, d'une installation, d'un équipement électrique"},
  {code:"C18",label:"réaliser des opérations de maintenance sur un ouvrage, une installation, un équipement électrique"}
];
const TACHES=[
  {code:"T 1.1",label:"analyser et/ou élaborer les documents relatifs aux besoins du client/utilisateur"},
  {code:"T 1.2",label:"élaborer un avant-projet/chantier (ou avant-projet sommaire)"},
  {code:"T 1.3",label:"dimensionner les constituants de l'installation"},
  {code:"T 1.4",label:"définir les coûts pour préparer une offre commerciale"},
  {code:"T 2.1",label:"choisir les matériels"},
  {code:"T 2.2",label:"réaliser les documents techniques du projet/chantier"},
  {code:"T 3.1",label:"proposer un protocole pour analyser le fonctionnement et/ou le comportement de l'installation"},
  {code:"T 3.2",label:"mesurer et contrôler l'installation, exploiter les mesures pour faire le diagnostic"},
  {code:"T 3.3",label:"formuler des préconisations"},
  {code:"T 4.1",label:"organiser la maintenance"},
  {code:"T 4.2",label:"réaliser la maintenance préventive ou prévisionnelle"},
  {code:"T 4.3",label:"réaliser la maintenance corrective"},
  {code:"T 5.1",label:"s'approprier et vérifier les informations relatives au projet/chantier"},
  {code:"T 5.2",label:"planifier les étapes du projet/chantier"},
  {code:"T 5.3",label:"assurer le suivi de la réalisation du projet/chantier (coûts, délais, qualité)"},
  {code:"T 5.4",label:"faire appliquer les règles liées à la santé, la sécurité et l'environnement"},
  {code:"T 5.5",label:"gérer et animer l'équipe projet/chantier"},
  {code:"T 6.1",label:"organiser l'espace de travail"},
  {code:"T 6.2",label:"implanter, poser, installer, câbler, raccorder les matériels électriques"},
  {code:"T 6.3",label:"programmer les applications métiers"},
  {code:"T 7.1",label:"réaliser les contrôles, les configurations, les essais fonctionnels"},
  {code:"T 7.2",label:"vérifier le fonctionnement de l'installation"},
  {code:"T 7.3",label:"réceptionner l'installation avec le client/utilisateur"},
  {code:"T 8.1",label:"constituer et mettre à jour les dossiers du projet/chantier"},
  {code:"T 8.2",label:"échanger, y compris en langue anglaise, avec les parties prenantes du projet/chantier"},
  {code:"T 8.3",label:"expliquer le fonctionnement de l'installation et former le client/utilisateur à son utilisation"},
  {code:"T 8.4",label:"préparer et animer des réunions"},
  {code:"T 8.5",label:"présenter et argumenter, y compris en langue anglaise, une offre à un client/utilisateur"}
];
const TASK_TO_COMP={"T 5.2":["C1","C10"],"T 5.4":["C1","C3"],"T 3.1":["C2"],"T 4.1":["C2"],"T 4.2":["C2","C13","C18"],"T 4.3":["C2","C13","C17","C18"],"T 5.3":["C3"],"T 7.3":["C4"],"T 8.2":["C4","C12"],"T 8.3":["C4"],"T 8.4":["C4"],"T 8.5":["C4","C5","C10"],"T 1.1":["C5"],"T 1.2":["C5","C6","C8","C10"],"T 1.3":["C5","C6","C8"],"T 1.4":["C5"],"T 2.1":["C7","C9"],"T 2.2":["C11"],"T 5.1":["C12"],"T 5.5":["C12"],"T 3.2":["C13","C17"],"T 3.3":["C17"],"T 6.1":["C14"],"T 6.2":["C14"],"T 6.3":["C15"],"T 7.1":["C15","C16"],"T 7.2":["C15","C16"],"T 8.1":["C11"]};
const compLabel=code=>{const c=COMPETENCES.find(x=>x.code===code);return c?c.code+" : "+c.label:code;};
const tacheLabel=code=>{const t=TACHES.find(x=>x.code===code);return t?t.code+" : "+t.label:code;};

/* =========================================================================
   RENDER
   ========================================================================= */
function render(){
  renderPlanPicker();
  if(!plan){ applyPermissions(); renderEmptyState(); return; }
  applyPermissions();
  renderYearTabs();
  renderTypography();
  renderTeacherFilter();
  $("#planTitleChip").textContent = plan.name;
  $("#zoomVal").textContent = zoom+"%";
  document.documentElement.style.setProperty("--wcol",((plan.colWidth||48)*zoom/100)+"px");
  renderGrid();
}

/* Verrouille l'interface en lecture seule si l'utilisateur n'a pas le droit d'éditer */
function applyPermissions(){
  const ro = !!plan && !canEditCurrent();
  const m = plan && DB.meta[DB.currentId];
  const tog=$("#editToggle");
  if(ro){ editMode=false; if(tog){tog.checked=false; tog.disabled=true;} }
  else if(tog){ tog.disabled=false; }
  const roB=$("#roBadge"); if(roB) roB.style.display = ro ? "" : "none";
  const pubB=$("#pubBadge"); if(pubB) pubB.style.display = (m && m.published) ? "" : "none";
  const shB=$("#sharedBadge"); if(shB) shB.style.display = (m && m.shared) ? "" : "none";
  setSaveState(saveStateNow());   // réévalue aussi l'état « lecture seule »
}

function renderTypography(){
  const root=document.documentElement.style;
  root.setProperty("--grid-font", plan.font || "inherit");
  root.setProperty("--act-fs", (plan.fontSize||12)+"px");
  root.setProperty("--lab-fs", ((plan.fontSize||12)+1)+"px");
  // fill the font selector once
  const sel=$("#fontSel");
  if(sel.options.length!==FONTS.length){
    sel.innerHTML=""; FONTS.forEach(f=>{ const o=document.createElement("option"); o.value=f.value; o.textContent=f.label; sel.appendChild(o); });
  }
  sel.value = plan.font || "";
  $("#fsVal").textContent = plan.fontSize||12;
}
function setPlanFontSize(v){
  if(!plan) return;
  plan.fontSize = Math.max(7, Math.min(28, v));
  persistDebounced(); renderTypography(); renderGrid();
}

function renderEmptyState(){
  $("#yearTabs").innerHTML="";
  $("#planTitleChip").textContent="";
  const g=$("#grid");
  g.style.gridTemplateColumns="1fr"; g.style.gridTemplateRows="1fr";
  g.innerHTML=`<div class="empty">
    <div style="font-size:46px;margin-bottom:10px">📋</div>
    <h2 style="margin:0 0 6px">Aucun plan de formation</h2>
    <p class="hint" style="max-width:360px;margin:0 0 20px">
      Créez un nouveau plan, importez une sauvegarde JSON, ou restaurez le plan BTS d'origine.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
      <button class="primary" id="esNew">＋ Nouveau plan</button>
      <button id="esImport">⬆ Importer un JSON</button>
      <button id="esSeed">↺ Restaurer le plan d'origine</button>
    </div></div>`;
  $("#esNew").onclick=newBlankPlan;
  $("#esImport").onclick=importJSON;
  $("#esSeed").onclick=restoreSeed;
}
function restoreSeed(){
  const seed=normalizePlan(seedData());
  seed.name=nomDuSeed();
  const id=createLocalPlan(seed); switchPlan(id); persist(); toast("Plan d'origine restauré");
}

function renderPlanPicker(){
  const sel = $("#planSel"); sel.innerHTML="";
  DB.order.forEach(id=>{
    const o=document.createElement("option");
    o.value=id; o.textContent=DB.plans[id].name; if(id===DB.currentId)o.selected=true;
    sel.appendChild(o);
  });
}
function renderYearTabs(){
  const t=$("#yearTabs"); t.innerHTML="";
  plan.years.forEach((y,i)=>{
    const b=document.createElement("button");
    b.className="tab"+(i===activeYear?" active":"");
    b.textContent=y.label;
    b.onclick=()=>{activeYear=i;render();};
    t.appendChild(b);
  });
}

function renderGrid(){
  const y = plan.years[activeYear];
  const grid = $("#grid");
  grid.innerHTML="";
  const N = y.weeks.length, S = y.rows.length;
  grid.style.gridTemplateColumns = `var(--label-w) ${colTemplate(y)}`;
  const rowTracks = y.rows.map(r=> r.height ? r.height+"px" : "minmax(var(--rowh),auto)").join(" ");
  grid.style.gridTemplateRows = `34px 28px 26px ${rowTracks}`;

  // corner
  const corner=document.createElement("div");
  corner.className="corner";
  corner.innerHTML=`<div class="yr">${esc(y.label)}</div><div class="sub">${esc(plan.name)}</div>`;
  grid.appendChild(corner);

  // semester header (group by semester value, contiguous)
  groupRuns(y.weeks.map(w=>w.semester)).forEach(run=>{
    const el=document.createElement("div");
    const semLabel = y.semesters[y.weeks[run.start].semester-1] || ("SEMESTRE "+y.weeks[run.start].semester);
    el.className="hd sem "+(y.weeks[run.start].semester===1?"s1":"s2");
    el.style.gridColumn = `${2+run.start} / ${2+run.end+1}`;
    el.textContent = semLabel;
    grid.appendChild(el);
  });
  // month header
  groupRuns(y.weeks.map(w=>w.month||"")).forEach(run=>{
    const el=document.createElement("div");
    el.className="hd month";
    el.style.gridColumn = `${2+run.start} / ${2+run.end+1}`;
    el.textContent = y.weeks[run.start].month||"";
    grid.appendChild(el);
  });
  // week header (with column-resize grip on the right edge)
  const dates=weekDatesFor(y, y.startYear);
  y.weeks.forEach((w,wi)=>{
    const el=document.createElement("div");
    el.className="hd week";
    el.style.gridColumn = `${2+wi}`;
    el.textContent = w.week;
    el.title = libelleSemaine(w.week, dates.get(w));   // info-bulle : dates réelles
    const grip=document.createElement("div");
    grip.className="colgrip"; grip.title="Glisser pour régler CETTE colonne (double-clic = largeur par défaut)";
    grip.addEventListener("mousedown",e=>startColResize(e,wi));
    grip.addEventListener("dblclick",e=>{e.stopPropagation();delete plan.years[activeYear].weeks[wi].w;persistDebounced();renderGrid();toast("Colonne réinitialisée");});
    el.appendChild(grip);
    grid.appendChild(el);
  });

  // subject rows
  y.rows.forEach((row,ri)=>{
    // label
    const lab=document.createElement("div");
    lab.className="rowlab"+(ri%2?" alt":"");
    lab.style.gridRow = `${4+ri}`;
    lab.innerHTML=`<span class="txt" title="Double-cliquez pour renommer">${esc(row.label||"")}</span>`;
    lab.querySelector(".txt").addEventListener("dblclick",e=>{e.stopPropagation();startLabelEdit(ri,e.currentTarget);});
    if(editMode){
      const m=document.createElement("button");
      m.className="icon ghost rowmenu"; m.textContent="⋯"; m.title="Options de la ligne";
      m.onclick=e=>{e.stopPropagation();openRowMenu(ri,m);};
      lab.appendChild(m);
    }
    const rgrip=document.createElement("div");
    rgrip.className="rowgrip"; rgrip.title="Glisser pour ajuster la hauteur (double-clic = auto)";
    rgrip.addEventListener("mousedown",e=>startRowResize(e,ri));
    rgrip.addEventListener("dblclick",e=>{e.stopPropagation();delete plan.years[activeYear].rows[ri].height;persistDebounced();renderGrid();toast("Hauteur automatique");});
    lab.appendChild(rgrip);
    grid.appendChild(lab);

    // background cells
    y.weeks.forEach((w,wi)=>{
      const c=document.createElement("div");
      c.className="bgcell"+(w.semester===2?" sem2":"")+(editMode?" hoverable":"");
      c.style.gridRow=`${4+ri}`; c.style.gridColumn=`${2+wi}`;
      c.dataset.ri=ri; c.dataset.wi=wi;
      if(editMode) attachCellDrag(c,ri,wi);
      grid.appendChild(c);
    });

    // activities
    row.activities.forEach((a,ai)=>{
      const el=document.createElement("div");
      el.className="act"+(editMode?" editable":"");
      el.style.gridRow=`${4+ri}`;
      el.style.gridColumn=`${2+clampW(y,a.start)} / ${2+clampW(y,a.end)+1}`;
      el.style.background=a.color||row.color;
      el.style.color=textOn(a.color||row.color);
      if(a.font) el.style.fontFamily=a.font;
      if(a.size) el.style.fontSize=a.size+"px";
      el.textContent=a.text;
      el.title=a.text;
      // pastilles professeurs
      if(a.teachers&&a.teachers.length){
        const tb=document.createElement("div"); tb.className="teachers";
        a.teachers.forEach(id=>{ const t=teacherById(id); if(!t)return;
          const p=document.createElement("span"); p.className="tpill"; p.style.background=t.color;
          p.textContent=teacherInitials(t.name); p.title=t.name; tb.appendChild(p); });
        el.appendChild(tb);
      }
      // badges compétences (C) & tâches (T)
      if((a.taches&&a.taches.length)||(a.comps&&a.comps.length)){
        const cb=document.createElement("div"); cb.className="codes";
        (a.taches||[]).forEach(code=>{ const s=document.createElement("span"); s.className="cbadge t"; s.textContent=code.replace(/\s/g,""); s.title=tacheLabel(code); cb.appendChild(s); });
        (a.comps||[]).forEach(code=>{ const s=document.createElement("span"); s.className="cbadge c"; s.textContent=code; s.title=compLabel(code); cb.appendChild(s); });
        el.appendChild(cb);
      }
      // la première ligne (Systèmes/Projets) reste toujours visible, même filtrée
      if(filterTeacher && ri!==0 && !(a.teachers&&a.teachers.includes(filterTeacher))) el.classList.add("dim");
      if(editMode){ attachBlockDrag(el,"act",ri,ai); attachBlockResize(el,"act",ri,ai); }
      grid.appendChild(el);
    });
  });

  // bands (full height overlay across all subject rows)
  (y.bands||[]).forEach((b,bi)=>{
    const el=document.createElement("div");
    el.className="band"+(editMode?" editable":"");
    el.style.gridRow=`4 / ${4+S}`;
    el.style.gridColumn=`${2+clampW(y,b.start)} / ${2+clampW(y,b.end)+1}`;
    if(b.color){ el.style.background=b.color; el.style.borderStyle="solid"; el.style.color=textOn(b.color); }
    if(b.font) el.style.fontFamily=b.font;
    if(b.size) el.style.fontSize=b.size+"px";
    const span=document.createElement("div"); span.className="bt"; span.textContent=b.text;
    el.appendChild(span);
    if(b.teachers&&b.teachers.length){
      el.title=(b.text)+" — "+b.teachers.map(id=>{const t=teacherById(id);return t?t.name:"";}).filter(Boolean).join(", ");
      const tb=document.createElement("div"); tb.className="band-teachers";
      b.teachers.forEach(id=>{ const t=teacherById(id); if(!t)return;
        const p=document.createElement("span"); p.className="tpill"; p.style.background=t.color;
        p.textContent=teacherInitials(t.name); p.title=t.name; tb.appendChild(p); });
      el.appendChild(tb);
    }
    if(filterTeacher && !(b.teachers&&b.teachers.includes(filterTeacher))) el.classList.add("dim");
    if(editMode){ attachBlockDrag(el,"band",null,bi); attachBlockResize(el,"band",null,bi); }
    grid.appendChild(el);
  });
}

function clampW(y,i){ return Math.max(0,Math.min(y.weeks.length-1,i)); }
/* Largeurs de colonnes : chaque semaine peut avoir sa propre largeur (w.w), sinon la valeur par défaut du plan */
function colTemplate(y){
  const z=zoom/100, base=plan.colWidth||48;
  return y.weeks.map(w=> ((w.w||base)*z)+"px").join(" ");
}
function applyColWidths(){
  const y=plan.years[activeYear];
  $("#grid").style.gridTemplateColumns=`var(--label-w) ${colTemplate(y)}`;
}
function groupRuns(arr){
  const runs=[]; let s=0;
  for(let i=1;i<=arr.length;i++){ if(i===arr.length||arr[i]!==arr[s]){runs.push({start:s,end:i-1});s=i;} }
  return runs;
}
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
/* Renvoie une couleur de texte lisible (foncé/blanc) selon la luminance du fond */
function textOn(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(hex||""); if(!m) return "#0f172a";
  const n=parseInt(m[1],16), r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  const lum=(0.299*r+0.587*g+0.114*b)/255;
  return lum>0.6 ? "#0f172a" : "#ffffff";
}

/* =========================================================================
   DÉPLACEMENT D'UN BLOC À LA SOURIS
   -------------------------------------------------------------------------
   Glisser une activité la décale de semaine en semaine, et la fait changer de
   ligne si on la déplace verticalement. Les bandes traversant toute la grille,
   elles ne se décalent qu'horizontalement.

   Un simple clic doit continuer d'ouvrir l'éditeur : le glissement ne démarre
   qu'au-delà de quelques pixels, pour qu'un clic un peu tremblant ne devienne
   pas un déplacement involontaire.
   ========================================================================= */
const SEUIL_GLISSEMENT = 4;   // px avant de considérer que l'on déplace

/* Décalage réellement applicable à un bloc [start,end] dans un calendrier de N
   colonnes : le bloc garde toujours sa durée, il bute donc sur les extrémités
   au lieu d'être tronqué ou de sortir du tableau. */
function decalageBorne(start, end, N, souhaite){
  return Math.max(-start, Math.min(N-1-end, souhaite));
}

/* Case de fond située sous un point de l'écran.
   Deux précautions indispensables :
   - on parcourt TOUTE la pile d'éléments, car une bande (stage, rentrée…)
     recouvre la grille entière et masquerait la case ;
   - on ramène le point dans la zone réellement visible, barres de défilement
     exclues (clientWidth/clientHeight les excluent, getBoundingClientRect non),
     sinon glisser jusqu'au bord pour faire défiler place le curseur sur la
     barre et plus aucune case n'est trouvée. */
function caseSousPoint(zone, x, y){
  const r=zone.getBoundingClientRect();
  const px=Math.min(Math.max(x, r.left+1), r.left+zone.clientWidth-2);
  const py=Math.min(Math.max(y, r.top+1),  r.top+zone.clientHeight-2);
  return document.elementsFromPoint(px,py).find(t=>t.classList && t.classList.contains("bgcell")) || null;
}

/* Défilement automatique quand le curseur approche d'un bord, pendant un
   glissement. La grille déborde de l'écran en largeur (49 semaines) comme en
   hauteur (une vingtaine de matières) : sans cela, impossible d'atteindre la
   partie non visible. `pos` est l'objet vivant qui porte la position du curseur. */
function autoDefilement(zone, pos, majPosition, avecVertical){
  let vX=0, vY=0, id=0;
  const tick=()=>{
    id=requestAnimationFrame(tick);
    if(!vX && !vY) return;
    const ax=zone.scrollLeft, ay=zone.scrollTop;
    zone.scrollLeft+=vX; zone.scrollTop+=vY;
    if(zone.scrollLeft!==ax || zone.scrollTop!==ay) majPosition();   // la case sous le curseur a changé
  };
  id=requestAnimationFrame(tick);
  const MARGE=70, MAX=28;
  return {
    regler(){
      const r=zone.getBoundingClientRect();
      const droite=r.left+zone.clientWidth, bas=r.top+zone.clientHeight;
      vX = pos.x < r.left+MARGE   ? -Math.min(MAX,(r.left+MARGE-pos.x)/2)
         : pos.x > droite-MARGE   ?  Math.min(MAX,(pos.x-(droite-MARGE))/2) : 0;
      vY = !avecVertical          ? 0
         : pos.y < r.top+MARGE    ? -Math.min(MAX,(r.top+MARGE-pos.y)/2)
         : pos.y > bas-MARGE      ?  Math.min(MAX,(pos.y-(bas-MARGE))/2) : 0;
    },
    stop(){ cancelAnimationFrame(id); }
  };
}

/* Bornes d'un bloc dont on tire un bord. Le bord opposé ne bouge pas et le
   bloc conserve au minimum une colonne : tirer au-delà le réduit sans jamais
   l'inverser ni le faire sortir du calendrier. */
function bornesRedimension(cote, wi, origStart, origEnd, N){
  return cote==="gauche"
    ? { start: Math.min(Math.max(0, wi), origEnd), end: origEnd }
    : { start: origStart, end: Math.max(Math.min(N-1, wi), origStart) };
}

function attachBlockDrag(el, kind, rowIdx, index){
  el.addEventListener("mousedown", ev=>{
    if(ev.button!==0) return;
    const y=plan.years[activeYear];
    const item = kind==="act" ? ((y.rows[rowIdx]||{}).activities||[])[index] : (y.bands||[])[index];
    if(!item) return;

    const N=y.weeks.length, zone=$("#scroll");
    const debutX=ev.clientX, debutY=ev.clientY;
    const origStart=item.start, origEnd=item.end;
    let glisse=false, dW=0, cibleRi=rowIdx;

    /* Le bloc suit le curseur ; on le rend transparent aux évènements pour
       qu'il ne s'éclaire pas au survol pendant qu'on le déplace. */
    el.style.pointerEvents="none";
    const ancre=caseSousPoint(zone, debutX, debutY);
    const ancreWi = ancre ? +ancre.dataset.wi : origStart;

    const pos={x:debutX, y:debutY};
    const majPosition=()=>{
      const t=caseSousPoint(zone, pos.x, pos.y);
      if(t){
        dW = decalageBorne(origStart, origEnd, N, (+t.dataset.wi) - ancreWi);
        if(kind==="act") cibleRi = +t.dataset.ri;
      }
      el.style.gridColumn = `${2+origStart+dW} / ${2+origEnd+dW+1}`;
      if(kind==="act") el.style.gridRow = `${4+cibleRi}`;
    };
    // une bande occupe déjà toute la hauteur : pas de défilement vertical
    const defil=autoDefilement(zone, pos, majPosition, kind==="act");

    const move=e=>{
      if(!glisse){
        if(Math.abs(e.clientX-debutX)<SEUIL_GLISSEMENT && Math.abs(e.clientY-debutY)<SEUIL_GLISSEMENT) return;
        glisse=true; el.classList.add("dragging"); document.body.style.cursor="grabbing";
      }
      pos.x=e.clientX; pos.y=e.clientY;
      majPosition(); defil.regler();
    };

    const up=()=>{
      document.removeEventListener("mousemove",move);
      document.removeEventListener("mouseup",up);
      defil.stop();
      el.style.pointerEvents=""; el.classList.remove("dragging"); document.body.style.cursor="";

      if(!glisse){                                   // simple clic : éditeur
        if(kind==="act") openActEditor(rowIdx,index); else openBandEditor(index);
        return;
      }
      if(dW===0 && cibleRi===rowIdx){ renderGrid(); return; }   // reposé au même endroit

      item.start=origStart+dW; item.end=origEnd+dW;
      if(kind==="act" && cibleRi!==rowIdx){
        y.rows[rowIdx].activities.splice(index,1);
        y.rows[cibleRi].activities.push(item);
      }
      persistDebounced(); renderGrid();
      toast((kind==="act" && cibleRi!==rowIdx)
        ? `Déplacé vers « ${y.rows[cibleRi].label} » (S${y.weeks[item.start].week})`
        : `Décalé sur S${y.weeks[item.start].week}`+(item.end>item.start?`–S${y.weeks[item.end].week}`:""));
    };

    document.addEventListener("mousemove",move);
    document.addEventListener("mouseup",up);
    ev.preventDefault();      // évite la sélection de texte pendant le glissement
  });
}

/* Poignées de redimensionnement sur les deux bords du bloc : tirer le bord
   gauche change la semaine de début, le bord droit la semaine de fin. Le bord
   opposé ne bouge pas. */
function attachBlockResize(el, kind, rowIdx, index){
  ["gauche","droite"].forEach(cote=>{
    const poignee=document.createElement("div");
    poignee.className="rsz "+cote;
    poignee.title = cote==="gauche" ? "Tirer pour changer la semaine de début"
                                    : "Tirer pour changer la semaine de fin";
    poignee.addEventListener("mousedown", ev=>{
      if(ev.button!==0) return;
      ev.stopPropagation();     // ne pas déclencher le déplacement du bloc entier
      ev.preventDefault();

      const y=plan.years[activeYear];
      const item = kind==="act" ? ((y.rows[rowIdx]||{}).activities||[])[index] : (y.bands||[])[index];
      if(!item) return;

      const N=y.weeks.length, zone=$("#scroll");
      const debutX=ev.clientX;
      const origStart=item.start, origEnd=item.end;
      let glisse=false, bornes={start:origStart, end:origEnd};

      el.style.pointerEvents="none";
      const pos={x:debutX, y:ev.clientY};
      const majPosition=()=>{
        const t=caseSousPoint(zone, pos.x, pos.y);
        if(t) bornes=bornesRedimension(cote, +t.dataset.wi, origStart, origEnd, N);
        el.style.gridColumn = `${2+bornes.start} / ${2+bornes.end+1}`;
      };
      const defil=autoDefilement(zone, pos, majPosition, false);   // redimension : horizontal seul

      const move=e=>{
        if(!glisse){
          if(Math.abs(e.clientX-debutX)<SEUIL_GLISSEMENT) return;
          glisse=true; el.classList.add("dragging"); document.body.style.cursor="col-resize";
        }
        pos.x=e.clientX; pos.y=e.clientY;
        majPosition(); defil.regler();
      };
      const up=()=>{
        document.removeEventListener("mousemove",move);
        document.removeEventListener("mouseup",up);
        defil.stop();
        el.style.pointerEvents=""; el.classList.remove("dragging"); document.body.style.cursor="";

        if(!glisse){                                  // clic sur la poignée : éditeur
          if(kind==="act") openActEditor(rowIdx,index); else openBandEditor(index);
          return;
        }
        if(bornes.start===origStart && bornes.end===origEnd){ renderGrid(); return; }

        item.start=bornes.start; item.end=bornes.end;
        persistDebounced(); renderGrid();
        const n=item.end-item.start+1;
        toast(`S${y.weeks[item.start].week}`+(item.end>item.start?`–S${y.weeks[item.end].week}`:"")+` — ${n} semaine${n>1?"s":""}`);
      };

      document.addEventListener("mousemove",move);
      document.addEventListener("mouseup",up);
    });
    el.appendChild(poignee);
  });
}

/* =========================================================================
   DRAG-TO-CREATE on empty cells
   ========================================================================= */
function attachCellDrag(cell,ri,wi){
  cell.addEventListener("mousedown",e=>{
    if(e.button!==0) return;
    selecting={rowIdx:ri,a:wi,b:wi};
    paintSelection();
    const move=ev=>{
      const t=document.elementFromPoint(ev.clientX,ev.clientY);
      if(t&&t.classList.contains("bgcell")&&+t.dataset.ri===ri){ selecting.b=+t.dataset.wi; paintSelection(); }
    };
    const up=()=>{
      document.removeEventListener("mousemove",move);
      document.removeEventListener("mouseup",up);
      const a=Math.min(selecting.a,selecting.b), b=Math.max(selecting.a,selecting.b);
      selecting=null; clearSelection();
      openActEditor(ri,null,{start:a,end:b});
    };
    document.addEventListener("mousemove",move);
    document.addEventListener("mouseup",up);
    e.preventDefault();
  });
}
function paintSelection(){
  clearSelection();
  if(!selecting) return;
  const a=Math.min(selecting.a,selecting.b), b=Math.max(selecting.a,selecting.b);
  document.querySelectorAll(`.bgcell[data-ri="${selecting.rowIdx}"]`).forEach(c=>{
    const wi=+c.dataset.wi; if(wi>=a&&wi<=b) c.classList.add("sel");
  });
}
function clearSelection(){ document.querySelectorAll(".bgcell.sel").forEach(c=>c.classList.remove("sel")); }

/* =========================================================================
   REDIMENSIONNEMENT MANUEL (tirer les colonnes / lignes)
   ========================================================================= */
function startColResize(e, wi){
  e.preventDefault(); e.stopPropagation();
  const grip=e.currentTarget; grip.classList.add("drag");
  const y=plan.years[activeYear], z=zoom/100, startX=e.clientX;
  const startW=(y.weeks[wi].w)||(plan.colWidth||48);
  document.body.style.cursor="col-resize"; document.body.style.userSelect="none";
  const move=ev=>{
    let w=startW + (ev.clientX-startX)/z;
    y.weeks[wi].w=Math.round(Math.max(24, Math.min(600, w)));   // règle UNIQUEMENT cette colonne
    applyColWidths();
  };
  const up=()=>{ document.removeEventListener("mousemove",move); document.removeEventListener("mouseup",up);
    grip.classList.remove("drag"); document.body.style.cursor=""; document.body.style.userSelect="";
    persistDebounced(); };
  document.addEventListener("mousemove",move); document.addEventListener("mouseup",up);
}
function startRowResize(e,ri){
  e.preventDefault(); e.stopPropagation();
  const grip=e.currentTarget; grip.classList.add("drag");
  const row=plan.years[activeYear].rows[ri];
  const startY=e.clientY, startH=row.height || grip.parentElement.getBoundingClientRect().height;
  document.body.style.cursor="row-resize"; document.body.style.userSelect="none";
  const move=ev=>{ row.height=Math.round(Math.max(28, Math.min(700, startH+(ev.clientY-startY)))); applyRowHeights(); };
  const up=()=>{ document.removeEventListener("mousemove",move); document.removeEventListener("mouseup",up);
    grip.classList.remove("drag"); document.body.style.cursor=""; document.body.style.userSelect="";
    persistDebounced(); };
  document.addEventListener("mousemove",move); document.addEventListener("mouseup",up);
}
function applyRowHeights(){
  const y=plan.years[activeYear];
  const tracks=y.rows.map(r=> r.height ? r.height+"px":"minmax(var(--rowh),auto)").join(" ");
  $("#grid").style.gridTemplateRows=`34px 28px 26px ${tracks}`;
}

/* Édition en place de l'intitulé d'une ligne (double-clic) */
function startLabelEdit(ri,span){
  if(span.classList.contains("editing")) return;
  span.classList.add("editing");
  span.setAttribute("contenteditable","true");
  span.focus();
  const rng=document.createRange(); rng.selectNodeContents(span);
  const sel=getSelection(); sel.removeAllRanges(); sel.addRange(rng);
  const finish=save=>{
    span.removeEventListener("keydown",onKey); span.removeEventListener("blur",onBlur);
    span.removeAttribute("contenteditable"); span.classList.remove("editing");
    if(save){ plan.years[activeYear].rows[ri].label = span.textContent.trim(); persistDebounced(); }
    renderGrid();
  };
  const onKey=e=>{
    if(e.key==="Enter"){ e.preventDefault(); finish(true); }
    else if(e.key==="Escape"){ e.preventDefault(); finish(false); }
  };
  const onBlur=()=>finish(true);
  span.addEventListener("keydown",onKey);
  span.addEventListener("blur",onBlur);
}

/* =========================================================================
   PROFESSEURS  (import, gestion, affectation, filtre)
   ========================================================================= */
function renderTeacherFilter(){
  const sel=$("#teacherFilter"); if(!sel) return;
  sel.innerHTML="";
  const o0=document.createElement("option"); o0.value=""; o0.textContent="Tous les profs"; sel.appendChild(o0);
  (plan?plan.teachers:[]).forEach(t=>{ const o=document.createElement("option"); o.value=t.id; o.textContent=t.name; sel.appendChild(o); });
  if(!plan || !plan.teachers.some(t=>t.id===filterTeacher)) filterTeacher="";
  sel.value=filterTeacher;
}
function addTeachersFromText(txt){
  const names=(txt||"").split(/\r?\n|;/).map(s=>s.trim()).filter(Boolean);
  let added=0;
  names.forEach(n=>{
    if(!plan.teachers.some(t=>t.name.toLowerCase()===n.toLowerCase())){
      plan.teachers.push({id:uid(),name:n,color:TEACHER_COLORS[plan.teachers.length%TEACHER_COLORS.length]});
      added++;
    }
  });
  if(added) persistDebounced();
  renderTeacherFilter();
  return added;
}
function removeTeacher(id){
  plan.teachers=plan.teachers.filter(t=>t.id!==id);
  plan.years.forEach(y=>{
    y.rows.forEach(r=>r.activities.forEach(a=>{ if(a.teachers) a.teachers=a.teachers.filter(x=>x!==id); }));
    (y.bands||[]).forEach(b=>{ if(b.teachers) b.teachers=b.teachers.filter(x=>x!==id); });
  });
  if(filterTeacher===id) filterTeacher="";
  persistDebounced(); renderTeacherFilter(); renderGrid();
}
function importTeachersFile(done){
  const inp=document.createElement("input"); inp.type="file"; inp.accept=".txt,.csv,text/plain,text/csv";
  inp.onchange=()=>{ const f=inp.files[0]; if(!f)return; const rd=new FileReader();
    rd.onload=()=>{ const n=addTeachersFromText(rd.result); toast(n+" professeur(s) importé(s)"); done&&done(); };
    rd.readAsText(f); };
  inp.click();
}
function openTeacherManager(){
  openModal("👤 Professeurs", (body,foot,close)=>{
    const draw=()=>{
      body.innerHTML="";
      const imp=document.createElement("div"); imp.className="field";
      imp.innerHTML=`<label>Importer / saisir des professeurs (un nom par ligne)</label>
        <textarea id="tmPaste" placeholder="M. Dupont&#10;Mme Martin&#10;M. Bernard"></textarea>
        <div class="teach-import" style="margin-top:8px">
          <button class="primary" id="tmAdd">＋ Ajouter à la liste</button>
          <button id="tmFile">⬆ Importer un fichier .txt / .csv</button>
        </div>`;
      body.appendChild(imp);
      const lab=document.createElement("div"); lab.className="hint"; lab.style.margin="16px 0 8px";
      lab.textContent = plan.teachers.length ? (plan.teachers.length+" professeur(s) — modifiez le nom ou la couleur, ou supprimez :") : "Aucun professeur pour le moment.";
      body.appendChild(lab);
      const list=document.createElement("div"); list.className="list";
      plan.teachers.forEach(t=>{
        const row=document.createElement("div"); row.className="trow";
        const col=document.createElement("input"); col.type="color"; col.value=t.color;
        const name=document.createElement("input"); name.type="text"; name.value=t.name;
        const pill=document.createElement("span"); pill.className="tpill"; pill.style.background=t.color; pill.textContent=teacherInitials(t.name);
        const del=document.createElement("button"); del.className="danger icon"; del.textContent="🗑"; del.title="Supprimer";
        col.oninput=()=>{ t.color=col.value; pill.style.background=t.color; persistDebounced(); };
        name.onchange=()=>{ t.name=name.value.trim(); pill.textContent=teacherInitials(t.name); persistDebounced(); };
        del.onclick=()=>{ if(confirm(`Supprimer « ${t.name} » ? Il sera retiré de tous les créneaux.`)){ removeTeacher(t.id); draw(); } };
        row.append(col,name,pill,del); list.appendChild(row);
      });
      body.appendChild(list);
      body.querySelector("#tmAdd").onclick=()=>{ const n=addTeachersFromText(body.querySelector("#tmPaste").value); toast(n?`${n} ajouté(s)`:"Aucun nouveau nom"); draw(); };
      body.querySelector("#tmFile").onclick=()=>importTeachersFile(draw);
    };
    draw();
    const b=document.createElement("button"); b.className="primary"; b.textContent="Fermer";
    b.onclick=()=>{ close(); renderTeacherFilter(); renderGrid(); };
    foot.appendChild(b);
  });
}
/* Gestionnaire de la bibliothèque de blocs */
function openLibraryManager(){
  openModal("🧩 Bibliothèque de blocs", (body,foot,close)=>{
    const draw=()=>{
      body.innerHTML="";
      if(!DB.library.length){
        const p=document.createElement("p"); p.className="hint";
        p.innerHTML="Aucun bloc enregistré.<br>Depuis la fenêtre d'édition d'une activité/bande, cliquez sur <b>💾</b> pour enregistrer le bloc courant ici.";
        body.appendChild(p); return;
      }
      const info=document.createElement("div"); info.className="hint"; info.style.margin="0 0 8px";
      info.textContent=DB.library.length+" bloc(s) — renommez ou supprimez :"; body.appendChild(info);
      const list=document.createElement("div"); list.className="list";
      DB.library.forEach(bk=>{
        const row=document.createElement("div"); row.className="trow";
        const sw=document.createElement("span"); sw.className="tdot"; sw.style.cssText="width:16px;height:16px;border-radius:4px;flex:0 0 auto;border:1px solid var(--line)";
        sw.style.background=bk.color||"#e2e8f0";
        const nm=document.createElement("input"); nm.type="text"; nm.value=bk.name||bk.text; nm.title="Nom / contenu du bloc";
        const del=document.createElement("button"); del.className="danger icon"; del.textContent="🗑"; del.title="Supprimer";
        nm.onchange=()=>{ bk.name=nm.value.trim(); persistDebounced(); };
        del.onclick=()=>{ DB.library=DB.library.filter(x=>x.id!==bk.id); persistDebounced(); draw(); };
        row.append(sw,nm,del); list.appendChild(row);
      });
      body.appendChild(list);
    };
    draw();
    const b=document.createElement("button"); b.className="primary"; b.textContent="Fermer"; b.onclick=close;
    foot.appendChild(b);
  });
}

/* =========================================================================
   PARTAGE D'UN PLAN — visibilité + droits de modification
   -------------------------------------------------------------------------
   Deux niveaux, volontairement distincts :
   • Publier      : tous les comptes VOIENT le plan, personne ne peut le modifier.
   • Co-éditeurs  : les personnes cochées peuvent MODIFIER le plan (table
                    plan_editors). Les règles RLS appliquent ces droits côté
                    serveur : cocher ici ne fait qu'écrire la ligne d'autorisation.
   Réservé au propriétaire du plan (et aux admins).
   ========================================================================= */
function openShareManager(){
  const id=DB.currentId, m=DB.meta&&DB.meta[id];
  if(!plan||!m){ toast("Aucun plan sélectionné."); return; }
  if(!isOwnerOrAdmin(id)){ toast("Seul le propriétaire du plan (ou un admin) gère le partage."); return; }
  if(m.isNew){ toast("Enregistrez d'abord le plan (il n'existe pas encore en base)."); flushSaves(); return; }

  openModal("👥 Partage — « "+plan.name+" »", (body,foot,close)=>{
    body.innerHTML='<div class="hint">Chargement…</div>';
    let changed=false;
    (async()=>{
      const [profRes,edRes]=await Promise.all([
        sb.from("profiles").select("id,email,full_name,role").order("full_name",{ascending:true}),
        sb.from("plan_editors").select("user_id").eq("plan_id",id)
      ]);
      const err=profRes.error||edRes.error;
      if(err){ body.innerHTML='<div class="auth-msg err">Erreur : '+esc(err.message)+'</div>'; return; }
      const editors=new Set((edRes.data||[]).map(r=>r.user_id));
      const people=(profRes.data||[]).filter(u=>u.id!==m.owner);   // le propriétaire a déjà tous les droits
      body.innerHTML="";

      /* ---- Visibilité ---- */
      const vis=document.createElement("div"); vis.className="field";
      vis.innerHTML='<label>Visibilité</label>';
      const visRow=document.createElement("div"); visRow.style.cssText="display:flex;gap:8px;align-items:center;flex-wrap:wrap";
      const visBtn=document.createElement("button");
      const visTxt=document.createElement("span"); visTxt.className="hint";
      const paintVis=()=>{
        visBtn.textContent = m.published ? "🔒 Rendre privé" : "🌍 Publier";
        visBtn.className   = m.published ? "" : "primary";
        visTxt.textContent = m.published
          ? "Publié : tous les comptes peuvent le consulter (en lecture seule)."
          : "Privé : seuls vous et les co-éditeurs ci-dessous y ont accès.";
      };
      visBtn.onclick=async()=>{ visBtn.disabled=true; await setPublished(id,!m.published); visBtn.disabled=false; paintVis(); render(); };
      paintVis(); visRow.append(visBtn,visTxt); vis.appendChild(visRow); body.appendChild(vis);

      const sep=document.createElement("div"); sep.style.cssText="height:1px;background:var(--line);margin:16px 0";
      body.appendChild(sep);

      /* ---- Co-éditeurs ---- */
      const lab=document.createElement("div"); lab.className="field";
      lab.innerHTML='<label>Peuvent modifier ce plan</label>';
      body.appendChild(lab);
      if(!people.length){
        const h=document.createElement("p"); h.className="hint";
        h.textContent="Aucun autre compte pour le moment. Vos collègues doivent d'abord créer leur compte dans l'application.";
        body.appendChild(h);
      } else {
        const search=document.createElement("input"); search.type="text"; search.placeholder="Rechercher un collègue…";
        search.style.marginBottom="8px"; body.appendChild(search);
        const list=document.createElement("div"); list.className="list"; body.appendChild(list);
        const draw=()=>{
          const q=search.value.trim().toLowerCase();
          list.innerHTML="";
          const shown=people.filter(u=>!q || (u.full_name||"").toLowerCase().includes(q) || (u.email||"").toLowerCase().includes(q));
          if(!shown.length){ const h=document.createElement("div"); h.className="hint"; h.textContent="Aucun résultat."; list.appendChild(h); return; }
          shown.forEach(u=>{
            const row=document.createElement("div"); row.className="trow";
            const who=document.createElement("div"); who.style.cssText="flex:1;min-width:0";
            who.innerHTML="<b>"+esc(u.full_name||u.email)+"</b>"+(u.role==="admin"?' <span class="badge-role admin">Admin</span>':"")+
                          '<br><span class="hint" style="word-break:break-all">'+esc(u.email)+"</span>";
            const chip=document.createElement("button");
            const paint=()=>{ const on=editors.has(u.id);
              chip.textContent = on ? "✓ Peut modifier" : "＋ Autoriser";
              chip.className   = on ? "primary" : "";
              chip.title       = on ? "Retirer le droit de modification" : "Autoriser cette personne à modifier le plan"; };
            chip.onclick=async()=>{
              chip.disabled=true;
              if(editors.has(u.id)){
                const {error}=await sb.from("plan_editors").delete().eq("plan_id",id).eq("user_id",u.id);
                if(error) toast("Échec : "+error.message); else { editors.delete(u.id); changed=true; }
              } else {
                const {error}=await sb.from("plan_editors").insert({plan_id:id, user_id:u.id});
                if(error) toast("Échec : "+error.message); else { editors.add(u.id); changed=true; }
              }
              chip.disabled=false; paint();
            };
            paint();
            if(u.role==="admin"){ chip.disabled=true; chip.title="Les administrateurs peuvent déjà tout modifier."; }
            row.append(who,chip); list.appendChild(row);
          });
        };
        search.oninput=draw; draw();
      }

      const note=document.createElement("p"); note.className="hint"; note.style.marginTop="14px";
      note.textContent="Une personne qui vient d'être autorisée doit recharger la page pour voir le plan passer en modifiable.";
      body.appendChild(note);
    })();

    const b=document.createElement("button"); b.className="primary"; b.textContent="Fermer";
    b.onclick=()=>{ close(); if(changed) toast("Droits de partage mis à jour"); };
    foot.appendChild(b);
  });
}

/* Panneau d'administration : liste des comptes + changement de rôle (réservé admin) */
function openAdminPanel(){
  if(!me || me.role!=="admin"){ toast("Réservé aux administrateurs."); return; }
  openModal("🛡️ Administration — comptes & rôles", (body,foot,close)=>{
    body.innerHTML='<div class="hint">Chargement…</div>';
    (async()=>{
      const {data,error}=await sb.from("profiles").select("id,email,full_name,role").order("created_at",{ascending:true});
      if(error){ body.innerHTML='<div class="auth-msg err">Erreur : '+esc(error.message)+'</div>'; return; }
      body.innerHTML="";
      // ── Logo de l'établissement (écran de connexion) ──
      const logoBox=document.createElement("div"); logoBox.className="field"; logoBox.style.marginBottom="16px";
      logoBox.innerHTML='<label>Logo de l’établissement (écran de connexion)</label>';
      const logoRow=document.createElement("div"); logoRow.style.cssText="display:flex;gap:8px;align-items:center;flex-wrap:wrap";
      const bUp=document.createElement("button"); bUp.textContent="🖼️ Changer le logo…"; bUp.onclick=pickLogo;
      const bReset=document.createElement("button"); bReset.textContent="Rétablir par défaut"; bReset.onclick=resetLogo;
      logoRow.append(bUp,bReset); logoBox.appendChild(logoRow);
      const hint=document.createElement("div"); hint.className="hint"; hint.style.marginTop="6px";
      hint.textContent="Image ≤ ~400 Ko. Visible par tous à la connexion (rechargez la page pour l'actualiser)."; logoBox.appendChild(hint);
      body.appendChild(logoBox);
      const sepA=document.createElement("div"); sepA.style.cssText="height:1px;background:var(--line);margin:0 0 14px"; body.appendChild(sepA);
      const info=document.createElement("div"); info.className="hint"; info.style.margin="0 0 10px";
      info.textContent=data.length+" compte(s). Choisissez le rôle de chacun :"; body.appendChild(info);
      const list=document.createElement("div"); list.className="list";
      data.forEach(u=>{
        const row=document.createElement("div"); row.className="trow";
        const who=document.createElement("div"); who.style.flex="1"; who.style.minWidth="0";
        who.innerHTML='<b>'+esc(u.full_name||u.email)+'</b>'+(u.id===me.id?' <span class="badge-role">vous</span>':'')+
                      '<br><span class="hint" style="word-break:break-all">'+esc(u.email)+'</span>';
        const sel=document.createElement("select"); sel.style.width="150px";
        [["prof","Professeur"],["admin","Admin"]].forEach(([v,t])=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; if(u.role===v)o.selected=true; sel.appendChild(o); });
        sel.onchange=async()=>{
          const nr=sel.value, old=u.role;
          if(u.id===me.id && nr!=="admin" && !confirm("Vous retirez votre propre rôle Admin : vous perdrez l'accès à ce panneau. Continuer ?")){ sel.value="admin"; return; }
          const {error}=await sb.from("profiles").update({role:nr}).eq("id",u.id);
          if(error){ toast("Échec : "+error.message); sel.value=old; return; }
          u.role=nr; toast("Rôle mis à jour : "+(u.full_name||u.email));
          if(u.id===me.id){ me.role=nr; updateUserBar(); render(); }
        };
        row.append(who,sel); list.appendChild(row);
      });
      body.appendChild(list);
    })();
    const b=document.createElement("button"); b.className="primary"; b.textContent="Fermer"; b.onclick=close;
    foot.appendChild(b);
  });
}

/* ---- Logo partagé (écran de connexion), géré par l'admin ---- */
function applyLogo(src){ if(!src) return;
  const el=document.querySelector('#authScreen .logo-lg-img'); if(el) el.src=src;
  const tb=$("#brandLogo"); if(tb) tb.src=src;
}
/* recopie le logo par défaut (intégré dans l'écran de connexion) vers la barre du haut */
function initBrandLogo(){ const def=document.querySelector('#authScreen .logo-lg-img'); const tb=$("#brandLogo"); if(def&&tb&&!tb.src) tb.src=def.src; }
async function loadSharedLogo(){
  try{ const {data}=await sb.from('app_settings').select('logo').eq('id',1).maybeSingle(); if(data&&data.logo) applyLogo(data.logo); }catch(e){}
}
function pickLogo(){
  if(!me||me.role!=='admin'){ toast("Réservé aux administrateurs."); return; }
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=()=>{ const f=inp.files[0]; if(!f)return;
    if(f.size>400*1024){ toast("Image trop lourde (max ~400 Ko). Réduisez-la puis réessayez."); return; }
    const rd=new FileReader();
    rd.onload=async()=>{
      const dataURL=rd.result;
      const {error}=await sb.from('app_settings').update({logo:dataURL, updated_at:new Date().toISOString()}).eq('id',1);
      if(error){ toast("Échec : "+error.message); return; }
      applyLogo(dataURL); toast("Logo mis à jour ✓");
    };
    rd.readAsDataURL(f);
  };
  inp.click();
}
async function resetLogo(){
  if(!me||me.role!=='admin'){ toast("Réservé aux administrateurs."); return; }
  const {error}=await sb.from('app_settings').update({logo:null, updated_at:new Date().toISOString()}).eq('id',1);
  if(error){ toast("Échec : "+error.message); return; }
  toast("Logo réinitialisé — rechargez la page pour voir le logo par défaut.");
}

/* petite modale générique (indépendante de closeFloaters : ne se referme pas au clic d'ouverture) */
/* `onClose` est appelé quelle que soit la façon de fermer (bouton, Échap, clic
   à côté) : indispensable pour les modales qui suspendent quelque chose. */
function openModal(title, build, onClose){
  closeFloaters();
  const wrap=document.createElement("div"); wrap.className="modal";
  wrap.style.background="rgba(15,23,42,.4)";
  const card=document.createElement("div"); card.className="card";
  card.innerHTML=`<div class="mh">${esc(title)}</div><div class="mb"></div><div class="mf"></div>`;
  wrap.appendChild(card);
  let closed=false;
  const close=()=>{ if(closed) return; closed=true;
                    wrap.remove(); document.removeEventListener("keydown",onEsc);
                    if(onClose) onClose(); };
  const onEsc=e=>{ if(e.key==="Escape") close(); };
  wrap.addEventListener("mousedown",e=>{ if(e.target===wrap) close(); });
  document.addEventListener("keydown",onEsc);
  document.body.appendChild(wrap);
  build(card.querySelector(".mb"), card.querySelector(".mf"), close);
}

/* =========================================================================
   EDITOR DRAWER
   ========================================================================= */
function openActEditor(rowIdx,index,preset){
  const y=plan.years[activeYear];
  const draft = index!=null
    ? clone(y.rows[rowIdx].activities[index])
    : {id:uid(),text:"",start:(preset?preset.start:0),end:(preset?preset.end:0),color:null};
  drawerCtx={kind:"act",rowIdx,index,draft};
  $("#drawerTitle").textContent = index!=null?"Modifier l'activité":"Nouvelle activité";
  $("#lblRow").textContent="Ligne";
  fillRowSelect(rowIdx);
  buildDrawer(draft, y);
  $("#fDelete").style.display = index!=null?"":"none";
  showDrawer();
}
function openBandEditor(index){
  const y=plan.years[activeYear];
  const draft = index!=null ? clone(y.bands[index])
    : {id:uid(),text:"",start:0,end:Math.min(2,y.weeks.length-1),color:"#e2e8f0"};
  drawerCtx={kind:"band",index,draft};
  $("#drawerTitle").textContent = index!=null?"Modifier la bande (période spéciale)":"Nouvelle bande";
  $("#lblRow").textContent="Type";
  const sel=$("#fRow"); sel.innerHTML="";
  sel.parentElement.style.display="none"; // bands span all rows; hide row selector
  buildDrawer(draft,y);
  $("#fDelete").style.display = index!=null?"":"none";
  showDrawer();
}
function fillRowSelect(sel){
  const box=$("#fRow"); box.parentElement.style.display="";
  box.innerHTML="";
  plan.years[activeYear].rows.forEach((r,i)=>{
    const o=document.createElement("option"); o.value=i; o.textContent=r.label; if(i===sel)o.selected=true;
    box.appendChild(o);
  });
}
function buildDrawer(draft,y){
  $("#fText").value=draft.text||"";
  const fill=(sel,val)=>{ sel.innerHTML=""; y.weeks.forEach((w,i)=>{
    const o=document.createElement("option"); o.value=i;
    o.textContent=`S${w.week} · ${w.month||""}`; if(i===val)o.selected=true; sel.appendChild(o);
  });};
  fill($("#fStart"),draft.start); fill($("#fEnd"),draft.end);
  // swatches
  const sw=$("#fSwatches"); sw.innerHTML="";
  const cur=(draft.color||"").toLowerCase();
  const norm=c=>(c||"").toLowerCase();
  const colors=[null,...SWATCH_COLORS];
  let matched=false;
  colors.forEach(col=>{
    const on=norm(draft.color)===norm(col);
    if(on) matched=true;
    const d=document.createElement("div"); d.className="sw"+(on?" on":"");
    d.style.background = col||"#fff";
    if(!col){ d.textContent="∅"; d.style.display="grid"; d.style.placeItems="center"; d.style.color="#94a3b8"; d.title="Couleur par défaut de la ligne"; }
    else d.title=col;
    d.onclick=()=>{ drawerCtx.draft.color=col; sw.querySelectorAll(".sw").forEach(x=>x.classList.remove("on")); d.classList.add("on"); };
    sw.appendChild(d);
  });
  // custom colour picker (any colour)
  const custom=document.createElement("label");
  const isCustom = cur && !matched;
  custom.className="sw"+(isCustom?" on":"");
  custom.title="Couleur personnalisée…";
  custom.style.position="relative"; custom.style.display="grid"; custom.style.placeItems="center";
  custom.style.background = isCustom ? draft.color : "conic-gradient(#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)";
  custom.innerHTML='<span style="font-size:14px;filter:drop-shadow(0 0 2px #fff)">🎨</span>';
  const inp=document.createElement("input"); inp.type="color";
  inp.value=/^#[0-9a-fA-F]{6}$/.test(draft.color||"")?draft.color:"#4f46e5";
  inp.style.cssText="position:absolute;opacity:0;width:100%;height:100%;left:0;top:0;cursor:pointer";
  inp.oninput=()=>{ drawerCtx.draft.color=inp.value; sw.querySelectorAll(".sw").forEach(x=>x.classList.remove("on")); custom.classList.add("on"); custom.style.background=inp.value; };
  custom.appendChild(inp);
  sw.appendChild(custom);
  // font override
  const ff=$("#fFont"); ff.innerHTML="";
  const oDef=document.createElement("option"); oDef.value="__def__"; oDef.textContent="Par défaut du plan"; ff.appendChild(oDef);
  FONTS.forEach(f=>{ if(f.value===""){return;} const o=document.createElement("option"); o.value=f.value; o.textContent=f.label; ff.appendChild(o); });
  ff.value = draft.font ? draft.font : "__def__";
  ff.onchange=()=>{ drawerCtx.draft.font = ff.value==="__def__" ? null : ff.value; };
  // size override
  const fz=$("#fSize"); fz.innerHTML="";
  const zDef=document.createElement("option"); zDef.value="__def__"; zDef.textContent="Par défaut du plan"; fz.appendChild(zDef);
  SIZES.forEach(s=>{ const o=document.createElement("option"); o.value=s; o.textContent=s+" px"; fz.appendChild(o); });
  fz.value = draft.size ? String(draft.size) : "__def__";
  fz.onchange=()=>{ drawerCtx.draft.size = fz.value==="__def__" ? null : +fz.value; };
  // professeurs affectés
  const tc=$("#fTeachers"); tc.innerHTML="";
  if(!plan.teachers.length){
    const h=document.createElement("span"); h.className="hint"; h.textContent="Aucun professeur importé. ";
    const b=document.createElement("button"); b.textContent="👤 Gérer les professeurs";
    b.onclick=()=>{ closeDrawer(); openTeacherManager(); };
    tc.appendChild(h); tc.appendChild(b);
  } else {
    draft.teachers = draft.teachers || [];
    plan.teachers.forEach(t=>{
      const chip=document.createElement("div");
      chip.className="tchip"+(draft.teachers.includes(t.id)?" on":"");
      chip.innerHTML=`<span class="tdot" style="background:${t.color}"></span>${esc(t.name)}`;
      chip.onclick=()=>{ const arr=drawerCtx.draft.teachers=drawerCtx.draft.teachers||[];
        const i=arr.indexOf(t.id); if(i>=0)arr.splice(i,1); else arr.push(t.id);
        chip.classList.toggle("on"); };
      tc.appendChild(chip);
    });
  }
  // compétences & tâches (référentiel)
  buildCodesField(draft);
  // bibliothèque de blocs
  const lib=$("#fLib"); lib.innerHTML="";
  const o0=document.createElement("option"); o0.value=""; o0.textContent = (DB.library.length? "— choisir un bloc —" : "(bibliothèque vide)"); lib.appendChild(o0);
  DB.library.forEach(bk=>{ const o=document.createElement("option"); o.value=bk.id; o.textContent=libLabel(bk); lib.appendChild(o); });
  $("#fLibUse").onclick=()=>{
    const bk=DB.library.find(x=>x.id===lib.value); if(!bk){ toast("Choisissez un bloc à insérer."); return; }
    const d=drawerCtx.draft;
    d.text=bk.text; if("color" in bk)d.color=bk.color; if("font" in bk)d.font=bk.font; if("size" in bk)d.size=bk.size;
    buildDrawer(d,y); toast("Bloc inséré");
  };
  $("#fLibSave").onclick=()=>{
    const text=$("#fText").value.trim();
    if(!text){ toast("Écrivez d'abord un contenu à enregistrer."); return; }
    DB.library.unshift({id:uid(), text, color:drawerCtx.draft.color||null, font:drawerCtx.draft.font||null, size:drawerCtx.draft.size||null});
    persistDebounced(); buildDrawer(drawerCtx.draft,y); toast("Bloc enregistré dans la bibliothèque ✓");
  };
}
function libLabel(bk){ const t=(bk.name||bk.text||"").replace(/\s+/g," ").trim(); return t.length>48?t.slice(0,48)+"…":t; }

/* Affiche les codes sélectionnés (badges) + bouton d'ouverture du sélecteur */
function buildCodesField(draft){
  draft.comps=draft.comps||[]; draft.taches=draft.taches||[];
  const box=$("#fCodes"); box.innerHTML="";
  if(!draft.comps.length && !draft.taches.length){
    const h=document.createElement("span"); h.className="hint"; h.textContent="Aucune compétence/tâche."; box.appendChild(h);
  } else {
    draft.taches.forEach(code=>{ const b=document.createElement("span"); b.className="cbadge t"; b.textContent=code; b.title=tacheLabel(code); box.appendChild(b); });
    draft.comps.forEach(code=>{ const b=document.createElement("span"); b.className="cbadge c"; b.textContent=code; b.title=compLabel(code); box.appendChild(b); });
  }
  $("#fCodesBtn").onclick=()=>openCodePicker(draft);
}

/* Sélecteur modal : compétences (C) et tâches (T) du référentiel */
function openCodePicker(draft){
  const selT=new Set(draft.taches||[]), selC=new Set(draft.comps||[]);
  openModal("Compétences & tâches — référentiel BTS Électrotechnique", (body,foot,close)=>{
    body.innerHTML=`<div class="hint" style="margin-bottom:10px">Cochez les tâches et/ou compétences. Cocher une tâche propose automatiquement ses compétences liées.</div>
      <div class="picker-cols">
        <div class="picker-col taches"><h4>Tâches professionnelles</h4><div class="picker-list" id="pkT"></div></div>
        <div class="picker-col"><h4>Compétences</h4><div class="picker-list" id="pkC"></div></div>
      </div>`;
    const pkC=body.querySelector("#pkC");
    const renderC=()=>{ pkC.innerHTML=""; COMPETENCES.forEach(c=>{
      const it=document.createElement("label"); it.className="pk-item"+(selC.has(c.code)?" on":"");
      it.innerHTML=`<input type="checkbox" ${selC.has(c.code)?"checked":""}><span><span class="cd">${c.code}</span> ${esc(c.label)}</span>`;
      it.querySelector("input").onchange=e=>{ e.target.checked?selC.add(c.code):selC.delete(c.code); it.classList.toggle("on",e.target.checked); };
      pkC.appendChild(it);
    });};
    const pkT=body.querySelector("#pkT");
    TACHES.forEach(t=>{
      const it=document.createElement("label"); it.className="pk-item"+(selT.has(t.code)?" on":"");
      it.innerHTML=`<input type="checkbox" ${selT.has(t.code)?"checked":""}><span><span class="cd">${t.code}</span> ${esc(t.label)}</span>`;
      it.querySelector("input").onchange=e=>{
        if(e.target.checked){ selT.add(t.code); (TASK_TO_COMP[t.code]||[]).forEach(c=>selC.add(c)); }
        else selT.delete(t.code);
        it.classList.toggle("on",e.target.checked); renderC();
      };
      pkT.appendChild(it);
    });
    renderC();
    const sortCodes=arr=>arr.slice().sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
    const ok=document.createElement("button"); ok.className="primary"; ok.textContent="Valider";
    ok.onclick=()=>{ drawerCtx.draft.taches=sortCodes([...selT]); drawerCtx.draft.comps=sortCodes([...selC]); buildCodesField(drawerCtx.draft); close(); };
    const cancel=document.createElement("button"); cancel.textContent="Annuler"; cancel.onclick=close;
    foot.append(cancel,ok);
  });
}
function showDrawer(){ $("#overlay").classList.add("show"); $("#drawer").classList.add("show"); }
function closeDrawer(){ $("#overlay").classList.remove("show"); $("#drawer").classList.remove("show"); drawerCtx=null; }

function saveDrawer(){
  if(!drawerCtx) return;
  const y=plan.years[activeYear];
  const d=drawerCtx.draft;
  d.text=$("#fText").value.trim();
  let a=+$("#fStart").value, b=+$("#fEnd").value;
  if(a>b)[a,b]=[b,a]; d.start=a; d.end=b;
  if(!d.text){ toast("Le contenu ne peut pas être vide."); return; }
  if(drawerCtx.kind==="act"){
    const targetRow=+$("#fRow").value;
    // remove from old row if editing & row changed
    if(drawerCtx.index!=null){
      const oldRow=y.rows[drawerCtx.rowIdx];
      if(targetRow!==drawerCtx.rowIdx){ oldRow.activities.splice(drawerCtx.index,1); y.rows[targetRow].activities.push(d); }
      else oldRow.activities[drawerCtx.index]=d;
    } else { y.rows[targetRow].activities.push(d); }
  } else {
    if(drawerCtx.index!=null) y.bands[drawerCtx.index]=d; else (y.bands=y.bands||[]).push(d);
  }
  persistDebounced(); closeDrawer(); renderGrid();
}
function deleteDrawer(){
  if(!drawerCtx||drawerCtx.index==null) return;
  const y=plan.years[activeYear];
  if(drawerCtx.kind==="act") y.rows[drawerCtx.rowIdx].activities.splice(drawerCtx.index,1);
  else y.bands.splice(drawerCtx.index,1);
  persistDebounced(); closeDrawer(); renderGrid();
}

/* =========================================================================
   ROW MANAGEMENT
   ========================================================================= */
function openRowMenu(ri,anchor){
  closeFloaters();
  const y=plan.years[activeYear];
  const m=document.createElement("div"); m.className="menu"; m.dataset.floater="1";
  const r=anchor.getBoundingClientRect();
  m.style.position="fixed"; m.style.top=(r.bottom+4)+"px"; m.style.left=(r.left-170)+"px";
  m.innerHTML=`
    <button data-a="rename">✏️ Renommer la ligne</button>
    <button data-a="up">↑ Monter</button>
    <button data-a="down">↓ Descendre</button>
    <button data-a="color">🎨 Couleur par défaut</button>
    <div class="sep"></div>
    <button data-a="add">＋ Ajouter une ligne en dessous</button>
    <div class="sep"></div>
    <button data-a="del" class="danger">🗑 Supprimer la ligne</button>`;
  m.querySelectorAll("button").forEach(b=>b.onclick=()=>{rowAction(b.dataset.a,ri);closeFloaters();});
  document.body.appendChild(m);
}
function rowAction(a,ri){
  const y=plan.years[activeYear], rows=y.rows;
  if(a==="rename"){ const v=prompt("Nom de la ligne :",rows[ri].label); if(v!=null)rows[ri].label=v; }
  else if(a==="up"&&ri>0){ [rows[ri-1],rows[ri]]=[rows[ri],rows[ri-1]]; }
  else if(a==="down"&&ri<rows.length-1){ [rows[ri+1],rows[ri]]=[rows[ri],rows[ri+1]]; }
  else if(a==="add"){ rows.splice(ri+1,0,{id:uid(),label:"Nouvelle ligne",color:PALETTE[rows.length%PALETTE.length],activities:[]}); }
  else if(a==="del"){ if(confirm(`Supprimer la ligne « ${rows[ri].label} » et ses activités ?`)) rows.splice(ri,1); }
  else if(a==="color"){ const v=prompt("Couleur (hex, ex #dbeafe) :",rows[ri].color); if(v)rows[ri].color=v; }
  persistDebounced(); renderGrid();
}
function addRow(){
  const y=plan.years[activeYear];
  y.rows.push({id:uid(),label:"Nouvelle ligne",color:PALETTE[y.rows.length%PALETTE.length],activities:[]});
  persistDebounced(); renderGrid();
  $("#scroll").scrollTop=$("#scroll").scrollHeight;
}

/* =========================================================================
   PLAN MANAGEMENT
   ========================================================================= */
function switchPlan(id){
  flushSaves();                 // le plan quitté est déjà dans `dirty` : on l'envoie sans attendre
  DB.currentId=id; plan=DB.plans[id]; activeYear=0; filterTeacher=""; savePref(); render();
}
const MONTHS_FR=["JANVIER","FÉVRIER","MARS","AVRIL","MAI","JUIN","JUILLET","AOÛT","SEPTEMBRE","OCTOBRE","NOVEMBRE","DÉCEMBRE"];

/* =========================================================================
   VACANCES SCOLAIRES — académie de La Réunion
   -------------------------------------------------------------------------
   Source : data.education.gouv.fr, jeu de données « fr-en-calendrier-scolaire »,
   calendrier des ÉLÈVES, relevé le 11/09/2026.
   Clé = année de rentrée (2026 = année scolaire 2026-2027).
     off  : semaines ISO dont les 5 jours ouvrés sont en vacances → proposées
            au retrait automatique.
     part : semaines dont la majorité des jours ouvrés sont en vacances, mais
            pas tous → seulement SIGNALÉES, jamais retirées d'office : selon
            l'établissement ces demi-semaines sont travaillées ou non.
   Le calendrier officiel n'est publié que 2 à 3 ans à l'avance ; au-delà,
   l'assistant le dit et laisse le calendrier complet.
   ========================================================================= */
const VACANCES_REUNION={
  2018:{off:[42,43,52,1,2,3,4,11,12,20,28], part:[33,19]},
  2019:{off:[42,43,52,1,2,3,4,11,12,19,28,29], part:[33,20]},
  2020:{off:[33,42,43,52,53,1,2,3,10,11,19,28], part:[18,27]},
  2021:{off:[32,41,42,51,52,1,2,3,11,12,20,21,28], part:[]},
  2022:{off:[41,42,51,52,1,2,3,11,12,20,21,28], part:[]},
  2023:{off:[42,43,52,1,2,3,10,11,19,20,28], part:[33,51]},
  2024:{off:[33,42,43,52,1,2,3,10,11,19,20,28], part:[]},
  2025:{off:[33,42,43,52,1,2,3,10,11,19,20,28,29], part:[]},
  2026:{off:[33,42,43,52,53,1,2,3,4,12,19,27,28], part:[11,18]}
};
function vacancesDe(sy){ return VACANCES_REUNION[sy]||null; }

/* Retire d'une année les semaines de vacances connues. Passe par remapWeeks
   pour que les activités déjà posées soient recalées au lieu d'être décalées. */
function retirerVacances(y, sy){
  const v=vacancesDe(sy); if(!v) return 0;
  const off=new Set(v.off.map(String));
  const garde=y.weeks.filter(w=>!off.has(String(w.week)));
  if(garde.length===y.weeks.length || !garde.length) return 0;
  const retirees=y.weeks.length-garde.length;
  remapWeeks(y, garde);
  return retirees;
}
/* Numéro de semaine ISO 8601 d'une date */
function isoWeekNum(d){
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=(t.getUTCDay()+6)%7;            // lundi=0
  t.setUTCDate(t.getUTCDate()-day+3);        // jeudi de la semaine ISO
  const firstThu=new Date(Date.UTC(t.getUTCFullYear(),0,4));
  const fday=(firstThu.getUTCDay()+6)%7;
  firstThu.setUTCDate(firstThu.getUTCDate()-fday+3);
  return 1+Math.round((t-firstThu)/(7*86400000));
}
/* Calendrier réel d'une année scolaire (rentrée mi-août sy → mi-juillet sy+1) */
function generateSchoolYearWeeks(sy){
  let start=new Date(sy,7,15);               // 15 août
  start.setDate(start.getDate()-((start.getDay()+6)%7)); // reculer au lundi
  const end=new Date(sy+1,6,13);             // ~13 juillet suivant
  const weeks=[];
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+7)){
    const m=moisDeLaSemaine(d);
    // d = date du lundi, conservée pour les info-bulles et le repérage réel
    weeks.push({ week:String(isoWeekNum(d)), month:MONTHS_FR[m], semester:(m>=1&&m<=6)?2:1, d:ymd(d) });
  }
  return weeks;
}
/* Mois d'une colonne : celui où tombe la MAJORITÉ des JOURS DE CLASSE
   (lundi → vendredi), et non celui du jeudi comme le veut la convention ISO.
   Une semaine à cheval — 3 jours d'un mois, 2 de l'autre — est ainsi rangée
   dans le mois où l'enseignement a réellement lieu. Exemple : la semaine du
   lundi 28 septembre 2026 compte 3 jours de classe en septembre et 2 en
   octobre, elle appartient donc à septembre.
   Sur 5 jours consécutifs l'égalité est impossible : le résultat est unique. */
function moisDeLaSemaine(lundi){
  const ordre=[], n={};
  for(let i=0;i<5;i++){
    const d=new Date(lundi); d.setDate(d.getDate()+i);
    const m=d.getMonth();
    if(!(m in n)){ n[m]=0; ordre.push(m); }
    n[m]++;
  }
  return ordre.reduce((a,b)=> n[b]>n[a] ? b : a);
}
const ymd=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");

/* =========================================================================
   DATES RÉELLES DES COLONNES
   -------------------------------------------------------------------------
   Les colonnes ne portent qu'un numéro de semaine ; la date se déduit de
   l'année de rentrée. Les plans récents la connaissent (y.startYear) et les
   semaines générées portent désormais leur lundi. Pour les plans plus
   anciens, on la retrouve dans le libellé de l'année (« 2ᵉ année · 2026-2027 »)
   ou, à défaut, dans le nom du plan (« BTS … 2024-2026 ») décalé de l'index.
   ========================================================================= */
function anneeDansTexte(t){ const m=/(20\d{2})\s*[-–—]\s*20\d{2}/.exec(String(t||"")); return m?+m[1]:0; }
function inferStartYear(p, y, idx){
  return y.startYear || anneeDansTexte(y.label) || (anneeDansTexte(p&&p.name) ? anneeDansTexte(p.name)+idx : 0) || 0;
}
/* Map : objet semaine -> date ISO du lundi (ou absent si indéterminable). */
function weekDatesFor(y, sy){
  const m=new Map();
  y.weeks.forEach(w=>{ if(w.d) m.set(w,w.d); });
  if(m.size===y.weeks.length) return m;
  if(!sy) return m;
  const parNum=new Map(generateSchoolYearWeeks(sy).map(x=>[String(x.week), x.d]));
  y.weeks.forEach(w=>{ if(!m.has(w) && parNum.has(String(w.week))) m.set(w, parNum.get(String(w.week))); });
  return m;
}
/* « Semaine 42 — du lundi 12 au dimanche 18 octobre 2026 » */
function libelleSemaine(numero, iso){
  if(!iso) return "Semaine "+numero;
  const a=new Date(iso+"T00:00:00"); if(isNaN(a)) return "Semaine "+numero;
  const b=new Date(a); b.setDate(b.getDate()+6);
  const jour=(d,annee)=>d.toLocaleDateString("fr-FR",
    Object.assign({weekday:"long",day:"numeric",month:"long"}, annee?{year:"numeric"}:{}));
  const meme=a.getFullYear()===b.getFullYear();
  return "Semaine "+numero+" — du "+jour(a,!meme)+" au "+jour(b,true);
}
/* Libellés de lignes (matières) du modèle BTS, par année */
function templateRows(yearIdx){
  try{
    const seed=seedData();
    const src=seed.years[Math.min(yearIdx,seed.years.length-1)];
    return src.rows.map(r=>({label:r.label, activities:[]}));
  }catch(e){ return [{label:"Systèmes / Projets",activities:[]},{label:"Enseignement",activities:[]}]; }
}
/* =========================================================================
   SEMAINES D'UNE ANNÉE — retirer les vacances, remettre une semaine
   -------------------------------------------------------------------------
   Les activités et les bandes repèrent leurs bornes par l'INDICE de la semaine
   dans y.weeks, pas par son numéro. Retirer ou insérer une colonne décale donc
   tout ce qui suit : `remapWeeks` fait cette translation à partir de l'identité
   des objets « semaine » conservés, ce qui préserve aussi les largeurs réglées
   à la main (w.w).
   ========================================================================= */

/* Applique un nouveau tableau de semaines à une année et recale son contenu.
   Renvoie le nombre d'activités/bandes supprimées (celles dont toutes les
   semaines ont disparu). */
function remapWeeks(y, newWeeks){
  const pos=new Map(); newWeeks.forEach((w,i)=>pos.set(w,i));
  const newIdx=y.weeks.map(w=> pos.has(w) ? pos.get(w) : -1);
  const last=newWeeks.length-1;
  let dropped=0;

  const move=item=>{
    const a=Math.max(0,Math.min(y.weeks.length-1,item.start));
    const b=Math.max(0,Math.min(y.weeks.length-1,item.end));
    let first=-1,lastKept=-1;
    for(let i=a;i<=b;i++){ if(newIdx[i]>=0){ if(first<0)first=newIdx[i]; lastKept=newIdx[i]; } }
    if(first<0){ dropped++; return false; }           // plus aucune semaine : on retire
    item.start=Math.min(first,last); item.end=Math.min(lastKept,last);
    return true;
  };

  y.rows.forEach(r=>{ r.activities=(r.activities||[]).filter(move); });
  y.bands=(y.bands||[]).filter(move);
  y.weeks=newWeeks;
  return dropped;
}

/* Calendrier complet de l'année scolaire, quand on sait de quelle rentrée il s'agit.
   Permet de proposer le retour d'une semaine précédemment retirée. */
function fullCalendarFor(y){
  if(!y.startYear) return null;
  return generateSchoolYearWeeks(y.startYear);
}

function openWeekManager(){
  if(!plan){ toast("Aucun plan."); return; }
  if(!canEditCurrent()){ toast("Lecture seule : les semaines ne peuvent pas être modifiées."); return; }
  const y=plan.years[activeYear];
  const full=fullCalendarFor(y);
  const dates=weekDatesFor(y, y.startYear);   // dates réelles pour les info-bulles

  /* Liste de travail : chaque entrée = une semaine possible de l'année.
     `week` est l'objet existant (à conserver tel quel) ou null si la semaine
     a été retirée auparavant et peut être remise. */
  let slots;
  if(full){
    const byNum=new Map(); y.weeks.forEach(w=>{ if(!byNum.has(String(w.week))) byNum.set(String(w.week),[]); byNum.get(String(w.week)).push(w); });
    slots=full.map(fw=>{
      const bucket=byNum.get(String(fw.week));
      const existing=bucket&&bucket.length?bucket.shift():null;
      return {num:String(fw.week), month:fw.month, semester:fw.semester, d:fw.d, week:existing, on:!!existing};
    });
    /* Semaines présentes dans le plan mais absentes du calendrier théorique
       (plans importés, retouches manuelles) : on les garde telles quelles. */
    y.weeks.forEach(w=>{ if(!slots.some(s=>s.week===w)) slots.push({num:String(w.week),month:w.month,semester:w.semester,d:w.d,week:w,on:true}); });
  } else {
    slots=y.weeks.map(w=>({num:String(w.week), month:w.month, semester:w.semester, d:w.d, week:w, on:true}));
  }

  openModal("📅 Semaines de « "+y.label+" »", (body,foot,close)=>{
    const intro=document.createElement("p"); intro.className="hint";
    intro.innerHTML = full
      ? "Décochez les semaines non travaillées (vacances, examens…) pour les retirer du tableau. "+
        "Vous pouvez aussi recocher une semaine retirée par erreur."
      : "Décochez les semaines à retirer du tableau. <b>Ce plan ne connaît pas son année de rentrée</b>, "+
        "une semaine retirée ne pourra donc pas être remise ici.";
    body.appendChild(intro);

    const tools=document.createElement("div"); tools.style.cssText="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0";
    const bAll=document.createElement("button"); bAll.textContent="Tout cocher";
    const bNone=document.createElement("button"); bNone.textContent="Tout décocher";
    tools.append(bAll,bNone);
    /* Raccourci « vacances » : disponible dès que l'année de rentrée est connue
       et figure au calendrier officiel relevé. */
    const vacs=vacancesDe(y.startYear);
    if(vacs){
      const bVac=document.createElement("button"); bVac.className="primary";
      bVac.textContent="🏖️ Décocher les vacances (La Réunion)";
      bVac.title="Calendrier officiel de l'Éducation nationale pour "+y.startYear+"-"+(y.startYear+1);
      bVac.onclick=()=>{
        const off=new Set(vacs.off.map(String));
        slots.forEach(s=>{ if(off.has(s.num)) s.on=false; });
        draw(); refresh();
        toast((vacs.part&&vacs.part.length)
          ? "Vacances décochées. Semaines à cheval laissées cochées : "+vacs.part.map(w=>"S"+w).join(", ")
          : "Semaines de vacances décochées");
      };
      tools.appendChild(bVac);
    }
    body.appendChild(tools);

    const count=document.createElement("div"); count.className="hint"; count.style.margin="0 0 10px";
    const warn=document.createElement("div"); warn.className="auth-msg"; warn.style.display="none";

    const wrap=document.createElement("div");
    wrap.style.cssText="display:flex;flex-direction:column;gap:10px;max-height:46vh;overflow:auto";
    body.append(count,warn,wrap);

    /* Combien d'activités/bandes perdraient toutes leurs semaines ? */
    const impact=()=>{
      const keep=new Set(slots.filter(s=>s.on&&s.week).map(s=>s.week));
      let lost=0;
      const test=item=>{
        const a=Math.max(0,Math.min(y.weeks.length-1,item.start)), b=Math.max(0,Math.min(y.weeks.length-1,item.end));
        for(let i=a;i<=b;i++) if(keep.has(y.weeks[i])) return;
        lost++;
      };
      y.rows.forEach(r=>(r.activities||[]).forEach(test));
      (y.bands||[]).forEach(test);
      return lost;
    };
    const refresh=()=>{
      const on=slots.filter(s=>s.on).length;
      count.textContent=on+" semaine(s) retenue(s) sur "+slots.length+".";
      const lost=impact();
      warn.style.display = lost ? "" : "none";
      warn.className = "auth-msg err";
      warn.textContent = lost ? ("⚠️ "+lost+" activité(s)/bande(s) ne couvrent plus aucune semaine retenue et seront supprimées.") : "";
      ok.disabled = on===0;
    };

    const draw=()=>{
      wrap.innerHTML="";
      groupRuns(slots.map(s=>s.month||"")).forEach(run=>{
        const box=document.createElement("div");
        const h=document.createElement("div"); h.className="hint";
        h.style.cssText="font-weight:700;margin-bottom:4px"; h.textContent=slots[run.start].month||"—";
        box.appendChild(h);
        const chips=document.createElement("div"); chips.style.cssText="display:flex;gap:5px;flex-wrap:wrap";
        for(let i=run.start;i<=run.end;i++){
          const s=slots[i];
          const b=document.createElement("button");
          b.textContent="S"+s.num;
          b.style.cssText="min-width:52px;padding:5px 8px";
          b.className=s.on?"primary":"";
          const quand=libelleSemaine(s.num, s.week ? dates.get(s.week) : s.d);
          b.title=quand+"\n"+(s.on ? "Semaine travaillée — cliquer pour la retirer"
                                   : (s.week ? "Retirée — cliquer pour la remettre"
                                             : "Absente du tableau — cliquer pour l'ajouter"));
          b.onclick=()=>{ s.on=!s.on; b.className=s.on?"primary":""; refresh(); };
          chips.appendChild(b);
        }
        box.appendChild(chips); wrap.appendChild(box);
      });
    };

    bAll.onclick=()=>{ slots.forEach(s=>s.on=true); draw(); refresh(); };
    bNone.onclick=()=>{ slots.forEach(s=>s.on=false); draw(); refresh(); };

    const ok=document.createElement("button"); ok.className="primary"; ok.textContent="Appliquer";
    ok.onclick=()=>{
      const newWeeks=slots.filter(s=>s.on).map(s=> s.week || {week:s.num, month:s.month, semester:s.semester});
      if(!newWeeks.length){ toast("Il faut garder au moins une semaine."); return; }
      const dropped=remapWeeks(y,newWeeks);
      persist(); close(); renderGrid();
      toast(dropped ? (newWeeks.length+" semaines — "+dropped+" élément(s) supprimé(s)")
                    : (newWeeks.length+" semaines retenues"));
    };
    const cancel=document.createElement("button"); cancel.textContent="Annuler"; cancel.onclick=close;
    foot.append(cancel,ok);

    draw(); refresh();
  });
}

function newBlankPlan(){
  const now=new Date();
  let startYear = now.getMonth()>=6 ? now.getFullYear() : now.getFullYear()-1; // rentrée à venir
  openModal("＋ Nouveau plan de formation", (body,foot,close)=>{
    body.innerHTML=`
      <div class="field">
        <label>Année de rentrée (1ʳᵉ année)</label>
        <select id="npYear"></select>
      </div>
      <div class="field">
        <label>Durée du cursus</label>
        <select id="npDur"><option value="2" selected>2 ans (BTS — 1ʳᵉ + 2ᵉ année)</option><option value="1">1 an</option></select>
      </div>
      <div class="field">
        <label>Vacances scolaires</label>
        <label for="npVac" style="display:flex;align-items:flex-start;gap:8px;font-weight:500;cursor:pointer">
          <input type="checkbox" id="npVac" checked style="width:auto;flex:0 0 auto;margin-top:3px">
          <span>Retirer les semaines de vacances de <b>La Réunion</b><br>
            <span class="hint">Calendrier officiel de l'Éducation nationale. Ajustable ensuite par ⋯ → Semaines de l'année.</span>
          </span>
        </label>
      </div>
      <div class="field">
        <label>Base de départ</label>
        <select id="npBase"></select>
      </div>
      <div class="field">
        <label>Nom du plan</label>
        <input type="text" id="npName">
      </div>
      <div class="hint" id="npPreview" style="background:var(--brand-soft);padding:10px 12px;border-radius:8px"></div>`;
    const ySel=body.querySelector("#npYear"), dur=body.querySelector("#npDur"),
          baseSel=body.querySelector("#npBase"), nm=body.querySelector("#npName"), prev=body.querySelector("#npPreview"),
          vac=body.querySelector("#npVac");
    for(let yr=now.getFullYear()-2; yr<=now.getFullYear()+8; yr++){
      const o=document.createElement("option"); o.value=yr; o.textContent=`Rentrée ${yr} (${yr}-${yr+1})`;
      if(yr===startYear)o.selected=true; ySel.appendChild(o);
    }
    baseSel.innerHTML="";
    const oT=document.createElement("option"); oT.value="__tpl__"; oT.textContent="Modèle BTS (matières vides)"; baseSel.appendChild(oT);
    const oE=document.createElement("option"); oE.value="__empty__"; oE.textContent="Plan vierge (quelques lignes)"; baseSel.appendChild(oE);
    DB.order.forEach(id=>{ const o=document.createElement("option"); o.value=id; o.textContent="Repartir de : "+DB.plans[id].name; baseSel.appendChild(o); });
    const refresh=()=>{
      const sy=+ySel.value, n=+dur.value, base=baseSel.value;
      nm.value = nm.dataset.touched ? nm.value : `BTS Électrotechnique ${sy}-${sy+n}`;
      const otez=vac.checked;
      const lines=[], manquantes=[], partielles=new Set();
      for(let i=0;i<n;i++){
        const s=sy+i, tot=generateSchoolYearWeeks(s).length, v=vacancesDe(s);
        let txt=`${i===0?"1ʳᵉ":"2ᵉ"} année : <b>${s}-${s+1}</b> — ${tot} semaines réelles`;
        if(otez && v){
          const enleve=generateSchoolYearWeeks(s).filter(w=>v.off.includes(+w.week)).length;
          txt+=` → <b>${tot-enleve}</b> après retrait de ${enleve} semaines de vacances`;
          (v.part||[]).forEach(w=>partielles.add(w));
        } else if(otez && !v){
          manquantes.push(`${s}-${s+1}`);
        }
        lines.push(txt);
      }
      let note="";
      if(manquantes.length) note+=`<br><br>⚠️ Calendrier officiel pas encore publié pour ${manquantes.join(" et ")} : ces années gardent toutes leurs semaines. Vous les ajusterez par ⋯ → Semaines de l'année.`;
      if(partielles.size) note+=`<br><br>ℹ️ Semaines à cheval sur des vacances, <b>conservées</b> (à vous de voir) : ${[...partielles].sort((a,b)=>a-b).map(w=>"S"+w).join(", ")}.`;
      if(base!=="__tpl__" && base!=="__empty__" && DB.plans[base]) note+=`<br><br>📋 Le contenu (activités, bandes, profs) de « ${esc(DB.plans[base].name)} » sera repris et replacé sur le nouveau calendrier.`;
      prev.innerHTML="📅 "+lines.join("<br>")+note;
    };
    nm.oninput=()=>{ nm.dataset.touched="1"; };
    ySel.onchange=refresh; dur.onchange=refresh; baseSel.onchange=refresh; vac.onchange=refresh; refresh();
    const create=document.createElement("button"); create.className="primary"; create.textContent="Créer le plan";
    create.onclick=()=>{
      const sy=+ySel.value, n=+dur.value, base=baseSel.value;
      const name=nm.value.trim()||`BTS ${sy}-${sy+n}`;
      const semsFor=i=>i===0?["SEMESTRE 1","SEMESTRE 2"]:["SEMESTRE 3","SEMESTRE 4"];
      const labFor=(i,s)=>`${i===0?"1ʳᵉ":"2ᵉ"} année · ${s}-${s+1}`;
      let p;
      if(base!=="__tpl__" && base!=="__empty__" && DB.plans[base]){
        const src=clone(DB.plans[base]);
        p={ name, font:src.font, fontSize:src.fontSize, colWidth:src.colWidth, teachers:src.teachers||[], years:[] };
        for(let i=0;i<n;i++){
          const s=sy+i, weeks=generateSchoolYearWeeks(s), W=weeks.length;
          const sry=src.years[Math.min(i,src.years.length-1)];
          const rows=sry.rows.map(r=>({ label:r.label, color:r.color, height:r.height,
            activities:(r.activities||[]).map(a=>({ ...a, id:uid(), start:Math.min(a.start,W-1), end:Math.min(a.end,W-1) })) }));
          const bands=(sry.bands||[]).map(b=>({ ...b, id:uid(), start:Math.min(b.start,W-1), end:Math.min(b.end,W-1) }));
          p.years.push({ label:labFor(i,s), semesters:semsFor(i), startYear:s, weeks, rows, bands });
        }
      } else {
        p={ name, years:[] };
        for(let i=0;i<n;i++){
          const s=sy+i;
          p.years.push({ label:labFor(i,s), semesters:semsFor(i), startYear:s, weeks:generateSchoolYearWeeks(s),
            rows: base==="__tpl__" ? templateRows(i) : [{label:"Systèmes / Projets",activities:[]},{label:"Enseignement",activities:[]},{label:"Physique appliquée",activities:[]}],
            bands:[] });
        }
      }
      /* Retrait des vacances APRÈS la pose des activités : remapWeeks recale
         les blocs au lieu de les décaler d'un cran par colonne supprimée. */
      let otees=0;
      if(vac.checked) p.years.forEach(y=>{ otees+=retirerVacances(y, y.startYear); });

      const np=normalizePlan(p);
      const id=createLocalPlan(np); close(); switchPlan(id); persist();
      toast(otees ? `Plan « ${np.name} » créé — ${otees} semaines de vacances retirées`
                  : `Plan « ${np.name} » créé avec le calendrier réel`);
    };
    const cancel=document.createElement("button"); cancel.textContent="Annuler"; cancel.onclick=close;
    foot.append(cancel,create);
  });
}
function duplicatePlan(){
  const p=clone(plan); p.name=plan.name+" (copie)";
  const id=createLocalPlan(p); switchPlan(id); persist(); toast("Plan dupliqué");
}
function renamePlan(){ if(!canEditCurrent()){toast("Lecture seule : renommage impossible.");return;} const v=prompt("Nom du plan :",plan.name); if(v){plan.name=v;persist();render();} }
function deletePlan(){
  if(!plan) return;
  if(!isOwnerOrAdmin(DB.currentId)){ toast("Seul le propriétaire (ou un admin) peut supprimer ce plan."); return; }
  if(!confirm(`Supprimer définitivement le plan « ${plan.name} » ?\n\nCette action est irréversible.`)) return;
  const delId=DB.currentId;
  dirty.delete(delId); cacheClear(delId);   // plus rien à renvoyer pour un plan supprimé
  deletePlanCloud(delId);
  delete DB.plans[delId]; delete DB.meta[delId];
  DB.order=DB.order.filter(x=>x!==delId);
  if(DB.order.length){ DB.currentId=DB.order[0]; plan=DB.plans[DB.currentId]; }
  else { DB.currentId=null; plan=null; }
  activeYear=0; savePref(); render();
  toast("Plan supprimé");
}

/* =========================================================================
   IMPORT / EXPORT
   ========================================================================= */
function download(name,content,type){
  const blob=content instanceof Blob?content:new Blob([content],{type:type||"application/octet-stream"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
/* En-tête d'impression (titre + logo + nom + année) pour une année donnée */
function printHeaderHTML(yr){
  const logo=($("#brandLogo")&&$("#brandLogo").src) || (document.querySelector('#authScreen .logo-lg-img')||{}).src || "";
  return `<div class="ph-main">PLAN DE FORMATION</div>`+
    `<div class="ph-row">`+
      (logo?`<img class="ph-logo" src="${logo}">`:``)+
      `<div class="ph-txt"><div class="ph-title">${esc(plan.name)}</div>`+
      `<div class="ph-sub">${esc(yr.label)} · édité le ${new Date().toLocaleDateString("fr-FR")}</div></div>`+
    `</div>`;
}
/* Mesure la hauteur réelle d'un en-tête à la largeur de page */
function measurePrintHeader(html, pageW){
  const h=$("#printHead"); const prevStyle=h.getAttribute("style")||"", prevHTML=h.innerHTML;
  h.innerHTML=html;
  h.style.cssText="display:block;position:absolute;left:-99999px;top:0;visibility:hidden;width:"+pageW+"px";
  const px=h.offsetHeight;
  h.setAttribute("style", prevStyle); h.style.display=""; h.innerHTML=prevHTML;
  return px;
}
/* Impression : UNE page A3 paysage PAR ANNÉE, chacune ajustée à sa feuille */
function printPlan(){
  if(!plan){ toast("Aucun plan à imprimer."); return; }
  const grid=$("#grid");
  const area=$("#printArea"); area.innerHTML="";
  const savedYear=activeYear, savedCols=grid.style.gridTemplateColumns;
  const PW = 1587 - 46, PAGE_H = 1122 - 46;              // A3 paysage 96 dpi, marges 6 mm
  const labelW=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--label-w"))||240;

  plan.years.forEach((yr,i)=>{
    activeYear=i; renderGrid();                          // rendre l'année i dans #grid
    const headHTML=printHeaderHTML(yr);
    const headerH=measurePrintHeader(headHTML, PW);
    const PH = PAGE_H - headerH - 40;                     // place restante (marge de sécurité généreuse)
    const N=yr.weeks.length;
    // largeur de colonne qui maximise le remplissage de la page pour CETTE année
    let best={scale:0, cw:56};
    for(let c=44; c<=240; c+=10){
      grid.style.gridTemplateColumns=`${labelW}px repeat(${N}, ${c}px)`;
      const s=Math.min(PW/grid.scrollWidth, PH/grid.scrollHeight);
      if(s>best.scale) best={scale:s, cw:c};
    }
    grid.style.gridTemplateColumns=`${labelW}px repeat(${N}, ${best.cw}px)`;
    const scale=Math.max(0.10, Math.min(best.scale*0.94, 1.8));   // 0.94 = sécurité "toujours 1 page"
    const clone=grid.cloneNode(true);
    clone.style.zoom=scale;
    clone.style.border=(3/scale)+"px solid #1e293b";     // cadre trait fort (~3 px après échelle)
    const page=document.createElement("div"); page.className="print-page";
    page.innerHTML=`<div class="print-head">${headHTML}</div>`;
    page.appendChild(clone);
    area.appendChild(page);
  });

  // restaurer l'affichage normal
  activeYear=savedYear; grid.style.gridTemplateColumns=savedCols; renderGrid();

  document.body.classList.add("printing-multi");
  const cleanup=()=>{ document.body.classList.remove("printing-multi"); area.innerHTML=""; window.removeEventListener("afterprint",cleanup); };
  window.addEventListener("afterprint",cleanup);
  setTimeout(()=>window.print(), 120);
}
function exportJSON(){ download(safe(plan.name)+".json", JSON.stringify(plan,null,1), "application/json"); }
function exportAllJSON(){ download("plans-formation.json", JSON.stringify(DB,null,1), "application/json"); }
function importJSON(){
  const inp=document.createElement("input"); inp.type="file"; inp.accept=".json,application/json";
  inp.onchange=()=>{ const f=inp.files[0]; if(!f)return; const rd=new FileReader();
    rd.onload=()=>{ try{
      const obj=JSON.parse(rd.result);
      if(obj.plans&&obj.order){ // full DB → chaque plan devient un nouveau plan qui VOUS appartient
        if(confirm("Importer une sauvegarde complète ? Chaque plan sera ajouté à votre compte.")){
          let last=null;
          obj.order.forEach(pid=>{ if(obj.plans[pid]){ last=createLocalPlan(normalizePlan(obj.plans[pid])); markDirty(last); } });
          flushSaves();   // envoi en série, avec cache local et nouvelle tentative en cas d'échec
          if(Array.isArray(obj.library)){ DB.library=DB.library||[];
            obj.library.forEach(bk=>{ if(bk&&!DB.library.some(x=>x.id===bk.id)) DB.library.push(bk); }); }
          savePref(); if(last) switchPlan(last); render(); toast("Sauvegarde importée (plans + bibliothèque)");
        }
      } else if(obj.years){ // single plan
        const p=normalizePlan(obj); const id=createLocalPlan(p); switchPlan(id); persist(); toast("Plan importé");
      } else toast("Fichier non reconnu.");
    }catch(e){ toast("Erreur de lecture du fichier JSON."); } };
    rd.readAsText(f); };
  inp.click();
}
function safe(s){ return String(s).replace(/[^\w\-À-ÿ ]+/g,"").trim()||"plan"; }

/* =========================================================================
   EXCEL (.xlsx) EXPORT  — minimal OOXML writer, no external library
   ========================================================================= */
function exportXLSX(){
  const colL = c => { let s=""; c++; while(c){ let m=(c-1)%26; s=String.fromCharCode(65+m)+s; c=Math.floor((c-1)/26);} return s; };
  const norm = h => (h||"E2E8F0").replace("#","").toUpperCase();

  /* ---- 1) collect every colour used, build style table up front ---- */
  const colorSet = new Set();
  plan.years.forEach(y=>{
    y.rows.forEach(r=>{ colorSet.add(norm(r.color)); r.activities.forEach(a=>colorSet.add(norm(a.color||r.color))); });
    (y.bands||[]).forEach(b=>{ if(b.color) colorSet.add(norm(b.color)); });
  });
  const BRAND="4338CA", SEM1="EFF6FF", SEM2="F5F3FF", BAND="E2E8F0", HDBG="F8FAFC";
  [BRAND,SEM1,SEM2,BAND,HDBG].forEach(c=>colorSet.add(c));
  const colors=[...colorSet];

  const fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>'];
  const fillId={};
  colors.forEach(hex=>{ fillId[hex]=fills.length; fills.push('<fill><patternFill patternType="solid"><fgColor rgb="FF'+hex+'"/></patternFill></fill>'); });

  const fInfo=(FONTS.find(f=>f.value===(plan.font||""))||FONTS[0]);
  const fName=fInfo.xlsx, bs=plan.fontSize||12;
  const fonts=[
    '<font><sz val="'+bs+'"/><name val="'+fName+'"/></font>',
    '<font><b/><sz val="'+bs+'"/><name val="'+fName+'"/></font>',
    '<font><b/><sz val="'+(bs+3)+'"/><color rgb="FF4338CA"/><name val="'+fName+'"/></font>',
    '<font><b/><sz val="'+bs+'"/><color rgb="FFFFFFFF"/><name val="'+fName+'"/></font>',
    '<font><sz val="'+Math.max(8,bs-2)+'"/><color rgb="FF64748B"/><name val="'+fName+'"/></font>'
  ];
  const thin='<border><left style="thin"><color rgb="FFDDE3EC"/></left><right style="thin"><color rgb="FFDDE3EC"/></right><top style="thin"><color rgb="FFDDE3EC"/></top><bottom style="thin"><color rgb="FFDDE3EC"/></bottom></border>';
  const borders=['<border/>',thin];

  const xf=[];
  const addXf=(fontId,fill,borderId,halign)=>{ xf.push('<xf numFmtId="0" fontId="'+fontId+'" fillId="'+fill+'" borderId="'+borderId+'" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="'+(halign||"left")+'" vertical="center" wrapText="1"/></xf>'); return xf.length-1; };
  const ST={
    base:  addXf(0,0,0,"left"),
    title: addXf(2,0,0,"left"),
    yearHd:addXf(3,fillId[BRAND],1,"left"),
    hd:    addXf(1,0,1,"center"),
    sem1:  addXf(1,fillId[SEM1],1,"center"),
    sem2:  addXf(1,fillId[SEM2],1,"center"),
    month: addXf(4,fillId[HDBG],1,"center"),
    week:  addXf(1,0,1,"center"),
    rowlab:addXf(1,0,1,"left"),
    empty: addXf(0,0,1,"left"),
    band:  addXf(1,fillId[BAND],1,"center")
  };
  const colorXf={};
  colors.forEach(hex=>{ colorXf[hex]=addXf(0,fillId[hex],1,"left"); });

  const stylesXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<fonts count="'+fonts.length+'">'+fonts.join("")+'</fonts>'+
    '<fills count="'+fills.length+'">'+fills.join("")+'</fills>'+
    '<borders count="'+borders.length+'">'+borders.join("")+'</borders>'+
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
    '<cellXfs count="'+xf.length+'">'+xf.join("")+'</cellXfs></styleSheet>';

  /* ---- 2) build sheet cells ---- */
  const rowsXml=[], merges=[];
  let R=1;
  const cell=(c,r,val,s)=> (val==null||val==="")
      ? '<c r="'+colL(c)+r+'"'+(s?' s="'+s+'"':"")+'/>'
      : '<c r="'+colL(c)+r+'"'+(s?' s="'+s+'"':"")+' t="inlineStr"><is><t xml:space="preserve">'+esc(val)+'</t></is></c>';
  const put=(cells)=>{ rowsXml.push('<row r="'+R+'">'+cells.join("")+'</row>'); R++; };
  const mergeRow=(c1,c2,r)=>{ if(c2>c1) merges.push(colL(c1)+r+':'+colL(c2)+r); };

  put([cell(0,R,plan.name,ST.title)]);
  put([cell(0,R,"",ST.base)]);

  plan.years.forEach(yr=>{
    const N=yr.weeks.length;
    { const r=R; const cs=[cell(0,r,yr.label,ST.yearHd)]; for(let i=0;i<N;i++) cs.push(cell(1+i,r,"",ST.yearHd)); put(cs); mergeRow(0,N,r); }
    { const r=R; const cs=[cell(0,r,"",ST.hd)];
      groupRuns(yr.weeks.map(w=>w.semester)).forEach(run=>{
        const lbl=yr.semesters[yr.weeks[run.start].semester-1]||"";
        const st=yr.weeks[run.start].semester===1?ST.sem1:ST.sem2;
        for(let i=run.start;i<=run.end;i++) cs.push(cell(1+i,r,i===run.start?lbl:"",st));
        mergeRow(1+run.start,1+run.end,r);
      }); put(cs); }
    { const r=R; const cs=[cell(0,r,"Mois",ST.hd)];
      groupRuns(yr.weeks.map(w=>w.month||"")).forEach(run=>{
        for(let i=run.start;i<=run.end;i++) cs.push(cell(1+i,r,i===run.start?(yr.weeks[run.start].month||""):"",ST.month));
        mergeRow(1+run.start,1+run.end,r);
      }); put(cs); }
    { const r=R; const cs=[cell(0,r,"Semaine",ST.hd)]; yr.weeks.forEach((w,i)=>cs.push(cell(1+i,r,w.week,ST.week))); put(cs); }
    (yr.bands||[]).forEach(b=>{
      const r=R; const st=Math.max(0,b.start), en=Math.min(N-1,b.end);
      const cs=[cell(0,r,"Période",ST.band)];
      for(let i=0;i<N;i++) cs.push(cell(1+i,r,i===st?b.text:"", (i>=st&&i<=en)?ST.band:ST.empty));
      put(cs); mergeRow(1+st,1+en,r);
    });
    yr.rows.forEach(row=>{
      const r=R; const cs=[cell(0,r,row.label,ST.rowlab)];
      const occ={};
      row.activities.slice().sort((a,b)=>a.start-b.start).forEach(a=>{
        const st=Math.max(0,Math.min(N-1,a.start)), en=Math.max(0,Math.min(N-1,a.end));
        const sid=colorXf[norm(a.color||row.color)];
        const profs=(a.teachers||[]).map(id=>{const t=teacherById(id);return t?t.name:"";}).filter(Boolean);
        const codes=[].concat(a.taches||[], a.comps||[]);
        const txt = a.text
          + (codes.length? "\n["+codes.join(", ")+"]" : "")
          + (profs.length? "\n👤 "+profs.join(", ") : "");
        for(let i=st;i<=en;i++) occ[i]={text:i===st?txt:"",s:sid};
        mergeRow(1+st,1+en,r);
      });
      for(let i=0;i<N;i++) cs.push(occ[i]?cell(1+i,r,occ[i].text,occ[i].s):cell(1+i,r,"",ST.empty));
      put(cs);
    });
    put([cell(0,R,"",ST.base)]);
  });

  const maxN=Math.max(...plan.years.map(y=>y.weeks.length));
  const cols='<col min="1" max="1" width="34" customWidth="1"/><col min="2" max="'+(maxN+1)+'" width="15" customWidth="1"/>';
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="0" topLeftCell="B1" activePane="topRight" state="frozen"/></sheetView></sheetViews>'+
    '<cols>'+cols+'</cols>'+
    '<sheetData>'+rowsXml.join("")+'</sheetData>'+
    '<mergeCells count="'+merges.length+'">'+merges.map(m=>'<mergeCell ref="'+m+'"/>').join("")+'</mergeCells></worksheet>';

  const files={
    "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Plan de formation" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml":stylesXml,
    "xl/worksheets/sheet1.xml":sheet
  };
  download(safe(plan.name)+".xlsx", zipStore(files), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  toast("Fichier Excel généré ✓");
}

/* ---- ZIP (STORE, no compression) with CRC32 ---- */
function zipStore(files){
  const enc=new TextEncoder();
  const parts=[]; const central=[]; let offset=0;
  const u16=n=>[n&255,(n>>8)&255];
  const u32=n=>[n&255,(n>>8)&255,(n>>16)&255,(n>>24)&255];
  for(const name in files){
    const data=enc.encode(files[name]);
    const crc=crc32(data);
    const nameB=enc.encode(name);
    const local=[].concat(u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),
      u32(crc),u32(data.length),u32(data.length),u16(nameB.length),u16(0));
    parts.push(new Uint8Array(local),nameB,data);
    central.push({crc,len:data.length,nameB,offset});
    offset+=local.length+nameB.length+data.length;
  }
  const cparts=[]; let csize=0;
  central.forEach(c=>{
    const h=[].concat(u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),
      u32(c.crc),u32(c.len),u32(c.len),u16(c.nameB.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(c.offset));
    const arr=new Uint8Array(h.length+c.nameB.length); arr.set(h,0); arr.set(c.nameB,h.length);
    cparts.push(arr); csize+=arr.length;
  });
  const end=[].concat(u32(0x06054b50),u16(0),u16(0),u16(central.length),u16(central.length),
    u32(csize),u32(offset),u16(0));
  return new Blob([...parts,...cparts,new Uint8Array(end)],{type:"application/zip"});
}
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRC_TABLE[(c^u8[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}

/* =========================================================================
   MENUS / UI GLUE
   ========================================================================= */
function closeFloaters(){ document.querySelectorAll('[data-floater]').forEach(x=>x.remove()); }
function openMenu(items,anchor){
  closeFloaters();
  const m=document.createElement("div"); m.className="menu"; m.dataset.floater="1";
  const r=anchor.getBoundingClientRect();
  m.style.position="fixed"; m.style.top=(r.bottom+6)+"px"; m.style.right=(window.innerWidth-r.right)+"px";
  items.forEach(it=>{
    if(it.sep){ const s=document.createElement("div"); s.className="sep"; m.appendChild(s); return; }
    if(it.label && it.header){ const l=document.createElement("div"); l.className="lab"; l.textContent=it.label; m.appendChild(l); return; }
    const b=document.createElement("button"); b.textContent=it.label; if(it.danger)b.className="danger";
    b.onclick=()=>{closeFloaters();it.fn();}; m.appendChild(b);
  });
  document.body.appendChild(m);
}
/* Témoin d'enregistrement de la barre du haut.
   4 états : enregistré / en cours / en échec (nouvelle tentative) / lecture seule. */
const SAVE_STATES={
  saved:   {color:"var(--ok)",     text:"Enregistré",            title:"Toutes les modifications sont en base."},
  pending: {color:"var(--warn)",   text:"Enregistrement…",       title:"Modifications en cours d'envoi."},
  error:   {color:"var(--danger)", text:"Non enregistré",        title:"Envoi impossible. Vos modifications sont conservées dans ce navigateur et seront renvoyées automatiquement."},
  ro:      {color:"var(--muted)",  text:"Lecture seule",         title:"Vous n'avez pas le droit de modifier ce plan."}
};
function saveStateNow(){ return !dirty.size ? "saved" : (retryTimer ? "error" : "pending"); }
function setSaveState(state){
  const s=$("#savedInd"); if(!s) return;
  if(state!=="error" && plan && !canEditCurrent()) state="ro";
  const st=SAVE_STATES[state]||SAVE_STATES.saved;
  s.querySelector(".dot").style.background=st.color;
  s.querySelector(".lbl").textContent=st.text;
  s.title=st.title;
  s.dataset.state=state;
}
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove("show"),2200); }

/* =========================================================================
   EVENTS
   ========================================================================= */
function wire(){
  $("#planSel").onchange=e=>switchPlan(e.target.value);
  $("#btnNew").onclick=newBlankPlan;
  $("#btnPlanMenu").onclick=e=>{e.stopPropagation();
    const owner=plan&&isOwnerOrAdmin(DB.currentId);
    const items=[{label:"PLAN ACTUEL",header:true},{label:"✏️ Renommer",fn:renamePlan},{label:"⧉ Dupliquer",fn:duplicatePlan}];
    if(owner){ items.push({sep:true});
      items.push({label:"👥 Partage et droits…",fn:openShareManager});   // publication + co-éditeurs
      items.push({sep:true});
      items.push({label:"🗑 Supprimer ce plan",fn:deletePlan,danger:true});
    }
    openMenu(items,e.currentTarget);};
  $("#btnExport").onclick=e=>{e.stopPropagation();openMenu([
    {label:"FORMATS",header:true},
    {label:"📊 Excel (.xlsx)",fn:exportXLSX},
    {label:"🖨 Imprimer / PDF (A3 paysage)",fn:printPlan},
    {sep:true},
    {label:"⬇ Sauvegarde JSON (ce plan)",fn:exportJSON},
    {label:"⬇ Sauvegarde JSON (tous les plans)",fn:exportAllJSON},
  ],e.currentTarget);};
  $("#btnMore").onclick=e=>{e.stopPropagation();
    const items=[
      {label:"＋ Ajouter une ligne",fn:addRow},
      {label:"⬛ Ajouter une bande (stage, vacances…)",fn:()=>{if(!editMode){toast("Activez le mode édition d'abord.");return;}openBandEditor(null);}},
      {sep:true},
      {label:"📅 Semaines de l'année (vacances)…",fn:openWeekManager},
      {sep:true},
      {label:"🧩 Bibliothèque de blocs",fn:openLibraryManager},
      {sep:true},
      {label:"⬆ Importer un fichier JSON",fn:importJSON},
    ];
    if(me && me.role==="admin"){ items.push({sep:true},{label:"🛡️ Administration (comptes & rôles)",fn:openAdminPanel}); }
    items.push({sep:true},{label:"↺ Réinitialiser avec le plan d'origine",fn:resetSeed,danger:true});
    openMenu(items,e.currentTarget);};

  $("#editToggle").onchange=e=>{ editMode=e.target.checked; renderGrid(); toast(editMode?"Mode édition activé — cliquez une case ou glissez pour créer une activité.":"Mode lecture."); };
  $("#zoomIn").onclick=()=>{zoom=Math.min(160,zoom+10);render();};
  $("#zoomOut").onclick=()=>{zoom=Math.max(60,zoom-10);render();};
  $("#fontSel").onchange=e=>{ if(!plan)return; plan.font=e.target.value; persistDebounced(); renderTypography(); renderGrid(); };
  $("#fsUp").onclick=()=>setPlanFontSize((plan?plan.fontSize:12)+1);
  $("#fsDown").onclick=()=>setPlanFontSize((plan?plan.fontSize:12)-1);
  $("#btnTeachers").onclick=e=>{ e.stopPropagation(); if(!plan){toast("Créez ou restaurez un plan d'abord.");return;} openTeacherManager(); };
  $("#teacherFilter").onchange=e=>{ filterTeacher=e.target.value; renderGrid(); };

  $("#drawerClose").onclick=closeDrawer;
  $("#fCancel").onclick=closeDrawer;
  $("#overlay").onclick=closeDrawer;
  $("#fSave").onclick=saveDrawer;
  $("#fDelete").onclick=deleteDrawer;

  document.addEventListener("click",e=>{ if(!e.target.closest('[data-floater]')&&!e.target.closest('.menu-wrap')&&!e.target.closest('.rowmenu')) closeFloaters(); });
  document.addEventListener("keydown",e=>{ if(e.key==="Escape"){closeDrawer();closeFloaters();} });

  /* ---- Filets de sécurité de fin de session ----
     L'onglet masqué est le dernier moment fiable pour envoyer une requête ;
     beforeunload ne peut plus qu'avertir (une requête n'aurait pas le temps
     d'aboutir), mais le cache local garde déjà tout, donc rien n'est perdu. */
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") flushSaves(); });
  window.addEventListener("pagehide",()=>{ flushSaves(); });
  window.addEventListener("beforeunload",e=>{
    if(!dirty.size) return;
    e.preventDefault(); e.returnValue="";   // « Voulez-vous vraiment quitter ce site ? »
  });
}
function resetSeed(){
  if(!confirm("Recréer le plan « "+nomDuSeed()+" » d'origine ? (Vos autres plans sont conservés.)")) return;
  const seed=normalizePlan(seedData());
  seed.name=nomDuSeed()+" (origine)";
  const id=createLocalPlan(seed); switchPlan(id); persist(); toast("Plan d'origine recréé");
}

/* =========================================================================
   AUTH — écran de connexion / inscription (Supabase)
   ========================================================================= */
let authMode="signin";
function showAuth(){ $("#authScreen").classList.add("show"); $("#app").style.display="none"; }
function hideAuth(){ $("#authScreen").classList.remove("show"); $("#app").style.display=""; }
function setAuthMsg(txt, ok){ const m=$("#authMsg"); m.textContent=txt||""; m.className="auth-msg"+(txt?(ok?" ok":" err"):""); }
function setAuthMode(mode){
  authMode=mode;
  $("#tabSignin").classList.toggle("on", mode==="signin");
  $("#tabSignup").classList.toggle("on", mode==="signup");
  $("#fldName").style.display = mode==="signup" ? "" : "none";
  $("#authSubmit").textContent = mode==="signup" ? "Créer mon compte" : "Se connecter";
  $("#authPass").autocomplete = mode==="signup" ? "new-password" : "current-password";
  setAuthMsg("");
}
function wireAuth(){
  $("#tabSignin").onclick=()=>setAuthMode("signin");
  $("#tabSignup").onclick=()=>setAuthMode("signup");
  $("#authSubmit").onclick=doAuth;
  $("#authScreen").addEventListener("keydown",e=>{ if(e.key==="Enter") doAuth(); });
  $("#btnLogout").onclick=async()=>{
    await flushSaves();                       // ne pas partir avec des modifications en attente
    if(dirty.size && !confirm("Des modifications n'ont pas pu être enregistrées en base.\n\n"+
       "Elles restent mémorisées dans ce navigateur et vous seront reproposées à la prochaine connexion.\n\nSe déconnecter quand même ?")) return;
    await sb.auth.signOut(); me=null; showAuth();
  };
}
async function doAuth(){
  const email=$("#authEmail").value.trim(), pass=$("#authPass").value;
  if(!email||!pass){ setAuthMsg("Renseignez e-mail et mot de passe."); return; }
  $("#authSubmit").disabled=true; setAuthMsg("Veuillez patienter…", true);
  try{
    if(authMode==="signup"){
      const name=$("#authName").value.trim();
      const {error}=await sb.auth.signUp({email,password:pass,options:{data:{full_name:name||email}}});
      if(error) throw error;
      const {data:s}=await sb.auth.getSession();
      if(!s.session){ setAuthMsg("Compte créé. Vérifiez votre e-mail pour confirmer, puis connectez-vous.", true); setAuthMode("signin"); $("#authSubmit").disabled=false; return; }
      await afterLogin(s.session);
    } else {
      const {data,error}=await sb.auth.signInWithPassword({email,password:pass});
      if(error) throw error;
      await afterLogin(data.session);
    }
  }catch(err){ setAuthMsg(traduireAuth(err.message||"Erreur d'authentification")); }
  $("#authSubmit").disabled=false;
}
function traduireAuth(msg){
  if(/Invalid login credentials/i.test(msg)) return "E-mail ou mot de passe incorrect.";
  if(/Email not confirmed/i.test(msg)) return "E-mail non confirmé : cliquez le lien reçu par e-mail (ou désactivez la confirmation dans Supabase).";
  if(/already registered|User already/i.test(msg)) return "Un compte existe déjà avec cet e-mail — connectez-vous.";
  if(/Password should be at least/i.test(msg)) return "Mot de passe trop court (6 caractères minimum).";
  return msg;
}
async function afterLogin(session){
  me={ id:session.user.id, email:session.user.email, role:"prof", name:session.user.email };
  try{ const {data:prof}=await sb.from("profiles").select("role,full_name").eq("id",me.id).single();
       if(prof){ me.role=prof.role||"prof"; me.name=prof.full_name||me.email; } }catch(e){}
  hideAuth();
  const ok=await cloudLoad();
  if(!appWired){ wire(); appWired=true; }
  if(!ok){ showLoadFailure(); updateUserBar(); return; }
  render(); updateUserBar();
  recoverFromCache();
}

/* Le chargement a échoué (réseau, base injoignable) : surtout ne pas présenter
   un compte « vide » dans lequel l'utilisateur recréerait ses plans en double. */
function showLoadFailure(){
  const g=$("#grid");
  g.style.gridTemplateColumns="1fr"; g.style.gridTemplateRows="1fr";
  g.innerHTML='<div class="empty">'+
    '<div style="font-size:46px;margin-bottom:10px">📡</div>'+
    '<h2 style="margin:0 0 6px">Impossible de joindre la base</h2>'+
    '<p class="hint" style="max-width:420px;margin:0 0 20px">Vos plans n\'ont pas pu être chargés. '+
    'Ils ne sont pas perdus : ils sont en ligne et réapparaîtront dès que la connexion sera rétablie. '+
    'Ne créez pas de nouveau plan en attendant, vous créeriez des doublons.</p>'+
    '<button class="primary" id="lfRetry">↻ Réessayer</button></div>';
  $("#lfRetry").onclick=async()=>{ const ok=await cloudLoad(); if(ok){ render(); recoverFromCache(); } else showLoadFailure(); };
  $("#planSel").innerHTML=""; $("#yearTabs").innerHTML=""; $("#planTitleChip").textContent="";
  setSaveState("error");
}

/* Travail laissé en plan par une session précédente (onglet fermé hors ligne,
   navigateur tué…) : le cache local le contient encore, on propose de le reprendre. */
function recoverFromCache(){
  const c=loadCache();
  const ids=Object.keys(c).filter(id=>c[id] && c[id].user===me.id && c[id].data && c[id].data.years);
  if(!ids.length) return;
  openModal("💾 Modifications non enregistrées retrouvées", (body,foot,close)=>{
    body.innerHTML='<p class="hint">Une session précédente s\'est terminée avant que ces modifications '+
      'n\'atteignent la base. Elles ont été conservées dans ce navigateur.</p>';
    const list=document.createElement("div"); list.className="list";
    ids.forEach(id=>{
      const e=c[id], row=document.createElement("div"); row.className="trow";
      const who=document.createElement("div"); who.style.flex="1";
      who.innerHTML="<b>"+esc(e.name||"Plan")+"</b><br><span class=\"hint\">modifié le "+
                    esc(new Date(e.at).toLocaleString("fr-FR"))+"</span>";
      row.appendChild(who); list.appendChild(row);
    });
    body.appendChild(list);
    const drop=document.createElement("button"); drop.className="danger"; drop.textContent="Ignorer et supprimer";
    drop.onclick=()=>{ ids.forEach(cacheClear); close(); toast("Brouillons supprimés"); };
    const take=document.createElement("button"); take.className="primary"; take.textContent="Reprendre ces modifications";
    take.onclick=()=>{
      let last=null;
      ids.forEach(id=>{
        const e=c[id];
        let p; try{ p=normalizePlan(e.data); }catch(err){ cacheClear(id); return; }
        if(DB.plans[id] && canEditPlan(id)){ DB.plans[id]=p; }          // plan connu : on réapplique le brouillon
        else if(!DB.plans[id]){                                          // plan jamais arrivé en base
          DB.plans[id]=p; DB.meta[id]={owner:me.id,published:false,canEdit:true,isNew:true,rev:null}; DB.order.push(id);
        } else { cacheClear(id); return; }                               // devenu lecture seule : on n'insiste pas
        if(id===DB.currentId) plan=p;
        markDirty(id); last=id;
      });
      close();
      if(last){ flushSaves(); render(); toast("Modifications reprises et renvoyées en base"); }
    };
    foot.append(drop,take);
  });
}
function updateUserBar(){
  if(!me) return;
  $("#userEmail").textContent=me.name||me.email;
  const b=$("#userRole"); b.textContent = me.role==="admin" ? "Admin" : "Professeur";
  b.className="badge-role"+(me.role==="admin"?" admin":"");
}

/* =========================================================================
   DÉMARRAGE
   ========================================================================= */
async function boot(){
  if(typeof supabase==="undefined" || !window.SB_URL || !window.SB_KEY){
    setAuthMsg("Connexion Internet requise (librairie non chargée) ou configuration Supabase manquante."); showAuth(); return;
  }
  sb=supabase.createClient(window.SB_URL, window.SB_KEY);
  wireAuth();
  setAuthMode("signin");
  initBrandLogo();    // logo par défaut dans la barre du haut
  loadSharedLogo();   // logo partagé (lecture publique) → connexion + barre du haut
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(session) await afterLogin(session); else showAuth();
  }catch(e){ showAuth(); setAuthMsg("Impossible de contacter le serveur : "+e.message); }
  sb.auth.onAuthStateChange((_e,s)=>{ if(!s){ me=null; showAuth(); } });
}
boot();
