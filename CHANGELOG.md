# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Versions : [SemVer](https://semver.org/lang/fr/).

## [0.2.0] — 2026-07-31

Phases 2 à 6 : le jeu existe, se joue à huit, contre des bots, et se rejoue.

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
- **La résolution simultanée**, réglable au salon et désactivée par défaut.
  Chacun écrit sa fonction, puis tout se résout d'un coup — à huit joueurs, cela
  remplace sept tours d'attente par un.

  Le champ `simultaneousResolution` existait depuis la phase 1 et personne ne le
  lisait : c'était du code mort, que le brief interdit. La question ouverte
  depuis le début — _si A tue B et B tue A dans le même round, que se passe-t-il ?_
  — est tranchée ([ADR 0019](docs/adr/0019-simultaneous-shots-are-all-fired-at-once.md)) :
  toutes les courbes sont tracées contre le **même état**, celui d'avant le
  round, et les éliminations s'appliquent ensemble.

  C'est la seule règle qui ne dépende d'aucun ordre, et un test l'affirme :
  permuter les joueurs ne change pas le résultat. Le double KO existe donc, et
  la partie nulle cesse d'être théorique. Une courbe qui traverse quelqu'un
  qu'un autre tir du même round a tué compte aussi — les deux sont partis au
  même instant.

  `ActiveTurn.playerId` devient nullable : en simultané, ce n'est à personne en
  particulier, et un champ qui désignerait quand même un joueur ferait griser
  les mauvaises choses côté client. `shot-submitted` dit qu'un joueur a répondu
  sans dire ce qu'il a écrit. Le plateau dessine désormais **toutes** les courbes
  d'un round, pas seulement la dernière.

- **Corrigé, découvert en écrivant le mode simultané** : un rejeu relisait un
  tour expiré comme un tour volontairement passé. Il reproduisait toutes les
  éliminations et la mauvaise raison — c'est-à-dire un rejeu qui ne reproduit
  pas. Un test le fixe désormais, pour l'expiration comme pour la déconnexion.

- **Les rejeux.** Une partie terminée arrive chez tout le monde sous forme de
  document, téléchargeable en un clic, et se regarde à nouveau tour par tour.

  Un rejeu enregistre **ce qui a été fait, pas ce qui a été dessiné**
  ([ADR 0018](docs/adr/0018-a-replay-stores-what-was-done.md)) : graine,
  configuration, carte, et une ligne par tour. Les courbes sont retracées à la
  lecture. Mesuré sur un duel de trente tours : 4 Ko au lieu de 271, soit
  soixante-huit fois moins, pour la même partie.

  La propriété qui compte, et qui est testée sur quarante parties tirées au
  hasard : `replay(toReplay(partie))` est égal à la partie, **champ pour champ,
  tracés compris**. Un enregistrement qui ne reproduit pas est l'enregistrement
  de rien. Un rejeu que le moteur ne sait plus jouer échoue en nommant le tour
  fautif, plutôt que de rendre une partie partie ailleurs en silence.

  Relire demande le moteur, que le client n'a pas ([ADR 0006](docs/adr/0006-client-side-curve-preview.md)) :
  c'est le serveur qui relit (`replay:load`) et renvoie la partie reconstruite.
  Marcher dedans ensuite est du pur dessin — « qui est debout au tour k » se lit
  dans l'historique.

  `TurnRecord` gagne `atMs` : les échéances de tour font partie de l'état, et un
  rejeu joué à une autre horloge reproduirait toutes les éliminations et une
  échéance différente.

- **`pnpm run balance` : la campagne d'équilibrage.** Des bots jouent les uns
  contre les autres, beaucoup, et le tableau qui sort dit combien de temps dure
  une partie. Tout vient d'une graine : un nombre imprimé se reproduit avec la
  même commande. Réglages : nombre de parties, difficulté, niveau, sièges,
  bouclier, rayon.

  Ce qu'elle a mesuré aux règles par défaut, 120 duels par case : un joueur qui
  corrige d'un tir sur l'autre élimine en une vingtaine de tours. Les 220 tirs
  qui traînaient dans la documentation décrivaient un tireur qui ne regarde pas
  où sa courbe s'est arrêtée ; regarder change tout, d'un facteur dix. Sur un
  terrain `difficile`, le même joueur met 14 tours au lieu de 5, et plus de la
  moitié des parties n'ont pas de vainqueur au bout de deux cents tours.

- **`playerRadius` est borné, et la dette la plus dangereuse est fermée**
  ([ADR 0017](docs/adr/0017-a-player-fits-inside-the-sealed-band.md)). On savait
  depuis l'ADR 0011 qu'une cible plus large que la bande scellée se touche au
  premier tir plat. La campagne l'a chiffré, et ce n'est pas une pente, c'est
  une falaise : à rayon 3 sur le terrain par défaut, 2 % des tirs touchent et un
  duel dure neuf tours ; à 3,5, **100 %** des tirs touchent et toutes les
  parties finissent au premier tour.

  `maxPlayerRadiusFor(bounds)` donne la borne, `TRIVIAL_CURVE_FRACTION` passe de
  `@fw/physics` aux contrats, et `createMatch` refuse une configuration hors
  borne avec `ERR_PLAYER_RADIUS_TOO_LARGE` — dont le message dit pourquoi et
  propose les deux issues.

- **`@fw/bot` : de quoi jouer seul.** L'hôte ajoute des bots au salon, à trois
  niveaux, et ils prennent leur tour sans qu'on leur demande.

  Un bot **cherche, il ne résout pas**
  ([ADR 0016](docs/adr/0016-a-bot-searches-it-does-not-solve.md)) : il tire une
  famille de fonctions et ses paramètres, écrit la source, la trace, regarde de
  combien il a raté, recommence. Il ne pourrait pas faire autrement — le
  générateur construit des terrains où aucune famille simple ne relie deux
  joueurs. Il écrit du **texte** dans le même parseur qu'un joueur, franchit la
  même vérification de continuité, et ne peut donc rien soumettre qu'un joueur
  ne pourrait écrire.

  Mesuré sur soixante duels par niveau, boucliers retirés : `debutant` élimine
  en ~40 tours, `confirme` en ~20, `redoutable` en ~7. Sur un terrain
  `difficile`, `redoutable` ne conclut que 27 duels sur 60 en 120 tours — la
  difficulté porte bien sur le problème, pas sur l'interface.

  Sans bouclier de départ, `redoutable` gagne au premier tour deux fois sur
  cinq. Le bouclier de deux tours n'est donc pas un confort : c'est ce qui
  empêche une partie d'être décidée avant d'avoir commencé. Un test le fixe.

- `lobby:add-bot` revient dans le protocole avec le bot qu'il attendait, et
  `LobbyMember` gagne `botLevel`. Un bot se retire par `lobby:remove-player`,
  comme n'importe qui.

- **Le jeu monte à huit joueurs** ([ADR 0015](docs/adr/0015-the-board-grows-with-the-lobby.md)).
  Le plafond de quatre n'était pas la limite qu'on croyait. Deux corrections :
  - **Le terrain grandit avec le salon** (`sizedForSeats`) : ×1 jusqu'à quatre
    joueurs, ×1,3 à cinq, ×1,6 au-delà, le nombre d'obstacles suivant l'aire.
  - **La distance entre ennemis s'exprime en unités**, plus en fraction de la
    largeur : `spawnMinDistanceEnemies`, 45 par défaut — exactement ce que
    valait 0,45 sur le terrain à deux joueurs. Une fraction exigeait un écart
    plus grand au moment précis où il y avait plus de monde à loger, ce qui est
    la raison pour laquelle « agrandir le terrain n'y change rien » était vrai.
  - **Le plafond dépend maintenant de la difficulté** (`maxSeatsFor`) : cinq en
    `facile`, sept en `difficile`, huit en `moderee`. C'est `facile` qui plafonne,
    parce qu'elle promet une parabole entre **chaque** paire et que les paires
    croissent comme le carré de l'effectif. Le refus est précoce et lisible :
    `ERR_TOO_MANY_SEATS_FOR_DIFFICULTY` avant même d'appeler le générateur, et le
    salon désactive « Lancer » en disant quelle difficulté choisir.

  Mesuré, 16 cartes par case : cinq joueurs 16/16 aux trois difficultés ;
  huit joueurs en `moderee` 16/16 à 326 ms. Sur l'ancien terrain, aux mêmes
  45 unités, aucun effectif au-delà de quatre ne produisait une seule carte.

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

### Décidé

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
  mais quelque chose les relie toujours. _Amendée par 0014 et 0015 : « une
  parabole passe » n'est plus exigé qu'en `facile`._
- [ADR 0012](docs/adr/0012-four-players.md) — plafond de quatre joueurs.
  _Amendée par 0015 : le plafond dépend maintenant de la difficulté._
- [ADR 0013](docs/adr/0013-shooting-along-both-axes.md) — `x = f(y)` s'obtient
  par transposition, pas par un second tracer.
- [ADR 0014](docs/adr/0014-difficulty-and-team-separation.md) — trois
  difficultés adossées à la connexité monotone, et deux distances de placement
  selon le camp.
- [ADR 0015](docs/adr/0015-the-board-grows-with-the-lobby.md) — le terrain
  grandit avec le salon, les distances sont en unités, le plafond de joueurs
  dépend de la difficulté.
- [ADR 0016](docs/adr/0016-a-bot-searches-it-does-not-solve.md) — un bot cherche
  par échantillonnage, il ne résout pas.
- [ADR 0017](docs/adr/0017-a-player-fits-inside-the-sealed-band.md) — un joueur
  tient dans la bande scellée : `playerRadius` est borné.
- [ADR 0018](docs/adr/0018-a-replay-stores-what-was-done.md) — un rejeu
  enregistre les décisions, pas les tracés.
- [ADR 0019](docs/adr/0019-simultaneous-shots-are-all-fired-at-once.md) — en
  simultané, tous les tirs partent du même instant.

### Corrigé

- La graine d'une partie ne pilotait rien : les tirages de placement venaient
  d'un générateur injecté à part, sans garantie qu'il corresponde à la graine
  inscrite dans l'état. Une partie pouvait annoncer une graine et avoir été
  tirée avec une autre, et son rejeu n'aurait rien reproduit. Le moteur dérive
  maintenant tout de `setup.seed`, et `RulesDeps.rng` a disparu. Voir la
  correction datée dans [ADR 0004](docs/adr/0004-determinism.md).
- La CI passait en local et échouait sur un dépôt propre : le lint typé lisait
  les déclarations produites par la compilation, et tournait avant elle.

### Connu et non résolu

- Générer une carte à sept sièges en `difficile` coûte 1,2 s, et le serveur est
  mono-thread : c'est du gel pour tous les salons, une fois par partie. Mesuré
  et accepté pour l'instant ; à sortir du fil principal si cela gêne.
- Un bot `redoutable` coûte environ 70 ms de serveur bloqué par coup, et le
  serveur est mono-thread. Une table de huit bots redoutables gèle donc un demi-
  seconde entre deux coups humains. Mesuré, accepté pour l'instant.

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

<!-- Les balises v0.1.0 et v0.2.0 existent en local ; le proxy Git de la session
     refuse le push de balises (403). À pousser depuis une machine ayant les
     droits : `git push origin v0.1.0 v0.2.0`. -->

[0.2.0]: https://github.com/francois136/Math-game/compare/v0.1.0...v0.2.0
[non publié]: https://github.com/francois136/Math-game/commits/main
