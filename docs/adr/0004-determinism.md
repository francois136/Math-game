# 0004 — Déterminisme : hasard seedé, horloge injectée

- **Statut** : accepté
- **Date** : 2026-07-30

## Contexte

Le rejeu, les tests d'intégration et le débogage d'une élimination contestée
supposent tous la même chose : rejouer une partie doit redonner exactement la
même partie.

## Décision

1. **Le hasard est seedé.** `Math.random` est interdit par le lint. Toute
   randomisation passe par le `Rng` de `@fw/contracts`, construit à partir de la
   graine de la partie.
2. **Les flux sont séparés.** `rng.fork('map')` et `rng.fork('order')` donnent
   des générateurs indépendants, pour qu'ajouter un tirage dans la génération de
   carte ne décale pas l'ordre de jeu.
3. **Le générateur vit dans les contrats.** Son motif de bits fait partie de la
   surface de compatibilité : le changer casse tous les rejeux enregistrés et
   impose une ADR.
4. **L'horloge est un paramètre.** `Date.now()` est interdit dans les paquets
   purs. `rules.apply(state, command, deps, nowMs)` reçoit l'instant ; seul le
   serveur le lit, via `ClockPort`.
5. **Les paramètres numériques du tracé sont des contrats**, pas des réglages
   locaux : deux builds qui divergent sur `minStep` divergent sur qui est mort.

## Conséquences

_Correction du 30 juillet 2026._ `RulesDeps` portait un `rng` injecté, distinct
de la graine inscrite dans l'état de la partie. Rien ne garantissait que les
deux coïncident : une partie pouvait annoncer la graine A et avoir été tirée
avec la graine B, et son rejeu n'aurait rien reproduit. Le moteur de règles
dérive maintenant ses flux de `setup.seed` par `createRng`, et le champ a été
retiré. Une graine qui ne pilote pas tout n'est pas une graine, c'est une
étiquette.

- Un rejeu est un `reduce` sur la liste des `TurnRecord`, sans machinerie
  supplémentaire.
- Les tests comparent des états entiers, champ à champ, et non des extraits.
- Le choix de mulberry32 (32 bits de sortie, période 2³²) est délibérément
  modeste : il faut un hasard reproductible et rapide, pas cryptographique.
