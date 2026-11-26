# Herbier

Wishlist personnelle privée, avec création d’accès visiteurs par code unique, connexion nominative et administration protégée.

## Démarrage local

Prérequis : Node.js 20 ou plus récent. L’application n’ajoute pas de client Supabase : le serveur utilise l’API REST Supabase intégrée à Node.

1. Créer un projet Supabase, puis exécuter [`supabase/schema.sql`](supabase/schema.sql) dans son SQL Editor.
2. Copier `.env.example` vers `.env`.
3. Renseigner `ADMIN_PASSWORD` (16 caractères minimum), `SESSION_SECRET` (valeur aléatoire d’au moins 32 caractères), `SUPABASE_URL` et `SUPABASE_SECRET_KEY`.
4. Lancer `npm start`, puis ouvrir `http://localhost:3000`.
5. Ouvrir `/admin`, se connecter et créer un code de partage. Il est montré une seule fois : le copier pour le transmettre.

À chaque visite, les proches saisissent leur nom et leur code personnel à 4 chiffres. La première fois, ils cliquent sur « Première connexion ? Rejoindre une wishlist », puis saisissent le code de partage, leur nom et leur code personnel. Le navigateur peut préremplir le nom, mais il reste modifiable. Les codes personnels sont hachés côté serveur. Les tentatives sont limitées ; ce code à 4 chiffres offre une protection plus faible qu’un mot de passe long et sert uniquement à un accès en lecture seule. En cas d’oubli, l’administrateur peut renouveler le code de partage, ce qui oblige tous les proches à recréer leur accès.

Le code courant reste consultable dans l’espace administrateur. Il est conservé chiffré dans Supabase avec une clé dérivée de `SESSION_SECRET`, en plus de son hash utilisé pour la validation. Pour un code déjà présent dans la base avant cette mise à jour, générez-en un nouveau pour activer son affichage persistant.

La clé Supabase secrète reste uniquement dans l’environnement du serveur : ne la place jamais dans le navigateur ni dans une variable `NEXT_PUBLIC_*`. Une ancienne clé `service_role` fonctionne aussi, mais la clé secrète `sb_secret_...` est préférable.

## Importer les anciennes données JSON

Si la wishlist existe déjà dans `data/wishlist.json`, configure d’abord `.env` et exécute `npm run migrate:json` avant de lancer l’application. La commande importe les données uniquement si la base ne contient pas encore de wishlist. Elle ne remplace jamais une wishlist déjà présente.

## Déploiement sur Vercel

Importer le dépôt dans Vercel et définir `ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPABASE_URL` et `SUPABASE_SECRET_KEY` dans les variables d’environnement du projet. Le point d’entrée `server.ts` lance le serveur Node ; le stockage durable est assuré par Supabase, pas par les fichiers de l’instance Vercel.

La table contient l’état de cette wishlist personnelle dans une seule ligne JSONB, y compris les comptes visiteurs (codes personnels hachés côté serveur). RLS est activé et aucun accès n’est accordé aux rôles `anon` et `authenticated` ; seul le serveur accède à la base avec sa clé secrète. Après cette mise à jour, les personnes ayant un ancien compte visiteur doivent le recréer avec le code de partage.

Le rate limiting actuel est conservé en mémoire par instance. Il convient à un usage personnel, mais n’est pas partagé entre plusieurs instances Vercel.

## Fonctionnalités

- Les images et liens de boutiques doivent utiliser HTTPS.
- Un lien de boutique HTTPS peut préremplir le nom, la description, l’image et le prix lorsque la page publie ces métadonnées. Certains sites bloquent la lecture automatique ; les champs restent modifiables. La récupération refuse les destinations réseau privées.
- Chaque article peut avoir un prix à l’unité et jusqu’à 8 variantes nommées avec leur propre prix.
- Aucun article de démonstration ni donnée factice n’est inclus.
