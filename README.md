# Maquette plateforme trading

Maquette interactive du site : la vitrine publique et l'application que le trader utilise une fois connecté.

Maquette en ligne (pour la voir et cliquer dedans) : https://claude.ai/artifact/LYndqZSNUCmNTQjJTNDWc8 — ce lien n'est plus accessible en modification ; la version à jour des écrans est dans ce dépôt (branche `site`).

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
| `project/Statistiques.dc.html` | Copie du Journal qui s'ouvre directement sur l'onglet Statistiques |
| `project/Importer.dc.html` | Importer des trades (fichier, connexion broker, historique) |
| `project/NouveauTrade.dc.html` | Ajouter un trade à la main |
| `project/Backtesting.dc.html` | Backtesting : mes sessions, nouvelle session, réel vs backtest |
| `project/Replay.dc.html` | Backtesting : replay bougie par bougie avec prise de positions et marqueurs de news |
| `project/News.dc.html` | News : calendrier économique, résultats d'entreprises, actualités, alertes |
| `project/Marche.dc.html` | État du marché : biais par actif d'après les news, et réactions de l'actif |
| `project/news-logic.js` | Module de calcul commun (surprise, réactions, verdict, score, heures de marché, tags des trades). Aucune donnée ni affichage |
| `project/donnees-exemple.js` | Données d'exemple (calendrier économique, prix minute). Seul fichier à remplacer pour brancher une vraie API |
| `tests/news-logic.test.js` | Tests du module de calcul : `node --test tests/news-logic.test.js` |
| `project/canvas.json` | Disposition des écrans sur le canevas |

## Ce que fait l'application

**Menu de gauche** : Tableau de bord seul en haut, puis OUTILS (Journal, Statistiques, Backtesting, News, État du marché, Coach IA), puis COMPTE (Paramètres, Aide).

**Comptes**
- Sélecteur en haut de page : un, plusieurs ou tous les comptes à la fois.
- Ajouter un compte (nom, type Réel / Prop firm / Démo, plateforme, capital) et supprimer un compte avec confirmation.
- Les rendements et drawdowns en % sont calculés sur le capital des comptes sélectionnés.

**Journal**
- Liste des trades triable, avec un panneau de détail : graphique simplifié, excursions max, et comparaison avec les trades du même actif, de la même session et de la même heure.
- Filtres : la période reste visible, et marché, sens, résultat et actif sont regroupés derrière un bouton « Filtres ».
- Calendrier de performance mensuel.
- Export CSV (réel), Excel et rapport PDF (simulés dans la maquette).

**Statistiques**, en 5 sous-onglets :
1. Vue d'ensemble : conseils automatiques, chiffres clés, courbe de capital et drawdown, distribution des résultats, comparaison des comptes, toutes les statistiques (frais compris).
2. Heures et sessions : tableau jour × heure, sessions, jours de la semaine.
3. Actifs et sens : par actif, long / short.
4. Comportement : résultat selon le nombre de trades dans la journée et après un gain ou une perte, émotions, durée des trades.
5. Évolution : comparaison avec la période précédente, progression sur les 20 derniers trades, performance par mois.

**Règle des 15 trades** : toutes les statistiques sont toujours affichées. Les conseils rédigés automatiquement (meilleure session, meilleur créneau, analyses du Coach IA) n'apparaissent qu'à partir de 15 trades sur la sélection.

**Backtesting**
- Liste des sessions (en cours ou terminées) avec progression, trades, réussite et résultat en R.
- Nouvelle session : un ou plusieurs actifs (4 maximum), unité de temps (M15, H1, H4), période, capital, risque par trade.
- Replay : lecture, pause, bougie suivante, vitesse ×1 à ×4. Ordres Acheter / Vendre avec stop (serré, normal, large) et objectif (1:1 à 1:3). Fermeture automatique au stop ou à l'objectif. Stop au point d'entrée, clôture manuelle, niveaux horizontaux, bilan de fin de session.
- Plusieurs actifs dans une session : un onglet par actif dans le replay, même ligne de temps pour tous, une position possible sur chaque actif.
- Onglet Statistiques : chiffres clés, courbe des résultats en R, par actif, par session, long / short, par jour, distribution des résultats, conseils à partir de 15 trades de test, filtres par session et par actif.
- Réel vs backtest : comparaison d'une session avec les vrais trades sur les mêmes actifs.
- Les trades de test restent séparés des statistiques réelles. Dans la maquette, les prix sont simulés ; le vrai produit aura besoin de données historiques de marché.

**News**
- Calendrier économique de la semaine (heures de Paris) : vue de la semaine avec les journées chargées, frise « zones à éviter » (sessions Asie / Londres / New York, ±15 min autour des news fortes et moyennes de mes actifs, réglable), compte à rebours sur chaque annonce à venir.
- Une fois le chiffre sorti : valeur réelle en vert ou rouge selon l'effet sur la devise, badge « forte surprise » et lecture courte (« Surprise positive : plutôt haussier USD, baissier or »).
- En dépliant une annonce : « Pourquoi ça compte » et la réaction moyenne de chacun de mes actifs aux 12 dernières publications.
- Résultats d'entreprises vus depuis le NAS100 : poids dans l'indice, mouvement attendu, effet potentiel sur l'indice, réaction moyenne du NAS100.
- Actualités filtrables par catégorie et par actif, avec un résumé d'une ligne.
- Alertes : avant une annonce (X minutes avant, réglable), sur la surprise (« si le réel s'écarte de plus de N de la prévision »), sur des résultats ou un mot-clé.

**État du marché** (EUR/USD, XAU/USD, NAS100, BTC/USD)
- Biais Haussier / Baissier / Neutre / Mitigé et score de −100 à +100 calculés à partir des dernières news : sens attendu × surprise normalisée × poids d'impact, avec une demi-vie de 24 h de marché ouvert (le week-end ne fait pas vieillir une news), poids divisé par deux si le marché a contredit la news.
- News dominante, phrase d'explication, prochaine news à fort impact avec compte à rebours.
- Les 10 dernières news de l'actif en vue compacte (une ligne par news, détail au clic) ou détaillée : surprise, sens attendu, réaction à +5 min / +15 min / +1 h, verdict « A fait bouger » / « Peu d'effet » avec ✓ / ✗, mini-graphique.

**News et trades**
- Replay : marqueurs des news sur le graphique (couleur selon l'impact) et rappel de la prochaine news forte.
- Tag automatique « pris près d'une news forte » sur les trades de backtest et réels (30 min par défaut, réglable dans Backtesting).
- Backtesting, onglet Statistiques : réussite, expectancy et nombre de trades avec ou sans news à proximité, phrase de conclusion, « échantillon trop faible » sous 30 trades dans un groupe.

**Nouvel utilisateur** : un écran d'accueil propose de connecter son broker, d'importer un fichier ou de saisir un trade. Il est visible avec le réglage « nouvelUtilisateur ».

## Comment s'en servir

Ces fichiers sont au format `.dc.html` de l'éditeur de design de Claude. Ils ne s'ouvrent pas seuls dans un navigateur : ils ont besoin du moteur de l'éditeur (`support.js`), qui ne fait pas partie de ce dépôt. Pour les voir et les modifier, utilise la maquette en ligne.

## Notes pour le développement

Cette maquette sert de cahier des charges visuel et fonctionnel. Ce n'est pas du code de production.

- Toutes les données (trades, prix, news, frais) sont des exemples générés pour la maquette.
- Une seule liste de trades doit alimenter tous les écrans : Tableau de bord, Journal, Statistiques, Calendrier et Coach IA.
- Dans la maquette, les pages se transmettent la période, les comptes et les trades ajoutés par le stockage de session du navigateur. Dans le vrai produit, tout cela vient de la base de données.
- `Statistiques.dc.html` est une copie de `Journal.dc.html`. Dans le vrai produit, ce sera la même page avec un paramètre d'URL.
- Points à traiter : fuseaux horaires et changement d'heure, trades fermés en plusieurs fois, stop loss manquant pour le calcul en R, devise des comptes, taille de position, coût de la connexion aux brokers.
- Tous les seuils des calculs de news sont regroupés dans `SEUILS`, en haut de `project/news-logic.js` (forte surprise, verdict, demi-vie, zones à éviter, fenêtre « près d'une news », taille d'échantillon…). La même tête de fichier contient `MES_ACTIFS`, la table des effets attendus `EFFETS`, `INSTRUMENTS` et les horaires d'ouverture `HORAIRES_MARCHE`.
- La maquette est figée au vendredi 6 novembre 2026, 13:03 à Paris (`MAINTENANT` dans `project/donnees-exemple.js`), juste avant le NFP de 14:30.
- `[NOM]` et `[BROKER]` sont à remplacer.
