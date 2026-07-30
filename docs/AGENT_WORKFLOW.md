# Comment travailler ici

Six périmètres, un dépôt, aucune collision. Ce document dit comment.

## 1. Prendre une tâche

1. Ouvre [`TASKS.md`](../TASKS.md). Chaque tâche porte un identifiant
   (`CM-3`), un agent propriétaire, et ses dépendances.
2. Vérifie que ses dépendances sont fusionnées dans `main`. Sinon, prends-en
   une autre — travailler sur une base non fusionnée est la première cause de
   conflit.
3. Marque la tâche « en cours » dans `TASKS.md`, sur ta branche, dans un commit
   `docs:` distinct de ton travail. `main` est protégée : rien n'y arrive
   autrement que par une PR.

## 2. Son propre plan de travail

Un agent = un `git worktree`. Chacun a son répertoire, ses `node_modules`, son
serveur de développement, et ne voit jamais les fichiers à moitié écrits d'un
autre.

```bash
git worktree add ../fw-core-math -b feat/core-math/parser origin/main
cd ../fw-core-math
pnpm install
```

Pour finir :

```bash
cd ../functionwars
git worktree remove ../fw-core-math
```

## 3. Coder

- Reste dans ton périmètre (voir [`AGENTS.md`](../AGENTS.md) §3). Un fichier
  hors périmètre dans ton diff est un motif de refus de PR, même si le code est
  bon.
- Tu as besoin d'un changement dans `@fw/contracts` ? **Ne le fais pas ici.**
  Ouvre une issue « contract change », mets un adaptateur local dans ton
  paquet, continue. Le lead traite la demande dans une PR dédiée.
- Commits petits, en anglais, avec le paquet en scope :

  ```
  feat(core-math): parse piecewise guards
  fix(physics): stop the trace at the entry point of a disc
  test(rules): cover the shield expiry turn
  docs(protocol): describe the reconnection handshake
  chore(ci): cache the pnpm store
  ```

## 4. Avant d'ouvrir la PR

```bash
pnpm run check     # format, lint, typecheck, tests — exactement ce que la CI exécute
```

Puis relis ton propre diff. Ce que la relecture cherche en premier :

- un `TODO` sans issue,
- du code mort ou une abstraction sans deuxième appelant,
- un test désactivé ou une assertion affaiblie,
- un fichier qui a doublé de taille,
- une constante d'équilibrage écrite en dur au lieu de venir de `@fw/contracts`.

## 5. Ouvrir la PR

Le modèle de PR pose trois questions. Réponds-y vraiment — surtout la première,
« pourquoi ». Un diff dit ce qui change ; il ne dit jamais pourquoi c'était la
bonne façon.

Une PR par tâche. Si ta PR fait plus de ~400 lignes de diff hors tests, découpe.

## 6. Gérer un conflit

Les conflits attendus sont rares et se limitent aux fichiers partagés :
`tsconfig.json` racine, `TASKS.md`, `CHANGELOG.md`, `package.json` racine.

```bash
git fetch origin main
git rebase origin/main       # rebase, pas merge : l'historique reste linéaire
# résoudre, puis
pnpm run check
git push --force-with-lease
```

Un conflit dans `packages/<autre-agent>/` signifie que quelqu'un est sorti de
son périmètre. Ne le résous pas silencieusement : signale-le dans la PR.

Un conflit dans `packages/contracts/` signifie qu'une modification de contrat a
été fusionnée pendant ton travail. Rebase, relis l'ADR correspondante, et
vérifie que ton implémentation suit toujours le port.

## 7. Fusionner

- La CI doit être verte. Aucune exception, aucun « je fusionne et je corrige
  après ».
- Squash merge, avec le titre de la PR en message de commit.
- Supprime la branche.
- Coche la tâche dans `TASKS.md`.
