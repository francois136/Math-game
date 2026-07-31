# 0011 — La règle de placement doit couper dans les deux sens

- **Statut** : amendé par [0014](0014-difficulty-and-team-separation.md) puis
  [0015](0015-the-board-grows-with-the-lobby.md) — la règle « une parabole passe »
  n'est plus exigée qu'en `facile`
- **Date** : 2026-07-30

## Contexte

Le brief demande que « le générateur de map vérifie qu'aucune droite ni
parabole simple ne relie deux joueurs sans obstacle sur le chemin ». Le
générateur a d'abord fait exactement cela, et la carte est devenue injouable.

Mesures, 12 cartes à deux joueurs, 1 648 tirs par carte pris dans une famille
large (sinusoïdes de toutes amplitudes et périodes, polynômes, exponentielles),
puis 4 000 tirs à coefficients continus, comme un joueur qui ajuste :

| Terrain                                    | Cartes gagnables | Tirs qui touchent  |
| ------------------------------------------ | ---------------- | ------------------ |
| Carte vide, sans obstacle                  | 12/12            | 188 / 1 648 (11 %) |
| Carte générée, règle stricte               | 2/12             | 4 / 1 648 (0,2 %)  |
| Carte générée, recherche fine à 4 000 tirs | 5/12             | 0,00 % à 0,22 %    |

Le diagnostic tient en une phrase : **l'ensemble des courbes qui passent par
l'adversaire est presque exactement l'ensemble des paraboles qui le relient au
tireur.** Sceller la seconde famille scelle la première. On n'obtient pas « pas
de tir facile » mais « pas de tir du tout ».

Baisser la hauteur des paraboles bloquées n'y change presque rien : à ±6 % de
la hauteur de carte au lieu de ±50 %, on passe de 2/12 à 5/12 cartes gagnables.
Ne sceller que la droite donne 10/12, mais laisse encore deux cartes où
personne ne peut jamais toucher personne.

## Décision

La contrainte devient **bilatérale**. Une carte n'est valide que si, pour
chaque paire de joueurs :

1. **aucune** courbe de la famille _triviale_ — la droite et les arcs à ±5 % de
   la hauteur de carte — ne passe ; c'est la règle anti-tir-facile du brief ;
2. **au moins une** courbe de la famille _large_ — arcs jusqu'à une hauteur de
   carte de part et d'autre — passe.

`MapValidation` gagne `unreachablePairs` en regard de `exposedPairs`. La passe
de bouchage teste chaque obstacle candidat avant de le poser : s'il fermait la
dernière voie d'une paire, il est refusé et une autre position est essayée.

## Conséquences

- Une carte rendue est jouable, et le générateur **refuse** plutôt que de
  livrer une carte que personne ne pourrait gagner.
- **Plafond mesuré : quatre joueurs.** À cinq c'est intermittent, à six et plus
  les deux contraintes ne sont pas satisfiables avec les paramètres par défaut,
  et agrandir la carte n'y suffit pas — vérifié jusqu'à quatre fois la surface.
  Avec vingt-huit paires à huit joueurs, les droites à sceller forment un
  maillage si dense que le milieu du terrain se sature.
  C'est un point d'équilibrage ouvert, inscrit dans `TASKS.md`, et une décision
  qui appartient au superviseur : plafonner les salons, ou renoncer à la règle
  de placement au-delà de quatre joueurs et s'en remettre au bouclier de départ.
- Le taux de réussite d'un tir à l'aveugle sur une carte valide est de l'ordre
  du pour cent. Un joueur qui voit où son tir s'est arrêté et corrige fait
  évidemment beaucoup mieux ; c'est la boucle de jeu, et elle reste à mesurer
  en phase 6.
- Les blocs de bouchage sont posés dans le tiers central. Les poser près d'un
  joueur bouche bien plus de courbes d'un coup — et emmure le joueur : tous ses
  tirs meurent en quelques unités, quoi qu'il écrive.
