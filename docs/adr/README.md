# Architecture Decision Records

Une décision structurante, une ADR. Numérotées, jamais réécrites : une décision
qu'on abandonne passe en `Statut : remplacé par NNNN`, et la nouvelle explique
pourquoi.

| N°                                            | Décision                                                             | Statut  |
| --------------------------------------------- | -------------------------------------------------------------------- | ------- |
| [0001](0001-typescript-monorepo.md)           | TypeScript partout, monorepo pnpm, serveur `ws`, client React/Canvas | accepté |
| [0002](0002-no-eval-hand-written-parser.md)   | Aucune exécution de code joueur, parseur écrit à la main             | accepté |
| [0003](0003-frozen-contracts-package.md)      | Les contrats sont gelés dans `@fw/contracts`                         | accepté |
| [0004](0004-determinism.md)                   | Hasard seedé, horloge injectée, paramètres de tracé contractuels     | accepté |
| [0005](0005-in-memory-server-state.md)        | L'état du serveur vit en mémoire seulement                           | accepté |
| [0006](0006-client-side-curve-preview.md)     | La prévisualisation de courbe est calculée par le client             | accepté |
| [0007](0007-continuity-as-only-validation.md) | La continuité est la seule règle de validation                       | accepté |

## Quand écrire une ADR

- Toute modification **structurante** de `@fw/contracts` : une interface, une
  limite, un défaut d'équilibrage, la forme du protocole.
- Toute nouvelle dépendance de production.
- Tout changement qui invalide les rejeux enregistrés.
- Tout choix qu'un agent arrivant dans six mois trouverait arbitraire.

**Amendement du 30 juillet 2026.** La règle disait « toute modification de
`@fw/contracts` », sans exception. Ajouter un code d'erreur avec son message
français est une addition de routine, sans décision derrière : lui imposer une
ADR aurait noyé le journal sous des notes vides, et c'est ainsi qu'on cesse de
lire un journal. Ces additions passent par le `CHANGELOG.md`. La PR reste
dédiée : ce point-là ne change pas.

## Forme

Contexte, décision, raisons, conséquences. Les conséquences comptent autant que
la décision : c'est la seule section qui dit ce qu'on a accepté de perdre.
