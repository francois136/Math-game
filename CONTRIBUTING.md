# Contribuer

## Démarrer

```bash
corepack enable        # Node 22, pnpm 10
pnpm install
pnpm run check         # doit être vert avant toute chose
```

## Avant d'ouvrir une pull request

1. Lis [`AGENTS.md`](AGENTS.md) — périmètres, interdits, style. Tout y est.
2. Lis le `README.md` du paquet que tu modifies : il contient ses critères
   d'acceptation.
3. Reste dans ton périmètre. Un fichier hors périmètre dans le diff fait
   refuser la PR, même si le code est juste.
4. `pnpm run check` doit passer en local. La CI exécute exactement cette
   commande.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), en anglais, avec
le nom du paquet en scope :

```
feat(core-math): parse piecewise guards
fix(physics): stop the trace at the entry point of a disc
test(rules): cover the shield expiry turn
docs(protocol): describe the reconnection handshake
chore(ci): cache the pnpm store
```

Types autorisés : `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`.

Un commit fait une chose. Un commit qui « corrige aussi deux bricoles au
passage » se scinde.

## Branches

`feat/<agent>/<sujet>` — par exemple `feat/core-math/piecewise-parser`.

`main` est protégée : aucun commit direct, aucune fusion en rouge.

Voir [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md) pour les `git worktree`
et la résolution de conflits.

## Modifier `@fw/contracts`

Pull request **dédiée**, qui ne touche rien d'autre, accompagnée d'une ADR dans
[`docs/adr/`](docs/adr). Voir [ADR 0003](docs/adr/0003-frozen-contracts-package.md).

Si tu es bloqué : ouvre une issue « contract change », écris un adaptateur
local, continue. Ne modifie pas les contrats dans une PR de fonctionnalité.

## Ajouter une dépendance

Elle a besoin d'une ADR. Le budget de production est volontairement minuscule :
`zod`, `ws`, `react`. Une dépendance de développement demande une justification
dans la description de PR.

## Tests

- Vitest, à côté du code testé : `packages/*/src/**/*.test.ts`.
- Toute logique mathématique ou géométrique a des tests de propriétés
  (fast-check), pas trois exemples.
- **On ne désactive jamais un test pour faire passer une PR.** Si le test est
  lui-même faux, la PR explique pourquoi et le corrige.
