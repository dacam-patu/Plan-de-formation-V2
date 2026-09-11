# 📅 Plan de formation — BTS Électrotechnique

Application web pour **créer, consulter, modifier, partager et imprimer** des plans de formation sous forme de calendrier annuel (type diagramme de Gantt), pensée pour le BTS Électrotechnique mais adaptable à toute formation.

> 🌐 **Version 2 : les plans vivent dans une base en ligne (Supabase).**
> Chaque professeur a un compte ; les plans peuvent être publiés (lecture) ou partagés en modification.
> Une connexion Internet est nécessaire.

---

## 🗂️ Structure du dépôt

```
Plan de formation V2/
├── index.html                ← la page (structure + configuration Supabase)
├── app.css                   ← toutes les feuilles de style
├── app.js                    ← toute la logique de l'application
├── seed.js                   ← le plan BTS fourni en exemple (window.SEED)
├── logo.png                  ← logo affiché à la connexion et à l'impression
├── supabase-setup.sql        ← création des tables + sécurité (RLS)   ─┐
├── supabase-logo.sql         ← logo partagé géré par l'admin           ├ à exécuter
├── supabase-fiabilite.sql    ← horodatage anti-écrasement              ─┘  dans Supabase
├── tests/                    ← vérifications automatiques (Node, sans dépendance)
├── SETUP-connexion.md        ← mise en place pas à pas de Supabase
└── Readme.md                 ← ce document
```

> ⚠️ Les cinq fichiers `index.html`, `app.css`, `app.js`, `seed.js` et `logo.png` vont **ensemble**.
> Copier `index.html` seul ne suffit plus (c'était le cas en V1).

---

## ✨ Fonctionnalités

### Le tableau
- **Vue calendrier** par année scolaire : semaines en colonnes (groupées par mois et par semestre), matières/domaines en lignes.
- **Deux années** par cursus (1ʳᵉ / 2ᵉ année), avec onglets.
- **Activités** : blocs colorés couvrant une plage de semaines (contenu, séquence, compétence…).
- **Bandes verticales** pour les périodes spéciales (stage, semaine d'intégration, rentrée…), traversant toute la grille.

### Création & édition
- **Assistant « Nouveau plan »** : on choisit l'**année de rentrée** et l'appli **génère le calendrier réel** (vrais numéros de semaine **ISO 8601**, y compris les années à 53 semaines), regroupé par mois et réparti en semestres.
- **Repartir d'un plan existant** : réutilise le contenu d'un ancien plan (activités, bandes, profs) en le replaçant sur le calendrier de la nouvelle rentrée.
- **Édition en place** : double-clic sur un intitulé de ligne pour le renommer ; clic sur une case (mode édition) pour modifier son contenu.
- **Glisser-créer** : en mode édition, glisser sur des cases vides pour créer une activité sur une plage de semaines.
- Gestion des lignes (ajouter, renommer, monter/descendre, supprimer, couleur par défaut).
- **Gestion des semaines** (⋯ → *Semaines de l'année*) : retirer les semaines non travaillées (vacances, examens) et les remettre. Les activités sont recalées automatiquement ; l'appli annonce à l'avance combien d'éléments perdraient toutes leurs semaines.

### Mise en forme
- **Couleurs** : 54 teintes prédéfinies + sélecteur de couleur libre ; contraste automatique du texte (blanc/foncé).
- **Police & taille** : réglage **global** (tout le tableau) et **par activité**.
- **Dimensions** : largeur des colonnes réglable **colonne par colonne** (glisser le bord d'un en-tête de semaine) et hauteur des lignes ajustable ; double-clic = valeur par défaut.
- **Zoom** de l'ensemble.

### Référentiel BTS
- **Compétences (C1…C18)** et **tâches professionnelles (T 1.1…T 8.5)** attachables à chaque activité.
- Cocher une tâche **propose automatiquement** les compétences qui lui sont liées.
- Les codes s'affichent en badges sur les blocs du tableau.

### Professeurs
- **Importer une liste** de professeurs (coller une liste ou fichier `.txt` / `.csv`), chacun avec sa couleur.
- **Affecter** un ou plusieurs professeurs à chaque activité **ou** bande (co-enseignement possible).
- **Pastilles d'initiales** affichées sur les cases.
- **Filtre par professeur** : met en évidence uniquement ses créneaux (la 1ʳᵉ ligne « Systèmes/Projets » reste toujours visible comme référence).

### Comptes, partage et droits
- **Connexion par e-mail / mot de passe**, deux rôles : *Professeur* et *Admin*.
- **⋯ (à côté du nom du plan) → Partage et droits** :
  - **Publier** : tous les comptes voient le plan, **en lecture seule** ;
  - **Co-éditeurs** : les personnes autorisées peuvent **modifier** le plan.
- Un plan qu'un collègue vous a ouvert affiche le badge **👥 Partagé avec vous**.
- **Panneau admin** (⋯ → *Administration*) : liste des comptes, changement de rôle, logo de l'établissement.
- Les droits sont appliqués **côté serveur** (règles RLS PostgreSQL) : ils ne peuvent pas être contournés depuis le navigateur.

### Bibliothèque de blocs
- **Enregistrer** un bloc (contenu + couleur + police + taille) pour le **réutiliser** dans n'importe quel plan.
- **Insérer** un bloc enregistré en un clic, **gérer** (renommer/supprimer) la bibliothèque.
- ⚠️ La bibliothèque est propre à **votre navigateur** (elle n'est pas encore partagée en base).

### Export & impression
- **Excel (.xlsx)** généré côté client (sans bibliothèque externe) : cellules fusionnées, couleurs, professeurs affectés.
- **Impression / PDF sur A3 paysage** : une page par année, tableau **automatiquement mis à l'échelle pour tenir sur la feuille**, avec en-tête (logo, nom du plan, année, date) et conservation des couleurs.
- **Export / Import JSON** (un plan, ou tous les plans + la bibliothèque).

---

## 💾 Comment les données sont enregistrées

Les plans sont **en base** (Supabase), pas dans le fichier. L'enregistrement est automatique, et protégé par trois garde-fous :

| Situation | Ce qui se passe |
|---|---|
| Vous modifiez puis changez de plan aussitôt | Le plan modifié est bien celui qui part en base. |
| Le réseau coupe | Le témoin passe **🔴 Non enregistré**. Votre travail est gardé dans le navigateur et **renvoyé tout seul** dès le retour du réseau. |
| Vous fermez l'onglet avec des modifications en attente | Le navigateur vous prévient ; au pire, la prochaine connexion vous propose de **reprendre les modifications retrouvées**. |
| Un collègue a enregistré le même plan entre-temps | L'appli **refuse d'écraser en silence** et vous demande d'arbitrer : garder sa version, ou imposer la vôtre. |
| La base est injoignable au démarrage | L'appli le dit clairement au lieu d'afficher un compte vide (pour éviter que vous recréiez des doublons). |

Le témoin en haut de l'écran indique l'état : **🟢 Enregistré**, **🟠 Enregistrement…**, **🔴 Non enregistré**, **⚪ Lecture seule**.

> 💡 **Conseil** : faites tout de même de temps en temps `Exporter → Sauvegarde JSON (tous les plans)`.
> C'est votre copie hors ligne, utile en cas de suppression accidentelle.

---

## 🚀 Mise en service

1. Suivre **`SETUP-connexion.md`** pour créer le projet Supabase.
2. Dans Supabase → *SQL Editor*, exécuter dans l'ordre :
   `supabase-setup.sql`, puis `supabase-logo.sql`, puis `supabase-fiabilite.sql`.
3. Renseigner `SB_URL` et `SB_KEY` en haut de **`index.html`** (la clé `anon` est publique, c'est normal).
4. Héberger le dossier (GitHub Pages, Netlify…) ou l'ouvrir localement.
5. Créer son compte, puis se donner le rôle admin :
   ```sql
   update public.profiles set role = 'admin' where email = 'votre.email@exemple.fr';
   ```

---

## ⏰ Empêcher la mise en pause du projet

Sur le **plan gratuit**, Supabase suspend un projet après **7 jours sans la moindre requête**,
et démonte l’instance : le domaine ne répond plus et l’application affiche « Failed to fetch ».
Les données ne sont pas perdues, mais il faut aller cliquer **Restore project** dans le tableau de bord.

Pour que ça n’arrive plus, le dépôt contient une tâche programmée GitHub Actions :
[`.github/workflows/garder-supabase-actif.yml`](.github/workflows/garder-supabase-actif.yml).

- Elle interroge la base **tous les 2 jours** (une vraie lecture, pas un simple ping réseau).
- Elle tourne **chez GitHub** : aucun ordinateur à laisser allumé pendant les vacances.
- **Aucune configuration** : l’adresse et la clé publique sont lues dans `index.html`.
- Si la base ne répond pas, la tâche **échoue volontairement** et GitHub vous envoie un e-mail :
  vous êtes prévenu *avant* d’avoir besoin de l’application.
- Elle écrit un marqueur `.github/derniere-visite.txt` **une fois par mois**, ce qui empêche GitHub
  de désactiver la programmation après 60 jours sans activité sur le dépôt.

> ⚠️ Cette tâche **entretient** un projet actif, elle ne peut pas en **réveiller** un déjà en pause.
> Si le projet dort, restaurez-le une fois à la main ; ensuite elle prend le relais.

Pour la tester tout de suite : onglet **Actions** du dépôt → *Garder Supabase actif* → **Run workflow**.

---
## 🧪 Vérifications automatiques

```bash
node tests/run.js
```

Aucune dépendance à installer. `app.js` est chargé dans Node avec un DOM minimal et un faux Supabase ; les tests couvrent l'enregistrement (file d'attente, cache de secours, verrou anti-écrasement) et le recalage des activités quand on retire ou rajoute des semaines.

---

## ⚙️ Détails techniques

- **100 % front-end** : HTML + CSS + JavaScript « vanilla », aucun build, une seule dépendance chargée par CDN (`@supabase/supabase-js`).
- **Base** : PostgreSQL (Supabase). Tables `profiles`, `plans` (le plan entier en `jsonb`), `plan_editors`, `app_settings`. Sécurité par **Row Level Security**.
- **Anti-écrasement** : `plans.updated_at` sert de numéro de version ; l'enregistrement n'aboutit que si la ligne porte encore la version lue au chargement.
- **Cache de secours** : `localStorage`, clé `pdf_v2_cache` (vidée dès confirmation en base). Préférences dans `pdf_v2_prefs`.
- **Calendrier** : numéros de semaine **ISO 8601** calculés à partir des dates réelles.
- **Export Excel** : générateur OOXML maison (écriture ZIP + CRC32 en JS, styles, fusions).
- **Impression** : `@page { size: A3 landscape }` + mise à l'échelle calculée, une page par année.
- **Compatibilité** : navigateurs modernes (Chrome / Edge recommandés pour l'impression).

---

## 📄 Licence / Auteur

Projet personnel — **David CAMALON**. Réutilisation et adaptation libres pour un usage pédagogique.
