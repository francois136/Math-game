# @fw/cli

**Propriétaire : agent QA/DevOps.**

Deux entrées : une partie complète, et une démonstration d'un seul tir.

## `pnpm run hotseat`

Une vraie partie, deux à quatre joueurs sur un clavier. Toute la logique vient
de `@fw/rules` : ce paquet demande une fonction et affiche ce qu'on lui répond.
C'est ce que permet un noyau pur — le hot-seat ne coûte pas une seconde
implémentation.

```bash
pnpm run hotseat
pnpm run hotseat --seed duel --players "Anne,Bob,Cléo" --teams
pnpm run hotseat --script "x,x^2/40,5*sin(x/4)"   # tirs joués d'affilée, sans clavier
```

## `pnpm run demo`

Une démonstration, pas un jeu. Elle sert à voir de ses yeux ce que les paquets
purs produisent, sans serveur, sans navigateur et sans attendre le client.

```bash
pnpm demo                                   # carte par défaut, tir d'exemple
pnpm demo --seed bravo --f "x^2/10" --from 0 --dir increasing
pnpm demo --f "{ 0 si x < 5 ; 9 sinon }"    # refusée, avec le message du joueur
```

Ce qu'elle fait : génère une carte depuis une graine, place les joueurs, valide
la fonction saisie (analyse puis continuité), trace le tir et dessine le tout
en ASCII avec la raison d'arrêt.

Ce qu'elle **ne** fait pas : gérer des tours ni une victoire — c'est le travail
du hot-seat ci-dessus, et de `@fw/rules` derrière lui.
