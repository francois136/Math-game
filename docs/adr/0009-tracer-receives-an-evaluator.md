# 0009 — Le tracer reçoit un évaluateur, il ne l'importe pas

- **Statut** : accepté
- **Date** : 2026-07-30

## Contexte

`@fw/physics` doit évaluer la fonction du joueur pour avancer le long de la
courbe. L'évaluateur vit dans `@fw/core-math`.

La solution la plus courte aurait été d'ajouter `@fw/core-math` aux dépendances
de `@fw/physics`. Elle transforme deux paquets frères en une pile : le tracer
ne pourrait plus être testé sans le parseur, et une modification du langage
ferait recompiler la géométrie.

## Décision

`TraceInput` porte un champ `evaluator: EvaluatorPort`. Le moteur de règles,
qui détient déjà les deux ports dans ses `deps`, le passe au tracer.

## Conséquences

- Le graphe de dépendances reste plat : `core-math`, `physics` et `rules` ne
  dépendent que de `@fw/contracts`, exactement comme le décrit
  `docs/ARCHITECTURE.md`.
- Les tests du tracer fournissent leur propre évaluateur — souvent une
  fonction écrite à la main, ce qui isole un défaut de tracé d'un défaut de
  parsing.
- Un coût réel : une indirection d'appel par évaluation, dans la boucle la plus
  chaude du jeu. Le banc de PH-8 dira si elle se voit ; en cas de besoin, la
  réponse sera de mémoriser l'appel côté tracer, pas de recâbler le graphe.
- _Constaté en phase 3 :_ `RulesDeps` doit porter l'évaluateur lui aussi,
  puisque c'est le moteur de règles qui construit le `TraceInput`. Champ ajouté
  ; la décision ne change pas, sa surface s'étend d'un cran.
