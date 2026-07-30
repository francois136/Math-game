# 0002 — Aucune exécution de code joueur : parseur écrit à la main

- **Statut** : accepté
- **Date** : 2026-07-30

## Contexte

Le cœur du jeu consiste à accepter une expression mathématique tapée par un
inconnu et à l'évaluer des dizaines de milliers de fois, sur un serveur partagé
par huit joueurs.

`eval` et `new Function` rendraient cela trivial à écrire — et donneraient à
n'importe quel joueur l'exécution de code arbitraire sur le serveur.

## Décision

Aucune forme d'exécution de texte joueur, nulle part : ni `eval`, ni
`new Function`, ni `Function()`, ni `import()` dynamique, ni moteur de gabarits.

Un lexeur et un parseur à descente récursive écrits à la main produisent un AST
typé, que l'évaluateur parcourt. Une règle ESLint (`no-restricted-globals`,
`no-restricted-syntax`) fait échouer la CI si l'un de ces appels réapparaît.

Aucune bibliothèque de mathématiques n'est utilisée non plus : la surface de
notre langage est volontairement minuscule (14 fonctions, 5 opérateurs, une
variable), et une dépendance apporterait ici plus de risque que de code épargné.

## Conséquences

- Le parseur est à écrire et à tester sérieusement — c'est l'objet du paquet
  `@fw/core-math`.
- Toute entrée est bornée **avant** d'être comprise : longueur, profondeur,
  nombre de nœuds, budget d'évaluations (`limits.ts`). Ces bornes ne sont pas
  des réglages de confort, elles sont la surface de sécurité.
- Les messages d'erreur peuvent être précis (position, nom, suggestion), ce
  qu'un `eval` n'aurait jamais permis. La contrainte de sécurité sert la
  pédagogie.
