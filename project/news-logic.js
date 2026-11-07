/*
 * news-logic.js — calculs communs des pages News, État du marché, Backtesting, Replay et Journal.
 * Aucun affichage ni donnée ici : uniquement des fonctions pures, testables sous Node
 * (module.exports) et disponibles dans les écrans via window.TJNews.
 * Les données (calendrier, prix) viennent de donnees-exemple.js, à remplacer par une vraie API.
 *
 * Conventions
 * - Heures en UTC (millisecondes). Paris = UTC+1 en novembre.
 * - Bougies M1 : { t, o, h, l, c }, t = heure d'ouverture, triées par t.
 * - Une news : { type, t, reel, prevision } (reel = null tant qu'elle n'est pas publiée).
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------
  // Seuils et réglages (tout ce qui se règle est ici)
  // ---------------------------------------------------------------------
  var SEUILS = {
    FORTE_SURPRISE_Z: 1.5,         // |surprise normalisée| à partir de laquelle on parle de « forte surprise »
    SURPRISE_MIN_HISTO: 5,         // publications passées minimum pour normaliser une surprise
    FENETRES_MIN: [5, 15, 60],     // horizons de réaction mesurés après l'annonce
    FENETRE_VERDICT_MIN: 15,       // horizon utilisé pour le verdict
    VERDICT_ATR_MULT: 1.5,         // « A fait bouger » si mouvement > 1,5 × ATR de la même heure sans news
    ATR_JOURS_REF: 20,             // nombre de jours sans news utilisés pour l'ATR de référence
    HISTO_N_MIN: 10,               // en dessous : historique jugé trop court
    HISTO_N_MAX: 12,               // publications passées retenues au maximum
    FENETRE_RANGE_MIN: 60,         // durée après l'annonce pour juger si le range du jour est cassé
    EPSILON: 1e-9,                 // écart considéré comme nul (surprise « conforme »)

    // État du marché (score de biais)
    POIDS_IMPACT: { 3: 3, 2: 2, 1: 1 }, // fort, moyen, faible
    DEMI_VIE_H: 24,                // une news compte deux fois moins au bout de 24 h
    FACTEUR_CONTREDITE: 0.5,       // contribution divisée par deux si le marché a réagi à l'inverse
    SCORE_ECHELLE: 5,              // score = 100 × tanh(somme / 5) : une forte surprise (2 σ) sur une news forte ≈ ±85
    SCORE_NEUTRE: 15,              // |score| < 15 → Neutre
    MITIGE_NB_FORTES: 3,           // on compare les 3 dernières news fortes…
    POIDS_ACTIF_MIN: 0.05,         // …encore actives (au moins 5 % de leur poids, soit ~4 jours)
    SURPRISE_FORTE_TEXTE: 1.0,     // « nettement » au-dessus / en dessous dans les phrases
    NB_DERNIERES_NEWS: 10,         // news listées sur la page État du marché

    // Page News
    ZONE_AVANT_MIN: 15,            // zone à éviter : 15 min avant une news…
    ZONE_APRES_MIN: 15,            // …et 15 min après (réglable sur la page)
    JOURNEE_CHARGEE_FORTES: 2,     // une journée est « chargée » à partir de 2 news fortes…
    JOURNEE_CHARGEE_TOTAL: 4,      // …ou 4 news fortes + moyennes sur mes actifs

    // News et trades (Backtesting, Replay, Journal)
    NEWS_PROCHE_MIN: 30,           // un trade est « proche d'une news » s'il est pris à moins de 30 min d'elle (réglable sur les pages)
    NEWS_PROCHE_IMPACT: 3,         // news prises en compte : impact fort seulement
    ECHANTILLON_MIN: 30            // en dessous de 30 trades dans un groupe : « échantillon trop faible pour conclure »
  };

  // Sessions de marché, en heure locale de leur place.
  var SESSIONS = [
    { nom: 'Asie', place: 'Tokyo', fz: 'TOKYO', debut: [9, 0], fin: [18, 0] },
    { nom: 'Londres', place: 'Londres', fz: 'LONDRES', debut: [8, 0], fin: [17, 0] },
    { nom: 'New York', place: 'New York', fz: 'NY', debut: [8, 0], fin: [17, 0] }
  ];

  // Nom court d'un actif dans les phrases (« baissier or »).
  var NOMS_ACTIFS = { 'EUR/USD': 'EUR/USD', 'GBP/USD': 'GBP/USD', 'USD/JPY': 'USD/JPY', 'USD/CAD': 'USD/CAD', 'XAU/USD': 'or', 'WTI': 'pétrole', 'NAS100': 'Nasdaq', 'CAC 40': 'CAC 40', 'BTC/USD': 'bitcoin' };

  // Actifs suivis par le trader (filtre « Mes actifs seulement »).
  var MES_ACTIFS = ['EUR/USD', 'XAU/USD', 'NAS100'];

  // Taille d'un pip / point par actif, unité affichée, prix et agitation typiques (mêmes niveaux que le Journal).
  var INSTRUMENTS = {
    'EUR/USD': { pip: 0.0001, unite: 'pips', prix: 1.1624, volMin: 0.00011 },
    'GBP/USD': { pip: 0.0001, unite: 'pips', prix: 1.3152, volMin: 0.00013 },
    'USD/JPY': { pip: 0.01, unite: 'pips', prix: 153.42, volMin: 0.017 },
    'USD/CAD': { pip: 0.0001, unite: 'pips', prix: 1.3950, volMin: 0.00010 },
    'XAU/USD': { pip: 0.1, unite: 'pips', prix: 4012.4, volMin: 0.62 },
    'WTI': { pip: 0.01, unite: 'pips', prix: 61.42, volMin: 0.023 },
    'NAS100': { pip: 1, unite: 'points', prix: 21480, volMin: 4.3 },
    'CAC 40': { pip: 1, unite: 'points', prix: 8121.5, volMin: 1.5 },
    'BTC/USD': { pip: 1, unite: 'points', prix: 98450, volMin: 61 }
  };

  // ---------------------------------------------------------------------
  // Table news → effet attendu, pour une publication AU-DESSUS des attentes.
  //   devise : la devise directement concernée, et son sens (+1 haussière, −1 baissière)
  //   impact : 3 fort, 2 moyen, 1 faible (mêmes barres que la page News)
  //   actifs : +1 l'actif monte, −1 il baisse, 0 effet variable (pas de sens attendu)
  //   pourquoi : explication courte affichée quand on déplie la news
  // Une publication en dessous des attentes inverse tous les sens.
  // Pour ajouter une annonce : copier une ligne et adapter.
  // ---------------------------------------------------------------------
  var EFFETS = {
    NFP: { nom: 'NFP — Emplois non agricoles', court: 'NFP', devise: 'USD', sensDevise: +1, impact: 3, unite: ' k', actifs: { 'EUR/USD': -1, 'GBP/USD': -1, 'USD/JPY': +1, 'XAU/USD': -1, 'NAS100': 0, 'BTC/USD': 0 },
      pourquoi: "Le chiffre de l'emploi le plus suivi au monde. Plus d'emplois que prévu = économie solide, la Fed peut garder des taux hauts : le dollar monte, l'or baisse. Pour les indices et le bitcoin, l'effet dépend de ce que le marché craint le plus (récession ou taux hauts)." },
    CHOMAGE_US: { nom: 'Taux de chômage US', court: 'chômage US', devise: 'USD', sensDevise: -1, impact: 3, unite: ' %', actifs: { 'EUR/USD': +1, 'GBP/USD': +1, 'USD/JPY': -1, 'XAU/USD': +1, 'NAS100': 0 },
      pourquoi: "Un chômage plus haut que prévu affaiblit le dollar : la Fed aura plus de raisons de baisser ses taux. Publié à la même minute que le NFP, les deux chiffres peuvent se contredire." },
    CPI_US: { nom: 'Inflation CPI US', court: 'CPI', devise: 'USD', sensDevise: +1, impact: 3, unite: ' %', actifs: { 'EUR/USD': -1, 'GBP/USD': -1, 'USD/JPY': +1, 'XAU/USD': -1, 'NAS100': -1, 'BTC/USD': -1 },
      pourquoi: "Une inflation plus forte que prévu éloigne les baisses de taux : le dollar monte, et les actifs qui aiment l'argent pas cher (indices tech, or, bitcoin) baissent." },
    ADP_US: { nom: 'Emploi privé ADP', court: 'ADP', devise: 'USD', sensDevise: +1, impact: 2, unite: ' k', actifs: { 'EUR/USD': -1, 'XAU/USD': -1, 'NAS100': 0, 'BTC/USD': 0 },
      pourquoi: "Un avant-goût du NFP, deux jours avant. Le marché s'en sert pour ajuster ses attentes, mais réagit moins fort." },
    ISM_SERVICES_US: { nom: 'ISM services', court: 'ISM services', devise: 'USD', sensDevise: +1, impact: 2, unite: '', actifs: { 'EUR/USD': -1, 'XAU/USD': -1, 'NAS100': +1, 'BTC/USD': 0 },
      pourquoi: "Le moral des entreprises de services, qui pèsent plus de 70 % de l'économie américaine. Au-dessus de 50 = activité en hausse." },
    MICHIGAN: { nom: 'Confiance des consommateurs (Michigan)', court: 'Michigan', devise: 'USD', sensDevise: +1, impact: 2, unite: '', actifs: { 'EUR/USD': -1, 'NAS100': +1 },
      pourquoi: "Des ménages confiants consomment plus : plutôt bon pour le dollar et pour les actions américaines." },
    INSCRIPTIONS_US: { nom: 'Inscriptions hebdomadaires au chômage', court: 'inscriptions au chômage', devise: 'USD', sensDevise: -1, impact: 2, unite: ' k', actifs: { 'EUR/USD': +1, 'XAU/USD': +1, 'NAS100': 0 },
      pourquoi: "Chaque jeudi, le nombre de nouveaux chômeurs. Plus que prévu = marché de l'emploi qui ralentit : dollar plus faible, or soutenu." },
    VENTES_DETAIL_US: { nom: 'Ventes au détail US', court: 'ventes au détail', devise: 'USD', sensDevise: +1, impact: 2, unite: ' %', actifs: { 'EUR/USD': -1, 'NAS100': +1 },
      pourquoi: "La consommation fait les deux tiers de l'économie américaine : un chiffre fort soutient le dollar et les indices." },
    EIA_PETROLE: { nom: 'Stocks de pétrole (EIA)', court: 'stocks EIA', devise: '', sensDevise: 0, impact: 2, unite: ' M', actifs: { 'WTI': -1 },
      pourquoi: "Des stocks qui montent plus que prévu signalent une demande faible : le pétrole baisse." },
    EMPLOI_CA: { nom: 'Emploi Canada', court: 'emploi Canada', devise: 'CAD', sensDevise: +1, impact: 2, unite: ' k', actifs: { 'USD/CAD': -1 },
      pourquoi: "Un marché du travail canadien solide soutient le dollar canadien." },
    PIB_EZ: { nom: 'PIB zone euro', court: 'PIB zone euro', devise: 'EUR', sensDevise: +1, impact: 2, unite: ' %', actifs: { 'EUR/USD': +1, 'CAC 40': +1 },
      pourquoi: "Une croissance plus forte que prévu soutient l'euro et réduit les attentes de baisse de taux de la BCE." },
    ZEW_DE: { nom: 'Indice ZEW Allemagne', court: 'ZEW', devise: 'EUR', sensDevise: +1, impact: 2, unite: '', actifs: { 'EUR/USD': +1 },
      pourquoi: "Le moral des investisseurs allemands : il donne le ton pour l'euro sur la journée." },
    PROD_INDUS_DE: { nom: 'Production industrielle Allemagne', court: 'production allemande', devise: 'EUR', sensDevise: +1, impact: 1, unite: ' %', actifs: { 'EUR/USD': +1 },
      pourquoi: "L'industrie allemande pèse lourd en Europe : un bon chiffre rassure sur la croissance, léger soutien pour l'euro." },
    HALIFAX: { nom: 'Prix des logements Halifax', court: 'Halifax', devise: 'GBP', sensDevise: +1, impact: 1, unite: ' %', actifs: { 'GBP/USD': +1 },
      pourquoi: "Un immobilier britannique qui ralentit peut pousser la Banque d'Angleterre à baisser ses taux : la livre faiblit." },
    CHOMAGE_UK: { nom: 'Taux de chômage Royaume-Uni', court: 'chômage UK', devise: 'GBP', sensDevise: -1, impact: 2, unite: ' %', actifs: { 'GBP/USD': -1 },
      pourquoi: "Un chômage en hausse rend une baisse de taux plus probable : la livre baisse." },
    PIB_UK: { nom: 'PIB Royaume-Uni', court: 'PIB UK', devise: 'GBP', sensDevise: +1, impact: 2, unite: ' %', actifs: { 'GBP/USD': +1 },
      pourquoi: "Une croissance proche de zéro met la livre sous pression ; une bonne surprise la soutient." },
    BOE_TAUX: { nom: "Taux de la Banque d'Angleterre", court: 'BoE', devise: 'GBP', sensDevise: +1, impact: 3, unite: ' %', actifs: { 'GBP/USD': +1 },
      pourquoi: "Des taux plus hauts que prévu rendent la livre plus attractive." }
  };

  // Décimales affichées pour chaque annonce (142 k, 4,2 %, 4,75 %…).
  var DECIMALES = { NFP: 0, CHOMAGE_US: 1, CPI_US: 1, ADP_US: 0, ISM_SERVICES_US: 1, MICHIGAN: 1, INSCRIPTIONS_US: 0, VENTES_DETAIL_US: 1, EIA_PETROLE: 1, EMPLOI_CA: 1, PIB_EZ: 1, ZEW_DE: 1, PROD_INDUS_DE: 1, HALIFAX: 1, CHOMAGE_UK: 1, PIB_UK: 1, BOE_TAUX: 2 };
  Object.keys(DECIMALES).forEach(function (k) { if (EFFETS[k]) EFFETS[k].dec = DECIMALES[k]; });

  var MIN = 60000, JOUR = 86400000;

  // ---------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------
  function signe(x) { return Math.abs(x) <= SEUILS.EPSILON ? 0 : (x > 0 ? 1 : -1); }
  function moyenne(xs) { if (!xs.length) return null; var s = 0; for (var i = 0; i < xs.length; i++) s += xs[i]; return s / xs.length; }
  function jourDe(t) { return Math.floor(t / JOUR); }
  function minuteDuJour(t) { return Math.floor((t - jourDe(t) * JOUR) / MIN); }
  function instrument(actif) {
    var i = INSTRUMENTS[actif];
    if (!i) throw new Error('Actif inconnu : ' + actif);
    return i;
  }

  // Index de la dernière bougie dont t <= cible (‑1 si aucune).
  function indexAuPlus(bougies, cible) {
    var lo = 0, hi = bougies.length - 1, res = -1;
    while (lo <= hi) {
      var m = (lo + hi) >> 1;
      if (bougies[m].t <= cible) { res = m; lo = m + 1; } else hi = m - 1;
    }
    return res;
  }
  function bougieA(bougies, t) {
    var i = indexAuPlus(bougies, t);
    return i >= 0 && bougies[i].t === t ? bougies[i] : null;
  }

  // ---------------------------------------------------------------------
  // Surprise
  // ---------------------------------------------------------------------
  // passees : publications précédentes de la même annonce ({ reel, prevision }).
  // Normalisation : surprise / écart quadratique moyen des surprises passées.
  function surprise(news, passees) {
    if (!news || news.reel === null || news.reel === undefined || news.prevision === null || news.prevision === undefined) return null;
    var brute = news.reel - news.prevision;
    var hist = (passees || []).filter(function (p) { return p.reel !== null && p.reel !== undefined && p.prevision !== null && p.prevision !== undefined; })
      .map(function (p) { return p.reel - p.prevision; });
    var echelle = hist.length ? Math.sqrt(moyenne(hist.map(function (x) { return x * x; }))) : 0;
    var normalisee = hist.length >= SEUILS.SURPRISE_MIN_HISTO && echelle > SEUILS.EPSILON ? brute / echelle : null;
    var s = signe(brute);
    return {
      brute: brute,
      normalisee: normalisee,
      echelle: echelle,
      nHisto: hist.length,
      forte: normalisee !== null && Math.abs(normalisee) >= SEUILS.FORTE_SURPRISE_Z,
      sens: s > 0 ? 'dessus' : s < 0 ? 'dessous' : 'conforme'
    };
  }

  // ---------------------------------------------------------------------
  // Effet attendu
  // ---------------------------------------------------------------------
  function libelleSens(s) { return s > 0 ? 'haussier' : s < 0 ? 'baissier' : 'variable'; }

  // sens : +1 / −1 / 0 (variable ou surprise nulle) ; suivi = false si la table ne couvre pas cet actif.
  function effetAttendu(type, actif, surpr) {
    var e = EFFETS[type];
    if (!e || !(actif in e.actifs)) return { suivi: false, sens: 0, libelle: 'non suivi' };
    var base = e.actifs[actif];
    var s = surpr ? signe(surpr.brute) : 1; // sans surprise connue : sens pour « au-dessus »
    var sens = base * s;
    return { suivi: true, sens: sens, variable: base === 0, libelle: base === 0 ? 'variable' : (s === 0 ? 'aucun' : libelleSens(sens)) };
  }

  // Effet sur la devise concernée (utile pour colorer un « réel » : meilleur ou moins bon pour la devise).
  function effetDevise(type, surpr) {
    var e = EFFETS[type];
    if (!e || !e.devise || !surpr) return { devise: e ? e.devise : '', sens: 0, libelle: 'aucun' };
    var sens = e.sensDevise * signe(surpr.brute);
    return { devise: e.devise, sens: sens, libelle: sens === 0 ? 'aucun' : libelleSens(sens) };
  }

  // ---------------------------------------------------------------------
  // Réaction d'un actif à une news
  // ---------------------------------------------------------------------
  // Référence : clôture de la bougie M1 juste avant l'annonce (celle qui s'ouvre à t − 1 min).
  // Mouvement à +N min : clôture de la bougie qui s'ouvre à t + (N − 1) min, donc clôturée à t + N.
  function reaction(actif, news, bougies) {
    var ins = instrument(actif);
    var iRef = indexAuPlus(bougies, news.t - MIN);
    if (iRef < 0) return null;
    var ref = bougies[iRef];
    if (news.t - ref.t > 5 * MIN) return null; // pas de cotation juste avant l'annonce
    var fen = {};
    SEUILS.FENETRES_MIN.forEach(function (w) {
      var b = bougieA(bougies, news.t + (w - 1) * MIN);
      if (!b) { fen[w] = null; return; }
      var ecart = b.c - ref.c;
      fen[w] = { prix: b.c, ecart: ecart, pct: ecart / ref.c * 100, unites: ecart / ins.pip };
    });
    return { actif: actif, ref: ref.c, refT: ref.t, unite: ins.unite, fenetres: fen };
  }

  // ATR de référence : amplitude moyenne (vrai range) de la fenêtre [heure, heure + duree)
  // sur les `nbJours` derniers jours AVANT `avantJour`, en excluant les jours de news.
  function atrMemeHeure(bougies, minute, duree, avantJour, joursExclus, nbJours) {
    var exclus = {};
    (joursExclus || []).forEach(function (j) { exclus[j] = true; });
    var parJour = {};
    for (var i = 0; i < bougies.length; i++) {
      var b = bougies[i], j = jourDe(b.t);
      if (j >= avantJour || exclus[j]) continue;
      var m = minuteDuJour(b.t);
      var r = parJour[j] || (parJour[j] = { h: -Infinity, l: Infinity, prev: null, n: 0 });
      if (m === minute - 1) r.prev = b.c;
      if (m >= minute && m < minute + duree) { r.n++; if (b.h > r.h) r.h = b.h; if (b.l < r.l) r.l = b.l; }
    }
    var jours = Object.keys(parJour).map(Number).filter(function (j) { return parJour[j].n >= duree * 0.8; })
      .sort(function (a, b) { return b - a; }).slice(0, nbJours || SEUILS.ATR_JOURS_REF);
    var ranges = jours.map(function (j) {
      var r = parJour[j], h = r.h, l = r.l;
      if (r.prev !== null) { h = Math.max(h, r.prev); l = Math.min(l, r.prev); }
      return h - l;
    });
    return { atr: moyenne(ranges), n: ranges.length };
  }

  // ---------------------------------------------------------------------
  // Verdict
  // ---------------------------------------------------------------------
  // opts : { surprise (résultat de surprise()), joursNews (jours à exclure de l'ATR) }
  function verdict(actif, news, bougies, opts) {
    opts = opts || {};
    var ins = instrument(actif);
    var r = reaction(actif, news, bougies);
    var w = SEUILS.FENETRE_VERDICT_MIN;
    var m = r && r.fenetres[w];
    if (!m) return { statut: 'en attente', libelle: 'En attente', reaction: r };
    var ref = atrMemeHeure(bougies, minuteDuJour(news.t), w, jourDe(news.t), opts.joursNews, SEUILS.ATR_JOURS_REF);
    if (!ref.atr) return { statut: 'sans référence', libelle: 'Pas assez d’historique', reaction: r };
    var ratio = Math.abs(m.ecart) / ref.atr;
    var bouge = ratio > SEUILS.VERDICT_ATR_MULT + SEUILS.EPSILON; // il faut dépasser le seuil (marge contre les arrondis)
    var eff = effetAttendu(news.type, actif, opts.surprise);
    var sm = signe(m.ecart);
    var sens = !eff.suivi ? 'non suivi' : (eff.sens === 0 ? 'variable' : (sm === 0 ? 'neutre' : (sm === eff.sens ? 'attendu' : 'contraire')));
    return {
      statut: 'mesuré',
      bouge: bouge,
      libelle: bouge ? 'A fait bouger' : 'Peu d’effet',
      ratio: ratio,
      atr: ref.atr,
      atrUnites: ref.atr / ins.pip,
      joursRef: ref.n,
      sens: sens,
      symbole: sens === 'attendu' ? '✓' : sens === 'contraire' ? '✗' : '',
      effet: eff,
      mouvement: m,
      reaction: r
    };
  }

  // ---------------------------------------------------------------------
  // Historique des réactions d'un actif à un type de news
  // ---------------------------------------------------------------------
  // publications : toutes les publications connues de ce type (triées ou non), { t, reel, prevision }.
  function reactionHistorique(actif, type, publications, bougies) {
    var ins = instrument(actif);
    var pubs = publications.filter(function (p) { return p.reel !== null && p.reel !== undefined; })
      .slice().sort(function (a, b) { return a.t - b.t; });
    var details = [];
    for (var k = pubs.length - 1; k >= 0 && details.length < SEUILS.HISTO_N_MAX; k--) {
      var p = pubs[k];
      var r = reaction(actif, p, bougies);
      var m = r && r.fenetres[SEUILS.FENETRE_VERDICT_MIN];
      if (!m) continue;
      // range de la journée jusqu'à l'annonce, puis cassure dans la fenêtre qui suit
      var debut = jourDe(p.t) * JOUR, hi = -Infinity, lo = Infinity, apresH = -Infinity, apresL = Infinity;
      for (var i = indexAuPlus(bougies, debut - 1) + 1; i < bougies.length && bougies[i].t < p.t + SEUILS.FENETRE_RANGE_MIN * MIN; i++) {
        var b = bougies[i];
        if (b.t < p.t) { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; } else { if (b.h > apresH) apresH = b.h; if (b.l < apresL) apresL = b.l; }
      }
      var casse = hi > -Infinity && (apresH > hi || apresL < lo);
      var surpr = surprise(p, pubs.slice(0, k));
      var eff = effetAttendu(type, actif, surpr);
      var sm = signe(m.ecart);
      details.push({ t: p.t, surprise: surpr, ecart: m.ecart, pct: m.pct, unites: m.unites, casseRange: casse, sensConnu: eff.suivi && eff.sens !== 0 && sm !== 0, dansLeSens: eff.sens !== 0 && sm === eff.sens });
    }
    var n = details.length;
    var avecSens = details.filter(function (d) { return d.sensConnu; });
    return {
      actif: actif, type: type, n: n, faible: n < SEUILS.HISTO_N_MIN, unite: ins.unite,
      mouvementMoyen15: n ? { pct: moyenne(details.map(function (d) { return Math.abs(d.pct); })), unites: moyenne(details.map(function (d) { return Math.abs(d.unites); })) } : null,
      pctCasseRange: n ? details.filter(function (d) { return d.casseRange; }).length / n * 100 : null,
      pctSensAttendu: avecSens.length ? avecSens.filter(function (d) { return d.dansLeSens; }).length / avecSens.length * 100 : null,
      nSens: avecSens.length,
      details: details
    };
  }

  // ---------------------------------------------------------------------
  // Formats (heure de Paris, nombres à la française)
  // ---------------------------------------------------------------------
  // Heure d'été européenne : du dernier dimanche de mars au dernier dimanche d'octobre, à 01:00 UTC.
  function dernierDimanche(annee, mois) { var d = new Date(Date.UTC(annee, mois + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); }
  function decalageParis(t) { var y = new Date(t).getUTCFullYear(); return t >= dernierDimanche(y, 2) && t < dernierDimanche(y, 9) ? 2 : 1; }
  function enParis(t) { return new Date(t + decalageParis(t) * 3600000); }
  var JOURS_C = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function heureParis(t) { var d = enParis(t); return deux(d.getUTCHours()) + ':' + deux(d.getUTCMinutes()); }
  function dateParis(t) { var d = enParis(t); return JOURS_C[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS_C[d.getUTCMonth()]; }
  function jourParis(t) { return Math.floor(enParis(t).getTime() / JOUR); }
  function nombre(x, dec, signeForce) {
    if (x === null || x === undefined || isNaN(x)) return '—';
    var s = Math.abs(x).toFixed(dec).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    if (x < 0 && Number(Math.abs(x).toFixed(dec)) !== 0) return '−' + s;
    return (signeForce && Number(x.toFixed(dec)) !== 0 ? '+' : '') + s;
  }
  // « aujourd'hui à 14:30 », « hier à 14:30 », « demain à 08:00 », sinon « jeu. 12 nov. à 13:00 »
  function quand(t, maintenant) {
    var e = jourParis(t) - jourParis(maintenant), h = heureParis(t);
    if (e === 0) return "aujourd'hui à " + h;
    if (e === -1) return 'hier à ' + h;
    if (e === 1) return 'demain à ' + h;
    return dateParis(t) + ' à ' + h;
  }
  function ilYa(t, maintenant) {
    var m = Math.round((maintenant - t) / MIN);
    if (m < 60) return 'il y a ' + m + ' min';
    if (m < 24 * 60) return 'il y a ' + Math.round(m / 60) + ' h';
    var j = Math.round(m / (24 * 60));
    return j === 1 ? 'hier' : 'il y a ' + j + ' jours';
  }
  function decimalesPrix(actif) { var p = instrument(actif).pip; return p >= 1 ? 0 : p >= 0.1 ? 2 : p >= 0.01 ? 3 : 5; }
  function decimalesValeur(type) { var e = EFFETS[type]; return e && e.dec !== undefined ? e.dec : 1; }

  // Prix de clôture de −avant à +apres minutes autour de t (pour une sparkline).
  function serieAutour(bougies, t, avantMin, apresMin) {
    var out = [];
    for (var i = indexAuPlus(bougies, t - avantMin * MIN - 1) + 1; i < bougies.length && bougies[i].t < t + apresMin * MIN; i++) out.push({ t: bougies[i].t, c: bougies[i].c });
    return out;
  }

  // ---------------------------------------------------------------------
  // État du marché
  // ---------------------------------------------------------------------
  // Analyse les N dernières news publiées qui concernent l'actif (de la plus récente à la plus ancienne).
  function analyserNews(actif, publications, bougies, joursNews, maintenant, n) {
    var touche = function (p) { return EFFETS[p.type] && (actif in EFFETS[p.type].actifs); };
    var triees = publications.filter(touche).slice().sort(function (a, b) { return a.t - b.t; });
    var sorties = triees.filter(function (p) { return p.reel !== null && p.reel !== undefined && p.t <= maintenant; });
    return sorties.slice(-(n || SEUILS.NB_DERNIERES_NEWS)).reverse().map(function (p) {
      var passees = triees.filter(function (q) { return q.type === p.type && q.t < p.t; });
      var sp = surprise(p, passees);
      var v = verdict(actif, p, bougies, { surprise: sp, joursNews: joursNews });
      return { pub: p, type: p.type, info: EFFETS[p.type], surprise: sp, effet: effetAttendu(p.type, actif, sp), verdict: v };
    });
  }

  function decroissance(heures) { return Math.pow(0.5, Math.max(0, heures) / SEUILS.DEMI_VIE_H); }

  // contribution = sens attendu (pour une publication au-dessus) × surprise normalisée × poids d'impact,
  // × décroissance (demi-vie 24 h), ÷ 2 si l'actif a réagi à l'inverse.
  function contribution(actif, a, maintenant) {
    var e = EFFETS[a.type], base = e.actifs[actif] || 0, sp = a.surprise;
    var z = !sp ? 0 : (sp.normalisee !== null ? sp.normalisee : signe(sp.brute)); // historique trop court : on garde le seul sens
    var poids = SEUILS.POIDS_IMPACT[e.impact] || 1;
    var ageH = (maintenant - a.pub.t) / 3600000, dec = decroissance(ageH);
    var contredite = !!(a.verdict && a.verdict.sens === 'contraire');
    var initiale = base * z * poids;
    return { initiale: initiale, valeur: initiale * dec * (contredite ? SEUILS.FACTEUR_CONTREDITE : 1), decroissance: dec, ageH: ageH, contredite: contredite, impact: e.impact };
  }

  var NOMS_DEVISES = { USD: ['le dollar', 'm'], EUR: ["l'euro", 'm'], GBP: ['la livre', 'f'], CAD: ['le dollar canadien', 'm'], JPY: ['le yen', 'm'] };

  // analyses : résultat d'analyserNews ; aVenir : publications pas encore sorties (toutes, elles sont filtrées ici).
  function etatMarche(actif, analyses, aVenir, maintenant) {
    var contribs = analyses.map(function (a) { var c = contribution(actif, a, maintenant); c.analyse = a; return c; });
    var somme = contribs.reduce(function (s, c) { return s + c.valeur; }, 0);
    var score = Math.round(100 * Math.tanh(somme / SEUILS.SCORE_ECHELLE));
    var fortes = contribs.filter(function (c) { return c.impact === 3 && c.decroissance >= SEUILS.POIDS_ACTIF_MIN && signe(c.valeur) !== 0; }).slice(0, SEUILS.MITIGE_NB_FORTES);
    var mitige = fortes.length >= 2 && fortes.some(function (c) { return c.valeur > 0; }) && fortes.some(function (c) { return c.valeur < 0; });
    var code = mitige ? 'mitige' : Math.abs(score) < SEUILS.SCORE_NEUTRE ? 'neutre' : score > 0 ? 'hausse' : 'baisse';
    var dominante = null;
    contribs.forEach(function (c) { if (c.decroissance >= SEUILS.POIDS_ACTIF_MIN && Math.abs(c.valeur) > 0.05 && (!dominante || Math.abs(c.valeur) > Math.abs(dominante.valeur))) dominante = c; });
    var futures = (aVenir || []).filter(function (p) { return p.t > maintenant && EFFETS[p.type] && (actif in EFFETS[p.type].actifs); }).sort(function (a, b) { return a.t - b.t; });
    var prochaineForte = futures.filter(function (p) { return EFFETS[p.type].impact === 3; })[0] || null;
    var devise = dominante ? dominante.analyse.info.devise : '';
    var prochaineDevise = devise ? futures.filter(function (p) { return EFFETS[p.type].devise === devise; })[0] || null : null;
    var etat = {
      actif: actif, score: score, somme: somme, code: code,
      biais: { hausse: 'Haussier', baisse: 'Baissier', neutre: 'Neutre', mitige: 'Mitigé' }[code],
      contributions: contribs, fortesActives: fortes, dominante: dominante, prochaineForte: prochaineForte, prochaineDevise: prochaineDevise
    };
    etat.phrase = expliquerEtat(etat, maintenant);
    return etat;
  }

  function texteSurprise(sp) {
    if (!sp || sp.sens === 'conforme') return 'conforme aux attentes';
    var net = sp.normalisee !== null && Math.abs(sp.normalisee) >= SEUILS.SURPRISE_FORTE_TEXTE;
    return (net ? 'nettement ' : '') + (sp.sens === 'dessus' ? 'au-dessus des attentes' : 'en dessous des attentes');
  }

  function expliquerEtat(etat, maintenant) {
    var actif = etat.actif, d = etat.dominante, morceaux = [];
    var prochaine = function (p) { return EFFETS[p.type].nom + ' ' + quand(p.t, maintenant); };
    if (etat.code === 'mitige') {
      var h = etat.fortesActives.filter(function (c) { return c.valeur > 0; })[0], b = etat.fortesActives.filter(function (c) { return c.valeur < 0; })[0];
      morceaux.push('Les dernières news fortes se contredisent : ' + h.analyse.info.court + ' pousse ' + actif + ' à la hausse, ' + b.analyse.info.court + ' à la baisse.');
      if (etat.prochaineForte) morceaux.push('La prochaine news forte pourrait trancher : ' + prochaine(etat.prochaineForte) + '.');
      return morceaux.join(' ');
    }
    if (!d) {
      morceaux.push('Aucune news récente assez marquante pour donner une direction à ' + actif + '.');
      if (etat.prochaineForte) morceaux.push('Prochaine news importante : ' + prochaine(etat.prochaineForte) + '.');
      return morceaux.join(' ');
    }
    var a = d.analyse, sp = a.surprise, info = a.info;
    var phrase = info.nom + ' : chiffre ' + texteSurprise(sp) + ', publié ' + ilYa(a.pub.t, maintenant);
    var dev = effetDevise(a.type, sp), nd = NOMS_DEVISES[info.devise];
    if (nd && dev.sens !== 0) phrase += ', ' + (dev.sens > 0 ? 'bon' : 'mauvais') + ' signe pour ' + nd[0];
    var r = a.verdict && a.verdict.reaction, m = r && (r.fenetres[60] || r.fenetres[15]);
    if (m && signe(m.ecart) !== 0) phrase += '. ' + actif + ' a ' + (m.ecart > 0 ? 'monté' : 'baissé') + ' de ' + nombre(Math.abs(m.pct), 2) + ' % ' + (r.fenetres[60] ? "dans l'heure" : 'en 15 min');
    morceaux.push(phrase + '.');
    if (d.contredite) morceaux.push('Le marché a contredit cette news : son poids est divisé par deux.');
    if (etat.code === 'neutre') morceaux.push('Effet trop faible ou trop ancien pour donner un biais.');
    else {
      var suite = 'Biais ' + etat.biais.toLowerCase();
      if (etat.prochaineDevise) suite += ' tant que la prochaine news ' + info.devise + " n'est pas sortie (" + prochaine(etat.prochaineDevise) + ')';
      morceaux.push(suite + '.');
    }
    return morceaux.join(' ');
  }

  // Résumé des N dernières news : combien ont fait bouger l'actif, combien dans le sens attendu.
  function resumeNews(analyses) {
    var mesurees = analyses.filter(function (a) { return a.verdict.statut === 'mesuré'; });
    var avecSens = mesurees.filter(function (a) { return a.verdict.sens === 'attendu' || a.verdict.sens === 'contraire'; });
    return {
      n: analyses.length, mesurees: mesurees.length,
      ontBouge: mesurees.filter(function (a) { return a.verdict.bouge; }).length,
      avecSens: avecSens.length,
      dansLeSens: avecSens.filter(function (a) { return a.verdict.sens === 'attendu'; }).length
    };
  }

  // La news qui fait le plus bouger l'actif en moyenne (mouvement moyen à 15 min, en pips/points).
  function newsQuiFaitBouger(actif, publications, bougies) {
    var types = {};
    publications.forEach(function (p) { if (EFFETS[p.type] && (actif in EFFETS[p.type].actifs)) types[p.type] = true; });
    var res = Object.keys(types).map(function (type) {
      return reactionHistorique(actif, type, publications.filter(function (p) { return p.type === type; }), bougies);
    }).filter(function (h) { return h.n >= 3 && h.mouvementMoyen15; });
    res.sort(function (a, b) { return b.mouvementMoyen15.unites - a.mouvementMoyen15.unites; });
    return { classement: res, premiere: res[0] || null };
  }

  // ---------------------------------------------------------------------
  // Page News
  // ---------------------------------------------------------------------
  // Mes actifs touchés par une annonce.
  function mesActifsConcernes(type) {
    var e = EFFETS[type];
    return e ? MES_ACTIFS.filter(function (a) { return a in e.actifs; }) : [];
  }

  // Lecture courte une fois le chiffre sorti : « Surprise positive : plutôt haussier USD, baissier EUR/USD, baissier or. »
  function lectureSurprise(type, surpr, actifs) {
    var e = EFFETS[type];
    if (!e || !surpr) return '';
    if (surpr.sens === 'conforme') return 'Conforme aux attentes : pas de surprise.';
    var debut = 'Surprise ' + (surpr.sens === 'dessus' ? 'positive' : 'négative') + (surpr.forte ? ' et forte' : '');
    var morceaux = [], dev = effetDevise(type, surpr);
    if (dev.sens !== 0) morceaux.push(dev.libelle + ' ' + e.devise);
    var liste = (actifs && actifs.length ? actifs : Object.keys(e.actifs)).filter(function (a) { return a in e.actifs; });
    liste.forEach(function (a) { var f = effetAttendu(type, a, surpr); if (f.sens !== 0) morceaux.push(f.libelle + ' ' + (NOMS_ACTIFS[a] || a)); });
    return morceaux.length ? debut + ' : plutôt ' + morceaux.join(', ') + '.' : debut + ' : effet variable sur tes actifs.';
  }

  // « dans 1 h 22 », « dans 42 min », « dans 3 j 4 h », « en cours », « passée »
  function dansCombien(t, maintenant) {
    var m = Math.ceil((t - maintenant) / MIN);
    if (m <= 0) return m > -SEUILS.ZONE_APRES_MIN ? 'en cours' : 'passée';
    if (m < 60) return 'dans ' + m + ' min';
    if (m < 24 * 60) { var h = Math.floor(m / 60), r = m % 60; return 'dans ' + h + ' h' + (r ? ' ' + deux(r) : ''); }
    var j = Math.floor(m / (24 * 60)), hh = Math.floor((m % (24 * 60)) / 60);
    return 'dans ' + j + ' j' + (hh ? ' ' + hh + ' h' : '');
  }

  // Zones à éviter : [t − avant, t + après] autour de chaque news, fusionnées quand elles se chevauchent.
  // evts : [{ t, impact (3 fort, 2 moyen), nom }] — les news faibles sont ignorées.
  function zonesAEviter(evts, avantMin, apresMin) {
    var av = avantMin === undefined ? SEUILS.ZONE_AVANT_MIN : avantMin, ap = apresMin === undefined ? SEUILS.ZONE_APRES_MIN : apresMin;
    var res = [];
    [3, 2].forEach(function (niv) {
      var z = evts.filter(function (e) { return e.impact === niv; })
        .map(function (e) { return { debut: e.t - av * MIN, fin: e.t + ap * MIN, niveau: niv, noms: [e.nom], heures: [e.t] }; })
        .sort(function (a, b) { return a.debut - b.debut; });
      var fus = [];
      z.forEach(function (x) {
        var d = fus[fus.length - 1];
        if (d && x.debut <= d.fin) {
          d.fin = Math.max(d.fin, x.fin);
          if (d.noms.indexOf(x.noms[0]) < 0) d.noms.push(x.noms[0]);
          if (d.heures.indexOf(x.heures[0]) < 0) d.heures.push(x.heures[0]);
        } else fus.push(x);
      });
      res = res.concat(fus);
    });
    return res.sort(function (a, b) { return a.debut - b.debut || b.niveau - a.niveau; });
  }

  // Journée de Paris (minuit → minuit) et sessions de marché ce jour-là, en UTC.
  function journeeParis(annee, mois, jour) {
    var minuit = Date.UTC(annee, mois, jour);
    var debut = minuit - decalageParis(minuit) * 3600000;
    var lendemain = Date.UTC(annee, mois, jour + 1);
    return { debut: debut, fin: lendemain - decalageParis(lendemain) * 3600000 };
  }
  function sessionsJour(annee, mois, jour) {
    return SESSIONS.map(function (s) {
      var d = Date.UTC(annee, mois, jour, s.debut[0], s.debut[1]), f = Date.UTC(annee, mois, jour, s.fin[0], s.fin[1]);
      return { nom: s.nom, place: s.place, debut: d - decalage(s.fz, d) * 3600000, fin: f - decalage(s.fz, f) * 3600000 };
    });
  }

  // Alerte sur la surprise : déclenchée si |réel − prévision| dépasse le seuil.
  function depasseSeuil(pub, seuil) {
    if (!pub || pub.reel === null || pub.reel === undefined || pub.prevision === null || pub.prevision === undefined) return false;
    return Math.abs(pub.reel - pub.prevision) > seuil + SEUILS.EPSILON;
  }

  // Résultats d'entreprise : effet potentiel sur l'indice ≈ poids dans l'indice × mouvement attendu de l'action.
  function impactSurIndice(poidsPct, mouvementPct) { return poidsPct / 100 * mouvementPct; }

  // ---------------------------------------------------------------------
  // Fuseaux horaires des places de marché
  // ---------------------------------------------------------------------
  // Décalage horaire (en heures) d'un fuseau à l'instant t : heure locale = UTC + décalage.
  function decalage(fz, t) {
    if (fz === 'TOKYO') return 9; // pas d'heure d'été au Japon
    var y = new Date(t).getUTCFullYear();
    if (fz === 'NY') {
      // heure d'été US : du 2e dimanche de mars (07:00 UTC) au 1er dimanche de novembre (06:00 UTC)
      var mars = new Date(Date.UTC(y, 2, 1)); var debut = Date.UTC(y, 2, 1 + (7 - mars.getUTCDay()) % 7 + 7, 7);
      var nov = new Date(Date.UTC(y, 10, 1)); var fin = Date.UTC(y, 10, 1 + (7 - nov.getUTCDay()) % 7, 6);
      return t >= debut && t < fin ? -4 : -5;
    }
    var ete = t >= dernierDimanche(y, 2) && t < dernierDimanche(y, 9);
    return fz === 'LONDRES' ? (ete ? 1 : 0) : (ete ? 2 : 1);
  }
  // Heure locale (jour UTC + h:m dans le fuseau) → instant UTC.
  function versUTC(jourMinuit, c) {
    var approx = jourMinuit + (c.h * 60 + c.m) * MIN;
    return approx - decalage(c.fz, approx) * 3600000;
  }


  // ---------------------------------------------------------------------
  // News et trades (Backtesting, Replay, Journal)
  // ---------------------------------------------------------------------
  // News assez fortes (impact ≥ NEWS_PROCHE_IMPACT) qui concernent un actif, triées par heure.
  function newsFortesPour(actif, publications, impactMin) {
    var imp = impactMin === undefined ? SEUILS.NEWS_PROCHE_IMPACT : impactMin;
    return publications.filter(function (p) { var e = EFFETS[p.type]; return e && e.impact >= imp && (actif in e.actifs); })
      .slice().sort(function (a, b) { return a.t - b.t; });
  }

  // La news forte la plus proche de l'entrée d'un trade (t0 si connu, sinon t), à moins de `minutes`.
  // newsTriees : résultat de newsFortesPour pour l'actif du trade. Écart en minutes : négatif = trade pris avant la news.
  function newsProche(trade, newsTriees, minutes) {
    var lim = (minutes === undefined ? SEUILS.NEWS_PROCHE_MIN : minutes) * MIN;
    var t = trade.t0 !== undefined && trade.t0 !== null ? trade.t0 : trade.t;
    var lo = 0, hi = newsTriees.length - 1, i = -1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (newsTriees[m].t <= t) { i = m; lo = m + 1; } else hi = m - 1; }
    var best = null;
    [i, i + 1].forEach(function (k) {
      var n = newsTriees[k];
      if (!n) return;
      var d = t - n.t;
      if (Math.abs(d) <= lim && (!best || Math.abs(d) < Math.abs(best.ecart))) best = { news: n, ecart: d };
    });
    if (!best) return null;
    // plusieurs news à la même minute (NFP et chômage US) : on les nomme ensemble
    var memes = newsTriees.filter(function (n) { return n.t === best.news.t; });
    var noms = [];
    memes.forEach(function (n) { var e = EFFETS[n.type], nm = e.court || e.nom; if (noms.indexOf(nm) < 0) noms.push(nm); });
    return { news: memes[0], toutes: memes, nom: noms.join(' / '), ecartMin: Math.round(best.ecart / MIN), impact: EFFETS[memes[0].type].impact };
  }

  // Tag de chaque trade : { trade, proche } (proche = null si aucune news forte à moins de `minutes`).
  function taggerTrades(trades, publications, minutes) {
    var parActif = {};
    return trades.map(function (tr) {
      var a = tr.sym;
      if (!parActif[a]) parActif[a] = newsFortesPour(a, publications);
      return { trade: tr, proche: newsProche(tr, parActif[a], minutes) };
    });
  }

  // Texte court du tag, du point de vue du trade : « 12 min avant NFP », « 5 min après CPI », « pendant NFP ».
  function texteTag(proche) {
    if (!proche) return '';
    var m = proche.ecartMin;
    return m === 0 ? 'pendant ' + proche.nom : m < 0 ? (-m) + ' min avant ' + proche.nom : m + ' min après ' + proche.nom;
  }

  function statsR(trades) {
    var n = trades.length, w = 0, s = 0;
    trades.forEach(function (t) { if (t.R > 0) w++; s += t.R; });
    return { n: n, gagnants: w, reussite: n ? w / n * 100 : null, esperance: n ? s / n : null, total: s };
  }

  // Comparaison des trades pris près d'une news forte et des autres.
  function comparerProcheNews(trades, publications, minutes) {
    var min = minutes === undefined ? SEUILS.NEWS_PROCHE_MIN : minutes;
    var tags = taggerTrades(trades, publications, min);
    var avec = statsR(tags.filter(function (x) { return x.proche; }).map(function (x) { return x.trade; }));
    var sans = statsR(tags.filter(function (x) { return !x.proche; }).map(function (x) { return x.trade; }));
    var suffisant = avec.n >= SEUILS.ECHANTILLON_MIN && sans.n >= SEUILS.ECHANTILLON_MIN;
    var R = function (x) { return nombre(x, 1, true) + ' R'; };
    var phrase;
    if (!suffisant) {
      phrase = 'Échantillon trop faible pour conclure : il faut au moins ' + SEUILS.ECHANTILLON_MIN + ' trades dans chaque groupe (ici ' + avec.n + ' près d’une news, ' + sans.n + ' sans).';
    } else {
      phrase = 'Tes trades proches des news ont une expectancy de ' + R(avec.esperance) + ' contre ' + R(sans.esperance) + ' sans news' +
        ' (réussite ' + Math.round(avec.reussite) + ' % contre ' + Math.round(sans.reussite) + ' %)';
      var ecart = avec.esperance - sans.esperance;
      phrase += ecart < -0.15 ? ' : tes trades pris loin des news fortes font nettement mieux.'
        : ecart > 0.15 ? ' : les news te réussissent plutôt bien.' : ' : pas de différence nette.';
    }
    return { minutes: min, avec: avec, sans: sans, suffisant: suffisant, phrase: phrase, tags: tags };
  }

  var api = {
    SEUILS: SEUILS, INSTRUMENTS: INSTRUMENTS, EFFETS: EFFETS, MES_ACTIFS: MES_ACTIFS,
    surprise: surprise, effetAttendu: effetAttendu, effetDevise: effetDevise,
    reaction: reaction, atrMemeHeure: atrMemeHeure, verdict: verdict, reactionHistorique: reactionHistorique,
    analyserNews: analyserNews, contribution: contribution, etatMarche: etatMarche, resumeNews: resumeNews, newsQuiFaitBouger: newsQuiFaitBouger,
    serieAutour: serieAutour,
    SESSIONS: SESSIONS, NOMS_ACTIFS: NOMS_ACTIFS,
    mesActifsConcernes: mesActifsConcernes, lectureSurprise: lectureSurprise, zonesAEviter: zonesAEviter, journeeParis: journeeParis, sessionsJour: sessionsJour, depasseSeuil: depasseSeuil, impactSurIndice: impactSurIndice,
    newsFortesPour: newsFortesPour, newsProche: newsProche, taggerTrades: taggerTrades, texteTag: texteTag, statsR: statsR, comparerProcheNews: comparerProcheNews,
    formats: { dansCombien: dansCombien, heureParis: heureParis, dateParis: dateParis, quand: quand, ilYa: ilYa, nombre: nombre, decimalesPrix: decimalesPrix, decimalesValeur: decimalesValeur },
    outils: { signe: signe, moyenne: moyenne, jourDe: jourDe, minuteDuJour: minuteDuJour, indexAuPlus: indexAuPlus, decroissance: decroissance, instrument: instrument, decalage: decalage, decalageParis: decalageParis, versUTC: versUTC, dernierDimanche: dernierDimanche },
    // rempli par donnees-exemple.js (ou par la vraie source de données)
    exemple: null
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TJNews = api;
})(typeof window !== 'undefined' ? window : null);
