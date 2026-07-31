# @fw/client

**Propriétaire : agent Client.** React + Canvas 2D, servi par Vite.

```bash
pnpm run serve      # dans un terminal : le serveur
pnpm --filter @fw/client dev   # dans un autre : l'interface, http://localhost:5173
```

Le client **affiche**. Il ne décide de rien : ni qui meurt, ni où la courbe
s'arrête, ni de qui est le tour.

## La prévisualisation, et sa frontière

Le champ de saisie dessine la courbe pendant qu'on la tape, en pointillé bleu.
Elle **ignore les obstacles et les joueurs** : elle montre la forme de la
courbe, pas où le tir s'arrêtera. Le tracé qui compte arrive du serveur, en
trait plein orange, avec un point rouge là où il s'est arrêté. Les deux styles
sont volontairement dissemblables ; un joueur ne doit jamais se demander lequel
il regarde.

Un interrupteur permet de **l'activer ou de la désactiver**, et le réglage
survit à un rechargement de page. Désactivée, elle n'est pas calculée du tout —
c'est la différence qui compte sur une machine lente.

La garantie est mécanique, pas déclarative : `package.json` ne déclare ni
`@fw/physics` ni `@fw/rules`, et la CI échoue si cela change
([ADR 0006](../../docs/adr/0006-client-side-curve-preview.md)).

## Ce qu'il reste à faire

- **Le hot-seat dans le navigateur** (CL-7) n'est pas fait. Il demanderait
  d'importer `@fw/rules` et `@fw/physics` côté client, donc de renoncer à la
  vérification ci-dessus. `pnpm run hotseat` couvre le besoin en terminal ; la
  question se retranchera si le besoin revient.
- Écrans de configuration de salon (équipes, réglages) : seuls « prêt » et
  « lancer » existent.

## Tests

- `preview.ts` et `state.ts` sont purs et testés par Vitest : ce sont les deux
  seuls endroits où le client raisonne.
- `pnpm --filter @fw/client run e2e` lance Playwright contre un vrai serveur et
  un vrai navigateur : deux joueurs, un salon, un tir, une fonction refusée, et
  l'interrupteur de prévisualisation.
