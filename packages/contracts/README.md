# @fw/contracts

**Propriétaire : le lead. Gelé.**

Ce paquet est la seule chose que tous les autres partagent : types, schémas de
validation réseau, ports, codes d'erreur, constantes d'équilibrage. Il ne
dépend d'aucun autre paquet, et personne ne le modifie au fil de l'eau.

## Pourquoi il est gelé

Six agents codent en parallèle contre ces déclarations. Si l'un d'eux ajoute un
champ pour se dépanner, les cinq autres compilent contre une réalité qui n'est
plus la leur. Donc :

- toute modification passe par une PR **dédiée**, qui ne touche que ce paquet ;
- toute modification s'accompagne d'une **ADR** dans `docs/adr/` ;
- une modification de `PROTOCOL_VERSION`, des limites de `limits.ts`, du
  générateur de `rng.ts` ou des paramètres de `TraceParams` est **cassante** :
  elle invalide les rejeux enregistrés et se signale comme telle.

## Contenu

| Fichier          | Rôle                                                                |
| ---------------- | ------------------------------------------------------------------- |
| `result.ts`      | `Result<T, E>` — un échec attendu est une valeur, pas une exception |
| `ids.ts`         | Identifiants brandés : `PlayerId`, `TeamId`, `LobbyCode`, `Seed`…   |
| `rng.ts`         | Générateur pseudo-aléatoire déterministe et ses flux dérivés        |
| `limits.ts`      | Bornes dures sur toute entrée joueur — surface de sécurité          |
| `geometry.ts`    | `Vec2`, obstacles, carte                                            |
| `expression.ts`  | AST des fonctions, noms autorisés, issues de domaine                |
| `errors.ts`      | Codes d'erreur et leurs paramètres typés                            |
| `messages.fr.ts` | Le texte français de chaque erreur — source unique                  |
| `shot.ts`        | Requête de tir, raison d'arrêt, résultat de tracé                   |
| `config.ts`      | `RuleSet`, `TraceParams`, `MapParams` et leurs valeurs par défaut   |
| `match.ts`       | État de partie, commandes, événements                               |
| `ports.ts`       | Les interfaces que chaque paquet implémente                         |
| `protocol.ts`    | Trames client/serveur et machine à états de connexion               |

## Règles internes

- Aucune dépendance hors `zod`.
- Aucune logique de jeu : ce paquet décrit, il ne décide pas. Les seules
  fonctions qu'il contient sont des constructeurs de valeurs (`fwError`,
  `createRng`) et des classifications pures (`errorCategory`).
- Tout ce qui traverse le réseau a un schéma Zod ; tout ce qui reste interne au
  moteur peut être un simple type TypeScript.
