# @fw/server

**Propriétaire : agent Server.**

Le serveur est **autoritatif** : il détient l'état, il applique les règles, il
diffuse le résultat. Une trame client est une demande, jamais un fait.

## Ce qu'il faut construire

1. **Transport** : un WebSocket (`ws`), trames JSON, une trame par message.
   Toute trame entrante passe par `ClientFrameSchema.safeParse` **avant** de
   toucher quoi que ce soit. Une trame invalide donne `ERR_BAD_MESSAGE` et,
   à la troisième d'affilée, ferme la socket.
2. **Sessions** : `hello` crée un `PlayerId` et un `SessionToken`. Le token
   seul permet de reprendre un siège après une coupure. Il n'est jamais dérivé
   du `PlayerId` et n'est jamais diffusé aux autres.
3. **Salons** : code d'invitation à 6 caractères, 2 à 4 joueurs (ADR 0012), spectateurs
   illimités jusqu'à 32 connexions, hôte transféré au plus ancien membre si
   l'hôte part.
4. **Orchestration** : le serveur possède la boucle d'horloge (échéances de
   tour) et traduit chaque message en `MatchCommand` passée à `@fw/rules`.
   Il ne calcule rien lui-même.
5. **Anti-triche** : le serveur ne reçoit que la source de la fonction et la
   direction. Il vérifie le tour, l'état de la partie, les limites d'entrée, et
   applique une limite de débit (`ERR_RATE_LIMITED`) sur `shot:validate`.
6. **Reconnexion** : le siège est conservé `reconnectGraceMs` ; à la
   reconnexion le client reçoit un instantané `match:state` complet, jamais un
   delta.

## État

Tout en mémoire (`Map<LobbyCode, Lobby>`). Pas de base de données, pas de
Redis : un redémarrage perd les parties en cours, c'est assumé (ADR 0005). Les
rejeux sont des fichiers JSON téléchargeables produits à la fin d'une partie.

## Interdits

- Faire confiance à une valeur envoyée par le client sans la revalider.
- Renvoyer à un client une information qu'il ne devrait pas avoir. Aujourd'hui
  la carte et les positions sont publiques ; passer par `MatchView` quand même,
  pour que le jour où ce ne sera plus vrai, il n'y ait qu'un endroit à changer.
- Écrire de la logique de jeu ici.

## Critères d'acceptation

- Test d'intégration : deux clients simulés jouent une partie complète en
  mémoire, sans socket réelle.
- Test de reconnexion : coupure au milieu d'un tour, reprise, état identique.
- Test de fuzzing du protocole : 10 000 trames aléatoires, aucun crash, aucune
  exception non capturée.
