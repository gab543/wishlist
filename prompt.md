
Je veux créer un site web élégant pour publier ma wishlist personnelle. Il n’y a qu’un seul administrateur, une seule wishlist et un seul code de partage actif à la fois. Avant de coder, inspecte le dépôt, lis `AGENTS.md` et les skills pertinents dans `.agents/skills/`, puis vérifie la stack et l’état actuel. Réutilise l’existant et respecte ses conventions. Ne remplace pas l’architecture sans raison.

## Objectif

En tant qu’unique administrateur, je peux gérer ma wishlist depuis un tableau de bord privé. Je peux ensuite partager son code d’accès unique : les visiteurs l’utilisent lors de leur première connexion pour créer leur accès nominatif et consulter ma liste sans pouvoir modifier son contenu. Le code n’est pas placé dans l’URL. Il n’y a qu’une seule wishlist.

## Expérience et design

Crée une interface premium, naturelle et chaleureuse — comme un bel atelier botanique contemporain, pas un tableau de bord générique ni un site « écolo » cliché :

- palette inspirée de la nature : fond crème, texte vert profond ou encre, accents sauge et terre cuite ;
- typographie élégante et expressive, beaucoup d’espace, détails organiques très subtils ;
- wishlist mise en valeur par de belles cartes illustrées, avec une hiérarchie visuelle soignée et des images harmonieuses ;
- disposition en grille sur desktop et en une colonne sur mobile, avec des cartes adaptées à chaque format ;
- interface entièrement en français, avec des textes naturels et concis ;
- expérience mobile soignée autant que desktop.

La page d’accueil doit inviter à saisir le code dans un formulaire clair et rassurant. Après validation, présente la wishlist avec son titre, une courte introduction et ses articles. Une carte peut afficher une image, un nom, une description, un prix indicatif et un lien vers la boutique si ces informations sont disponibles.

Soigne les animations : transitions fluides, apparitions discrètes, légers mouvements inspirés du vivant et interactions agréables sur les cartes et les boutons. Évite les effets tape-à-l’œil et les animations qui gênent la lecture. Elles doivent enrichir l’expérience sans la ralentir. Respecte `prefers-reduced-motion` et ne fais pas dépendre l’accès au contenu d’une animation.

## Fonctionnalités

- Connexion habituelle : saisie du nom et d’un code personnel à 4 chiffres.
- Première connexion : le visiteur choisit « Rejoindre une wishlist », saisit le code de partage, puis choisit son nom et son code personnel à 4 chiffres.
- Le nom peut être prérempli sur le même navigateur, mais reste modifiable.
- Accès en lecture seule à l’unique wishlist ; renouveler le code invalide les accès visiteurs existants.
- Tableau de bord administrateur pour créer, consulter, modifier et supprimer des articles.
- Un article peut avoir un nom, une description, une image, un prix indicatif, une catégorie et un lien externe.
- Permettre de gérer le titre et la description de la wishlist, ainsi que de renouveler son code de partage.
- Prévoir des états vides, chargement, erreur et code invalide, avec des messages compréhensibles.
- Les liens externes s’ouvrent de façon sûre et clairement identifiable.
- N’ajoute pas de réservation, paiement ou autre fonctionnalité non demandée.

## Sécurité et données

Le code public sert uniquement à consulter une liste : il ne doit jamais donner accès à l’administration ni permettre de modifier des données. Protège les routes et opérations admin avec le mécanisme d’authentification existant. Si le projet n’en a pas, signale-le et propose une solution adaptée au dépôt plutôt que de laisser l’administration ouverte.

Les codes de partage doivent être difficiles à deviner et leur validation ne doit pas révéler si d’autres codes existent. Ne mets pas de données sensibles dans le code client. N’utilise pas de fausses données comme si elles étaient persistées : branche les écrans sur le stockage existant ou indique clairement ce qui manque pour rendre l’application réellement fonctionnelle.

## Méthode et qualité

Commence par résumer brièvement la structure existante et le plan d’implémentation, puis réalise le travail. Si un choix important est impossible à déduire du dépôt, pose une question avant de prendre une décision qui changerait fortement le périmètre.

Vérifie le résultat avec les commandes de test, lint et build adaptées au projet. Corrige les problèmes introduits par tes changements. Si possible, lance l’application et vérifie visuellement les vues principales sur mobile et desktop.

À la fin, résume les fonctionnalités réalisées, les fichiers importants modifiés, les vérifications effectuées et les éventuels prérequis encore nécessaires.
