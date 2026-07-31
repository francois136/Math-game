# 0018 — Un rejeu enregistre ce qui a été fait, pas ce qui a été dessiné

- **Statut** : accepté
- **Date** : 2026-07-31

## Contexte

Un rejeu peut se stocker de deux façons : l'état complet de la partie, tracés
compris, ou seulement les commandes, les courbes étant recalculées à la
lecture.

Ce n'est pas un débat d'opinion : c'est mesurable.

## Mesure

Un duel de trente tours, sur le terrain par défaut :

| ce qu'on garde                       | taille     |
| ------------------------------------ | ---------- |
| l'état complet, polylignes comprises | **271 Ko** |
| les commandes seules                 | **4 Ko**   |

Soixante-huit fois moins. Les 5 533 points de polyligne du même duel sont
entièrement dérivables de six kilo-octets de décisions.

## Décision

**Un rejeu porte les décisions.** Graine, configuration, carte, joueurs, et une
ligne par tour : qui, quelle fonction, sur quel axe, dans quel sens, et à quel
instant. Les courbes sont retracées à la lecture.

**La carte voyage avec le rejeu**, au lieu d'être régénérée depuis la graine.
Elle coûte deux kilo-octets et elle achète l'indépendance vis-à-vis de
`GENERATOR_VERSION` : un rejeu enregistré aujourd'hui se relit après une
évolution du générateur, ce que la graine seule ne pouvait pas promettre.

**L'instant de chaque tour est enregistré.** Les échéances de tour font partie
de l'état ; rejouer avec une autre horloge reproduirait toutes les éliminations
et un `deadlineAt` différent — c'est-à-dire un rejeu qui ne reproduit pas.
`TurnRecord` gagne donc `atMs`.

**La relecture échoue plutôt que de diverger.** Un rejeu dont le moteur refuse
un tir vient d'une autre version du jeu ; le dire vaut mieux que rendre une
partie qui est partie ailleurs en silence. `ERR_BAD_REPLAY` nomme le tour fautif.

**La propriété qui compte** : `replay(toReplay(state))` est égal à `state`,
champ pour champ, tracés compris. C'est un test de propriété sur quarante
parties tirées au hasard. Un enregistrement qui ne reproduit pas est
l'enregistrement de rien.

## Qui relit

Recalculer les courbes demande le moteur, que le client n'a pas et ne doit pas
avoir ([ADR 0006](0006-client-side-curve-preview.md)). C'est donc le **serveur**
qui relit : le client lui envoie le document (`replay:load`) et reçoit la partie
terminée, dont l'historique contient tous les tracés.

Marcher dedans ensuite ne demande aucun moteur : « qui est debout après le tour
k » se lit dans `history[i].eliminated`, ce qui est de la lecture, pas de la
décision. Le lecteur pas à pas du client est donc du pur dessin.

## Conséquences

- Un rejeu tient dans un courriel, et le client le télécharge sans rien envoyer
  nulle part : le document vient déjà du serveur.
- `replay:load` coûte une partie entière de tracés au serveur. Il est donc
  limité en débit comme `shot:validate`, l'autre message qui fait calculer le
  serveur à la demande.
- Le rejeu ne rejoue pas les décisions des bots : il rejoue **les tirs**, qui
  sont enregistrés. Un changement du bot ne casse donc aucun rejeu — ce que
  stocker la graine seule n'aurait pas permis.
