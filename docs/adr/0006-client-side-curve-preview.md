# 0006 — La prévisualisation de courbe est calculée par le client

- **Statut** : accepté
- **Date** : 2026-07-30

## Contexte

La règle est nette : aucune logique de jeu côté client. Mais un joueur qui tape
`3*sin(x/2)` doit voir sa courbe **pendant** qu'il la tape. Un aller-retour
réseau par frappe est à la fois lent et un canal d'analyse offert à qui voudrait
sonder le terrain.

## Décision

Le client importe `@fw/core-math` — et lui seul — pour évaluer la fonction et
dessiner un trait de prévisualisation.

Cette courbe **ignore les obstacles, les joueurs et les collisions**. Elle ne
dit pas où le tir s'arrêtera, ni qui il touchera. Le tracé qui compte
(`TraceResult`) vient du serveur, toujours.

Le client n'importe jamais `@fw/physics` ni `@fw/rules` en mode réseau. En mode
hot-seat, où il n'y a pas de serveur, il les importe tous : il _est_ le serveur.

## Raisons

Évaluer une fonction n'est pas une décision de jeu. Décider qui meurt en est
une. La frontière passe là, et elle est vérifiable : `packages/client/package.json`
ne déclare pas `@fw/physics` ni `@fw/rules` en dépendance de production.

## Conséquences

- La validation _avant tir_ reste serveur (`shot:validate`) : c'est lui qui
  décide si une fonction est acceptable, pas le client.
- Un client modifié pourrait tracer la courbe sans les collisions. Il le peut
  déjà avec un papier et un crayon : ce n'est pas une information privilégiée.
- Le rendu de la prévisualisation ne doit jamais réutiliser le style visuel du
  tracé confirmé, pour qu'aucun joueur ne les confonde.
