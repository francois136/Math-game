# 0017 — Un joueur tient dans la bande scellée

- **Statut** : accepté
- **Date** : 2026-07-31
- **Amende** : [ADR 0011](0011-placement-rule-must-cut-both-ways.md)

## Contexte

Depuis l'ADR 0011, une dette était inscrite en toutes lettres dans
`GAME_DESIGN.md`, le `CHANGELOG.md` et `TASKS.md` :

> `playerRadius` peut défaire la règle de placement : une cible plus large que
> la bande scellée se touche au premier tir plat. Vrai au-delà d'environ 3 sur
> la carte par défaut. À trancher en BA-3.

Le générateur scelle toutes les courbes qui montent de moins de 5 % de la
hauteur du terrain entre deux joueurs. Sur le terrain par défaut, cela fait une
bande de 3 unités. Un joueur de rayon supérieur **dépasse de la bande posée
pour le cacher**, et la droite que le générateur a bouchée le touche quand même.

La campagne d'équilibrage (BA-3) permettait enfin de mesurer plutôt que de
supposer.

## Mesure

Duels de bots `confirme`, terrain `moderee`, boucliers retirés, 30 parties par
rayon :

| rayon   | tirs qui touchent | tours médians |
| ------- | ----------------- | ------------- |
| 2       | 1,36 %            | 20            |
| 2,5     | 1,74 %            | 14            |
| 3       | 2,05 %            | 9             |
| **3,5** | **100 %**         | **1**         |
| 4       | 100 %             | 1             |
| 5       | 100 %             | 1             |

Ce n'est pas une pente, c'est une falaise, et elle tombe exactement là où le
rayon dépasse la bande scellée. Au-delà, **tous** les tirs touchent et **toutes**
les parties se terminent au premier tour : le jeu n'existe plus.

## Décision

Le rayon d'un joueur est **borné par la bande que le générateur scelle** :

```
maxPlayerRadiusFor(bounds) = hauteur × TRIVIAL_CURVE_FRACTION
```

`TRIVIAL_CURVE_FRACTION` (0,05) quitte `@fw/physics` pour `@fw/contracts`. Elle
y a sa place : ce n'est plus seulement un réglage du générateur, c'est le
nombre dont dépend la validité d'une configuration de partie.

`createMatch` refuse une configuration hors borne avec
`ERR_PLAYER_RADIUS_TOO_LARGE`, dont le message français dit **pourquoi** — que
les joueurs dépasseraient des obstacles posés pour les cacher — et propose les
deux issues : réduire le rayon, ou agrandir le terrain.

La borne est placée **là où est la falaise**, pas un cran avant par prudence :
un rayon de 3 exactement est accepté sur le terrain par défaut, et se joue
normalement.

## Pourquoi pas l'inverse

Élargir la bande scellée en proportion du rayon a été essayé et mesuré : la
génération à quatre joueurs s'effondre de 30/30 à 1/30 et coûte douze secondes.
Le couplage se résout donc du côté du rayon, pas du côté de la bande.

## Conséquences

- Un hôte qui veut de gros joueurs doit agrandir le terrain — ce qui est le bon
  réflexe, et ce que la borne lui dit.
- Le test d'intégration du serveur utilisait un rayon de 5 sur un terrain de
  30 de hauteur pour rendre les tirs faciles. Il a fallu lui donner un terrain
  haut de 100. C'est le premier utilisateur de la règle, et il l'a trouvée.
- La dette ouverte depuis l'ADR 0011 est fermée par une garantie et non par une
  note : une configuration dangereuse ne démarre plus.
