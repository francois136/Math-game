# AGENTS.md — règles permanentes

> Ce fichier est lu à froid, sans contexte préalable. Il doit suffire, avec les
> documents qu'il désigne, pour coder ici sans rien casser chez les voisins.

## 1. À lire avant d'écrire quoi que ce soit

| Document                                           | Rôle                                              |
| -------------------------------------------------- | ------------------------------------------------- |
| Ce fichier                                         | Conventions, périmètres, interdits                |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)     | Qui dépend de qui, et pourquoi                    |
| [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)       | Les règles du jeu, verbatim                       |
| [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md) | Branche, PR, conflit                              |
| Le `README.md` de ton paquet                       | Ton périmètre exact et tes critères d'acceptation |

## 2. La règle qui gouverne tout : les contrats avant le code

`@fw/contracts` est **gelé**. Six périmètres compilent contre lui en parallèle.
Un champ ajouté « juste pour se dépanner » casse silencieusement cinq voisins.

- On ne modifie `packages/contracts/` que dans une **PR dédiée**, qui ne touche
  rien d'autre, accompagnée d'une **ADR** dans `docs/adr/`.
- Bloqué par un contrat manquant ? Ouvre l'issue « contract change », code
  autour avec un adaptateur local, et continue. Ne le modifie pas dans la PR
  en cours.
- Tu implémentes un port ? Ton export public **est** l'interface de
  `ports.ts`, à l'identique. Pas de signature « améliorée ».

## 3. Périmètres — deux agents ne touchent jamais le même fichier

| Agent     | Écrit dans                                                                | Ne touche jamais                                          |
| --------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| Core-Math | `packages/core-math/**`                                                   | tout le reste                                             |
| Physics   | `packages/physics/**`                                                     | tout le reste                                             |
| Rules     | `packages/rules/**`                                                       | tout le reste                                             |
| Server    | `packages/server/**`                                                      | tout le reste                                             |
| Client    | `packages/client/**`                                                      | tout le reste                                             |
| QA/DevOps | `.github/**`, `packages/cli/**`, config racine, `docs/` sauf ADR d'autrui | `packages/{core-math,physics,rules,server,client}/src/**` |
| Lead      | `packages/contracts/**`, arbitrage                                        | —                                                         |

Fichiers partagés (`package.json` racine, `tsconfig.json` racine, `TASKS.md`,
`CHANGELOG.md`) : modification autorisée mais **minimale**, une ligne si
possible, et signalée dans la description de PR — ce sont les seuls endroits où
un conflit est attendu.

Ajouter ton paquet à la compilation, quand tu poses ton premier `src/` : une
ligne dans `references` de `tsconfig.json` racine. Rien d'autre.

## 4. Ce qui est interdit, partout, sans exception

- **`eval`, `new Function`, `Function()`, `import()` sur du texte joueur.** Le
  lint échoue. Voir [`docs/adr/0002`](docs/adr/0002-no-eval-hand-written-parser.md).
- **`Math.random`.** Utilise le `Rng` seedé de `@fw/contracts`. Le lint échoue.
- **`Date.now()`** dans les paquets purs. Le temps est un paramètre. Le lint échoue.
- **`any` non justifié.** Toute exception porte un commentaire qui l'explique.
- **Logique de jeu côté client.** Une seule dérogation, bornée, dans
  [`docs/adr/0006`](docs/adr/0006-client-side-curve-preview.md).
- **Désactiver un test, le passer en `skip`, affaiblir une assertion pour la
  faire passer.** Un test rouge se répare. Si le test lui-même est faux, la PR
  explique pourquoi.
- **Un `TODO` sans issue.** Format imposé : `// TODO(#123): …`.
- **Un fichier de plus de 400 lignes.** Découpe.
- **Une dépendance de plus** sans ADR. Le budget est volontairement serré :
  `zod`, `ws`, `react`. C'est tout, côté production.

## 5. Style

- TypeScript strict, sans exception (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).
- **Identifiants et commentaires de code en anglais. Documentation, interface
  et messages joueur en français.** Un message d'erreur est du contenu, pas du
  code : il vit dans `messages.fr.ts`, jamais en dur.
- Un échec attendu est un `Result`, pas une exception. `throw` est réservé aux
  violations d'invariant — c'est-à-dire aux bugs.
- Imports d'extension explicite (`./foo.js`), modules ESM, `import type` pour
  les types.
- Pas de classe quand une fonction suffit. Pas d'abstraction pour un seul
  appelant.

## 6. Tests

- Vitest. `packages/*/src/**/*.test.ts`, à côté du code testé.
- Toute logique mathématique ou géométrique a des **tests de propriétés**
  (fast-check), pas trois exemples. Les invariants sont dans le README du
  paquet.
- Le déterminisme se teste : même graine, mêmes entrées, même sortie, comparée
  champ à champ.
- Objectif de couverture : 95 % de lignes sur `core-math`, `physics`, `rules`.
  Le seuil de `vitest.config.ts` monte au fur et à mesure ; il ne redescend
  jamais.

## 7. Définition de « terminé »

- [ ] `pnpm run check` vert en local
- [ ] Tests unitaires **et** de propriétés sur ce qui a été ajouté
- [ ] Aucune régression sur la suite complète
- [ ] Aucun `TODO` sans issue, aucun code mort
- [ ] `CHANGELOG.md` mis à jour
- [ ] Commit atomique en Conventional Commits, scope = nom du paquet
- [ ] PR qui explique **pourquoi**, pas seulement quoi

## 8. Git

- `main` est protégée. Aucun commit direct.
- Branche : `feat/<agent>/<sujet>`, par exemple `feat/core-math/piecewise-parser`.
- Commits en anglais, [Conventional Commits](https://www.conventionalcommits.org/),
  scope = paquet : `feat(core-math): parse piecewise guards`.
- Un agent = un `git worktree` dédié. Voir [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md).
- Aucune PR ne fusionne en rouge.

## 9. Quand il y a un doute

Sur une question **technique ou d'organisation** : tranche, applique, et
consigne dans une ADR si c'est structurant.

Sur une question de **règle du jeu ou d'équilibrage** : ne tranche pas seul.
`docs/GAME_DESIGN.md` fait autorité ; s'il est muet, ouvre une issue
`question` et marque le point `[À TRANCHER]` à l'endroit exact du code. Une
règle inventée en silence est plus coûteuse à retrouver qu'une fonctionnalité
manquante.
