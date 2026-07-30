# 0010 — Le plafond de couverture par défaut passe à 0,35

- **Statut** : accepté
- **Date** : 2026-07-30

## Contexte

`maxCoverage` borne la part de la carte que les obstacles peuvent occuper. Elle
valait 0,28, choisie à vue avant que le générateur n'existe.

Le générateur, lui, est constructif : il place les joueurs, répand un peu de
couvert, puis bouche les courbes simples qui relient encore deux joueurs. Le
nombre de courbes à boucher croît comme le carré du nombre de sièges — une
paire à deux joueurs, vingt-huit à huit.

Mesure sur 20 graines, huit sièges :

| `maxCoverage` | Succès | Temps moyen |
| ------------- | ------ | ----------- |
| 0,28          | 18/20  | 309 ms      |
| 0,35          | 20/20  | 107 ms      |
| 0,45          | 20/20  | 103 ms      |

À 0,28, l'échec n'est pas un hasard : le budget est épuisé avant que toutes les
lignes soient fermées, et le générateur brûle ses tentatives à redécouvrir la
même impasse.

## Décision

`DEFAULT_MAP_PARAMS.maxCoverage` passe de 0,28 à 0,35. Le schéma reste borné à
0,6.

## Conséquences

- Les cartes à deux joueurs ne changent pas : elles plafonnent à 0,11 de
  couverture, très loin du plafond. Relever un plafond que personne n'atteint
  ne coûte rien.
- Une partie à huit démarre maintenant sans risque d'échec de génération, en
  un dixième de seconde.
- 0,45 n'apporte plus rien : la contrainte n'est plus le budget.
- Ce nombre est un réglage d'équilibrage : il vit dans `MatchConfig`, un hôte
  de salon peut le changer, et il est enregistré avec la partie.
