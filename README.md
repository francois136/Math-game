# FunctionWars

Un jeu multijoueur au tour par tour, de deux à quatre joueurs, où l'on
s'élimine en traçant des courbes.

À son tour, un joueur écrit une fonction — `x^2`, `3*sin(x/2)`, `ln(x+4)`, ou
une fonction par morceaux — et choisit un sens de propagation. La courbe part de
son point, contourne ou percute les obstacles, et si elle traverse un adversaire,
celui-ci disparaît. Dernier survivant gagné.

La seule règle imposée aux fonctions est qu'elles soient **continues** là où
elles sont tracées. Tout le reste — asymptotes, sorties de domaine, bords de
carte — arrête simplement le tir.

## État

**Phase 2 : le moteur.** Le langage de fonctions, le tracé et les cartes
existent et sont testés ; il n'y a encore ni tours, ni éliminations, ni réseau.

```bash
pnpm install && pnpm run build
pnpm run demo --seed bravo --f "x^2/40"
```

Ce qui marche : écrire une fonction, se la voir refuser en français si elle est
discontinue ou mal formée, la voir tracée sur une carte générée, et savoir
exactement où et pourquoi le tir s'est arrêté.

Ce qui manque : les tours et la victoire (`@fw/rules`, phase 3), le serveur
(phase 4), l'interface (phase 5). Voir [`TASKS.md`](TASKS.md).

## Installation

```bash
corepack enable          # pnpm 10, Node 22
pnpm install
pnpm run check           # format, lint, typecheck, tests
```

## Commandes

| Commande             | Rôle                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `pnpm run check`     | Tout : format, lint, typecheck, tests. C'est ce que la CI exécute |
| `pnpm run typecheck` | `tsc --build` sur l'ensemble des paquets                          |
| `pnpm run lint`      | ESLint avec les règles typées                                     |
| `pnpm run test`      | Vitest, unitaires et propriétés                                   |
| `pnpm run format`    | Prettier en écriture                                              |

## Les paquets

| Paquet                                | Rôle                                              | Pur |
| ------------------------------------- | ------------------------------------------------- | --- |
| [`@fw/contracts`](packages/contracts) | Types, schémas réseau, ports, erreurs, constantes | ✅  |
| [`@fw/core-math`](packages/core-math) | Parseur, AST, évaluation, domaine, continuité     | ✅  |
| [`@fw/physics`](packages/physics)     | Tracé adaptatif, collisions, cartes               | ✅  |
| [`@fw/rules`](packages/rules)         | État de partie, tours, modes, victoire            | ✅  |
| [`@fw/server`](packages/server)       | WebSocket, salons, sessions, orchestration        | —   |
| [`@fw/client`](packages/client)       | Canvas, saisie, salon, animations                 | —   |

« Pur » signifie : aucune dépendance vers le réseau, le DOM, le système de
fichiers ou l'horloge. Ces trois paquets se testent intégralement en mémoire.

## Documentation

| Document                                           | Contenu                                                 |
| -------------------------------------------------- | ------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                           | Les règles permanentes pour quiconque code ici          |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)     | Paquets, flux de données, dépendances                   |
| [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)       | Règles détaillées, grammaire des fonctions, équilibrage |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md)             | Messages réseau et machine à états                      |
| [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md) | Prendre une tâche, brancher, ouvrir une PR              |
| [`docs/adr/`](docs/adr)                            | Les décisions structurantes et leurs raisons            |
| [`TASKS.md`](TASKS.md)                             | Le backlog, découpé par agent, avec ses dépendances     |

## Licence

Propriétaire, tous droits réservés.
