# Protocole réseau

Version : **1** (`PROTOCOL_VERSION` dans `@fw/contracts`).

Un seul WebSocket par client, trames JSON, une trame par message. Le schéma de
référence est `packages/contracts/src/protocol.ts` — ce document l'explique, il
ne le remplace pas.

## Principe

Le serveur est autoritatif. Une trame client est **une demande**, jamais un
fait. Toute trame entrante passe par `ClientFrameSchema.safeParse` avant de
toucher quoi que ce soit ; une trame invalide donne `ERR_BAD_MESSAGE`, et trois
d'affilée ferment la socket.

## Enveloppes

```jsonc
// client → serveur
{ "id": 42, "message": { "type": "shot:fire", "shot": { … } } }

// serveur → client
{ "replyTo": 42, "message": { "type": "match:events", … } }   // réponse
{ "replyTo": null, "message": { "type": "lobby:state", … } }  // diffusion
```

`id` est monotone par connexion. Il sert uniquement à corréler une réponse à sa
demande ; le serveur ne s'en sert pas comme numéro de séquence de jeu.

## Messages client → serveur

| Type                  | Qui          | Effet                                                  |
| --------------------- | ------------ | ------------------------------------------------------ |
| `hello`               | tous         | Ouvre la session. `token` non nul = reprise d'un siège |
| `lobby:create`        | identifié    | Crée un salon, l'émetteur en devient l'hôte            |
| `lobby:join`          | identifié    | Rejoint par code, comme joueur ou spectateur           |
| `lobby:leave`         | membre       | Quitte. L'hôte transmet son rôle au plus ancien membre |
| `lobby:configure`     | hôte         | Remplace la configuration du salon                     |
| `lobby:set-team`      | membre       | Change d'équipe, ou `null` en FFA                      |
| `lobby:ready`         | membre       | Bascule l'état prêt                                    |
| `lobby:add-bot`       | hôte         | Ajoute un bot                                          |
| `lobby:remove-player` | hôte         | Expulse                                                |
| `replay:load`         | tous         | Fait relire un rejeu par le serveur                    |
| `match:start`         | hôte         | Démarre. `seed` non nul pour rejouer une partie connue |
| `shot:validate`       | joueur actif | Parse + continuité seulement. Limité en débit          |
| `shot:fire`           | joueur actif | Joue le tour                                           |
| `turn:pass`           | joueur actif | Passe volontairement                                   |
| `ping`                | tous         | Battement de cœur                                      |

## Messages serveur → client

| Type              | Quand                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| `welcome`         | Après un `hello` accepté. Porte le `SessionToken`                      |
| `lobby:state`     | À chaque changement du salon. Instantané complet                       |
| `match:state`     | Démarrage, arrivée en cours de partie, reconnexion. Instantané complet |
| `match:events`    | Après chaque commande appliquée. Incrémental, numéroté par `seq`       |
| `shot:validation` | Réponse à `shot:validate`                                              |
| `match:replay`    | À la fin d'une partie : tout le match, en quelques kilo-octets         |
| `shot-submitted`  | (événement) En simultané : quelqu'un a répondu, sans dire quoi         |
| `replay:state`    | Réponse à `replay:load` : la partie reconstruite, tracés compris       |
| `error`           | Toute demande refusée                                                  |
| `pong`            | Réponse à `ping`                                                       |

Un client qui rate un lot d'événements ne tente pas de rattraper : il se
reconnecte et reçoit un `match:state` complet. C'est plus simple qu'un journal
de rejeu côté client, et le coût est négligeable pour huit joueurs.

## Machine à états d'une connexion

```
        ┌──────────┐
        │connected │  socket ouverte, rien reçu
        └────┬─────┘
             │ hello (version compatible)
             ▼
        ┌──────────┐  ◄──── lobby:leave
        │identified│
        └────┬─────┘
             │ lobby:create | lobby:join
             ▼
      ┌────────────┐        ┌────────────┐
      │  in-lobby  │───────►│ spectating │  (join asSpectator)
      └────┬───────┘        └────────────┘
           │ match:start (hôte) / partie déjà lancée
           ▼
      ┌────────────┐
      │  in-match  │
      └────┬───────┘
           │ fin de partie
           ▼
      ┌────────────┐
      │  in-lobby  │
      └────────────┘

  perte de socket, à tout moment ─► closed  (siège conservé reconnectGraceMs)
```

Une transition illégale — `shot:fire` depuis `identified`, `match:start` d'un
non-hôte — répond `error` et **ne change pas d'état**. Elle ne ferme pas la
socket : c'est presque toujours une course, pas une attaque.

## Reconnexion

1. Le client conserve son `SessionToken` (mémoire de l'onglet, pas de stockage
   persistant : rien ne sort de la machine).
2. À la reconnexion, `hello` avec le token.
3. Si le siège est encore tenu (**deux minutes**, `RECONNECT_GRACE_MS`), le
   serveur renvoie le même `PlayerId`, puis un `match:state` complet.
4. Sinon, `ERR_UNAUTHORIZED`, et le client repart comme nouveau joueur.

Pendant la coupure, les tours du joueur sont passés (`skipped: 'disconnected'`).
La partie n'attend pas.

## Limites de débit

| Message         | Limite                         |
| --------------- | ------------------------------ |
| `shot:validate` | 5 par seconde et par connexion |
| `ping`          | 1 par seconde                  |
| toutes trames   | 30 par seconde, puis fermeture |

Un dépassement répond `ERR_RATE_LIMITED` avec le délai avant réessai.

## Compatibilité

`PROTOCOL_VERSION` est comparée dans `hello`. En cas d'écart, le serveur répond
`ERR_PROTOCOL_VERSION` et ferme : il n'y a pas de négociation de version, parce
qu'un client web se recharge.

Ajouter un type de message est compatible ; en retirer un, en changer la forme,
ou changer le sens d'un champ ne l'est pas et impose un bump de version, avec
une ADR.

`lobby:add-bot` a été retiré avant la première mise en service, faute de bot, et
est revenu avec lui. Il porte le niveau
(`debutant`, `confirme`, `redoutable`), et un bot se retire par
`lobby:remove-player` comme n'importe qui. `LobbyMember` gagne `botLevel`, non
nul exactement quand `isBot`. La version reste 1 : ajouter un type de message et
un champ à une vue est compatible.
