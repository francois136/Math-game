# Backlog

Une ligne = une pull request. Si une tâche dépasse ~400 lignes de diff hors
tests, elle était trop grosse : découpe-la et note-le ici.

**Statuts** : ☐ à faire · ◐ en cours · ☑ fusionné

Les dépendances sont des tâches **fusionnées dans `main`**, pas des branches en
cours. Commencer sur une base non fusionnée est la première cause de conflit.

---

## Phase 1 — Squelette et contrats ☑

| #    | Agent | Tâche                                                            | Dépend de | État |
| ---- | ----- | ---------------------------------------------------------------- | --------- | ---- |
| CT-1 | Lead  | Monorepo pnpm, TypeScript strict, ESLint typé, Prettier, Vitest  | —         | ☑    |
| CT-2 | Lead  | `@fw/contracts` : types, schémas, ports, erreurs, limites, RNG   | CT-1      | ☑    |
| CT-3 | Lead  | Documentation : architecture, design, protocole, workflow, 7 ADR | CT-1      | ☑    |
| CT-4 | Lead  | CI GitHub Actions, modèles de PR et d'issues, CODEOWNERS         | CT-1      | ☑    |

---

## Phase 2 — Core-Math et Physics, jouable en CLI

| #    | Agent     | Tâche                                                                                            | Dépend de  |
| ---- | --------- | ------------------------------------------------------------------------------------------------ | ---------- |
| CM-1 | Core-Math | Lexeur : nombres, identifiants, opérateurs, mots-clés `si`/`sinon`/`et`/`ou`, positions          | CT-2       |
| CM-2 | Core-Math | Parseur à descente récursive : précédences, `^` à droite, moins unaire, multiplication implicite | CM-1       |
| CM-3 | Core-Math | Fonctions par morceaux : gardes, ordre d'évaluation, `sinon` facultatif                          | CM-2       |
| CM-4 | Core-Math | Limites statiques pendant le parsing + messages d'erreur avec position et suggestion             | CM-2       |
| CM-5 | Core-Math | Évaluateur sans exception, sortie de domaine comme valeur                                        | CM-3       |
| CM-6 | Core-Math | Vérificateur de continuité : raccords exacts, balayage des sauts et des pôles                    | CM-5       |
| CM-7 | Core-Math | Propriétés fast-check : `parse` ne lève jamais, aller-retour AST, table de discontinuités        | CM-6       |
| PH-1 | Physics   | Primitives géométriques : segment/AABB, segment/disque, segment/polygone convexe                 | CT-2       |
| PH-2 | Physics   | Tracé à pas adaptatif, translation à l'origine, terminaison garantie                             | PH-1, CM-5 |
| PH-3 | Physics   | Arrêts : obstacle, bord, domaine, discontinuité, arc, pas — avec point d'entrée exact            | PH-2       |
| PH-4 | Physics   | Détection de joueur touché, `immuneUntilArc`, option `pierce`                                    | PH-3       |
| PH-5 | Physics   | Générateur de cartes déterministe : obstacles, couverture, dégagements                           | CT-2       |
| PH-6 | Physics   | Validation anti-tir-facile : droites et paraboles échantillonnées entre apparitions              | PH-5, PH-1 |
| PH-7 | Physics   | Propriétés : terminaison, bornes, déterminisme, collision disque vérifiée analytiquement         | PH-4, PH-6 |
| PH-8 | Physics   | Banc de performance : un tir sous 16 ms sur la carte par défaut                                  | PH-7       |
| QA-1 | QA        | Seuils de couverture relevés à 95 % sur `core-math` et `physics`                                 | CM-7, PH-7 |
| QA-2 | QA        | CLI de démonstration : carte, deux joueurs, tir au clavier, rendu ASCII                          | PH-4, CM-6 |

---

## Phase 3 — Rules, partie locale complète

| #    | Agent | Tâche                                                                            | Dépend de        |
| ---- | ----- | -------------------------------------------------------------------------------- | ---------------- |
| RU-1 | Rules | `createMatch` : ordre tiré du seed, attribution des apparitions, boucliers       | PH-5             |
| RU-2 | Rules | Résolution d'un tir : parse → continuité → vulnérabilités → tracé → éliminations | RU-1, CM-6, PH-4 |
| RU-3 | Rules | Erreur récupérable : tour non consommé, état inchangé                            | RU-2             |
| RU-4 | Rules | Fin de tour, boucliers décrémentés, expiration, joueur suivant vivant            | RU-2             |
| RU-5 | Rules | Mode FFA et conditions de victoire                                               | RU-4             |
| RU-6 | Rules | Mode équipes, tir ami configurable, victoire d'équipe                            | RU-5             |
| RU-7 | Rules | Déconnexion et reconnexion : siège conservé, tours passés                        | RU-4             |
| RU-8 | Rules | Propriétés et partie scriptée rejouée deux fois, comparée champ à champ          | RU-6, RU-7       |
| QA-3 | QA    | Hot-seat en CLI : partie complète à deux, sans réseau                            | RU-8, QA-2       |

---

## Phase 4 — Serveur et multijoueur

| #     | Agent  | Tâche                                                                          | Dépend de  |
| ----- | ------ | ------------------------------------------------------------------------------ | ---------- |
| SV-1  | Server | Serveur `ws`, validation Zod de toute trame entrante, enveloppes               | CT-2       |
| SV-2  | Server | Sessions : `hello`, `PlayerId`, `SessionToken`, machine à états de connexion   | SV-1       |
| SV-3  | Server | Salons : code d'invitation, arrivée, départ, transfert d'hôte, spectateurs     | SV-2       |
| SV-4  | Server | Configuration de salon, équipes, prêt, démarrage                               | SV-3       |
| SV-5  | Server | Orchestration : commandes vers `@fw/rules`, diffusion des événements           | SV-4, RU-8 |
| SV-6  | Server | Horloge de tour et expiration automatique                                      | SV-5       |
| SV-7  | Server | Reconnexion : délai de grâce, instantané complet au retour                     | SV-5, RU-7 |
| SV-8  | Server | Limitation de débit et fermeture après trames invalides répétées               | SV-1       |
| SV-9  | Server | Fuzzing du protocole : 10 000 trames aléatoires, aucune exception              | SV-8       |
| SV-10 | Server | Test d'intégration : deux clients simulés, partie complète, sans socket réelle | SV-7       |

---

## Phase 5 — Client graphique

| #    | Agent  | Tâche                                                                           | Dépend de        |
| ---- | ------ | ------------------------------------------------------------------------------- | ---------------- |
| CL-1 | Client | Vite, React, structure d'application, transport WebSocket typé                  | CT-2             |
| CL-2 | Client | Rendu Canvas : carte, obstacles, joueurs, boucliers, coordonnées monde          | CL-1             |
| CL-3 | Client | Champ de saisie de fonction, syntaxe par morceaux, erreurs sous le champ        | CL-1, CM-4       |
| CL-4 | Client | Prévisualisation locale de la courbe (ADR 0006), style distinct du tir confirmé | CL-2, CL-3, CM-5 |
| CL-5 | Client | Écrans de salon : création, code, équipes, réglages, prêt                       | CL-1, SV-4       |
| CL-6 | Client | Animation d'un tir le long de la polyligne, marqueur d'arrêt, élimination       | CL-2, SV-5       |
| CL-7 | Client | Mode hot-seat branché sur `@fw/rules` en local                                  | CL-4, RU-8       |
| CL-8 | Client | Playwright : partie hot-seat complète, fonction refusée, tour non consommé      | CL-7             |
| CL-9 | Client | Accessibilité au clavier, contrastes, réduction des animations                  | CL-6             |

---

## Phase 6 — Équilibrage, bot, rejeux

| #    | Agent  | Tâche                                                                                     | Dépend de  |
| ---- | ------ | ----------------------------------------------------------------------------------------- | ---------- |
| BA-1 | Rules  | Bot simple : famille de fonctions paramétrées, tir choisi par échantillonnage             | RU-8       |
| BA-2 | Rules  | Niveaux de bot et test qu'un bot ne gagne pas au premier tour sur 1 000 graines           | BA-1       |
| BA-3 | QA     | Campagne d'équilibrage : 1 000 parties simulées, statistiques de durée et de premier kill | BA-2       |
| BA-4 | Server | Export de rejeu JSON en fin de partie                                                     | SV-10      |
| BA-5 | Client | Lecture d'un rejeu, pas à pas                                                             | BA-4, CL-6 |
| BA-6 | Rules  | Résolution simultanée : trancher l'ordre des tirs croisés, ADR, puis implémenter          | RU-8       |
| BA-7 | Lead   | Documentation finale, captures, guide de déploiement                                      | tout       |

---

## Dette et questions ouvertes

- L'ordre de résolution en mode simultané n'est pas tranché (BA-6). Le champ
  `RuleSet.simultaneousResolution` existe mais aucune implémentation ne le lit.
- Le format de rejeu partageable n'est pas figé (BA-4).
- Les polygones convexes sont dans les contrats mais le générateur ne les
  produira qu'en PH-5 ; jusque-là, seules les cartes JSON peuvent en contenir.
