# Backlog

Une ligne = une pull request. Si une tâche dépasse ~400 lignes de diff hors
tests, elle était trop grosse : découpe-la et note-le ici.

**Statuts** : ☐ à faire · ◐ en cours · ☑ fusionné

Les dépendances sont des tâches **fusionnées dans `main`**, pas des branches en
cours. Commencer sur une base non fusionnée est la première cause de conflit.

---

## Phase 1 — Squelette et contrats ☑

| # | Agent | Tâche | Dépend de | État |
| ---- | ----- | ---------------------------------------------------------------- | --------- | ---- | ---- |
| CT-1 | Lead | Monorepo pnpm, TypeScript strict, ESLint typé, Prettier, Vitest | — | ☑ |
| CT-2 | Lead | `@fw/contracts` : types, schémas, ports, erreurs, limites, RNG | CT-1 | ☑ |
| CT-3 | Lead | Documentation : architecture, design, protocole, workflow, 7 ADR | CT-1 | ☑ |
| CT-4 | Lead | CI GitHub Actions, modèles de PR et d'issues, CODEOWNERS | CT-1 | ☑ |

---

## Phase 2 — Core-Math et Physics, jouable en CLI

| #    | Agent     | Tâche                                                                                            | Dépend de  | État |
| ---- | --------- | ------------------------------------------------------------------------------------------------ | ---------- | ---- |
| CM-1 | Core-Math | Lexeur : nombres, identifiants, opérateurs, mots-clés `si`/`sinon`/`et`/`ou`, positions          | CT-2       | ☑    |
| CM-2 | Core-Math | Parseur à descente récursive : précédences, `^` à droite, moins unaire, multiplication implicite | CM-1       | ☑    |
| CM-3 | Core-Math | Fonctions par morceaux : gardes, ordre d'évaluation, `sinon` facultatif                          | CM-2       | ☑    |
| CM-4 | Core-Math | Limites statiques pendant le parsing + messages d'erreur avec position et suggestion             | CM-2       | ☑    |
| CM-5 | Core-Math | Évaluateur sans exception, sortie de domaine comme valeur                                        | CM-3       | ☑    |
| CM-6 | Core-Math | Vérificateur de continuité : raccords exacts, balayage des sauts et des pôles                    | CM-5       | ☑    |
| CM-7 | Core-Math | Propriétés fast-check : `parse` ne lève jamais, aller-retour AST, table de discontinuités        | CM-6       | ☑    |
| PH-1 | Physics   | Primitives géométriques : segment/AABB, segment/disque, segment/polygone convexe                 | CT-2       | ☐    |
| PH-2 | Physics   | Tracé à pas adaptatif, translation à l'origine, terminaison garantie                             | PH-1, CM-5 | ☐    |
| PH-3 | Physics   | Arrêts : obstacle, bord, domaine, discontinuité, arc, pas — avec point d'entrée exact            | PH-2       | ☐    |
| PH-4 | Physics   | Détection de joueur touché, `immuneUntilArc`, option `pierce`                                    | PH-3       | ☐    |
| PH-5 | Physics   | Générateur de cartes déterministe : obstacles, couverture, dégagements                           | CT-2       | ☐    |
| PH-6 | Physics   | Validation anti-tir-facile : droites et paraboles échantillonnées entre apparitions              | PH-5, PH-1 | ☐    |
| PH-7 | Physics   | Propriétés : terminaison, bornes, déterminisme, collision disque vérifiée analytiquement         | PH-4, PH-6 | ☐    |
| PH-8 | Physics   | Banc de performance : un tir sous 16 ms sur la carte par défaut                                  | PH-7       | ☐    |
| QA-1 | QA        | Seuils de couverture relevés à 95 % sur `core-math` et `physics`                                 | CM-7, PH-7 | ☐    |
| QA-2 | QA        | CLI de démonstration : carte, deux joueurs, tir au clavier, rendu ASCII                          | PH-4, CM-6 | ☐    |

---

## Phase 3 — Rules, partie locale complète

| #    | Agent | Tâche                                                                            | Dépend de        | État |
| ---- | ----- | -------------------------------------------------------------------------------- | ---------------- | ---- |
| RU-1 | Rules | `createMatch` : ordre tiré du seed, attribution des apparitions, boucliers       | PH-5             | ☐    |
| RU-2 | Rules | Résolution d'un tir : parse → continuité → vulnérabilités → tracé → éliminations | RU-1, CM-6, PH-4 | ☐    |
| RU-3 | Rules | Erreur récupérable : tour non consommé, état inchangé                            | RU-2             | ☐    |
| RU-4 | Rules | Fin de tour, boucliers décrémentés, expiration, joueur suivant vivant            | RU-2             | ☐    |
| RU-5 | Rules | Mode FFA et conditions de victoire                                               | RU-4             | ☐    |
| RU-6 | Rules | Mode équipes, tir ami configurable, victoire d'équipe                            | RU-5             | ☐    |
| RU-7 | Rules | Déconnexion et reconnexion : siège conservé, tours passés                        | RU-4             | ☐    |
| RU-8 | Rules | Propriétés et partie scriptée rejouée deux fois, comparée champ à champ          | RU-6, RU-7       | ☐    |
| QA-3 | QA    | Hot-seat en CLI : partie complète à deux, sans réseau                            | RU-8, QA-2       | ☐    |

---

## Phase 4 — Serveur et multijoueur

| #     | Agent  | Tâche                                                                          | Dépend de  |
| ----- | ------ | ------------------------------------------------------------------------------ | ---------- |
| SV-1  | Server | Serveur `ws`, validation Zod de toute trame entrante, enveloppes               | CT-2       | ☐   |
| SV-2  | Server | Sessions : `hello`, `PlayerId`, `SessionToken`, machine à états de connexion   | SV-1       | ☐   |
| SV-3  | Server | Salons : code d'invitation, arrivée, départ, transfert d'hôte, spectateurs     | SV-2       | ☐   |
| SV-4  | Server | Configuration de salon, équipes, prêt, démarrage                               | SV-3       | ☐   |
| SV-5  | Server | Orchestration : commandes vers `@fw/rules`, diffusion des événements           | SV-4, RU-8 | ☐   |
| SV-6  | Server | Horloge de tour et expiration automatique                                      | SV-5       | ☐   |
| SV-7  | Server | Reconnexion : délai de grâce, instantané complet au retour                     | SV-5, RU-7 | ☐   |
| SV-8  | Server | Limitation de débit et fermeture après trames invalides répétées               | SV-1       | ☐   |
| SV-9  | Server | Fuzzing du protocole : 10 000 trames aléatoires, aucune exception              | SV-8       | ☐   |
| SV-10 | Server | Test d'intégration : deux clients simulés, partie complète, sans socket réelle | SV-7       | ☐   |

---

## Phase 5 — Client graphique

| #    | Agent  | Tâche                                                                                                                                                                                                         | Dépend de        | État |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---- |
| CL-1 | Client | Vite, React, structure d'application, transport WebSocket typé                                                                                                                                                | CT-2             | ☐    |
| CL-2 | Client | Rendu Canvas : carte, obstacles, joueurs, boucliers, coordonnées monde                                                                                                                                        | CL-1             | ☐    |
| CL-3 | Client | Champ de saisie de fonction, syntaxe par morceaux, erreurs sous le champ                                                                                                                                      | CL-1, CM-4       | ☐    |
| CL-4 | Client | Prévisualisation locale de la courbe (ADR 0006), style distinct du tir confirmé                                                                                                                               | CL-2, CL-3, CM-5 | ☐    |
| CL-5 | Client | Écrans de salon : création, code, équipes, réglages, prêt                                                                                                                                                     | CL-1, SV-4       | ☐    |
| CL-6 | Client | Animation d'un tir le long de la polyligne, marqueur d'arrêt, élimination                                                                                                                                     | CL-2, SV-5       | ☐    |
| CL-7 | Client | Hot-seat dans le navigateur — **écarté** : demanderait d'importer `@fw/rules` et `@fw/physics` côté client, donc de renoncer à la vérification de l'ADR 0006. `pnpm run hotseat` couvre le besoin en terminal | CL-4, RU-8       | ✗    |
| CL-8 | Client | Playwright : partie hot-seat complète, fonction refusée, tour non consommé                                                                                                                                    | CL-7             | ☐    |
| CL-9 | Client | Accessibilité au clavier, contrastes, réduction des animations                                                                                                                                                | CL-6             | ☐    |

---

## Entre les phases 5 et 6 — axes de tir et difficultés ☑

Demandé par le superviseur avant l'ouverture de la phase 6.

| #    | Agent     | Tâche                                                                              | Dépend de  | État |
| ---- | --------- | ---------------------------------------------------------------------------------- | ---------- | ---- |
| AX-1 | Lead      | Contrats : `Axis` sur la requête de tir, `Difficulty`, distances par camp          | CL-9       | ☑    |
| AX-2 | Physics   | `transpose.ts` : quart de tour, involution prouvée par propriété (ADR 0013)        | AX-1       | ☑    |
| AX-3 | Physics   | `connectivity.ts` : connexité monotone par colonnes, quatre balayages (ADR 0014)   | AX-1       | ☑    |
| AX-4 | Physics   | Générateur : trois difficultés, placement par camp, `validate` à quatre familles   | AX-2, AX-3 | ☑    |
| AX-5 | Core-Math | `parse(source, variable)` : la lettre de l'axe, et le refus de l'autre             | AX-1       | ☑    |
| AX-6 | Rules     | L'axe traverse le moteur ; composition des équipes transmise au générateur         | AX-4, AX-5 | ☑    |
| AX-7 | Client    | Choix de l'axe, prévisualisation le long de la bonne variable, difficulté au salon | AX-6       | ☑    |
| AX-8 | QA        | Playwright : un tir fonction de `y`, et le choix de difficulté par l'hôte          | AX-7       | ☑    |

---

## Phase 6 — Équilibrage, bot, rejeux

| #    | Agent   | Tâche                                                                                                                     | Dépend de  | État |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------- | ---------- | ---- |
| BA-1 | Rules   | Bot simple : famille de fonctions paramétrées, tir choisi par échantillonnage (ADR 0016)                                  | RU-8       | ☑    |
| BA-2 | Rules   | Niveaux de bot, ordonnés par mesure ; aucun ne gagne au premier tour sous les règles par défaut                           | BA-1       | ☑    |
| BA-3 | QA      | Campagne d'équilibrage `pnpm run balance` : durée des parties, premier kill, dette du rayon tranchée                      | BA-2       | ☑    |
| BA-8 | Physics | **Plafond de quatre joueurs levé** : terrain à l'échelle du salon, distances en unités, plafond par difficulté (ADR 0015) | PH-7       | ☑    |
| BA-4 | Server  | Export de rejeu JSON en fin de partie, 68x plus petit que l'état (ADR 0018)                                               | SV-10      | ☑    |
| BA-5 | Client  | Lecture d'un rejeu, pas à pas, curseur et narration                                                                       | BA-4, CL-6 | ☑    |
| BA-6 | Rules   | Résolution simultanée : tirs tracés contre le même état, double KO assumé (ADR 0019)                                      | RU-8       | ☑    |
| BA-7 | Lead    | Documentation finale, captures, guide de déploiement                                                                      | tout       | ☐    |

---

## Dette et questions ouvertes

- **Le jeu monte à huit joueurs en `moderee`, cinq en `facile`, sept en
  `difficile`** ([ADR 0015](docs/adr/0015-the-board-grows-with-the-lobby.md)).
  Monter `facile` plus haut suppose d'assouplir l'ADR 0011 : sa promesse qu'une
  parabole relie chaque paire est ce qui plafonne, et elle croît comme le carré
  de l'effectif.
- Générer une carte à sept sièges en `difficile` coûte 1,2 s pendant lesquelles
  le serveur ne répond à personne. Une fois par partie, mais mono-thread. À
  sortir du fil principal si un salon s'en plaint.
- Un coup de bot `redoutable` coûte 220 tracés, soit ~70 ms de serveur bloqué.
  Une table de huit bots redoutables gèle donc un demi-seconde entre deux coups
  humains. Même remède que ci-dessus si cela devient gênant.
- L'équilibrage à plus de deux joueurs n'a pas été mesuré. La campagne sait le
  faire (`--seats`), personne ne l'a lancée.
- Le générateur ne produit que des rectangles et des disques. Les polygones
  convexes sont dans les contrats, gérés par les collisions et validés, mais
  seules les cartes JSON écrites à la main peuvent en contenir.
- Le tracé ne peut pas revenir sur son auteur : la courbe s'éloigne de son
  origine de façon monotone dans la variable du tir. `selfImmunityArc` protège
  donc du départ, et de rien d'autre, et doit rester supérieur au rayon de
  hitbox.
- Une carte plus petite que celle par défaut doit baisser
  `spawnMinDistanceEnemies` : 45 unités ne traversent pas un plateau large de 50,
  et le générateur ne sortira aucune carte. Visible immédiatement, mais rien ne
  le dit à l'hôte au moment du réglage.
- La connexité monotone est discrétisée en 220 colonnes. Un obstacle plus fin
  qu'une colonne peut lui échapper. Le générateur n'en produit pas d'aussi fin ;
  une carte JSON écrite à la main le pourrait.
- En `difficile`, personne n'a encore mesuré combien de tirs un humain met à
  toucher. Les 0,00 % mesurés sont ceux d'un tireur aléatoire, ce qui est le
  but ; le nombre qui compte viendra de BA-3.
