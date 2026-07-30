# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Versions : [SemVer](https://semver.org/lang/fr/).

## [Non publié]

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
