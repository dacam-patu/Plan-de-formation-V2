# 🔐 Mise en place du login + rôles (Supabase)

Cette V2 ajoute des **comptes**, des **rôles** et le **partage des plans** via une base de données en ligne (Supabase). Voici les étapes — comptez ~15 minutes.

---

## Étape 1 — Créer un projet Supabase (gratuit)

1. Aller sur **https://supabase.com** → **Start your project** → se connecter (GitHub ou e-mail).
2. **New project** :
   - *Name* : `plan-de-formation`
   - *Database Password* : choisissez un mot de passe **fort** et **notez-le** (il sert à la base, pas au login de l'appli).
   - *Region* : choisir **Europe (Paris / Frankfurt)**.
3. Attendre ~1 minute que le projet soit prêt.

## Étape 2 — Créer les tables et la sécurité

1. Dans Supabase, menu de gauche → **SQL Editor** → **New query**.
2. Ouvrir le fichier **`supabase-setup.sql`** (dans ce dossier), **copier tout**, coller dans l'éditeur.
3. Cliquer **RUN**. Vous devez voir *Success*.
4. Recommencer (New query → coller → RUN) avec **`supabase-logo.sql`**, puis **`supabase-fiabilite.sql`**.

## Étape 3 — Activer la connexion par e-mail

1. Menu **Authentication** → **Providers** → **Email** : laisser activé.
2. Menu **Authentication** → **Sign In / Providers** (ou *Settings*) :
   - Pour se simplifier la vie au début, **désactiver « Confirm email »** (sinon chaque inscription demande un clic dans un e-mail de confirmation). Vous pourrez le réactiver plus tard.

## Étape 4 — Récupérer les 2 informations à me donner

Menu **Project Settings** (roue crantée) → **API** :

- **Project URL** — ressemble à `https://xxxxxxxx.supabase.co`
- **Project API keys → `anon` `public`** — une longue clé qui commence par `eyJ...`

> ✅ La clé **`anon` / public** est **faite pour être mise dans le code du navigateur** — ce n'est pas un secret.
> ❌ Ne me donnez **jamais** la clé **`service_role`** (celle-là est secrète).

**Envoyez-moi ces 2 valeurs** (Project URL + clé `anon` public) : je les mettrai dans la configuration de l'appli, puis j'intègre l'écran de connexion et le chargement/enregistrement des plans depuis la base.

## Étape 5 — Devenir administrateur

1. Une fois l'appli branchée, **créez votre compte** (inscription avec votre e-mail).
2. Retournez dans Supabase → **SQL Editor**, et exécutez (avec votre e-mail) :
   ```sql
   update public.profiles set role = 'admin' where email = 'dacamalon@gmail.com';
   ```
3. Vous êtes désormais **admin**.

---

## Ce qui est branché dans l'appli

- Écran de **connexion / inscription**.
- Affichage du **compte connecté** et de son **rôle**.
- **Chargement / enregistrement des plans dans la base**, avec cache de secours local
  et refus d'écraser le travail d'un collègue.
- **⋯ → Partage et droits** : publier un plan (lecture pour tous) et autoriser
  nommément des collègues à le **modifier**.
- **Panneau admin** : liste des comptes, changement de rôle, logo de l'établissement.

## Bon à savoir
- L'appli nécessite **une connexion Internet** (elle parle à la base).
- Pour un vrai usage partagé, il faut **héberger le dossier complet** (index.html,
  app.css, app.js, seed.js, logo.png) — gratuit : GitHub Pages, Netlify…
- Vos données locales (version V1) ne sont pas touchées : vous pouvez les
  **importer** dans la base via vos sauvegardes JSON.
