# 0012 — Une partie compte au plus quatre joueurs

- **Statut** : amendé par [0015](0015-the-board-grows-with-the-lobby.md) — le
  plafond dépend maintenant de la difficulté et monte jusqu'à huit
- **Date** : 2026-07-30
- **Décide** : le superviseur, sur la mesure de l'[ADR 0011](0011-placement-rule-must-cut-both-ways.md)

## Contexte

Le brief demandait des salons de deux à huit joueurs. L'ADR 0011 a établi que
la règle de placement doit couper dans les deux sens : aucune courbe triviale
ne doit relier deux joueurs, et au moins une courbe doit les relier.

Ces deux contraintes ne sont pas satisfiables au-delà de quatre sièges. Mesuré :
quatre joueurs, 30 cartes sur 30 ; cinq, intermittent ; six et huit, aucune.
Agrandir le terrain n'y change rien — vérifié jusqu'à quatre fois la surface.
La raison est combinatoire : le nombre de paires croît comme le carré du nombre
de joueurs, les droites à sceller forment un maillage de plus en plus dense, et
le milieu du terrain finit saturé d'obstacles qui ferment aussi les voies de
passage.

## Décision

`MAX_PLAYERS = 4`, et les schémas le font respecter : `RuleSet.maxPlayers`,
`MapParams.spawnCount`, `GameMap.spawns`, `MatchState.players` et
`MatchState.order` sont tous bornés à quatre.

Le plafond est **dans le contrat**, pas seulement dans la valeur par défaut.
Une limite qu'on peut dépasser en changeant un réglage n'est pas une limite :
c'est un salon de six joueurs qui échoue au démarrage sans que personne
comprenne pourquoi.

## Conséquences

- Le mode équipes se joue à 2 contre 2. C'est peu, et c'est assumé.
- Lever le plafond suppose de rouvrir l'ADR 0011 : soit une autre famille de
  courbes triviales, soit renoncer à la règle de placement au-delà de quatre et
  s'en remettre au bouclier de départ. Tâche BA-8.
- Les schémas refusent désormais une configuration à six joueurs plutôt que de
  l'accepter et d'échouer plus tard. C'est le comportement voulu : un contrat
  qui ment coûte plus cher qu'un contrat qui restreint.
