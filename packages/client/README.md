# @fw/client

**Propriétaire : agent Client.** React + Canvas 2D, servi par Vite.

Le client **affiche**. Il ne décide de rien : ni qui meurt, ni où la courbe
s'arrête, ni de qui est le tour.

## Ce qu'il faut construire

1. **Rendu Canvas** : carte, obstacles, joueurs, boucliers, courbe animée le
   long de la polyligne reçue, marqueur au point d'arrêt.
2. **Saisie de fonction** avec prévisualisation en direct, y compris la syntaxe
   par morceaux. Erreurs affichées sous le champ, en français, telles que le
   serveur les a formulées.
3. **Salon** : création, code d'invitation, équipes, réglages, prêt, démarrage.
4. **Mode hot-seat et bot** : la même interface, branchée sur `@fw/rules` en
   local au lieu du réseau. C'est ce qui permet de jouer sans serveur.

## La seule chose que le client calcule

La **prévisualisation** de la courbe : le client importe `@fw/core-math` pour
évaluer `f` et dessiner le trait avant le tir. Cette courbe ignore les
obstacles, les joueurs et les collisions — elle ne dit pas où le tir
s'arrêtera. Le tracé qui compte vient du serveur (ADR 0006).

C'est la seule dérogation, et elle est bornée : le client n'importe jamais
`@fw/physics` ni `@fw/rules` en mode réseau.

## Interdits

- Recalculer, deviner ou anticiper une élimination.
- Afficher un état que le serveur n'a pas confirmé.
- Coder en dur une constante d'équilibrage : elles viennent de `@fw/contracts`.

## Critères d'acceptation

- Playwright : une partie hot-seat complète, du salon à l'écran de victoire.
- Playwright : saisie d'une fonction discontinue, message d'erreur affiché,
  tour non consommé.
- Capture d'écran comparée : courbe, obstacles et hitboxes alignés sur les
  coordonnées monde.
