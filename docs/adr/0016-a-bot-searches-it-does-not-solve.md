# 0016 — Un bot cherche, il ne résout pas

- **Statut** : accepté
- **Date** : 2026-07-31

## Contexte

Il faut un adversaire pour jouer seul, et pour mesurer l'équilibrage (BA-3).
La question n'est pas de savoir s'il faut un bot, mais ce qu'un bot a le droit
de savoir.

La tentation évidente est de lui faire calculer une trajectoire : étant donné
deux points et des obstacles, résoudre pour les coefficients qui passent.
C'est impossible, et c'est heureux — l'ADR 0011 construit précisément des
terrains où aucune famille simple ne relie deux joueurs. Un bot capable de
résoudre serait un bot qui lit la carte d'une façon interdite au joueur.

## Décision

**Le bot échantillonne.** Il tire une famille (droite, parabole, cubique,
sinus, racine) et ses paramètres, écrit la fonction, la trace, et regarde à
quelle distance la courbe est passée de sa cible. Il garde le meilleur essai.
Le niveau est le **nombre d'essais**, plus une passe de raffinement autour du
plus proche raté pour le niveau le plus fort.

**Il écrit du texte source**, pas un arbre syntaxique, et le passe au parseur
dans lequel un joueur tape. Un bot capable de soumettre ce qu'aucun joueur ne
pourrait écrire serait un autre jeu ; et ses fonctions finissent dans le
journal de partie, où un humain les lit et peut les réutiliser.

**Il franchit la même porte qu'un joueur** : parseur, limites statiques,
vérification de continuité. Il ne peut donc pas plus qu'un joueur tirer une
fonction discontinue.

**Il ne passe jamais son tour.** Quand tout est raté, il tire le moins raté.
Un bot qui passe pour cause de mauvaise pioche est un bot qui fait traîner la
partie sans que personne comprenne pourquoi.

**Le choix de l'axe et du sens vient de la géométrie**, pas du hasard : la
courbe ne s'éloigne de son origine que dans un sens, donc tirer vers un mur est
un tour perdu d'avance. Ce n'est pas viser, c'est refuser de tirer à l'envers.

## Conséquences

- Un bot est aussi coincé qu'un joueur sur un terrain `difficile` — mesuré :
  le plus fort n'y conclut que 27 duels sur 60 en 120 tours. C'est la preuve
  que la difficulté porte sur le problème, pas sur l'interface.
- Le niveau `redoutable` coûte 220 tracés, soit environ 70 ms de serveur bloqué
  par coup. Une partie à huit bots redoutables gèle donc le serveur d'un demi-
  seconde entre deux coups humains. Acceptable aujourd'hui, inscrit dans
  `TASKS.md`.
- Sans bouclier de départ, le bot redoutable gagne au premier tour deux fois
  sur cinq. Le bouclier n'est donc pas un confort : c'est ce qui empêche une
  partie d'être décidée avant d'avoir commencé.
- Le bot vit dans son propre paquet, qui dépend de `@fw/rules` pour savoir qui
  est vulnérable. Dupliquer cette doctrine aurait été la faire diverger le jour
  où un mode de jeu s'ajoute.
