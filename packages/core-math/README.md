# @fw/core-math

**Propriétaire : agent Core-Math.** Pur, sans I/O, sans DOM, sans réseau.

Transforme le texte tapé par un joueur en une fonction évaluable, ou en une
erreur qui lui explique quoi corriger.

## Ports implémentés

- `ExpressionParserPort` — `parse(source) → Result<ParsedExpression, FwError>`
- `EvaluatorPort` — `evaluate(ast, x) → EvalOutcome`
- `ContinuityCheckerPort` — `check(expr, interval, params) → Result<void, FwError>`

## Ce qu'il faut construire

1. **Lexeur et parseur à descente récursive** (précédence : `^` à droite, puis
   unaire `−`, puis `* /`, puis `+ −`). Pas de générateur de parseur, pas de
   dépendance. Multiplication implicite (`2x`, `3sin(x)`) : **oui**, et
   documentée dans `docs/GAME_DESIGN.md`.
2. **Fonctions par morceaux**, syntaxe `{ expr si garde ; … ; expr sinon }`.
   Gardes évaluées dans l'ordre, première vraie gagne. Le morceau `sinon` final
   est facultatif : là où aucune garde ne tient, la fonction n'est pas définie,
   ce qui est une sortie de domaine et non une erreur.
3. **Limites statiques** appliquées pendant le parsing, pas après :
   `MAX_SOURCE_LENGTH`, `MAX_AST_DEPTH`, `MAX_AST_NODES`,
   `MAX_PIECEWISE_BRANCHES`. Une entrée hostile doit coûter moins d'une
   milliseconde.
4. **Évaluation** sans exception : hors domaine est une valeur
   (`{ defined: false, failure }`), jamais un `throw`.
5. **Continuité** — la seule règle de validation du jeu. Elle ne s'intéresse
   qu'aux raccords de morceaux : toutes les fonctions du langage étant
   continues sur leur domaine, une expression à un seul morceau l'est par
   théorème, et la balayer ne produirait que des faux positifs sur les fortes
   pentes. Les raccords sont trouvés par les gardes simples (`x < c`, exactes)
   et par un balayage numérique de la branche active (général). Renvoie **la
   première** discontinuité, avec un message qui donne `x`, la limite à gauche
   et la limite à droite.

## Interdits

- `eval`, `new Function`, `Function()`, `import()` dynamique sur du texte
  joueur. Le lint échoue si l'un apparaît. Voir `docs/adr/0002`.
- `Math.random`, `Date.now` : injectés, jamais lus dans le paquet.
- Toute mutation d'un nœud d'AST : ils sont `readonly` par contrat.

## Critères d'acceptation

- Tests de propriétés (fast-check) : `parse` ne lève jamais, sur n'importe
  quelle chaîne ; `parse(print(ast))` redonne le même AST ; toute fonction
  polynomiale est acceptée ; toute fonction par morceaux qui recolle à ε près
  est acceptée, et rejetée sinon.
- Table de cas de discontinuité : `tan`, `1/x`, `ln` en 0, raccords sautés,
  raccords propres.
- `parse` sur 512 caractères adverses : < 1 ms.
