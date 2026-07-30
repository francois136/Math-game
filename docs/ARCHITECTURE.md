# Architecture

## Le principe

Le jeu est un **noyau pur** entouré d'une coquille impure.

Le noyau — `core-math`, `physics`, `rules` — ne connaît ni le réseau, ni le
DOM, ni l'horloge, ni le système de fichiers. On lui donne des valeurs, il rend
des valeurs. C'est ce qui rend la partie déterministe, rejouable, testable en
mémoire, et jouable en hot-seat sans serveur : le même code tourne dans le
serveur Node et dans l'onglet du navigateur.

La coquille — `server`, `client` — fait tout ce qui est sale : ouvrir des
sockets, lire l'heure, dessiner des pixels.

## Les paquets

```
                    ┌──────────────────────┐
                    │    @fw/contracts     │   types · schémas · ports
                    │   (gelé, sans dep)   │   erreurs · limites · RNG
                    └──────────┬───────────┘
             ┌─────────────┬───┴────┬─────────────┐
             │             │        │             │
      ┌──────▼──────┐ ┌────▼─────┐ ┌▼──────────┐  │
      │@fw/core-math│ │@fw/physics│ │ @fw/rules │  │
      │ parse · eval│ │trace · map│ │ état·tours│  │
      │  continuité │ │ collisions│ │  victoire │  │
      └──────┬──────┘ └────┬─────┘ └─────┬─────┘  │
             │             │             │        │
             └─────────────┴──────┬──────┘        │
                                  │               │
                          ┌───────▼───────┐  ┌────▼─────────┐
                          │  @fw/server   │  │  @fw/client  │
                          │ ws · lobbies  │◄─┤ canvas · UI  │
                          │  orchestration│  │   (WebSocket)│
                          └───────────────┘  └──────────────┘
```

Les flèches descendent toujours. `contracts` ne dépend de personne ; aucun
paquet pur ne dépend d'un paquet impur ; `core-math`, `physics` et `rules` ne
dépendent pas les uns des autres — ils ne se parlent qu'à travers les ports que
`rules` reçoit dans `deps`.

Le client importe `core-math` : c'est la seule arête inhabituelle du graphe,
et elle sert uniquement à dessiner la prévisualisation
([ADR 0006](adr/0006-client-side-curve-preview.md)).

## Le trajet d'un tir

```
 client                serveur                              noyau pur
 ──────                ───────                              ─────────
 saisie « x^2 »
 preview locale ......................................... core-math.evaluate
        │
        ├─ shot:validate ──► parse + continuité ────────► core-math
        │  ◄──── shot:validation { ok, error? }
        │
        └─ shot:fire ─────► rules.apply(state, {kind:'fire'})
                                  │
                                  ├─ parse ─────────────► core-math.parse
                                  ├─ continuité ────────► core-math.check
                                  ├─ vulnérabilités ────► rules (bouclier,
                                  │                        tir ami, immunité)
                                  ├─ trace ─────────────► physics.trace
                                  ├─ éliminations, fin de tour
                                  └─► { state', events[] }
                                  │
           ◄──── match:events [shot-resolved, player-eliminated, turn-started]
 animation
```

Une erreur de parsing ou de continuité s'arrête à la deuxième étape : l'état
n'est pas touché, le tour n'est pas consommé, le joueur corrige.

## Les invariants qui tiennent l'ensemble

1. **Déterminisme.** Même graine, mêmes commandes dans le même ordre, même
   partie — jusqu'à la dernière coordonnée de la polyligne. Les trois sources
   de non-déterminisme sont interdites par le lint : `Math.random`, `Date.now`
   dans le noyau, et l'ordre d'itération d'un objet dont les clés viennent du
   réseau.
2. **L'état ne se mute pas.** `rules.apply` rend un nouvel état. Le rejeu est
   donc un `reduce` sur la liste des `TurnRecord`.
3. **Le serveur est autoritatif.** Le client n'envoie qu'une chaîne de
   caractères et une direction.
4. **Une entrée joueur est bornée avant d'être comprise.** Longueur, profondeur
   d'AST, nombre de nœuds, budget d'évaluations : tout est plafonné dans
   `limits.ts`, et les plafonds s'appliquent pendant le parsing, pas après.

## Stratégie de test

| Niveau       | Où                              | Quoi                                                                                                    |
| ------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Propriétés   | `core-math`, `physics`, `rules` | Invariants : le parseur ne lève jamais, le tracé termine toujours, le nombre de vivants ne croît jamais |
| Unitaire     | partout                         | Cas nommés, cas limites, table de discontinuités                                                        |
| Intégration  | `rules`, `server`               | Partie scriptée complète, rejouée, comparée champ à champ                                               |
| Fuzzing      | `server`                        | Trames aléatoires, aucune exception non capturée                                                        |
| Bout en bout | `client`                        | Playwright : hot-seat complet, fonction refusée, animation d'un tir                                     |
| Performance  | `physics`                       | Un tir résolu en moins de 16 ms sur la carte par défaut                                                 |

## Ce qui n'est pas encore décidé

- Le format exact des rejeux téléchargeables (phase 6).
- La stratégie du bot (phase 6) : aléatoire guidé, puis recherche sur un
  échantillon de fonctions paramétrées.
- La résolution simultanée est **conçue** (`RuleSet.simultaneousResolution`)
  mais non implémentée : l'ordre de résolution en cas de tirs croisés devra
  être tranché explicitement, pas subi.
