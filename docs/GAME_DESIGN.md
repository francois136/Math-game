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

Deux distances minimales, pas une, et toutes deux **en unités de monde** :

- **coéquipiers** : `spawnMinDistanceAllies`, 12 unités par défaut ;
- **adversaires** : `spawnMinDistanceEnemies`, **45 unités** par défaut, soit
  près de la moitié de la largeur du terrain à deux joueurs.

0,5 de la largeur était la proposition initiale ; à quatre ennemis mutuels c'est
géométriquement impossible sur la zone utile de 88 × 48.

Ce qui s'adapte à l'effectif, c'est **le terrain, pas la distance**
(`sizedForSeats`, [ADR 0015](adr/0015-the-board-grows-with-the-lobby.md)) : ×1
jusqu'à quatre joueurs, ×1,3 à cinq, ×1,6 au-delà, le nombre d'obstacles suivant
l'aire. Plus de joueurs ne veut donc pas dire des ennemis plus proches, mais
plus de place. Une distance exprimée en fraction du terrain aurait fait
l'inverse : exiger un écart plus grand au moment précis où il y a plus de monde
à loger.

Un terrain **plus petit** que celui par défaut doit baisser
`spawnMinDistanceEnemies` en proportion : 45 unités ne traversent pas un plateau
large de 50, et aucune carte ne sortira.

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

**Le plafond de joueurs dépend de la difficulté du terrain**
([ADR 0015](adr/0015-the-board-grows-with-the-lobby.md)) :

| difficulté | joueurs au plus | coût d'une carte au plafond |
| ---------- | --------------- | --------------------------- |
| facile     | 5               | 356 ms                      |
| difficile  | 7               | 1,2 s                       |
| modérée    | **8**           | 326 ms                      |

C'est `facile` qui plafonne le plus bas, et pour une raison structurelle : elle
promet qu'une parabole relie **chaque** paire, or le nombre de paires croît
comme le carré de l'effectif. La connexité monotone, elle, tient à huit sans
effort. Six joueurs en `facile` sortent bien une carte sur seize, mais à trois
secondes et demie de serveur bloqué pièce — un prix qu'un salon n'a pas à payer.

Le refus est précoce et lisible : `createMatch` rend
`ERR_TOO_MANY_SEATS_FOR_DIFFICULTY` avant même d'appeler le générateur, et le
salon désactive « Lancer » en disant quelle difficulté choisir.

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
- **Résolution simultanée** (`simultaneousResolution`, réglable au salon,
  désactivée par défaut) : chacun écrit sa fonction, puis **tout se résout d'un
  coup**. Le round se ferme dès que tous les vivants ont répondu, ou à
  l'échéance — les silencieux comptant comme des tours expirés.

  Toutes les courbes sont tracées contre le **même état**, celui d'avant le
  round, et les éliminations s'appliquent ensemble
  ([ADR 0019](adr/0019-simultaneous-shots-are-all-fired-at-once.md)). C'est la
  seule règle qui ne dépende d'aucun ordre : permuter les joueurs ne change pas
  le résultat, et c'est testé. Deux conséquences, voulues :

  - **le double KO existe** — deux joueurs qui se touchent meurent tous les
    deux, et si c'étaient les deux derniers, la partie est nulle ;
  - **on peut toucher un mort** — une courbe qui traverse quelqu'un qu'un autre
    tir du même round a tué compte quand même, parce que les deux tirs sont
    partis au même instant.

  Un tir soumis ne se retire pas. Le simultané troque l'attente contre
  l'engagement — ce qui, à huit joueurs, remplace sept tours d'attente par un.

## 7. Ce que la campagne d'équilibrage a mesuré

`pnpm run balance` fait jouer des bots les uns contre les autres et imprime ce
qui s'est passé. Tout vient d'une graine : les nombres ci-dessous se
reproduisent avec la même commande.

### La durée d'une partie

Duels, règles par défaut (bouclier de deux tours, rayon 1,5), 120 parties par
case. « Tours » est la médiane des parties allées à leur terme ; une partie non
finie en 200 tours est comptée nulle.

| terrain   | débutant             | confirmé      | redoutable    |
| --------- | -------------------- | ------------- | ------------- |
| facile    | 57 tours (67 finies) | 19 tours (95) | 5 tours (116) |
| modérée   | 52 tours (68)        | 18 tours (98) | 5 tours (114) |
| difficile | 50 tours (15)        | 42 tours (37) | 14 tours (67) |

Ce que ça dit :

- **Un joueur qui corrige d'un tir sur l'autre élimine en une vingtaine de
  tours.** Le chiffre de 220 tirs qui traînait dans ce document décrivait un
  tireur qui ne regarde pas où sa courbe s'est arrêtée. Regarder change tout,
  d'un facteur dix.
- **La difficulté du terrain porte sur le problème, pas sur l'interface.** En
  `difficile`, un bot débutant ne conclut que 15 parties sur 120 : il n'y a rien
  à trouver en balayant un coefficient. Le bot le plus fort y met 14 tours, soit
  presque trois fois ce qu'il met ailleurs, et laisse encore 53 parties sur 120
  sans vainqueur au bout de deux cents tours.
- **`facile` et `moderee` se jouent presque pareil** pour un joueur qui cherche.
  L'écart entre les deux est réel pour qui balaie une famille de paraboles, et
  s'efface pour qui regarde le terrain — ce qui est cohérent avec ce que chacune
  garantit.

### Le rayon de hitbox — dette fermée

C'était le point ouvert le plus dangereux, et la mesure est sans appel : au-delà
de la bande scellée, **tous** les tirs touchent. `playerRadius` est désormais
borné ([ADR 0017](adr/0017-a-player-fits-inside-the-sealed-band.md)), et une
configuration hors borne ne démarre plus.

## 8. Ce qui reste ouvert

- Le format des rejeux partageables (phase 6).
- L'équilibrage à plus de deux joueurs n'a pas été mesuré : la campagne le sait
  faire (`--seats`), personne ne l'a encore lancée.
