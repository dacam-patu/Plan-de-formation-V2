# 📅 Plan de formation — BTS Électrotechnique

Application web **autonome** (un seul fichier `index.html`) pour **créer, consulter, modifier et imprimer** des plans de formation sous forme de calendrier annuel (type diagramme de Gantt), pensée pour le BTS Électrotechnique mais adaptable à toute formation.

> 🧩 Aucune installation, aucun serveur, aucune connexion Internet requise.
> On ouvre le fichier dans un navigateur et ça fonctionne.

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

### Mise en forme
- **Couleurs** : 54 teintes prédéfinies + sélecteur de couleur libre ; contraste automatique du texte (blanc/foncé).
- **Police & taille** : réglage **global** (tout le tableau) et **par activité**.
- **Dimensions** : largeur des colonnes réglable **colonne par colonne** (glisser le bord d'un en-tête de semaine) et hauteur des lignes ajustable ; double-clic = valeur par défaut.
- **Zoom** de l'ensemble.

### Professeurs
- **Importer une liste** de professeurs (coller une liste ou fichier `.txt` / `.csv`), chacun avec sa couleur.
- **Affecter** un ou plusieurs professeurs à chaque activité **ou** bande (co-enseignement possible).
- **Pastilles d'initiales** affichées sur les cases.
- **Filtre par professeur** : met en évidence uniquement ses créneaux (la 1ʳᵉ ligne « Systèmes/Projets » reste toujours visible comme référence).

### Bibliothèque de blocs
- **Enregistrer** un bloc (contenu + couleur + police + taille) pour le **réutiliser** dans n'importe quel plan.
- **Insérer** un bloc enregistré en un clic, **gérer** (renommer/supprimer) la bibliothèque.

### Multi-plans & sauvegarde
- **Plusieurs plans** gérés dans l'appli (créer, dupliquer, renommer, supprimer).
- **Sauvegarde automatique** dans le navigateur (localStorage).
- **Export / Import JSON** (un plan ou tous les plans + la bibliothèque).

### Export & impression
- **Excel (.xlsx)** généré côté client (sans bibliothèque externe) : cellules fusionnées, couleurs, professeurs affectés.
- **Impression / PDF sur A3 paysage** : le tableau entier est **automatiquement mis à l'échelle pour tenir sur une page**, avec un en-tête (nom du plan, année, date) et conservation des couleurs.

---

## 🚀 Utilisation

1. **Ouvrir** `index.html` (double-clic — il s'ouvre dans votre navigateur).
2. Activer le **Mode édition** (interrupteur en haut) pour modifier.
3. Barre d'outils : onglets d'année, filtre professeur, gestion des professeurs, police, taille, zoom.
4. Menus :
   - **＋ Nouveau plan** : assistant de création (année de rentrée, base de départ).
   - **⤓ Exporter** : Excel, Impression A3, sauvegardes JSON.
   - **⋯** (à côté du nom du plan) : renommer / dupliquer / supprimer le plan.
   - **⋯** (à droite) : ajouter une ligne/bande, bibliothèque de blocs, importer un JSON.

---

## 💾 Sauvegarde des données — À LIRE

Les données (plans, professeurs, bibliothèque) sont enregistrées **dans le navigateur** (localStorage), **pas dans le fichier `index.html`**. Conséquences :

- **Copier seulement `index.html`** sur un autre PC **ne transfère pas** vos données (vous ne verriez que l'exemple).
- **Vider le cache**, **changer de navigateur** ou **renommer/déplacer le fichier** peut rendre les données « invisibles » (elles restent liées à l'ancienne page).
- **Mettre l'appli en ligne** (http/https) crée un espace de stockage distinct de la version locale.

### La règle d'or
> **Faites régulièrement `Exporter → Sauvegarde JSON (tous les plans)`** et conservez ce fichier.
> C'est votre seule copie de sécurité.

### Transférer vers un autre PC / collègue
1. Envoyer **`index.html`** (l'appli) **+** le fichier **`.json`** (les données).
2. Le destinataire ouvre `index.html`, puis **⋯ → Importer un fichier JSON** → choisit le `.json`.
3. L'import **fusionne** (ses plans sont conservés, les vôtres ajoutés).

---

## 🗂️ Structure du dépôt

```
Plan de formation/
├── index.html      ← l'application complète (autonome)
├── *.json          ← sauvegardes de données (à créer via Exporter)
└── Readme.md       ← cette documentation
```

---

## ⚙️ Détails techniques

- **100 % front-end** : HTML + CSS + JavaScript « vanilla », aucune dépendance, aucun build.
- **Stockage** : `localStorage` (clé `pdf_plans_v1`).
- **Calendrier** : numéros de semaine **ISO 8601** calculés à partir des dates réelles.
- **Export Excel** : générateur OOXML minimal maison (écriture ZIP + CRC32 en JS, styles, fusions).
- **Impression** : `@page { size: A3 landscape }` + mise à l'échelle calculée du tableau.
- **Compatibilité** : navigateurs modernes (Chrome / Edge recommandés pour l'impression et le partage du stockage local).

---

## 🔧 Dépôt Git

### Initialisation
```bash
git init
git remote add origin git@github.com:dacam-patu/plan-de-formation.git
git add .
git commit -m "Initialisation du projet plan de formation"
git push -u origin main
```

### Rédiger un commit
```bash
git add .
git commit -m "Titre court du commit

Description détaillée : ce qui a évolué dans le projet."
git push
```

---

## 📄 Licence / Auteur

Projet personnel — **David CAMALON**. Réutilisation et adaptation libres pour un usage pédagogique.
