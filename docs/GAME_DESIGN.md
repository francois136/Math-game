# Game design

Ce document fait autorité sur les règles. Le code s'y conforme ; quand le code
et ce document divergent, c'est le code qui a tort.

## 1. Le plateau

Un repère cartésien rectangulaire, `[-50, 50] × [-30, 30]` par défaut, réglable
par salon. Des obstacles — rectangles, disques, et polygones convexes — occupent
le terrain. Chaque joueur possède un point d'origine `(x₀, y₀)` et une hitbox
circulaire de rayon `1,5` unité par défaut.

Une carte vient soit du générateur procédural, à partir d'une graine, soit d'un
fichier JSON. Dans les deux cas elle passe la même validation.

## 2. Le tir

Un joueur fournit **une fonction** `f`, **une variable** — `x` ou `y` — et
**un sens**. La courbe tracée est

```
y = y₀ + f(x − x₀) − f(0)      le long de x
x = x₀ + f(y − y₀) − f(0)      le long de y
```

autrement dit la fonction du joueur, translatée pour passer par son point.

Le second cas n'est pas un second moteur : le tracer **transpose** le terrain,
trace comme il l'a toujours fait, et transpose la réponse
([ADR 0013](adr/0013-shooting-along-both-axes.md)). Sans lui, deux joueurs l'un
au-dessus de l'autre seraient hors d'atteinte quoi qu'ils écrivent — une courbe
`y = f(x)` ne repasse jamais par l'abscisse de son auteur.

La lettre que le joueur tape suit la variable : `3*sin(x/2)` le long de `x`,
`3*sin(y/2)` le long de `y`. Écrire l'autre lettre donne une erreur qui dit
laquelle était attendue.
Il n'est jamais nécessaire que `f(0) = 0` : le moteur normalise. Si `f` n'est
pas définie en `0`, en revanche, le tir est refusé avant d'être tiré
(`ERR_UNDEFINED_AT_ORIGIN`) — il n'y a pas de point de départ.

Le tracé avance pas à pas depuis l'origine, dans le sens choisi, et s'arrête à
la première de ces rencontres :

| Arrêt           | Raison                                                                           |
| --------------- | -------------------------------------------------------------------------------- |
| `obstacle`      | La courbe entre dans un obstacle                                                 |
| `player-hit`    | La courbe traverse la hitbox d'un joueur vulnérable, et `pierce` est faux        |
| `map-edge`      | La courbe sort du rectangle de jeu                                               |
| `domain-exit`   | `f` cesse d'être définie : `ln` en `x ≤ 0`, `√` d'un négatif, division par zéro… |
| `discontinuity` | Saut ou asymptote verticale rencontrée en cours de route                         |
| `arc-limit`     | La courbe a parcouru `maxArcLength` unités                                       |
| `step-limit`    | Le budget de pas est épuisé                                                      |

Les trois derniers sont des garde-fous, pas des règles : ils existent pour
qu'un tir coûte un temps borné.

## 3. Les fonctions

### Grammaire

```ebnf
expression  = term , { ("+" | "-") , term } ;
term        = factor , { ("*" | "/" | implicit) , factor } ;
factor      = unary , [ "^" , factor ] ;              (* associatif à droite *)
unary       = [ "-" | "+" ] , primary ;
primary     = number
            | constant
            | "x"
            | function , "(" , expression , ")"
            | "(" , expression , ")"
            | piecewise ;
piecewise   = "{" , branch , { separator , branch } , "}" ;
branch      = expression , "si" , guard
            | expression , "sinon" ;
guard       = comparison , { ("et" | "ou") , comparison } ;
comparison  = expression , ("<" | "<=" | ">" | ">=") , expression ;
separator   = ";" | saut de ligne ;
```

- **Fonctions** : `sin cos tan asin acos atan sinh cosh tanh exp ln log sqrt abs`.
  Toutes à un argument. `ln` est le logarithme népérien, `log` le logarithme
  décimal.
- **Constantes** : `pi`, `e`. **Variable** : `x`, la seule.
- `^` est associatif à droite : `2^3^2 = 2^9`.
- Le moins unaire est moins prioritaire que la puissance : `-x^2 = -(x^2)`.
- **Multiplication implicite** : autorisée après un littéral — un nombre, `pi`
  ou `e`. `2x`, `2(x+1)`, `3sin(x)`, `2pi` sont valides ; `x x` et `x(2)` ne le
  sont pas, parce qu'ils se lisent trop facilement comme autre chose.
- **Pas de notation scientifique.** `2e5` vaut 2·e·5, pas 200000 : qui écrit
  `e` dans ce jeu veut le nombre d'Euler, à chaque fois.

### Fonctions par morceaux

```
{ x^2          si x < 2
  4 + 3*(x-2)  si x >= 2 }
```

Les gardes sont évaluées **dans l'ordre** : le premier morceau dont la garde est
vraie l'emporte. Un morceau `sinon` final, facultatif, attrape le reste.

Là où **aucune** garde n'est vraie, la fonction n'est pas définie. Ce n'est pas
une erreur : c'est une sortie de domaine, qui arrêtera le tir si la courbe
l'atteint. Une fonction par morceaux n'a donc pas à couvrir toute la droite
réelle.

Huit morceaux au maximum.

### La seule règle de validation : la continuité

Une fonction est acceptée si et seulement si elle est **continue** sur chaque
intervalle où elle est définie.

Concrètement, avant le tir :

1. `f` doit être définie en `0` — sinon la courbe n'a pas de point de départ.
2. À chaque point de raccord entre deux morceaux, la limite à gauche et la
   limite à droite sont comparées : si elles diffèrent de plus de `ε`
   (`continuityEpsilon`, `1e-6`, avec une tolérance relative pour les grandes
   valeurs), la fonction est refusée.
3. Et c'est tout : **il n'y a rien d'autre à vérifier**. Toutes les fonctions
   du langage sont continues sur leur domaine, et somme, produit, quotient et
   composée de fonctions continues le sont là où elles sont définies. Une
   expression à un seul morceau est donc continue par théorème, pas par chance.
   Une discontinuité ne peut apparaître que là où la _définition_ change,
   c'est-à-dire à un raccord. (Ce théorème dépend de la liste des fonctions :
   ajouter `floor`, `sign` ou un modulo le casserait.)
4. Le message nomme le point et donne les deux limites, parce que c'est
   exactement ce qu'il faut savoir pour corriger :

   > La fonction est discontinue en x = 2 : elle vaut 4 en arrivant par la
   > gauche et 7 par la droite. Seules les fonctions continues peuvent être
   > tirées — raccorde tes morceaux.

Un refus **ne consomme pas le tour**. Le joueur corrige et retire.

Deux cas voisins ne sont **pas** des refus : un raccord où la fonction n'a pas
de valeur d'un côté est un bord de domaine, et un raccord où les deux limites
coïncident mais où le point lui-même n'a pas de valeur est un trou. Dans les
deux cas le tir part et s'arrête là, sans rien refuser.

Une asymptote verticale rencontrée _en cours de tracé_ (`tan`, `1/x`) n'est pas
un motif de refus : la fonction est continue sur son domaine, et la courbe
s'arrête simplement en arrivant au pôle. La distinction est volontaire — refuser
`tan(x)` d'emblée priverait le jeu d'une de ses armes les plus intéressantes.

### Bornes

Ces limites ne sont pas des réglages : elles garantissent qu'une entrée
hostile coûte moins d'une milliseconde.

| Borne                 | Valeur         |
| --------------------- | -------------- |
| Longueur de la source | 512 caractères |
| Profondeur de l'arbre | 32             |
| Nœuds de l'arbre      | 512            |
| Morceaux              | 8              |
| Évaluations par tir   | 200 000        |
| Points de polyligne   | 20 000         |

## 4. Équilibrage : pas de mise à mort facile au premier tour

Trois garde-fous, cumulables, tous réglables par salon.

### Placement garanti

Le générateur rejette toute carte où deux joueurs sont reliés par une courbe
**triviale** — la droite qui les joint et les arcs à ±5 % de la hauteur de
carte, dans les deux orientations. C'est ce qu'un joueur tape dans ses trente
premières secondes, et cette règle ne dépend d'aucun réglage.

Et il rejette tout autant une carte où **aucune** courbe ne les relie. C'est
l'autre moitié de la règle, et elle n'est pas décorative : boucher toutes les
paraboles revient à boucher la joignabilité elle-même, et produit des cartes que
personne ne peut gagner. Mesuré, documenté, corrigé — voir
[ADR 0011](adr/0011-placement-rule-must-cut-both-ways.md).

### Trois difficultés de terrain

| Difficulté  | Rien de trivial ne passe | Une fonction continue passe | Une parabole passe |
| ----------- | ------------------------ | --------------------------- | ------------------ |
| `facile`    | exigé                    | garanti par la parabole     | **exigé**          |
| `moderee`   | exigé                    | **exigé**                   | indifférent        |
| `difficile` | exigé                    | **exigé**                   | **interdit**       |

« Une fonction continue passe » se vérifie exactement, pas au jugé : l'espace
libre entre les deux joueurs doit être **connexe le long d'un balayage
monotone** — `x` croissants, `x` décroissants, `y` croissants ou `y`
décroissants. Un chemin dans ce graphe _est_ le graphe d'une fonction continue.
Voir [ADR 0014](adr/0014-difficulty-and-team-separation.md).

Mesuré sur huit terrains à deux joueurs, 12 000 tirs pris au hasard dans une
famille large : `facile` 0,16 % de réussite, `moderee` 0,17 %, `difficile`
**0,00 %** — alors que le terrain reste traversable par construction. En
difficile, il n'y a rien à trouver en balayant un coefficient : il faut
inventer.

### Qui se place où

Deux distances minimales, pas une :

- **coéquipiers** : `spawnMinDistanceAllies`, 12 unités par défaut ;
- **adversaires** : `enemySeparationFraction` de la largeur du terrain, **0,45**
  par défaut, soit 45 unités sur 100.

0,5 était la proposition initiale ; à quatre ennemis mutuels c'est
géométriquement impossible sur la zone utile de 88 × 48. 0,45 tient à quatre,
mesuré.

Après `maxGenerationAttempts` échecs, `ERR_MAP_GENERATION_FAILED` : le
générateur refuse plutôt que de livrer une carte injouable.

**Le rayon de hitbox et la bande scellée sont couplés.** La bande triviale
mesure ±5 % de la hauteur de carte, soit ±3 unités par défaut, pour un rayon de
1,5 : la cible tient dans la bande, et le scellement mord. Un hôte qui monte
`playerRadius` à 5 sur une petite carte obtient une cible plus large que la
bande, et le premier tir plat gagne — mesuré. Élargir la bande en proportion a
été essayé : la génération à quatre joueurs s'effondre de 30/30 à 1/30 et coûte
douze secondes. Le couplage est donc laissé tel quel, documenté, et confié à la
campagne d'équilibrage BA-3 ; en attendant, ne montez pas le rayon sans baisser
la distance entre joueurs.

**Plafond : quatre joueurs**, inscrit dans les contrats
([ADR 0012](adr/0012-four-players.md)). Au-delà, les deux contraintes ne sont
pas satisfiables et agrandir le terrain n'y change rien. Le mode équipes se
joue donc à 2 contre 2.

C'est le garde-fou le plus important : il agit sur la cause plutôt que sur le
symptôme. Le générateur ne se contente pas d'espérer : il place les joueurs,
répand un peu de couvert, puis **bouche** une à une les courbes qui restent
ouvertes.

Le plafond de couverture (`maxCoverage`, 0,35) est un plafond, pas une cible.
Un duel n'en utilise qu'un tiers ; c'est à huit joueurs, où vingt-huit paires
doivent être bouchées, qu'il devient contraignant. Mesuré sur 20 graines : à
0,28 la génération à huit échoue une fois sur dix et coûte 300 ms, à 0,35 elle
réussit toujours et coûte 100 ms. Les cartes de duel ne s'en trouvent pas plus
encombrées, puisqu'elles n'approchent jamais le plafond.

### Bouclier de départ

Chaque joueur est invulnérable pendant `shieldTurns` tours (défaut : **2**),
avec un indicateur visuel. Un tir qui touche un joueur protégé le traverse : le
tir n'est pas arrêté, et le `Hit` est marqué `absorbedBy: 'shield'` — le tireur
apprend donc qu'il a visé juste, et le protégé apprend qu'il est visé.

Le compte se fait en **tours du joueur lui-même**, pas en manches : le bouclier
décroît à la fin de son propre tour, qu'il ait tiré, passé ou été absent. « Tu
es tranquille pendant tes deux premiers tours » est ce qu'un joueur comprend en
lisant l'indicateur, et c'est robuste à une élimination ailleurs dans l'ordre,
ce qu'un compteur de manches ne serait pas.

### Immunité de départ du tireur

Un tir part **à l'intérieur de la hitbox de son auteur**. Sans garde-fou, tout
tir tuerait son tireur sur place. Il est donc invulnérable à son propre tir sur
les `selfImmunityArc` premières unités de longueur d'arc (défaut : **3**).

Ce réglage doit rester supérieur au rayon de hitbox (1,5 par défaut), sinon
l'immunité expire avant que la courbe n'ait quitté le tireur, et il meurt de son
propre tir.

Une précision qui a son importance, et qui n'était pas comprise au moment
d'écrire le brief : **une courbe ne peut pas revenir sur son auteur.** Elle est
le graphe d'une fonction de `x`, et le tracé s'éloigne de `x₀` de façon
monotone ; il ne repasse donc jamais par l'abscisse du tireur. Se tuer soi-même
en bouclant est impossible — l'immunité de départ protège du départ, et de
rien d'autre.

### Budget de complexité (facultatif, désactivé par défaut)

`complexityBudget` plafonne le nombre de nœuds d'AST d'un tir. Sert à un mode
« duel simple » ; hors de ce mode, `null`.

## 5. Modes de jeu

| Mode    | Victoire                                 | Tir ami                        |
| ------- | ---------------------------------------- | ------------------------------ |
| `ffa`   | Dernier joueur vivant                    | sans objet                     |
| `teams` | Dernière équipe ayant au moins un vivant | réglable, désactivé par défaut |

Une partie en équipes exige **au moins deux équipes** : s'il n'y en a qu'une,
elle a gagné dès la première résolution, avant que personne n'ait joué. Le
moteur refuse la partie plutôt que de la laisser se terminer toute seule
(`ERR_NOT_ENOUGH_TEAMS`).

Un joueur sans équipe en mode équipes compte comme son propre camp : il ne peut
donc pas gagner « avec » quelqu'un d'autre par accident.

Si la dernière résolution élimine tous les survivants restants, la partie est
nulle.

L'ajout d'un mode se fait en ajoutant un objet de règles, jamais en modifiant
les modes existants.

## 6. Le tour

- Séquentiel par défaut, dans un ordre tiré de la graine à la création.
- `turnDurationMs` (défaut : **60 s**). À l'expiration, le tour est passé
  automatiquement : aucun tir, `skipped: 'timeout'`.
- Un joueur déconnecté conserve son siège ; ses tours sont passés jusqu'à son
  retour.
- **Résolution simultanée** : prévue dans les règles
  (`simultaneousResolution`), non implémentée. L'ordre de résolution des tirs
  croisés est une décision de design qui reste à prendre, explicitement.

## 7. Ce qui reste ouvert

- **La durée d'une partie.** Mesuré : un joueur qui tire au hasard dans une
  famille raisonnable de fonctions met environ 220 tirs à en éliminer un autre,
  soit un taux de réussite de l'ordre de 0,5 % par tir. Un joueur humain, qui
  voit où son tir s'est arrêté et corrige, fait beaucoup mieux — de combien
  reste à mesurer, et c'est l'objet de la campagne d'équilibrage BA-3. Les
  leviers connus : rayon de hitbox, distance entre les points d'apparition,
  densité d'obstacles.
- Le bot : stratégie et niveaux (phase 6).
- Le format des rejeux partageables (phase 6).
- L'ordre de résolution en mode simultané (voir plus haut).
