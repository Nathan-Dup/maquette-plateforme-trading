# Maquette plateforme trading

Maquette interactive du site : la vitrine publique et l'application que le trader utilise une fois connecté.

## Écrans

| Fichier | Écran |
|---|---|
| `project/Main.dc.html` | Page d'accueil (site public) |
| `project/Fonctionnalites.dc.html` | Fonctionnalités (site public) |
| `project/Tarifs.dc.html` | Tarifs (site public) |
| `project/Connexion.dc.html` | Inscription / Connexion |
| `project/Structure.dc.html` | Plan du site |
| `project/Dashboard.dc.html` | Tableau de bord (après connexion) |
| `project/Journal.dc.html` | Journal : Trades, Statistiques, Calendrier, Exporter |
| `project/Statistiques.dc.html` | Journal ouvert sur l'onglet Statistiques |
| `project/Importer.dc.html` | Importer des trades (fichier, connexion broker, historique) |
| `project/NouveauTrade.dc.html` | Ajouter un trade à la main |
| `project/canvas.json` | Disposition des écrans sur le canevas |

## Comment s'en servir

Ces fichiers sont au format `.dc.html` de l'éditeur de design de Claude. Pour les voir et les modifier, ouvre la maquette en ligne :
https://claude.ai/artifact/LYndqZSNUCmNTQjJTNDWc8

Ils ne s'ouvrent pas seuls dans un navigateur : ils ont besoin du moteur de l'éditeur (`support.js`), qui ne fait pas partie de ce dépôt.

## Notes pour le développement

- Toutes les données (trades, prix, news) sont des exemples générés pour la maquette.
- Une seule liste de trades doit alimenter tous les écrans : Tableau de bord, Journal, Statistiques, Calendrier et Coach IA.
- Le capital de référence est fixé à 20 000 € pour les calculs en %. Dans le vrai produit, il sera réglé par le trader.
- `[NOM]` et `[BROKER]` sont à remplacer.
