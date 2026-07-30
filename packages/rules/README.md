# @fw/rules

**Propriétaire : agent Rules.** Pur, sans I/O, sans DOM, sans réseau.

Détient l'état d'une partie et la façon dont il change. C'est le seul paquet qui
a le droit de dire qu'un joueur est mort.

## Port implémenté

- `RulesEnginePort` — `createMatch(setup, deps)`, `apply(state, command, deps, nowMs)`

`apply` est **pure** : elle ne modifie pas l'état reçu, elle en renvoie un
nouveau accompagné de la liste des événements. Une commande refusée renvoie
l'état inchangé et un événement `command-rejected`. C'est ce qui rend le rejeu,
les tests scriptés et le mode hot-seat triviaux.

## Ce qu'il faut construire

1. **Création de partie** : ordre de jeu tiré du `seed` (`rng.fork('order')`),
   attribution des points d'apparition, boucliers initialisés à
   `rules.shieldTurns`.
2. **Résolution d'un tir** : parse → continuité → calcul des vulnérabilités →
   `tracer.trace` → éliminations → fin de tour. Une erreur de parsing ou de
   continuité **ne consomme pas le tour** (`isRecoverable`).
3. **Vulnérabilités** — c'est ici, et nulle part ailleurs, que se décide qui
   peut être touché : bouclier restant, tir ami en mode équipes,
   immunité de départ du tireur (`selfImmunityArc`). Le tracer ne fait
   qu'appliquer le verdict.
4. **Fin de tour** : décrément des boucliers, passage au joueur vivant suivant,
   nouvelle échéance `deadlineAt = nowMs + turnDurationMs`.
5. **Conditions de victoire** : FFA, dernier vivant ; équipes, dernière équipe
   avec au moins un vivant ; nul si tout le monde meurt dans la même
   résolution.
6. **Modes** : `mode` est un discriminant, pas une cascade de `if`. Ajouter un
   mode doit se faire en ajoutant un objet, pas en modifiant les autres.

## Interdits

- Appeler le parseur, le tracer ou le générateur autrement que par `deps`.
- Lire l'horloge : `nowMs` est un paramètre.
- Muter `state` ou l'un de ses sous-objets.

## Critères d'acceptation

- Partie scriptée complète, rejouée deux fois, état final identique.
- Propriétés : le nombre de vivants ne croît jamais ; le joueur actif est
  toujours vivant ; une partie terminée refuse toute commande de jeu.
- Chaque garde-fou d'équilibrage a son test : bouclier, immunité de départ,
  tir ami, `pierce`, expiration de tour.
