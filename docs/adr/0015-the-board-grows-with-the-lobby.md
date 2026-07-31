# 0015 — Le terrain grandit avec le salon, et le plafond dépend de la difficulté

- **Statut** : accepté
- **Date** : 2026-07-31
- **Amende** : [ADR 0011](0011-placement-rule-must-cut-both-ways.md),
  [ADR 0012](0012-four-players.md), [ADR 0014](0014-difficulty-and-team-separation.md)

## Contexte

L'ADR 0012 plafonnait le jeu à quatre joueurs, sur la mesure de l'ADR 0011 :
au-delà, le générateur ne satisfaisait plus ses deux règles de placement. Sa
conclusion — « agrandir le terrain n'y change rien » — était juste **au moment
où elle a été écrite**, et fausse depuis l'ADR 0014.

Deux choses ont changé.

D'abord, la contrainte « une parabole doit relier chaque paire » n'est plus
exigée partout : c'est la promesse de `facile` seule. `moderee` et `difficile`
ne demandent que la connexité monotone, qui est bien plus faible.

Ensuite, la distance entre ennemis était exprimée **en fraction de la largeur
du terrain**. Agrandir le terrain agrandissait donc la distance exigée dans la
même proportion : la contrainte était invariante d'échelle, et l'agrandissement
ne pouvait effectivement rien y faire. C'est ce qui a rendu la mesure de
l'ADR 0012 juste pour une mauvaise raison.

## Mesure

Terrain agrandi, distance ennemie tenue à **45 unités**, 16 cartes par case :

| sièges | terrain | facile         | modérée        | difficile      |
| ------ | ------- | -------------- | -------------- | -------------- |
| 5      | ×1,3    | 16/16 (356 ms) | 16/16 (33 ms)  | 16/16 (177 ms) |
| 6      | ×1,6    | 16/16 (3,6 s)  | 16/16 (101 ms) | 16/16 (605 ms) |
| 7      | ×1,6    | 4/16           | 16/16 (188 ms) | 16/16 (1,2 s)  |
| 8      | ×1,6    | 0/16           | 16/16 (326 ms) | 12/16          |

Sur le terrain à deux joueurs, aux mêmes 45 unités, **aucun** effectif au-delà
de quatre ne produit une seule carte.

## Décision

**La distance de placement s'exprime en unités, plus en fraction.**
`enemySeparationFraction` devient `spawnMinDistanceEnemies`, 45 par défaut —
soit ce que valait 0,45 sur le terrain à deux joueurs, donc rien de changé pour
un duel. Une fraction demanderait mécaniquement un écart plus grand au moment
précis où il y a plus de monde à loger.

**Le terrain grandit avec le nombre de sièges** (`sizedForSeats`) : ×1 jusqu'à
quatre, ×1,3 à cinq, ×1,6 au-delà. Le nombre d'obstacles suit l'aire, pour
qu'un terrain plus grand ne soit pas un terrain plus vide. Personne n'a jamais
voulu des ennemis plus proches ; ce qu'il fallait, c'était de la place.

**Le plafond de joueurs dépend de la difficulté** (`maxSeatsFor`) : cinq en
`facile`, sept en `difficile`, huit en `moderee` — l'effectif que le brief
demandait. `MAX_PLAYERS` repasse donc à 8.

`facile` s'arrête à cinq alors que six cartes sur six sortent : elles coûtent
trois secondes et demie de serveur bloqué chacune. Un salon n'a pas à payer ce
prix, et le mur est structurel — le nombre de paires à la fois scellées et
ouvertes croît comme le carré de l'effectif.

Le refus est **explicite et précoce** : `createMatch` rejette l'effectif avec
`ERR_TOO_MANY_SEATS_FOR_DIFFICULTY` avant d'appeler le générateur, le message
français dit quelle difficulté choisir, et le salon désactive « Lancer » avec
la même phrase. C'est exactement ce que l'ADR 0012 exigeait d'un plafond : pas
un échec mystérieux au démarrage.

## Conséquences

- L'ADR 0012 est amendé, pas annulé : sa mesure reste vraie de son époque, et
  sa règle — un plafond appartient au contrat — est celle qu'on applique ici,
  simplement avec un plafond par difficulté au lieu d'un plafond unique.
- Une carte plus petite que celle par défaut doit baisser
  `spawnMinDistanceEnemies` : 45 unités ne traversent pas un terrain large de 50. C'est visible immédiatement (aucune carte ne sort), et documenté.
- Le mode équipes monte à 4 contre 4 en `moderee`.
- Générer une carte à six sièges en `difficile` prend 605 ms, à sept 1,2 s. Le
  serveur est mono-thread : ce temps est du gel pour tous les salons. Acceptable
  une fois par partie, à surveiller — inscrit dans `TASKS.md`.
- `facile` à cinq joueurs coûte 356 ms, `moderee` à huit 326 ms : la difficulté
  la plus permissive est aussi la moins chère, ce qui va dans le bon sens.
