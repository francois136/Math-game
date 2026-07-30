# 0005 — L'état du serveur vit en mémoire, et seulement là

- **Statut** : accepté
- **Date** : 2026-07-30
- **Décide** : le superviseur

## Contexte

Une partie compte de deux à huit joueurs et dure quelques dizaines de minutes.
Trois options avaient été posées : mémoire seule, mémoire plus persistance des
rejeux en SQLite, ou état partagé dans Redis pour plusieurs instances.

## Décision

Mémoire seule. `Map<LobbyCode, Lobby>` dans le process Node. Aucune base de
données, aucun cache externe, un seul process.

## Raisons

- La charge réelle ne justifie rien de plus : huit joueurs par partie, un tour
  toutes les dizaines de secondes.
- Redis aurait imposé une sérialisation de l'état à chaque transition, c'est-à-
  dire exactement le couplage que l'architecture pure cherche à éviter.
- Le déploiement reste trivial, ce qui compte plus, à ce stade, que la
  résilience au redémarrage.

## Conséquences

- **Un redémarrage du serveur perd les parties en cours.** C'est accepté et
  doit être dit à l'utilisateur dans l'interface, pas découvert.
- Pas de mise à l'échelle horizontale sans revenir sur cette décision.
- Les rejeux sont des fichiers JSON téléchargés par le client à la fin d'une
  partie, pas des lignes en base.
- Revenir sur ce choix concerne uniquement `@fw/server` : les paquets purs ne
  savent pas où vit l'état.
