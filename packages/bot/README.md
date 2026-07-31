# @fw/bot

**Propriétaire : agent Rules.** Pur, sans I/O, sans DOM, sans réseau.

Choisit un tir pour un siège que personne n'occupe.

## Port implémenté

- `BotPort` — `chooseShot(state, botId, level, deps) → ShotRequest`

## Comment il joue

Il **essaie**. Il écrit une fonction, la trace, regarde où la courbe est passée,
et recommence. Rien ici ne calcule une trajectoire, et rien ne le pourrait : le
générateur de cartes est construit pour qu'aucune famille simple ne relie deux
joueurs ([ADR 0016](../../docs/adr/0016-a-bot-searches-it-does-not-solve.md)).

Il écrit du **texte source**, pas un arbre, et le passe au parseur dans lequel
un joueur tape. Ce n'est pas un détour : un bot capable de soumettre des tirs
qu'aucun joueur ne pourrait écrire serait un autre jeu, et ses fonctions
finissent dans le journal de partie, où un humain les lit.

Il franchit **la même porte** qu'un joueur — parseur, puis vérification de
continuité — donc il ne peut pas plus qu'un joueur tirer une fonction
discontinue.

## Les niveaux

| Niveau       | Tirages | Raffinements | Ce que ça donne              |
| ------------ | ------- | ------------ | ---------------------------- |
| `debutant`   | 8       | —            | une élimination en ~40 tours |
| `confirme`   | 45      | —            | ~20 tours                    |
| `redoutable` | 160     | 60           | ~7 tours                     |

Mesuré sur soixante duels par case, boucliers retirés. Sur un terrain
`difficile`, le bot redoutable ne conclut que 27 parties sur 60 en 120 tours :
c'est exactement ce que cette difficulté promet.

**Sans bouclier de départ, le bot redoutable trouve un tir gagnant dès son
premier tour dans deux cas sur cinq** en `facile` et en `moderee`. Le bouclier
de deux tours, qui est le défaut, est ce qui empêche une partie d'être décidée
avant d'avoir commencé.

## Déterminisme

Le tirage vient de la graine de la partie et de l'indice du tour, de rien
d'autre. Rejouer une partie rejoue les coups des bots ([ADR 0004](../../docs/adr/0004-determinism.md)).

## Critères d'acceptation

- Le tir proposé est **toujours** accepté par les règles : un bot ne gâche
  jamais son tour sur une fonction refusée.
- Deux appels sur le même état donnent le même tir ; deux tours différents en
  donnent des différents.
- Les niveaux sont ordonnés : plus le bot essaie, plus vite il gagne.
- Aucun bot ne gagne au premier tour sous les règles par défaut.
