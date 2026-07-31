# 0019 — En simultané, tous les tirs partent du même instant

- **Statut** : accepté
- **Date** : 2026-07-31

## Contexte

`RuleSet.simultaneousResolution` existe depuis la phase 1 et **personne ne le
lit**. C'est du code mort, que le brief interdit. Deux issues honnêtes : le
retirer, ou l'implémenter.

Le plafond de joueurs venant de passer à huit
([ADR 0015](0015-the-board-grows-with-the-lobby.md)), le tour par tour signifie
attendre sept tours entre deux actions. Le mode simultané a donc bien plus de
valeur qu'au moment où le champ a été écrit.

Reste la question que la tâche BA-6 posait depuis le début, et qui est la seule
qui compte : **si A tue B et B tue A dans le même round, que se passe-t-il ?**

## La décision : les tirs sont tracés contre le même état

Trois réponses étaient possibles.

**Résoudre dans l'ordre des sièges.** Le premier tue, le second meurt avant
d'avoir tiré. C'est du tour par tour déguisé, et l'avantage revient à un ordre
que personne n'a choisi. Écarté.

**Résoudre par ordre d'arrivée.** Le plus rapide gagne. Cela fait entrer le
temps de réaction dans un jeu où l'on écrit des fonctions — exactement ce que
le tour par tour protégeait. Écarté.

**Tracer tous les tirs contre l'état d'avant, puis appliquer toutes les
éliminations ensemble.** C'est ce que « simultané » veut dire, et c'est la
seule des trois qui ne dépende d'aucun ordre : permuter les joueurs ne change
pas le résultat. **Retenue.**

Conséquences directes, assumées :

- **Le double KO existe.** Deux joueurs qui se touchent meurent tous les deux.
  Si c'étaient les deux derniers, la partie est nulle — `MatchOutcome` prévoyait
  déjà `draw`, qui cesse ainsi d'être théorique.
- **On peut toucher un mort.** Une courbe traverse une cible qu'un autre tir du
  même round a tuée : le coup compte quand même, parce que les deux tirs sont
  partis au même instant. Le contraire aurait réintroduit un ordre.
- Les boucliers et les règles de tir ami sont évalués **une fois**, sur l'état
  d'avant. Un bouclier qui expire à la fin du round protège pendant tout le
  round.

## Ce que ça change dans l'état

`ActiveTurn.playerId` devient **nullable** : en simultané, ce n'est à personne
en particulier. Un champ qui désignerait quand même un joueur serait un champ
qui ment, et le client s'en servirait pour griser les mauvaises choses.

`MatchState.pending` porte les tirs soumis et pas encore résolus. Le round se
résout dès que tous les joueurs vivants et connectés ont soumis, ou à
l'échéance — les manquants comptant comme des tours passés.

L'historique garde **un `TurnRecord` par tir**, tous avec le même `index` : le
numéro du round. Un rejeu enregistre donc les tirs d'un round dans l'ordre des
sièges, ce qui est un ordre d'écriture et non un ordre de résolution — rejouer
les rejoue toujours ensemble.

## Conséquences

- Le mode reste **désactivé par défaut**. Il change le jeu ; c'est un choix de
  salon, pas une évolution imposée.
- Un tir soumis n'est plus modifiable : il n'y a pas de « je retire ». Le
  simultané troque l'attente contre l'engagement, et c'est le marché.
- La validation d'une fonction (`shot:validate`) reste disponible avant de
  soumettre : le mode change qui tire quand, pas ce qu'on a le droit d'écrire.
