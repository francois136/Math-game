# Déploiement

Deux processus : un serveur WebSocket en Node, et des fichiers statiques.
Rien d'autre — pas de base de données, pas de cache, pas de service tiers.

## Construire

```bash
corepack enable                      # pnpm 10, Node 22
pnpm install --frozen-lockfile
pnpm run check                       # format, lint, typecheck, tests
pnpm --filter @fw/client build       # produit packages/client/dist
```

`pnpm run check` construit aussi les paquets serveur (`tsc --build`), donc
`packages/server/dist` existe après cette commande.

## Faire tourner le serveur

```bash
FW_PORT=8787 node packages/server/dist/main.js
```

| Variable  | Défaut | Rôle                    |
| --------- | ------ | ----------------------- |
| `FW_PORT` | 8787   | Port d'écoute WebSocket |

C'est tout ce qu'il lit. Le serveur n'ouvre aucun fichier, ne contacte aucun
service, et **garde tout en mémoire** ([ADR 0005](adr/0005-in-memory-server-state.md)) :
le redémarrer perd les salons et les parties en cours. C'est assumé — une partie
dure une vingtaine de tours, et le rejeu de celles qui sont finies est déjà chez
les joueurs.

Un salon vide est supprimé. Un joueur déconnecté garde son siège deux minutes.

## Servir le client

`packages/client/dist` est un site statique : n'importe quel serveur de fichiers
convient. Une seule variable, lue **à la construction** et non à l'exécution :

```bash
VITE_FW_SERVER=wss://jeu.exemple.fr/ws pnpm --filter @fw/client build
```

Sans elle, le client vise `ws://localhost:8787`, ce qui va pour du local et
pour rien d'autre.

**En HTTPS, il faut `wss://`.** Un navigateur qui sert une page en HTTPS refuse
une WebSocket en clair, et le symptôme est une page qui reste sur « connexion »
sans message.

## Derrière un reverse proxy

Le serveur parle WebSocket et rien d'autre : une requête HTTP ordinaire reçoit
un refus, pas une page. Un contrôle de santé qui attend un `200` sur `/` le lira
comme « à terre » alors qu'il fonctionne — surveillez l'ouverture d'une socket,
ou le port lui-même.

Exemple nginx :

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # Une partie peut rester silencieuse le temps qu'un joueur réfléchit.
    proxy_read_timeout 600s;
}
```

Le délai de lecture compte : un tour dure une minute par défaut et un joueur
peut passer ce temps à écrire sa fonction sans qu'aucune trame circule.

## Ce qui protège le serveur

Rien à configurer, tout est dans le code, mais autant savoir ce sur quoi on
s'appuie :

- **Aucune exécution de code joueur.** Les fonctions sont analysées par un
  parseur écrit à la main ; `eval` et `new Function` sont interdits par le lint
  et par un travail de CI dédié ([ADR 0002](adr/0002-no-eval-hand-written-parser.md)).
- **Toute trame entrante est validée par Zod** avant d'atteindre la moindre
  ligne de logique de jeu.
- **Limitation de débit** par seau à jetons, sur les trames, les demandes de
  validation et les `ping`. Une connexion qui enchaîne les trames invalides est
  fermée.
- **Limites statiques** sur la source d'une fonction : longueur, profondeur,
  nombre de nœuds, nombre d'évaluations par tir. Un tir se résout en moins de
  16 ms sur la carte par défaut.

## Ce qu'il faut savoir avant de mettre en ligne

- **Le serveur est mono-thread.** Générer une carte à sept sièges en
  `difficile` prend environ 1,2 s, pendant lesquelles aucun salon n'est servi.
  Une fois par partie. Un coup de bot `redoutable` coûte environ 70 ms.
- **Aucun état n'est persisté.** Pas de comptes, pas de journal de parties, pas
  de statistiques. Un rejeu est un fichier que le joueur télécharge.
- **Tout est en français**, y compris les messages d'erreur du parseur.
