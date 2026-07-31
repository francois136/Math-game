# @fw/cli

**Propriétaire : agent QA/DevOps.**

Trois entrées : une partie complète, une démonstration d'un seul tir, et la
campagne d'équilibrage.

## `pnpm run hotseat`

Une vraie partie, deux à huit joueurs sur un clavier. Toute la logique vient
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

## `pnpm run balance`

La campagne d'équilibrage : des bots jouent les uns contre les autres, beaucoup,
et le tableau qui sort dit combien de temps dure une partie.

```bash
pnpm run balance                                          # 60 parties par case
pnpm run balance -- --matches 200 --shield 2
pnpm run balance -- --difficulty moderee --level confirme --radius 3
pnpm run balance -- --seats 4 --difficulty moderee
```

Tout vient d'une graine : un nombre imprimé ici se reproduit avec la même
commande. C'est ce qui permet de répondre « mesuré » plutôt que « il me
semble ».

| Option         | Défaut     | Rôle                                |
| -------------- | ---------- | ----------------------------------- |
| `--matches`    | 60         | parties par case du tableau         |
| `--difficulty` | les trois  | terrains à mesurer, séparés par `,` |
| `--level`      | les trois  | niveaux de bot                      |
| `--seats`      | 2          | joueurs par partie                  |
| `--shield`     | 0          | tours de bouclier au départ         |
| `--radius`     | 1,5        | rayon de hitbox                     |
| `--seed`       | `campagne` | préfixe des graines                 |

Une partie non finie en 200 tours est comptée comme nulle. Une carte que le
générateur ne sait pas construire n'est comptée nulle part : ce n'est pas un
résultat d'équilibrage.

Ce que la campagne a déjà tranché est dans
[`docs/GAME_DESIGN.md`](../../docs/GAME_DESIGN.md) §7.
