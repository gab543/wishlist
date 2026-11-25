# Herbier

Wishlist personnelle privée, avec accès visiteur en lecture seule par code unique et administration protégée.

## Démarrage local

Prérequis : Node.js 20 ou plus récent. L’application n’ajoute pas de client Supabase : le serveur utilise l’API REST Supabase intégrée à Node.

1. Créer un projet Supabase, puis exécuter [`supabase/schema.sql`](supabase/schema.sql) dans son SQL Editor.
2. Copier `.env.example` vers `.env`.
3. Renseigner `ADMIN_PASSWORD` (16 caractères minimum), `SESSION_SECRET` (valeur aléatoire d’au moins 32 caractères), `SUPABASE_URL` et `SUPABASE_SECRET_KEY`.
4. Lancer `npm start`, puis ouvrir `http://localhost:3000`.
5. Ouvrir `/admin`, se connecter et créer un code de partage. Il est montré une seule fois : le copier pour le transmettre.

La clé Supabase secrète reste uniquement dans l’environnement du serveur : ne la place jamais dans le navigateur ni dans une variable `NEXT_PUBLIC_*`. Une ancienne clé `service_role` fonctionne aussi, mais la clé secrète `sb_secret_...` est préférable.

## Importer les anciennes données JSON

Si la wishlist existe déjà dans `data/wishlist.json`, configure d’abord `.env` et exécute `npm run migrate:json` avant de lancer l’application. La commande importe les données uniquement si la base ne contient pas encore de wishlist. Elle ne remplace jamais une wishlist déjà présente.

## Déploiement sur Vercel

Importer le dépôt dans Vercel et définir `ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPABASE_URL` et `SUPABASE_SECRET_KEY` dans les variables d’environnement du projet. Le point d’entrée `server.ts` lance le serveur Node ; le stockage durable est assuré par Supabase, pas par les fichiers de l’instance Vercel.

La table contient l’état de cette wishlist personnelle dans une seule ligne JSONB. RLS est activé et aucun accès n’est accordé aux rôles `anon` et `authenticated` ; seul le serveur accède à la base avec sa clé secrète. Les visiteurs utilisent l’API de l’application et doivent saisir le code actif.

Le rate limiting actuel est conservé en mémoire par instance. Il convient à un usage personnel, mais n’est pas partagé entre plusieurs instances Vercel.

## Fonctionnalités

- Les images et liens de boutiques doivent utiliser HTTPS.
- Un lien de boutique HTTPS peut préremplir le nom, la description, l’image et le prix lorsque la page publie ces métadonnées. Certains sites bloquent la lecture automatique ; les champs restent modifiables. La récupération refuse les destinations réseau privées.
- Chaque article peut avoir un prix à l’unité et jusqu’à 8 variantes nommées avec leur propre prix.
- Aucun article de démonstration ni donnée factice n’est inclus.
