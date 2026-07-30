# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Versions : [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- `@fw/core-math` : lexeur, parseur à descente récursive, évaluateur et
  vérificateur de continuité. 65 tests, dont des propriétés fast-check qui
  couvrent « le parseur ne lève jamais », l'aller-retour impression/analyse, et
  l'acceptation ou le refus de raccords construits.

- `@fw/physics` : intersections segment/rectangle, segment/disque et
  segment/polygone convexe, tracé à pas adaptatif, générateur de cartes
  déterministe et sa validation. 50 tests.
- `@fw/cli` : une démonstration en terminal — une carte, une fonction, un
  tracé en ASCII — et `pnpm run hotseat`, une partie complète à deux à quatre
  joueurs sur un seul clavier.
- `@fw/rules` : création de partie, tours, boucliers, vulnérabilités, modes FFA
  et équipes, conditions de victoire, déconnexion et reconnexion. 29 tests dont
  des propriétés : le nombre de vivants ne croît jamais, le joueur actif est
  toujours vivant, `apply` ne modifie jamais l'état reçu, et une partie rejouée
  depuis sa graine et ses commandes est identique champ à champ.
- `ERR_NOT_ENOUGH_TEAMS` : une partie en équipes à une seule équipe est refusée
  au lieu de se terminer d'elle-même au premier tour.

### Décidé, en cours d'implémentation

- La vérification de continuité n'inspecte que les raccords de morceaux : les
  fonctions du langage étant continues sur leur domaine, une expression à un
  seul morceau l'est par théorème. Documenté dans `docs/GAME_DESIGN.md` §3 et
  dans l'en-tête de `continuity.ts`.
- La multiplication implicite suit un littéral — nombre, `pi` ou `e` — et pas
  seulement un nombre, pour que `2e5` et `2pi x` se lisent comme un joueur les
  écrit. Pas de notation scientifique.
- [ADR 0008](docs/adr/0008-map-generator-knows-the-seat-count.md) — le
  générateur reçoit le nombre de sièges.
- [ADR 0009](docs/adr/0009-tracer-receives-an-evaluator.md) — le tracer reçoit
  un évaluateur au lieu de l'importer.
- [ADR 0010](docs/adr/0010-coverage-ceiling.md) — plafond de couverture à 0,35.
- [ADR 0011](docs/adr/0011-placement-rule-must-cut-both-ways.md) — la règle de
  placement coupe dans les deux sens : rien de trivial ne relie deux joueurs,
  mais quelque chose les relie toujours. **Plafond mesuré : quatre joueurs.**

### Corrigé

- La graine d'une partie ne pilotait rien : les tirages de placement venaient
  d'un générateur injecté à part, sans garantie qu'il corresponde à la graine
  inscrite dans l'état. Une partie pouvait annoncer une graine et avoir été
  tirée avec une autre, et son rejeu n'aurait rien reproduit. Le moteur dérive
  maintenant tout de `setup.seed`, et `RulesDeps.rng` a disparu. Voir la
  correction datée dans [ADR 0004](docs/adr/0004-determinism.md).
- La CI passait en local et échouait sur un dépôt propre : le lint typé lisait
  les déclarations produites par la compilation, et tournait avant elle.

### Connu et non résolu

- **Une partie dure longtemps.** Un joueur qui tire au hasard met environ
  220 tirs à en éliminer un autre, soit 0,5 % de réussite par tir. Un humain
  qui corrige d'un tir sur l'autre fait mieux, de combien reste à mesurer
  (tâche BA-3).

- Le générateur ne produit pas de carte à six joueurs ou plus. Il refuse
  proprement plutôt que d'en livrer une injouable ; `DEFAULT_RULES.maxPlayers`
  vaut toujours 8. Voir BA-8 dans `TASKS.md`.

## [0.1.0] — 2026-07-30

Phase 1 : le squelette et les contrats. Le jeu n'est pas jouable ; ce qui est
posé, c'est ce contre quoi six agents vont pouvoir coder en parallèle.

### Ajouté

- Monorepo pnpm, TypeScript strict, ESLint typé, Prettier, Vitest, fast-check.
- `@fw/contracts`, gelé : identifiants brandés, `Result`, générateur
  pseudo-aléatoire déterministe, géométrie, AST des fonctions, codes d'erreur
  avec leurs messages français, requête et résultat de tir, configuration et
  valeurs d'équilibrage, état de partie, ports, protocole réseau.
- Squelettes de `@fw/core-math`, `@fw/physics`, `@fw/rules`, `@fw/server`,
  `@fw/client`, chacun avec son périmètre et ses critères d'acceptation.
- Documentation : `AGENTS.md`, architecture, design du jeu, protocole,
  workflow multi-agents, et sept ADR.
- CI GitHub Actions : format, lint, typecheck, tests, plus une passe dédiée qui
  interdit `eval`, `new Function` et `Math.random`.
- Modèles de pull request et d'issues, `CODEOWNERS`, backlog dans `TASKS.md`.
- Hook pre-commit sans dépendance (`.githooks/pre-commit`), à activer par clone.

### Décidé

- [ADR 0001](docs/adr/0001-typescript-monorepo.md) — TypeScript partout,
  serveur `ws`, client React/Canvas.
- [ADR 0002](docs/adr/0002-no-eval-hand-written-parser.md) — aucune exécution
  de code joueur, parseur écrit à la main.
- [ADR 0003](docs/adr/0003-frozen-contracts-package.md) — contrats gelés.
- [ADR 0004](docs/adr/0004-determinism.md) — hasard seedé, horloge injectée.
- [ADR 0005](docs/adr/0005-in-memory-server-state.md) — état serveur en mémoire.
- [ADR 0006](docs/adr/0006-client-side-curve-preview.md) — prévisualisation
  calculée par le client, sans collisions.
- [ADR 0007](docs/adr/0007-continuity-as-only-validation.md) — la continuité
  est la seule règle de validation.

<!-- La balise v0.1.0 existe en local ; le proxy Git de la session refuse le
     push de balises (403). À pousser depuis une machine ayant les droits :
     `git push origin v0.1.0`. -->

[non publié]: https://github.com/francois136/Math-game/commits/main
