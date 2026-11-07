/*
 * donnees-exemple.js — données d'exemple de la maquette (calendrier économique et prix minute).
 *
 * C'est le SEUL fichier à remplacer pour brancher une vraie source (API du calendrier, prix du broker).
 * Il remplit window.TJNews.exemple avec les fonctions suivantes, que les pages utilisent :
 *   publications(type)                → 13 dernières publications d'une annonce { type, t, prevision, reel, precedent }
 *   publicationsPeriode(debut, fin)   → toutes les annonces entre deux dates (marqueurs du replay, tags des trades)
 *   newsFortesPeriode(actifs, d, f)   → heures des news fortes de ces actifs (utilisé par les trades d'exemple du backtest)
 *   jeuActif(actif)                   → publications + bougies M1 + jours de news d'un actif
 *   etat(actif)                       → tout ce qu'il faut à la page État du marché
 * Tout est généré de façon reproductible : mêmes chiffres à chaque chargement et sur toutes les pages.
 * Chargé après news-logic.js.
 */
(function (root) {
  'use strict';
  var L = (root && root.TJNews) || (typeof require !== 'undefined' ? require('./news-logic.js') : null);
  if (!L) return;

  var MIN = 60000, JOUR = 86400000;
  var EFFETS = L.EFFETS, SEUILS = L.SEUILS, O = L.outils;

  var EXEMPLE = {
    MAINTENANT: Date.UTC(2026, 10, 6, 12, 3),  // ven. 6 nov. 2026, 13:03 à Paris : le NFP sort à 14:30
    SEANCE_DEBUT_MIN: 0,                      // bougies générées de 00:00…
    SEANCE_FIN_MIN: 18 * 60,                  // …à 18:00 UTC
    // calendrier type : heure LOCALE du pays qui publie (fz : NY, PARIS ou LONDRES), rythme, niveau habituel,
    // dispersion des surprises, force de la réaction des prix
    CALENDRIER: {
      NFP: { h: 8, m: 30, fz: 'NY', rythme: 'mensuel', rang: 1, jour: 5, niveau: 160, dispersion: 45, force: 3.2 },
      CHOMAGE_US: { h: 8, m: 30, fz: 'NY', rythme: 'mensuel', rang: 1, jour: 5, niveau: 4.2, dispersion: 0.1, force: 1.2 },
      CPI_US: { h: 8, m: 30, fz: 'NY', rythme: 'mensuel', rang: 2, jour: 3, niveau: 2.6, dispersion: 0.12, force: 3.0 },
      ADP_US: { h: 8, m: 15, fz: 'NY', rythme: 'mensuel', rang: 1, jour: 3, niveau: 150, dispersion: 40, force: 1.6 },
      ISM_SERVICES_US: { h: 10, m: 0, fz: 'NY', rythme: 'mensuel', rang: 1, jour: 3, niveau: 52, dispersion: 1.6, force: 1.4 },
      MICHIGAN: { h: 10, m: 0, fz: 'NY', rythme: 'mensuel', rang: 1, jour: 5, niveau: 70.5, dispersion: 2.2, force: 0.9 },
      INSCRIPTIONS_US: { h: 8, m: 30, fz: 'NY', rythme: 'hebdo', jour: 4, niveau: 222, dispersion: 9, force: 0.7 },
      VENTES_DETAIL_US: { h: 8, m: 30, fz: 'NY', rythme: 'mensuel', rang: 2, jour: 5, niveau: 0.3, dispersion: 0.35, force: 1.6 },
      EIA_PETROLE: { h: 10, m: 30, fz: 'NY', rythme: 'hebdo', jour: 3, niveau: -0.5, dispersion: 2.8, force: 1.8 },
      EMPLOI_CA: { h: 8, m: 30, fz: 'NY', rythme: 'mensuel', rang: 1, jour: 5, niveau: 18, dispersion: 22, force: 1.4 },
      PIB_EZ: { h: 11, m: 0, fz: 'PARIS', rythme: 'mensuel', rang: 2, jour: 1, niveau: 0.2, dispersion: 0.1, force: 1.1 },
      ZEW_DE: { h: 11, m: 0, fz: 'PARIS', rythme: 'mensuel', rang: 2, jour: 2, niveau: 13, dispersion: 4, force: 0.9 },
      PROD_INDUS_DE: { h: 8, m: 0, fz: 'PARIS', rythme: 'mensuel', rang: 1, jour: 5, niveau: 0.1, dispersion: 0.6, force: 0.6 },
      HALIFAX: { h: 10, m: 30, fz: 'PARIS', rythme: 'mensuel', rang: 1, jour: 5, niveau: 0.2, dispersion: 0.3, force: 0.5 },
      CHOMAGE_UK: { h: 7, m: 0, fz: 'LONDRES', rythme: 'mensuel', rang: 2, jour: 2, niveau: 4.1, dispersion: 0.1, force: 1.2 },
      PIB_UK: { h: 7, m: 0, fz: 'LONDRES', rythme: 'mensuel', rang: 2, jour: 5, niveau: 0.1, dispersion: 0.15, force: 1.3 },
      BOE_TAUX: { h: 12, m: 0, fz: 'LONDRES', rythme: 'mensuel', rang: 2, jour: 4, niveau: 4.75, dispersion: 0.08, force: 2.6 }
    },
    // Valeurs imposées pour rester cohérent avec le calendrier affiché sur la page News (date UTC de publication)
    FIXES: {
      NFP: { '2026-10-02': { reel: 142 }, '2026-11-06': { prevision: 165 } },
      CHOMAGE_US: { '2026-10-02': { reel: 4.2 }, '2026-11-06': { prevision: 4.2 } },
      MICHIGAN: { '2026-10-02': { reel: 70.5 }, '2026-11-06': { prevision: 71.2 } },
      EMPLOI_CA: { '2026-10-02': { reel: 22.1 }, '2026-11-06': { prevision: 15.0 } },
      PROD_INDUS_DE: { '2026-10-02': { reel: -0.4 }, '2026-11-06': { prevision: 0.2, reel: 0.5 } },
      HALIFAX: { '2026-10-02': { reel: 0.3 }, '2026-11-06': { prevision: 0.2, reel: -0.1 } },
      CPI_US: { '2026-10-14': { reel: 2.6 }, '2026-11-11': { prevision: 2.5 } },
      PIB_EZ: { '2026-10-12': { reel: 0.3 }, '2026-11-09': { prevision: 0.2 } },
      ZEW_DE: { '2026-10-13': { reel: 13.1 }, '2026-11-10': { prevision: 14.0 } },
      CHOMAGE_UK: { '2026-10-13': { reel: 4.1 }, '2026-11-10': { prevision: 4.2 } },
      EIA_PETROLE: { '2026-11-04': { reel: 2.1 }, '2026-11-11': { prevision: -0.8 } },
      BOE_TAUX: { '2026-10-08': { reel: 4.75 }, '2026-11-12': { prevision: 4.75 } },
      INSCRIPTIONS_US: { '2026-11-05': { reel: 221 }, '2026-11-12': { prevision: 224 } },
      PIB_UK: { '2026-10-09': { reel: 0.2 }, '2026-11-13': { prevision: 0.1 } },
      VENTES_DETAIL_US: { '2026-10-09': { reel: 0.4 }, '2026-11-13': { prevision: 0.3 } }
    }
  };

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function gauss(r) { var u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function arrondi(x, d) { var p = Math.pow(10, d); return Math.round(x * p) / p; }

  // Dates de publication d'un type d'annonce, des `n` derniers mois (ou semaines) jusqu'à `jusqua`.
  function datesPublication(type, jusqua, n) {
    var c = EXEMPLE.CALENDRIER[type], out = [];
    if (!c) return out;
    var d = new Date(jusqua);
    if (c.rythme === 'hebdo') {
      var j = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      while (new Date(j).getUTCDay() !== c.jour) j += JOUR;
      for (var k = 0; k < n; k++) out.unshift(O.versUTC(j - k * 7 * JOUR, c));
    } else {
      for (var mo = 0; mo < n; mo++) {
        var y = d.getUTCFullYear(), m = d.getUTCMonth() - mo;
        var first = new Date(Date.UTC(y, m, 1));
        var off = (c.jour - first.getUTCDay() + 7) % 7;
        out.unshift(O.versUTC(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1 + off + (c.rang - 1) * 7), c));
      }
    }
    return out;
  }

  // Prévision et réel d'une publication : fixés par sa date, donc identiques quelle que soit la période demandée.
  function valeurs(type, t) {
    var c = EXEMPLE.CALENDRIER[type], dec = EFFETS[type].dec, r = rng(hash('val:' + type + ':' + t));
    var prev = arrondi(c.niveau + gauss(r) * c.dispersion * 0.6, dec);
    var reel = arrondi(prev + gauss(r) * c.dispersion, dec);
    var f = (EXEMPLE.FIXES[type] || {})[new Date(t).toISOString().slice(0, 10)] || {};
    if (f.prevision !== undefined) prev = f.prevision;
    if (f.reel !== undefined) reel = f.reel;
    return { prevision: prev, reel: reel };
  }

  // Publications d'une liste de dates (la première ne sert qu'à donner le « précédent » de la suivante).
  function construire(type, dates) {
    var res = [];
    for (var i = 1; i < dates.length; i++) {
      var v = valeurs(type, dates[i]);
      res.push({ type: type, t: dates[i], prevision: v.prevision, reel: dates[i] <= EXEMPLE.MAINTENANT ? v.reel : null, precedent: valeurs(type, dates[i - 1]).reel });
    }
    return res;
  }

  // 13 dernières publications (la plus récente peut être à venir : reel = null).
  var cachePubs = {};
  function publicationsExemple(type, n) {
    n = n || 13;
    var key = type + '|' + n;
    if (cachePubs[key]) return cachePubs[key];
    if (!EXEMPLE.CALENDRIER[type]) return [];
    var fin = EXEMPLE.MAINTENANT + 8 * JOUR;
    var dates = datesPublication(type, fin, n + 2).filter(function (t) { return t <= fin; }).slice(-(n + 1));
    cachePubs[key] = construire(type, dates);
    return cachePubs[key];
  }

  // Toutes les annonces publiées entre deux dates (tous types), triées par heure.
  var cachePeriodes = {};
  function publicationsPeriode(debut, fin) {
    var key = Math.floor(debut / JOUR) + '|' + Math.ceil(fin / JOUR);
    if (cachePeriodes[key]) return cachePeriodes[key];
    var out = [];
    Object.keys(EXEMPLE.CALENDRIER).forEach(function (type) {
      var c = EXEMPLE.CALENDRIER[type];
      var n = c.rythme === 'hebdo' ? Math.ceil((fin - debut) / (7 * JOUR)) + 3 : Math.ceil((fin - debut) / (28 * JOUR)) + 3;
      var dates = datesPublication(type, fin + 31 * JOUR, n + 2);
      out = out.concat(construire(type, dates).filter(function (p) { return p.t >= debut && p.t <= fin; }));
    });
    out.sort(function (a, b) { return a.t - b.t; });
    cachePeriodes[key] = out;
    return out;
  }

  // Heures des news fortes qui touchent ces actifs : { t, actif, type }.
  function newsFortesPeriode(actifs, debut, fin) {
    var pubs = publicationsPeriode(debut, fin), out = [];
    actifs.forEach(function (a) { L.newsFortesPour(a, pubs).forEach(function (p) { out.push({ t: p.t, actif: a, type: p.type }); }); });
    return out.sort(function (a, b) { return a.t - b.t || (a.actif < b.actif ? -1 : 1); });
  }

  // Impulsion de prix provoquée par une publication sur un actif, en multiples de l'agitation minute.
  function impulsion(actif, p, passees) {
    var c = EXEMPLE.CALENDRIER[p.type], e = EFFETS[p.type];
    if (!c || !e || !(actif in e.actifs) || p.reel === null) return null;
    var s = L.surprise(p, passees), z = s && s.normalisee !== null ? s.normalisee : (s ? O.signe(s.brute) : 0);
    z = Math.max(-3, Math.min(3, z));
    var r = rng(hash('imp:' + actif + p.t));
    var base = e.actifs[actif];
    var dir = base === 0 ? (r() < 0.5 ? -1 : 1) * Math.abs(z) : base * z;
    return { t: p.t, taille: (dir * c.force * 5) + gauss(r) * c.force * 3.5, agitation: 1 + c.force * 0.3 };
  }

  // Bougies M1 d'un actif pour un jour (numéro de jour UTC), avec les news qui le touchent.
  var cacheJours = {};
  function bougiesJour(actif, jour, chocs) {
    var key = actif + '|' + jour + '|' + chocs.map(function (x) { return x.t + ':' + x.taille.toFixed(3); }).join(',');
    if (cacheJours[key]) return cacheJours[key];
    var ins = O.instrument(actif), r = rng(hash('j:' + actif + ':' + jour));
    var px = ins.prix * (1 + Math.sin(jour / 9) * 0.012 + (r() - 0.5) * 0.004);
    var ancre = px, out = [], debut = jour * JOUR, fin = Math.min(debut + EXEMPLE.SEANCE_FIN_MIN * MIN, EXEMPLE.MAINTENANT);
    for (var t = debut + EXEMPLE.SEANCE_DEBUT_MIN * MIN; t < fin; t += MIN) {
      var mn = O.minuteDuJour(t);
      // activité : séance asiatique calme, ouverture de Londres, puis séance US plus agitée
      var profil = mn >= 13 * 60 + 30 && mn < 16 * 60 ? 1.35 : mn >= 7 * 60 && mn < 11 * 60 ? 1.1 : mn < 6 * 60 ? 0.55 : 0.85;
      var agit = 1, saut = 0;
      for (var k = 0; k < chocs.length; k++) {
        var dtm = (t - chocs[k].t) / MIN;
        if (dtm >= 0 && dtm < 45) agit += (chocs[k].agitation - 1) * Math.exp(-dtm / 9);
        if (dtm >= 0 && dtm < 3) saut += chocs[k].taille * [0.55, 0.3, 0.15][dtm];
        if (dtm >= 6 && dtm < 30) saut -= chocs[k].taille * 0.25 / 24; // léger retour après l'excès
      }
      var o = px, v = ins.volMin * profil * agit;
      // léger rappel vers le niveau du jour ; les sauts dus aux news déplacent ce niveau
      ancre += saut * ins.volMin;
      var c = o + gauss(r) * v + saut * ins.volMin + (ancre - o) * 0.008;
      var h = Math.max(o, c) + Math.abs(gauss(r)) * v * 0.6, l = Math.min(o, c) - Math.abs(gauss(r)) * v * 0.6;
      out.push({ t: t, o: o, h: h, l: l, c: c });
      px = c;
    }
    cacheJours[key] = out;
    return out;
  }

  // Jeu de données pour un actif et un seul type de news (utilisé par les tests).
  function jeuExemple(actif, type, nbPubs) {
    var pubs = publicationsExemple(type, nbPubs || 13);
    var joursNews = pubs.map(function (p) { return O.jourDe(p.t); });
    var jours = {};
    pubs.forEach(function (p) { jours[O.jourDe(p.t)] = true; });
    // jours de référence (sans news) avant les 2 dernières publications jusqu'à aujourd'hui, pour leur verdict
    pubs.filter(function (p) { return O.jourDe(p.t) <= O.jourDe(EXEMPLE.MAINTENANT); }).slice(-2).forEach(function (p) {
      var j = O.jourDe(p.t) - 1, pris = 0;
      while (pris < SEUILS.ATR_JOURS_REF + 4 && j > O.jourDe(p.t) - 60) {
        var wd = new Date(j * JOUR).getUTCDay();
        if (wd !== 0 && wd !== 6 && joursNews.indexOf(j) < 0) { jours[j] = true; pris++; }
        j--;
      }
    });
    var bougies = [];
    Object.keys(jours).map(Number).sort(function (a, b) { return a - b; }).forEach(function (j) {
      if (j * JOUR + EXEMPLE.SEANCE_DEBUT_MIN * MIN > EXEMPLE.MAINTENANT) return;
      var chocs = [];
      pubs.forEach(function (p, i) { if (O.jourDe(p.t) === j) { var im = impulsion(actif, p, pubs.slice(0, i)); if (im) chocs.push(im); } });
      bougies = bougies.concat(bougiesJour(actif, j, chocs));
    });
    return { actif: actif, type: type, publications: pubs, bougies: bougies, joursNews: joursNews };
  }

  // Jeu de données complet pour un actif : toutes les annonces qui le touchent, sur les mêmes bougies
  // (deux news à la même minute, comme NFP et chômage, font bouger le prix ensemble).
  var cacheActifs = {};
  function jeuActif(actif) {
    if (cacheActifs[actif]) return cacheActifs[actif];
    var maintenant = EXEMPLE.MAINTENANT, aujourdhui = O.jourDe(maintenant);
    var pubs = [];
    Object.keys(EFFETS).forEach(function (type) {
      if (EXEMPLE.CALENDRIER[type] && (actif in EFFETS[type].actifs)) pubs = pubs.concat(publicationsExemple(type));
    });
    pubs.sort(function (a, b) { return a.t - b.t; });
    var sorties = pubs.filter(function (p) { return p.reel !== null && p.t <= maintenant; });
    var joursNews = [];
    sorties.forEach(function (p) { var j = O.jourDe(p.t); if (joursNews.indexOf(j) < 0) joursNews.push(j); });
    var jours = {};
    joursNews.forEach(function (j) { jours[j] = true; });
    jours[aujourdhui] = true;
    // jours de référence (sans news) pour l'ATR des dernières news listées
    var dejaRef = {};
    sorties.slice(-SEUILS.NB_DERNIERES_NEWS).forEach(function (p) {
      var j0 = O.jourDe(p.t);
      if (dejaRef[j0]) return;
      dejaRef[j0] = true;
      var j = j0 - 1, pris = 0;
      while (pris < SEUILS.ATR_JOURS_REF && j > j0 - 60) {
        var wd = new Date(j * JOUR).getUTCDay();
        if (wd !== 0 && wd !== 6 && joursNews.indexOf(j) < 0) { jours[j] = true; pris++; }
        j--;
      }
    });
    var bougies = [];
    Object.keys(jours).map(Number).sort(function (a, b) { return a - b; }).forEach(function (j) {
      var chocs = [];
      sorties.forEach(function (p) {
        if (O.jourDe(p.t) !== j) return;
        var passees = pubs.filter(function (q) { return q.type === p.type && q.t < p.t; });
        var im = impulsion(actif, p, passees);
        if (im) chocs.push(im);
      });
      var b = bougiesJour(actif, j, chocs);
      for (var i = 0; i < b.length; i++) bougies.push(b[i]);
    });
    cacheActifs[actif] = { actif: actif, publications: pubs, bougies: bougies, joursNews: joursNews, maintenant: maintenant };
    return cacheActifs[actif];
  }

  // Tout ce dont la page État du marché a besoin pour un actif.
  function etatExemple(actif) {
    var jeu = jeuActif(actif);
    var analyses = L.analyserNews(actif, jeu.publications, jeu.bougies, jeu.joursNews, jeu.maintenant);
    return {
      jeu: jeu, analyses: analyses,
      etat: L.etatMarche(actif, analyses, jeu.publications, jeu.maintenant),
      resume: L.resumeNews(analyses),
      plusForte: L.newsQuiFaitBouger(actif, jeu.publications, jeu.bougies)
    };
  }

  var exemple = {
    REGLAGES: EXEMPLE,
    publications: publicationsExemple, publicationsPeriode: publicationsPeriode, newsFortesPeriode: newsFortesPeriode,
    jeu: jeuExemple, jeuActif: jeuActif, etat: etatExemple, dates: datesPublication
  };
  L.exemple = exemple;
  if (typeof module !== 'undefined' && module.exports) module.exports = exemple;
})(typeof window !== 'undefined' ? window : null);
