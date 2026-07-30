# 0008 — Le générateur de cartes reçoit le nombre de sièges

- **Statut** : accepté
- **Date** : 2026-07-30

## Contexte

`MapGeneratorPort.generate(seed, params)` ne disait pas combien de points
d'apparition produire. Deux contournements étaient possibles :

- en générer toujours huit et laisser les règles n'en garder que les premiers ;
- déduire le nombre du contexte, que le port ne reçoit pas.

Le premier casse la validation anti-tir-facile, qui est la contrainte
dimensionnante du générateur : elle porte sur **chaque paire** de sièges, donc
sur 28 paires à huit joueurs contre une seule à deux. Une carte de duel aurait
dû satisfaire 28 contraintes dont 27 ne servent à rien — beaucoup plus longue à
trouver, et plus encombrée d'obstacles pour y arriver.

## Décision

`MapParams` gagne un champ `spawnCount`, entre 2 et 8. Les règles le
renseignent depuis le nombre de joueurs de la partie. Valeur par défaut : 2.

## Conséquences

- Changement de contrat, donc PR dédiée et cette ADR — c'est le premier passage
  par la procédure de l'[ADR 0003](0003-frozen-contracts-package.md).
- **Non cassant** pour les rejeux : `MapParams` fait partie de `MatchConfig`,
  qui est enregistré avec la partie. Une partie enregistrée avant ce champ ne
  se relit plus telle quelle, mais il n'existe encore aucune partie
  enregistrée.
- Le générateur peut désormais adapter sa densité d'obstacles au nombre de
  sièges, ce qu'il ne pouvait pas faire.
