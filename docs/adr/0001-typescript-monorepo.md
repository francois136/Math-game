# 0001 — TypeScript partout, monorepo pnpm

- **Statut** : accepté
- **Date** : 2026-07-30
- **Décide** : le superviseur, sur trois options proposées

## Contexte

Le jeu a un moteur mathématique et géométrique non trivial qui doit tourner à
deux endroits : sur le serveur, qui fait autorité, et dans le navigateur, pour
la prévisualisation et le mode hot-seat. Trois stacks ont été mises en balance :

- **A** — TypeScript partout, serveur Node + `ws` brut, client React + Canvas 2D.
- **B** — idem, mais serveur bâti sur Colyseus (rooms, synchronisation d'état,
  reconnexion fournies).
- **C** — serveur Socket.IO, client TypeScript sans framework.

## Décision

Option **A**.

## Raisons

- **Un seul langage, un seul moteur.** Le noyau pur se déplace du serveur au
  navigateur sans réécriture ni portage. C'est ce qui rend le hot-seat gratuit
  et le rejeu vérifiable des deux côtés.
- **Le protocole nous appartient.** Colyseus impose son modèle d'état et sa
  synchronisation ; ici l'état est une valeur immuable produite par
  `rules.apply`, et le rejeu déterministe en découle directement. Se plier au
  modèle d'un framework aurait coûté cette propriété.
- **Le budget de dépendances reste petit** : `zod`, `ws`, `react`. Ce que
  Colyseus ou Socket.IO auraient fourni — salons, reconnexion — représente
  quelques centaines de lignes que l'on veut de toute façon pouvoir tester.
- **pnpm workspaces** donne les frontières de paquets dont l'organisation
  multi-agents a besoin : un agent ne peut pas importer ce que son `package.json`
  ne déclare pas.

## Conséquences

- Salons, sessions, reconnexion et limitation de débit sont à écrire et à
  tester (voir `packages/server/README.md`).
- Node 22 et pnpm 10 sont imposés (`engines`).
- Un futur client natif devrait parler le même protocole JSON, ce qui est
  documenté dans `docs/PROTOCOL.md`.
