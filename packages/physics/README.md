# @fw/physics

**Propriétaire : agent Physics.** Pur, sans I/O, sans DOM, sans réseau.

Fait avancer une courbe dans le monde jusqu'à ce qu'elle s'arrête, et fabrique
des cartes sur lesquelles la partie a une chance d'être intéressante.

## Ports implémentés

- `TracerPort` — `trace(input) → TraceResult`
- `MapGeneratorPort` — `generate(seed, params)`, `validate(map, params)`

## Le tracé

La courbe effectivement dessinée est

```
y = y₀ + f(x − x₀) − f(0)      le long de x
x = x₀ + f(y − y₀) − f(0)      le long de y
```

soit la fonction du joueur translatée pour passer par son point d'origine, quel
que soit `f(0)`.

Le tir le long de `y` **ne double aucune ligne de code** : `transpose.ts` tourne
le monde d'un quart de tour, le tracer fait son travail habituel, et le résultat
est retourné (ADR 0013). Une propriété le vérifie : un tir le long de `y` est
exactement le transposé du même tir le long de `x` sur la carte transposée.

Le pas en `x` est **adaptatif** : il vise `targetSegmentLength` de longueur
d'arc, se divise quand `|Δy|` dépasse `maxSegmentRise`, et ne descend jamais
sous `minStep` — c'est cette borne qui garantit que le tracé termine.

La collision se teste **segment contre forme**, jamais point par point : un
segment qui traverse un obstacle entre deux échantillons doit être détecté.
Le point d'arrêt renvoyé est le point d'**entrée** dans la forme, pas le
sommet du segment.

Le tracé s'arrête sur, dans cet ordre de priorité le long du segment courant :
sortie de domaine, discontinuité, obstacle, joueur touché (si `pierce` est
faux), bord de carte, `maxArcLength`, `maxSteps`.

Une cible dont `immuneUntilArc` dépasse la longueur d'arc courante est ignorée
— c'est ainsi que le tireur ne se tue pas au départ mais peut se tuer au retour.

## La génération de cartes

- Déterministe en `seed` : même graine, même carte, au bit près.
- Obstacles : rectangles et disques d'abord, polygones convexes ensuite.
- Contrainte de couverture (`maxCoverage`), de dégagement autour des points
  d'apparition (`spawnClearance`), et de distance entre eux — deux distances
  distinctes : `spawnMinDistanceAllies` entre coéquipiers, et
  `enemySeparationFraction` de la largeur du terrain entre adversaires.
- **Validation anti-tir facile** : pour chaque paire de points d'apparition, on
  échantillonne des droites et des paraboles simples les reliant, dans les deux
  orientations ; si l'une passe sans rencontrer d'obstacle, la carte est rejetée
  et regénérée (`maxGenerationAttempts` fois, puis `ERR_MAP_GENERATION_FAILED`).
  En `facile` ce test protège seulement des tirs les plus plats ; en
  `difficile` il porte sur une famille de paraboles bien plus large, et aucune
  ne doit passer.
- **Connexité monotone** (`connectivity.ts`) : découpe le terrain en colonnes
  perpendiculaires au balayage, liste les intervalles libres de chaque colonne,
  relie ceux qui se chevauchent, et cherche un chemin. Un chemin **est** le
  graphe d'une fonction continue. C'est ce qui donne un sens vérifiable aux
  difficultés `moderee` et `difficile` (ADR 0014).
- **Distances par camp** : coéquipiers et adversaires n'ont pas la même
  distance minimale. Le générateur reçoit la composition des équipes.
- `validate` s'applique aussi aux cartes JSON écrites à la main, et vérifie en
  plus la convexité et l'orientation des polygones.

## Critères d'acceptation

- Propriétés : le tracé se termine toujours ; il ne sort jamais des bornes ;
  il est identique à deux exécutions près ; un segment qui coupe un disque est
  toujours détecté (comparaison avec une résolution analytique).
- Cas limites : asymptote verticale, fonction constante, pente quasi verticale,
  origine collée à un obstacle.
- Un tir se résout en moins de 16 ms sur la carte par défaut (banc mesuré).
