# 0007 — La continuité est la seule règle de validation

- **Statut** : accepté
- **Date** : 2026-07-30
- **Décide** : le superviseur (brief initial)

## Contexte

Il fallait décider ce qu'une fonction doit satisfaire pour être tirable. Les
candidats évidents — interdire les asymptotes, borner la dérivée, imposer
`f(0) = 0` — sont tous plus simples à implémenter que la continuité.

## Décision

Une fonction est acceptée si et seulement si elle est **continue** sur chaque
intervalle où elle est définie. Rien d'autre n'est exigé.

En particulier :

- `f(0) = 0` n'est **pas** exigé : le moteur translate la courbe
  (`y = y₀ + f(x − x₀) − f(0)`).
- Une asymptote verticale n'est **pas** un motif de refus. `tan(x)` et `1/x`
  sont continues sur leur domaine ; la courbe s'arrête simplement en arrivant
  au pôle.
- Une fonction par morceaux n'a **pas** à couvrir toute la droite réelle : là
  où aucune garde ne tient, elle n'est pas définie, et le tir s'arrête.

Ce qui est refusé, et refusé **avant** le tir, sans consommer le tour :

- une fonction non définie en `0`, faute de point de départ ;
- un raccord de morceaux dont les limites gauche et droite diffèrent de plus de
  `continuityEpsilon`.

## Raisons

C'est la contrainte du brief, et elle est bonne : elle produit exactement le
jeu qu'on veut. Interdire les asymptotes retirerait `tan` de l'arsenal, alors
qu'une courbe qui fonce vers l'infini juste avant un obstacle est un des tirs
les plus satisfaisants du jeu. Borner la dérivée aurait obligé à expliquer une
règle que personne n'a envie d'apprendre.

Une seule règle, énonçable en une phrase, et dont l'échec s'explique en donnant
deux nombres.

## Conséquences

- Le vérificateur de continuité est un morceau de code sérieux, à tester par
  propriétés : c'est lui qui porte toute la validation.
- Le message d'erreur doit donner `x`, la limite à gauche et la limite à
  droite. Sans ces trois nombres, il n'apprend rien.
- Les garde-fous de terminaison (`maxArcLength`, `maxSteps`, budget
  d'évaluations) ne sont **pas** des règles de jeu : ils arrêtent un tir, ils
  ne le refusent pas.
