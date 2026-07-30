# @fw/cli

**Propriétaire : agent QA/DevOps.**

Une démonstration, pas un jeu. Elle sert à voir de ses yeux ce que les paquets
purs produisent, sans serveur, sans navigateur et sans attendre le client.

```bash
pnpm demo                                   # carte par défaut, tir d'exemple
pnpm demo --seed bravo --f "x^2/10" --from 0 --dir increasing
pnpm demo --f "{ 0 si x < 5 ; 9 sinon }"    # refusée, avec le message du joueur
```

Ce qu'elle fait : génère une carte depuis une graine, place les joueurs, valide
la fonction saisie (analyse puis continuité), trace le tir et dessine le tout
en ASCII avec la raison d'arrêt.

Ce qu'elle **ne** fait pas : gérer des tours, des éliminations ou une victoire.
Cette logique appartient à `@fw/rules`, qui n'existe pas encore ; la dupliquer
ici pour faire joli serait la première fissure de l'architecture.
