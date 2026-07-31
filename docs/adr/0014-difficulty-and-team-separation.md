# 0014 — Trois difficultés de terrain, et une distance par camp

- **Statut** : amendé par [0015](0015-the-board-grows-with-the-lobby.md) — la
  distance entre ennemis passe d'une fraction du terrain à un nombre d'unités
- **Date** : 2026-07-31
- **Décide** : le superviseur

## Contexte

Le générateur garantissait deux choses : rien de trivial ne relie deux joueurs,
et une parabole de la famille large en relie toujours deux. La seconde garantie
rend la partie **finissable**, ce qui était le but de l'ADR 0011 — mais elle la
rend aussi prévisible. Une parabole existe toujours, donc chercher revient à
balayer un paramètre.

Par ailleurs, la distance minimale entre deux sièges était unique. Deux
coéquipiers séparés de vingt-cinq unités gaspillent le terrain ; deux ennemis
séparés de vingt-cinq unités se battent dans un couloir.

## Décision

### Trois difficultés

| Difficulté  | Rien de trivial ne passe | Une fonction continue passe | Une parabole passe |
| ----------- | ------------------------ | --------------------------- | ------------------ |
| `facile`    | exigé                    | garanti par la parabole     | **exigé**          |
| `moderee`   | exigé                    | **exigé**                   | indifférent        |
| `difficile` | exigé                    | **exigé**                   | **interdit**       |

« Une fonction continue passe » a un sens précis et vérifiable : l'espace libre
entre les deux joueurs est **connexe le long d'un balayage monotone** — en `x`
croissants, en `x` décroissants, en `y` croissants ou en `y` décroissants. Le
générateur découpe le terrain en colonnes perpendiculaires au balayage, calcule
les intervalles libres de chaque colonne, relie ceux qui se chevauchent d'une
colonne à la suivante, et cherche un chemin. Un tel chemin **est** le graphe
d'une fonction continue, et réciproquement : c'est exactement la propriété
demandée, pas une approximation de confort.

### Une distance par camp

`spawnMinDistance` se scinde :

- `spawnMinDistanceAllies` — entre deux sièges du même camp. Défaut : 12.
- `enemySeparationFraction` — entre deux sièges opposés, en fraction de la
  largeur du terrain. Défaut : **0,45**, soit 45 unités sur 100.

Le générateur reçoit la composition des équipes (`spawnTeams`) pour appliquer
la bonne distance à chaque paire.

## Pourquoi 0,45 et non 0,5

Le superviseur proposait « plus de la moitié de la longueur du plateau ». À
deux joueurs, 0,5 fonctionne. À quatre ennemis mutuels, c'est géométriquement
impossible : la zone utile fait 88 × 48 après dégagement des bords, et quatre
points deux à deux distants de 50 n'y tiennent pas — les deux points du petit
côté ne peuvent pas dépasser 48. 0,45 tient à quatre, mesuré ; 0,5 ne tient
qu'à deux ou trois.

Le nombre est un réglage de salon : un hôte qui joue à deux peut le monter.

## Conséquences

- La passe de bouchage change d'invariant. Elle préservait « une parabole
  passe » ; elle préserve maintenant, selon la difficulté, soit cela, soit la
  connexité monotone — nettement plus faible, donc nettement plus de terrains
  possibles, y compris ceux où il faut vraiment chercher.
- En `difficile`, la passe ne bouche plus la famille triviale mais la famille
  large : c'est le même code, avec une autre cible.
- La connexité monotone est calculée par discrétisation en colonnes. Un obstacle
  plus fin qu'une colonne peut lui échapper ; la résolution est choisie pour que
  cela demande un obstacle plus fin qu'un joueur, et c'est écrit dans le code.
- `MapValidation` répond désormais aux trois questions séparément, plutôt qu'à
  une seule : un terrain refusé dit lequel des trois critères a manqué.
