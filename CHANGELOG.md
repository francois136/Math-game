# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Versions : [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- **Tirer le long de `y`.** Un tir porte maintenant un axe : `y = f(x)` comme
  avant, ou `x = f(y)`, qui trace une courbe couchée. Deux joueurs l'un
  au-dessus de l'autre n'étaient reliés par aucune fonction de `x` ; ils le sont
  par une fonction de `y`. Aucune ligne de collision, de pas adaptatif ou
  d'asymptote n'est écrite deux fois : le monde est tourné d'un quart de tour,
  tracé, puis retourné ([ADR 0013](docs/adr/0013-shooting-along-both-axes.md)).
  Le parseur accepte la lettre de l'axe choisi et refuse l'autre. La
  prévisualisation, le client, le serveur et la CLI suivent l'axe.
- **Trois difficultés de terrain**, choisies par l'hôte dans le salon
  ([ADR 0014](docs/adr/0014-difficulty-and-team-separation.md)) :
  - `facile` — le comportement précédent : rien de trivial ne relie deux
    joueurs, mais une parabole simple passe toujours.
  - `moderee` — la garantie porte sur l'existence d'une fonction continue, pas
    sur sa simplicité. `connectivity.ts` la vérifie exactement : le terrain est
    découpé en colonnes perpendiculaires au balayage, les intervalles libres
    voisins qui se chevauchent sont reliés, et un chemin dans ce graphe **est**
    le graphe d'une fonction continue.
  - `difficile` — la même garantie, plus l'exigence inverse : aucune parabole de
    la famille échantillonnée ne doit passer. Chaque élimination doit être
    inventée. Mesuré : 0,00 % de réussite sur 12 000 tirs aléatoires, contre
    0,16 % en `facile`, sur des terrains qui restent traversables par
    construction.
- **Placement par camp.** Le générateur reçoit la composition des équipes.
  Coéquipiers : 12 unités de distance minimale. Adversaires :
  `enemySeparationFraction` de la largeur du terrain, 0,45 par défaut — soit
  près de la moitié du plateau, sans coller tout le monde aux coins. Mesuré :
  adversaires à 45 unités et plus, coéquipiers autour de 19.
- `@fw/core-math` : lexeur, parseur à descente récursive, évaluateur et
  vérificateur de continuité. 65 tests, dont des propriétés fast-check qui
  couvrent « le parseur ne lève jamais », l'aller-retour impression/analyse, et
  l'acceptation ou le refus de raccords construits.

- `@fw/physics` : intersections segment/rectangle, segment/disque et
  segment/polygone convexe, tracé à pas adaptatif, générateur de cartes
  déterministe et sa validation. 50 tests.
- `@fw/cli` : une démonstration en terminal — une carte, une fonction, un
  tracé en ASCII — et `pnpm run hotseat`, une partie complète à deux à quatre
  joueurs sur un seul clavier.
- `@fw/rules` : création de partie, tours, boucliers, vulnérabilités, modes FFA
  et équipes, conditions de victoire, déconnexion et reconnexion. 29 tests dont
  des propriétés : le nombre de vivants ne croît jamais, le joueur actif est
  toujours vivant, `apply` ne modifie jamais l'état reçu, et une partie rejouée
  depuis sa graine et ses commandes est identique champ à champ.
- `@fw/server` : serveur autoritatif complet — poignée de main et jetons de
  session, salons à code d'invitation avec transfert d'hôte, spectateurs,
  configuration, démarrage de partie, résolution des tirs, validation sans
  coût de tour, échéances de tour, reconnexion avec instantané complet, et
  limitation de débit par seau à jetons. 25 tests, dont une partie entière
  jouée entre deux clients simulés et 8 000 trames aléatoires sans une seule
  exception.
- `@fw/client` : l'interface. Canvas 2D, écran d'accueil, salon avec code
  d'invitation, plateau, journal de partie, et saisie de fonction avec
  **prévisualisation activable ou désactivable** — un interrupteur, retenu
  d'un rechargement à l'autre, et qui ne calcule rien quand il est éteint.
  18 tests unitaires sur les deux seuls endroits où le client raisonne
  (`preview.ts`, `state.ts`) et trois tests Playwright dans un vrai navigateur
  contre un vrai serveur.
- Reprise de siège après un rechargement de page : le client garde son jeton et
  se rebranche sur la partie en cours. Le serveur savait le faire depuis la
  phase 4, le client ne s'en servait pas.
- La CI vérifie que `packages/client/package.json` ne déclare ni `@fw/physics`
  ni `@fw/rules`. L'[ADR 0006](docs/adr/0006-client-side-curve-preview.md)
  n'est plus une promesse écrite, c'est un échec de build.
- `IdFactoryPort.lobbyCode()` et `.sessionToken()`.
- `ERR_NOT_ENOUGH_TEAMS` : une partie en équipes à une seule équipe est refusée
  au lieu de se terminer d'elle-même au premier tour.

### Décidé, en cours d'implémentation

- La vérification de continuité n'inspecte que les raccords de morceaux : les
  fonctions du langage étant continues sur leur domaine, une expression à un
  seul morceau l'est par théorème. Documenté dans `docs/GAME_DESIGN.md` §3 et
  dans l'en-tête de `continuity.ts`.
- La multiplication implicite suit un littéral — nombre, `pi` ou `e` — et pas
  seulement un nombre, pour que `2e5` et `2pi x` se lisent comme un joueur les
  écrit. Pas de notation scientifique.
- [ADR 0008](docs/adr/0008-map-generator-knows-the-seat-count.md) — le
  générateur reçoit le nombre de sièges.
- [ADR 0009](docs/adr/0009-tracer-receives-an-evaluator.md) — le tracer reçoit
  un évaluateur au lieu de l'importer.
- [ADR 0010](docs/adr/0010-coverage-ceiling.md) — plafond de couverture à 0,35.
- [ADR 0011](docs/adr/0011-placement-rule-must-cut-both-ways.md) — la règle de
  placement coupe dans les deux sens : rien de trivial ne relie deux joueurs,
  mais quelque chose les relie toujours. **Plafond mesuré : quatre joueurs.**
- [ADR 0013](docs/adr/0013-shooting-along-both-axes.md) — `x = f(y)` s'obtient
  par transposition, pas par un second tracer.
- [ADR 0014](docs/adr/0014-difficulty-and-team-separation.md) — trois
  difficultés adossées à la connexité monotone, et deux distances de placement
  selon le camp.

### Corrigé

- La graine d'une partie ne pilotait rien : les tirages de placement venaient
  d'un générateur injecté à part, sans garantie qu'il corresponde à la graine
  inscrite dans l'état. Une partie pouvait annoncer une graine et avoir été
  tirée avec une autre, et son rejeu n'aurait rien reproduit. Le moteur dérive
  maintenant tout de `setup.seed`, et `RulesDeps.rng` a disparu. Voir la
  correction datée dans [ADR 0004](docs/adr/0004-determinism.md).
- La CI passait en local et échouait sur un dépôt propre : le lint typé lisait
  les déclarations produites par la compilation, et tournait avant elle.

### Retiré

- `lobby:add-bot` quitte le protocole jusqu'à ce qu'un bot existe (phase 6).
  Un message auquel le serveur ne sait répondre que « pas encore » invite un
  client à écrire du code pour une fonctionnalité absente.

### Connu et non résolu

- **Le rayon de hitbox peut défaire la règle de placement.** Une cible plus
  large que la bande scellée se touche au premier tir plat ; c'est vrai au-delà
  d'un rayon d'environ 3 sur la carte par défaut (1,5 par défaut, donc sans
  danger tel quel). Élargir la bande en proportion a été essayé et écarté : la
  génération à quatre joueurs tombe de 30/30 à 1/30. À trancher en BA-3.
- **Une partie dure longtemps.** Un joueur qui tire au hasard met environ
  220 tirs à en éliminer un autre, soit 0,5 % de réussite par tir. Un humain
  qui corrige d'un tir sur l'autre fait mieux, de combien reste à mesurer
  (tâche BA-3).

- Le générateur ne produit pas de carte à six joueurs ou plus. Il refuse
  proprement plutôt que d'en livrer une injouable ; `DEFAULT_RULES.maxPlayers`
  vaut toujours 8. Voir BA-8 dans `TASKS.md`.

## [0.1.0] — 2026-07-30

Phase 1 : le squelette et les contrats. Le jeu n'est pas jouable ; ce qui est
posé, c'est ce contre quoi six agents vont pouvoir coder en parallèle.

### Ajouté

- Monorepo pnpm, TypeScript strict, ESLint typé, Prettier, Vitest, fast-check.
- `@fw/contracts`, gelé : identifiants brandés, `Result`, générateur
  pseudo-aléatoire déterministe, géométrie, AST des fonctions, codes d'erreur
  avec leurs messages français, requête et résultat de tir, configuration et
  valeurs d'équilibrage, état de partie, ports, protocole réseau.
- Squelettes de `@fw/core-math`, `@fw/physics`, `@fw/rules`, `@fw/server`,
  `@fw/client`, chacun avec son périmètre et ses critères d'acceptation.
- Documentation : `AGENTS.md`, architecture, design du jeu, protocole,
  workflow multi-agents, et sept ADR.
- CI GitHub Actions : format, lint, typecheck, tests, plus une passe dédiée qui
  interdit `eval`, `new Function` et `Math.random`.
- Modèles de pull request et d'issues, `CODEOWNERS`, backlog dans `TASKS.md`.
- Hook pre-commit sans dépendance (`.githooks/pre-commit`), à activer par clone.

### Décidé

- [ADR 0001](docs/adr/0001-typescript-monorepo.md) — TypeScript partout,
  serveur `ws`, client React/Canvas.
- [ADR 0002](docs/adr/0002-no-eval-hand-written-parser.md) — aucune exécution
  de code joueur, parseur écrit à la main.
- [ADR 0003](docs/adr/0003-frozen-contracts-package.md) — contrats gelés.
- [ADR 0004](docs/adr/0004-determinism.md) — hasard seedé, horloge injectée.
- [ADR 0005](docs/adr/0005-in-memory-server-state.md) — état serveur en mémoire.
- [ADR 0006](docs/adr/0006-client-side-curve-preview.md) — prévisualisation
  calculée par le client, sans collisions.
- [ADR 0007](docs/adr/0007-continuity-as-only-validation.md) — la continuité
  est la seule règle de validation.

<!-- La balise v0.1.0 existe en local ; le proxy Git de la session refuse le
     push de balises (403). À pousser depuis une machine ayant les droits :
     `git push origin v0.1.0`. -->

[non publié]: https://github.com/francois136/Math-game/commits/main
