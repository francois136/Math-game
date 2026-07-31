# 0013 — On tire aussi le long de `y`

- **Statut** : accepté
- **Date** : 2026-07-31
- **Décide** : le superviseur

## Contexte

Une courbe `y = f(x)` s'éloigne de `x₀` de façon monotone et ne revient jamais
sur l'abscisse de son auteur (ADR 0011, conséquences). Le corollaire est plus
gênant : **deux joueurs placés l'un au-dessus de l'autre sont hors d'atteinte**,
quels que soient les obstacles et quelle que soit la fonction. Le validateur de
cartes le savait déjà — il traite une paire alignée verticalement comme non
joignable — mais la seule réponse était d'interdire ce placement, ce qui gâche
une bonne partie du terrain.

## Décision

Un tir porte désormais un **axe** en plus d'un sens. `axis: 'x'` trace
`y = f(x)`, `axis: 'y'` trace `x = f(y)`.

L'implémentation ne double rien : le tracer **transpose** le monde — origine,
obstacles, bornes, cibles — trace comme il l'a toujours fait, puis transpose le
résultat. Un quart de tour à l'aller, un quart de tour au retour.

## Raisons

La transposition est une involution : `transpose(transpose(m)) === m`. Toute
la géométrie de collision, le pas adaptatif, la détection d'asymptote et les
règles d'immunité restent exactement le code déjà testé, exercé sur des données
tournées. Écrire une seconde boucle de tracé pour l'axe `y` aurait doublé la
surface où un défaut peut vivre, pour un résultat identique au signe près.

## Conséquences

- `ShotRequest` gagne `axis`, et le protocole avec lui. Rien n'ayant jamais été
  déployé, `PROTOCOL_VERSION` reste à 1.
- Le vérificateur de continuité reçoit un intervalle exprimé dans la variable du
  tir : `x − x₀` le long de `x`, `y − y₀` le long de `y`. C'est le moteur de
  règles qui le calcule, comme avant.
- Deux joueurs alignés verticalement redeviennent joignables, et le générateur
  n'a plus à écarter ce placement.
- Le coût est une transposition par tir — quelques dizaines de microsecondes sur
  une carte de quarante obstacles, mesuré, très en dessous du budget de 16 ms.
