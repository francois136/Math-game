# 0003 — Les contrats sont gelés dans un paquet dédié

- **Statut** : accepté
- **Date** : 2026-07-30

## Contexte

Six agents codent en parallèle sur des périmètres disjoints. Chacun a besoin de
types que les autres produisent, avant que les autres n'existent.

## Décision

Un paquet `@fw/contracts` contient tout ce qui est partagé — types, schémas
Zod, interfaces de ports, codes d'erreur, constantes d'équilibrage, générateur
pseudo-aléatoire — et **rien d'autre**. Il ne dépend d'aucun paquet du dépôt.

Il est gelé : on ne le modifie que dans une pull request dédiée, qui ne touche
aucun autre fichier, et qui s'accompagne d'une ADR.

Un agent bloqué par un contrat manquant ouvre une issue « contract change »,
écrit un adaptateur local, et continue.

## Raisons

Un contrat qu'on peut modifier au fil de l'eau n'est pas un contrat. Le coût
d'un champ ajouté « en passant » n'est pas payé par celui qui l'ajoute : il est
payé cinq fois, par des agents qui compilaient contre autre chose.

Le rendre pénible à modifier est l'objectif, pas un effet secondaire.

## Conséquences

- Le lead est le goulot d'étranglement sur les contrats. C'est assumé : ce
  goulot est moins cher que la dérive.
- Certaines interfaces seront imparfaites pendant un temps. Un adaptateur local
  et laid vaut mieux qu'une interface partagée qui bouge.
- Les changements cassants sont visibles : `PROTOCOL_VERSION`, `limits.ts`,
  `rng.ts` et `TraceParams` invalident les rejeux enregistrés et se signalent
  comme tels.
