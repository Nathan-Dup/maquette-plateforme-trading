// Tests du module de calcul — lancer depuis la racine du dépôt : node --test tests/news-logic.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../project/news-logic.js');
require('../project/donnees-exemple.js'); // remplit L.exemple

const MIN = 60000, JOUR = 86400000;
const T0 = Date.UTC(2026, 10, 6, 13, 30); // annonce
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// bougies plates à `px`, de `debut` à `fin` (exclu), avec des modifs ponctuelles
function serie(debut, fin, px, modifs = {}) {
  const out = [];
  for (let t = debut; t < fin; t += MIN) {
    const c = modifs[t] !== undefined ? modifs[t] : (out.length ? out[out.length - 1].c : px);
    const o = out.length ? out[out.length - 1].c : px;
    out.push({ t, o, h: Math.max(o, c), l: Math.min(o, c), c });
  }
  return out;
}

test('surprise brute, normalisée et forte surprise', () => {
  const passees = [{ reel: 150, prevision: 140 }, { reel: 130, prevision: 140 }, { reel: 150, prevision: 140 }, { reel: 130, prevision: 140 }, { reel: 150, prevision: 140 }];
  const s = L.surprise({ reel: 185, prevision: 165 }, passees);
  close(s.brute, 20);
  close(s.echelle, 10);
  close(s.normalisee, 2);
  assert.equal(s.forte, true);
  assert.equal(s.sens, 'dessus');
  const faible = L.surprise({ reel: 170, prevision: 165 }, passees);
  assert.equal(faible.forte, false);
  assert.equal(L.surprise({ reel: 165, prevision: 165 }, passees).sens, 'conforme');
});

test('surprise : pas publiée, ou historique trop court', () => {
  assert.equal(L.surprise({ reel: null, prevision: 165 }, []), null);
  const s = L.surprise({ reel: 170, prevision: 165 }, [{ reel: 1, prevision: 0 }]);
  assert.equal(s.normalisee, null);
  assert.equal(s.forte, false);
});

test('effet attendu : NFP au-dessus → EUR/USD et or baissiers, NAS100 variable', () => {
  const dessus = { brute: 20 }, dessous = { brute: -20 };
  assert.equal(L.effetAttendu('NFP', 'EUR/USD', dessus).libelle, 'baissier');
  assert.equal(L.effetAttendu('NFP', 'XAU/USD', dessus).libelle, 'baissier');
  assert.equal(L.effetAttendu('NFP', 'USD/JPY', dessus).libelle, 'haussier');
  assert.equal(L.effetAttendu('NFP', 'NAS100', dessus).libelle, 'variable');
  assert.equal(L.effetAttendu('NFP', 'EUR/USD', dessous).libelle, 'haussier');
  assert.equal(L.effetAttendu('NFP', 'WTI', dessus).suivi, false);
  assert.equal(L.effetDevise('NFP', dessus).libelle, 'haussier');
  assert.equal(L.effetDevise('CHOMAGE_US', dessus).libelle, 'baissier');
});

test('reaction : mesurée depuis la clôture de la bougie juste avant', () => {
  const b = serie(T0 - 30 * MIN, T0 + 70 * MIN, 1.0800, {
    [T0 - MIN]: 1.0810,          // clôture de référence
    [T0 + 4 * MIN]: 1.0790,      // +5 min
    [T0 + 14 * MIN]: 1.0780,     // +15 min
    [T0 + 59 * MIN]: 1.0795      // +1 h
  });
  const r = L.reaction('EUR/USD', { type: 'NFP', t: T0 }, b);
  close(r.ref, 1.0810);
  close(r.fenetres[5].unites, -20, 1e-6);
  close(r.fenetres[15].unites, -30, 1e-6);
  close(r.fenetres[60].unites, -15, 1e-6);
  close(r.fenetres[15].pct, -0.003 / 1.0810 * 100, 1e-9);
  assert.equal(r.unite, 'pips');
});

test('reaction : fenêtres pas encore disponibles', () => {
  const b = serie(T0 - 10 * MIN, T0 + 10 * MIN, 17800);
  const r = L.reaction('NAS100', { t: T0 }, b);
  assert.ok(r.fenetres[5]);
  assert.equal(r.fenetres[15], null);
  assert.equal(r.fenetres[60], null);
});

// 20 jours de référence où la fenêtre 13:30–13:45 a un range de 10 pips, puis le jour de news
function jeuVerdict(mouvementPips) {
  let b = [];
  const jNews = L.outils.jourDe(T0);
  for (let k = 25; k >= 1; k--) {
    const j = jNews - k, d0 = j * JOUR + 13 * 60 * MIN;
    const m = {}; m[d0 + 35 * MIN] = 1.0810; // range de 10 pips dans la fenêtre
    b = b.concat(serie(d0, d0 + 60 * MIN, 1.0800, m));
  }
  b = b.concat(serie(T0 - 30 * MIN, T0 + 61 * MIN, 1.0800, { [T0 + 14 * MIN]: 1.0800 + mouvementPips * 0.0001 }));
  return b;
}

test('verdict : au-delà de 1,5 × ATR → « A fait bouger », sens attendu ✓', () => {
  const b = jeuVerdict(-20);
  const v = L.verdict('EUR/USD', { type: 'NFP', t: T0 }, b, { surprise: { brute: 25 } });
  close(v.atr, 0.0010, 1e-9);
  assert.equal(v.bouge, true);
  assert.equal(v.libelle, 'A fait bouger');
  assert.equal(v.sens, 'attendu');
  assert.equal(v.symbole, '✓');
});

test('verdict : sous le seuil → « Peu d’effet », sens contraire ✗', () => {
  const v = L.verdict('EUR/USD', { type: 'NFP', t: T0 }, jeuVerdict(12), { surprise: { brute: 25 } });
  assert.equal(v.bouge, false);
  assert.equal(v.libelle, 'Peu d’effet');
  assert.equal(v.sens, 'contraire');
  assert.equal(v.symbole, '✗');
});

test('verdict : seuil exact non franchi, jours de news exclus de l’ATR', () => {
  const v = L.verdict('EUR/USD', { type: 'NFP', t: T0 }, jeuVerdict(-15), { surprise: { brute: 25 } });
  assert.equal(v.bouge, false); // 15 pips = 1,5 × 10 : il faut dépasser
  const jNews = L.outils.jourDe(T0);
  const v2 = L.verdict('EUR/USD', { type: 'NFP', t: T0 }, jeuVerdict(-20), { surprise: { brute: 25 }, joursNews: [jNews - 1, jNews - 2] });
  assert.equal(v2.joursRef, 20);
});

test('verdict : en attente tant que +15 min n’est pas atteint', () => {
  const b = serie(T0 - 30 * MIN, T0 + 8 * MIN, 1.08);
  assert.equal(L.verdict('EUR/USD', { type: 'NFP', t: T0 }, b, {}).statut, 'en attente');
});

test('reactionHistorique : moyennes, cassure du range et sens attendu', () => {
  let b = [], pubs = [];
  for (let k = 0; k < 12; k++) {
    const t = T0 - (12 - k) * 28 * JOUR;
    const dessus = k % 2 === 0;                      // surprise alternée
    const vaDansLeSens = k < 9;                     // 9 fois sur 12 dans le sens attendu
    const sens = (dessus ? -1 : 1) * (vaDansLeSens ? 1 : -1);
    const casse = k < 6;                            // 6 fois sur 12 au-delà du range du jour
    const debut = L.outils.jourDe(t) * JOUR + 7 * 60 * MIN;
    const m = { [debut + 10 * MIN]: 1.0830, [debut + 20 * MIN]: 1.0770 }; // range du jour : 1,0770 – 1,0830
    m[debut + 21 * MIN] = 1.0800;
    m[t + 14 * MIN] = 1.0800 + sens * (casse ? 0.0040 : 0.0020);
    m[t + 15 * MIN] = 1.0800;
    b = b.concat(serie(debut, t + 70 * MIN, 1.0800, m));
    pubs.push({ type: 'NFP', t, prevision: 160, reel: dessus ? 190 : 130 });
  }
  pubs.push({ type: 'NFP', t: T0 + 3 * JOUR, prevision: 160, reel: null }); // à venir : ignorée
  const h = L.reactionHistorique('EUR/USD', 'NFP', pubs, b);
  assert.equal(h.n, 12);
  assert.equal(h.faible, false);
  close(h.mouvementMoyen15.unites, (6 * 40 + 6 * 20) / 12, 1e-6);
  close(h.pctCasseRange, 50);
  close(h.pctSensAttendu, 75);
});

test('reactionHistorique : historique court signalé', () => {
  const pubs = [{ type: 'NFP', t: T0, prevision: 1, reel: 2 }];
  const h = L.reactionHistorique('EUR/USD', 'NFP', pubs, serie(T0 - 60 * MIN, T0 + 60 * MIN, 1.08));
  assert.equal(h.n, 1);
  assert.equal(h.faible, true);
});

test('les seuils sont regroupés et modifiables', () => {
  const avant = L.SEUILS.VERDICT_ATR_MULT;
  L.SEUILS.VERDICT_ATR_MULT = 1.0;
  const v = L.verdict('EUR/USD', { type: 'NFP', t: T0 }, jeuVerdict(-12), { surprise: { brute: 25 } });
  assert.equal(v.bouge, true);
  L.SEUILS.VERDICT_ATR_MULT = avant;
});

test('données d’exemple : NFP sur EUR/USD cohérent', () => {
  const jeu = L.exemple.jeu('EUR/USD', 'NFP');
  assert.equal(jeu.publications.length, 13);
  const derniere = jeu.publications[jeu.publications.length - 1];
  assert.equal(derniere.reel, null);                          // le NFP du jour n'est pas encore sorti
  assert.equal(new Date(derniere.t).toISOString(), '2026-11-06T13:30:00.000Z');
  const h = L.reactionHistorique('EUR/USD', 'NFP', jeu.publications, jeu.bougies);
  assert.equal(h.n, 12);
  assert.ok(h.pctSensAttendu >= 55, 'sens attendu ' + h.pctSensAttendu);
  assert.ok(h.mouvementMoyen15.unites > 5 && h.mouvementMoyen15.unites < 80, 'mouvement ' + h.mouvementMoyen15.unites);
  const passee = jeu.publications[jeu.publications.length - 2];
  const v = L.verdict('EUR/USD', passee, jeu.bougies, { surprise: L.surprise(passee, jeu.publications.slice(0, -2)), joursNews: jeu.joursNews });
  assert.equal(v.statut, 'mesuré');
  assert.ok(v.joursRef >= 15, 'jours de référence ' + v.joursRef);
});

test('données d’exemple : tous les types et actifs de la table fonctionnent', () => {
  Object.keys(L.EFFETS).forEach((type) => {
    Object.keys(L.EFFETS[type].actifs).forEach((actif) => {
      const jeu = L.exemple.jeu(actif, type);
      const h = L.reactionHistorique(actif, type, jeu.publications, jeu.bougies);
      assert.ok(h.n >= 10, `${type} / ${actif} : ${h.n} publications`);
    });
  });
});

// ---------------------------------------------------------------- Partie B
const NOW = Date.UTC(2026, 10, 6, 12, 3);
// fausse analyse : type, heures écoulées, surprise normalisée, sens du verdict
function an(type, heures, z, sensVerdict) {
  return { type, pub: { t: NOW - heures * 3600000 }, info: L.EFFETS[type], surprise: { brute: z, normalisee: z, sens: z > 0 ? 'dessus' : 'dessous', forte: Math.abs(z) >= 1.5 },
    verdict: { statut: 'mesuré', sens: sensVerdict || 'attendu', bouge: true, reaction: null } };
}

test('contribution = sens × surprise normalisée × poids, avec demi-vie de 24 h', () => {
  const c0 = L.contribution('EUR/USD', an('NFP', 0, 2), NOW);
  close(c0.valeur, -1 * 2 * 3);                          // NFP au-dessus → EUR/USD baissier, impact fort = 3
  const c24 = L.contribution('EUR/USD', an('NFP', 24, 2), NOW);
  close(c24.valeur, -3);                                 // moitié au bout de 24 h
  const c48 = L.contribution('EUR/USD', an('ADP_US', 48, -1), NOW);
  close(c48.valeur, (-1) * (-1) * 2 * 0.25);             // impact moyen = 2, quart au bout de 48 h
  const cp = L.contribution('EUR/USD', an('PROD_INDUS_DE', 0, 1), NOW);
  close(cp.valeur, 1);                                   // impact faible = 1
});

test('contribution divisée par deux si le marché a réagi à l’inverse', () => {
  const c = L.contribution('EUR/USD', an('NFP', 0, 2, 'contraire'), NOW);
  close(c.valeur, -3);
  assert.equal(c.contredite, true);
});

test('NAS100 et NFP : effet variable → contribution nulle', () => {
  close(L.contribution('NAS100', an('NFP', 0, 2), NOW).valeur, 0);
});

test('score borné à ±100, Haussier / Baissier / Neutre', () => {
  const e1 = L.etatMarche('EUR/USD', [an('NFP', 1, -3), an('CPI_US', 2, -3)], [], NOW);
  assert.ok(e1.score > 90 && e1.score <= 100, String(e1.score));
  assert.equal(e1.biais, 'Haussier');
  const e2 = L.etatMarche('EUR/USD', [an('NFP', 1, 2)], [], NOW);
  assert.equal(e2.biais, 'Baissier');
  close(e2.score, Math.round(100 * Math.tanh(-6 * Math.pow(0.5, 1 / 24) / L.SEUILS.SCORE_ECHELLE))); // 1 h de décroissance
  const e3 = L.etatMarche('EUR/USD', [an('PROD_INDUS_DE', 30, 0.5)], [], NOW);
  assert.ok(Math.abs(e3.score) < 15);
  assert.equal(e3.biais, 'Neutre');
  const vide = L.etatMarche('EUR/USD', [], [], NOW);
  assert.equal(vide.score, 0);
  assert.equal(vide.biais, 'Neutre');
  assert.match(vide.phrase, /Aucune news récente/);
});

test('Mitigé si les dernières news fortes vont dans des sens opposés', () => {
  const e = L.etatMarche('EUR/USD', [an('NFP', 2, 2), an('CPI_US', 30, -2.5)], [], NOW);
  assert.equal(e.biais, 'Mitigé');
  assert.match(e.phrase, /se contredisent/);
  // une news forte trop ancienne (> ~4 jours) ne compte plus
  const e2 = L.etatMarche('EUR/USD', [an('NFP', 2, 2), an('CPI_US', 24 * 6, -2.5)], [], NOW);
  assert.equal(e2.biais, 'Baissier');
});

test('phrase : news dominante, biais, et prochaine news de la même devise', () => {
  const futures = [{ type: 'NFP', t: Date.UTC(2026, 10, 6, 13, 30), reel: null }, { type: 'PIB_EZ', t: Date.UTC(2026, 10, 9, 10), reel: null }];
  const e = L.etatMarche('EUR/USD', [an('CPI_US', 3, 2)], futures, NOW);
  assert.match(e.phrase, /^Inflation CPI US : chiffre nettement au-dessus des attentes, publié il y a 3 h, bon signe pour le dollar\./);
  assert.match(e.phrase, /Biais baissier tant que la prochaine news USD n'est pas sortie \(NFP — Emplois non agricoles aujourd'hui à 14:30\)\./);
  assert.equal(e.prochaineForte.type, 'NFP');
  const c = L.etatMarche('EUR/USD', [an('CPI_US', 3, 2, 'contraire')], futures, NOW);
  assert.match(c.phrase, /Le marché a contredit cette news/);
});

test('heures de Paris et de New York (changements d’heure)', () => {
  assert.equal(L.formats.heureParis(Date.UTC(2026, 10, 6, 13, 30)), '14:30');   // hiver
  assert.equal(L.formats.heureParis(Date.UTC(2026, 6, 3, 12, 30)), '14:30');    // été
  assert.equal(L.formats.dateParis(Date.UTC(2026, 10, 6, 13, 30)), 'ven. 6 nov.');
  assert.equal(L.formats.quand(Date.UTC(2026, 10, 5, 13, 30), NOW), 'hier à 14:30');
  assert.equal(L.formats.nombre(-0.1234, 2, true), '−0,12');
  assert.equal(L.formats.nombre(1234.5, 1, true), '+1 234,5');
  // NFP à 8:30 à New York : 14:30 à Paris sauf pendant le décalage de fin octobre (13:30)
  const nfp = L.exemple.publications('NFP').map((p) => L.formats.dateParis(p.t) + ' ' + L.formats.heureParis(p.t));
  assert.ok(nfp.includes('ven. 6 nov. 14:30'), nfp.join(', '));
  assert.ok(nfp.includes('ven. 3 juil. 14:30'), nfp.join(', '));
  const ins = L.exemple.publications('INSCRIPTIONS_US').map((p) => L.formats.dateParis(p.t) + ' ' + L.formats.heureParis(p.t));
  assert.ok(ins.includes('jeu. 29 oct. 13:30'), ins.join(', '));
});

test('données d’exemple : état du marché complet pour les 4 actifs de la page', () => {
  ['EUR/USD', 'XAU/USD', 'NAS100', 'BTC/USD'].forEach((a) => {
    const E = L.exemple.etat(a);
    assert.equal(E.analyses.length, 10, a);
    assert.ok(E.analyses.every((x, i) => i === 0 || x.pub.t <= E.analyses[i - 1].pub.t), a + ' trié');
    assert.ok(E.etat.score >= -100 && E.etat.score <= 100);
    assert.ok(['Haussier', 'Baissier', 'Neutre', 'Mitigé'].includes(E.etat.biais));
    assert.ok(E.etat.phrase.length > 20);
    assert.equal(E.etat.prochaineForte.type, 'NFP');
    assert.ok(E.analyses.every((x) => x.verdict.statut === 'mesuré'), a + ' verdicts');
    assert.ok(E.plusForte.premiere, a);
    const s = E.resume;
    assert.ok(s.ontBouge <= s.mesurees && s.dansLeSens <= s.avecSens);
  });
  // cohérence avec la page News : production allemande du jour
  const pi = L.exemple.publications('PROD_INDUS_DE').find((p) => L.formats.dateParis(p.t) === 'ven. 6 nov.');
  assert.deepEqual([pi.precedent, pi.prevision, pi.reel, L.formats.heureParis(pi.t)], [-0.4, 0.2, 0.5, '08:00']);
});

// ---------------------------------------------------------------- Partie C
test('lecture de la surprise : « surprise positive : plutôt haussier USD, baissier or »', () => {
  const s = { brute: 30, normalisee: 0.8, sens: 'dessus', forte: false };
  assert.equal(L.lectureSurprise('NFP', s, ['XAU/USD']), 'Surprise positive : plutôt haussier USD, baissier or.');
  assert.equal(L.lectureSurprise('NFP', s, L.mesActifsConcernes('NFP')), 'Surprise positive : plutôt haussier USD, baissier EUR/USD, baissier or.');
  const n = { brute: -0.3, normalisee: -2, sens: 'dessous', forte: true };
  assert.equal(L.lectureSurprise('CHOMAGE_US', n, ['EUR/USD']), 'Surprise négative et forte : plutôt haussier USD, baissier EUR/USD.');
  assert.equal(L.lectureSurprise('NFP', { brute: 0, sens: 'conforme' }), 'Conforme aux attentes : pas de surprise.');
  assert.deepEqual(L.mesActifsConcernes('NFP'), ['EUR/USD', 'XAU/USD', 'NAS100']);
  assert.deepEqual(L.mesActifsConcernes('HALIFAX'), []);
});

test('compte à rebours relatif', () => {
  const f = L.formats.dansCombien;
  assert.equal(f(NOW + 42 * MIN, NOW), 'dans 42 min');
  assert.equal(f(NOW + 82 * MIN, NOW), 'dans 1 h 22');
  assert.equal(f(NOW + 120 * MIN, NOW), 'dans 2 h');
  assert.equal(f(NOW + (3 * 24 * 60 + 4 * 60 + 10) * MIN, NOW), 'dans 3 j 4 h');
  assert.equal(f(NOW - 5 * MIN, NOW), 'en cours');
  assert.equal(f(NOW - 60 * MIN, NOW), 'passée');
});

test('zones à éviter : ±15 min, fusion des news proches, fortes et moyennes séparées', () => {
  const t = Date.UTC(2026, 10, 6, 13, 30);
  const z = L.zonesAEviter([
    { t, impact: 3, nom: 'NFP' }, { t, impact: 3, nom: 'Chômage' }, { t: t + 20 * MIN, impact: 3, nom: 'Autre' },
    { t: t + 90 * MIN, impact: 2, nom: 'Michigan' }, { t: t - 5 * 3600000, impact: 1, nom: 'Faible' }
  ]);
  assert.equal(z.length, 2);
  assert.deepEqual([z[0].niveau, z[0].debut, z[0].fin, z[0].noms], [3, t - 15 * MIN, t + 35 * MIN, ['NFP', 'Chômage', 'Autre']]);
  assert.deepEqual([z[1].niveau, z[1].debut, z[1].fin], [2, t + 75 * MIN, t + 105 * MIN]);
  const z2 = L.zonesAEviter([{ t, impact: 3, nom: 'NFP' }], 5, 30);
  assert.deepEqual([z2[0].debut, z2[0].fin], [t - 5 * MIN, t + 30 * MIN]);
});

test('sessions en heure de Paris (hiver) et journée de Paris', () => {
  const j = L.journeeParis(2026, 10, 6);
  assert.equal(L.formats.heureParis(j.debut), '00:00');
  assert.equal(j.fin - j.debut, 24 * 3600000);
  const s = L.sessionsJour(2026, 10, 6).map((x) => x.nom + ' ' + L.formats.heureParis(x.debut) + '–' + L.formats.heureParis(x.fin));
  assert.deepEqual(s, ['Asie 01:00–10:00', 'Londres 09:00–18:00', 'New York 14:00–23:00']);
  // fin octobre : l'Europe est passée à l'heure d'hiver, pas encore New York
  const o = L.sessionsJour(2026, 9, 28).map((x) => L.formats.heureParis(x.debut));
  assert.deepEqual(o, ['01:00', '09:00', '13:00']);
});

test('alerte sur la surprise et impact d’un résultat sur l’indice', () => {
  assert.equal(L.depasseSeuil({ reel: 210, prevision: 165 }, 40), true);
  assert.equal(L.depasseSeuil({ reel: 200, prevision: 165 }, 40), false);
  assert.equal(L.depasseSeuil({ reel: 205, prevision: 165 }, 40), false); // il faut dépasser
  assert.equal(L.depasseSeuil({ reel: null, prevision: 165 }, 40), false);
  close(L.impactSurIndice(9, 7.8), 0.702, 1e-9);
});

// ---------------------------------------------------------------- Partie D
const NFP_T = Date.UTC(2026, 10, 6, 13, 30);
const PUBS = [
  { type: 'NFP', t: NFP_T }, { type: 'CHOMAGE_US', t: NFP_T }, { type: 'MICHIGAN', t: NFP_T + 90 * MIN },
  { type: 'CPI_US', t: NFP_T + 5 * JOUR }, { type: 'PIB_EZ', t: NFP_T - 3 * 3600000 }, { type: 'BOE_TAUX', t: NFP_T + 60 * MIN }
];

test('news proche : news forte de l’actif à moins de 30 min de l’entrée', () => {
  const fortes = L.newsFortesPour('EUR/USD', PUBS);
  assert.deepEqual(fortes.map((p) => p.type), ['NFP', 'CHOMAGE_US', 'CPI_US']); // Michigan et PIB : impact moyen ; BoE : pas EUR/USD
  const p1 = L.newsProche({ sym: 'EUR/USD', t: NFP_T - 12 * MIN }, fortes);
  assert.equal(p1.nom, 'NFP / chômage US');
  assert.equal(p1.ecartMin, -12);
  assert.equal(L.texteTag(p1), '12 min avant NFP / chômage US');
  assert.equal(L.texteTag(L.newsProche({ sym: 'EUR/USD', t: NFP_T + 5 * MIN }, fortes)), '5 min après NFP / chômage US');
  assert.equal(L.texteTag(L.newsProche({ sym: 'EUR/USD', t: NFP_T + 5 * JOUR - 20 * MIN }, fortes)), '20 min avant CPI');
  assert.equal(L.texteTag(L.newsProche({ sym: 'EUR/USD', t: NFP_T }, fortes)), 'pendant NFP / chômage US');
  assert.equal(L.newsProche({ sym: 'EUR/USD', t: NFP_T + 31 * MIN }, fortes), null);
  assert.ok(L.newsProche({ sym: 'EUR/USD', t: NFP_T + 31 * MIN }, fortes, 45));          // seuil réglable
  // l'entrée (t0) compte, pas la sortie (t)
  assert.ok(L.newsProche({ sym: 'EUR/USD', t0: NFP_T - 10 * MIN, t: NFP_T + 3 * 3600000 }, fortes));
  assert.equal(L.taggerTrades([{ sym: 'WTI', t: NFP_T }], PUBS)[0].proche, null);          // le NFP ne touche pas le pétrole
});

test('comparaison avec / sans news, et échantillon trop faible', () => {
  const trades = [];
  for (let i = 0; i < 40; i++) trades.push({ sym: 'EUR/USD', t: NFP_T + (i % 3 - 1) * 10 * MIN, R: i % 5 === 0 ? 1.5 : -1 });   // près du NFP : 8 gagnants sur 40
  for (let i = 0; i < 60; i++) trades.push({ sym: 'EUR/USD', t: NFP_T - (2 + i) * JOUR, R: i % 2 === 0 ? 2 : -1 });             // sans news : 30 sur 60
  const c = L.comparerProcheNews(trades, PUBS);
  assert.deepEqual([c.avec.n, c.sans.n], [40, 60]);
  close(c.avec.reussite, 20); close(c.avec.esperance, (8 * 1.5 - 32) / 40);
  close(c.sans.reussite, 50); close(c.sans.esperance, 0.5);
  assert.equal(c.suffisant, true);
  assert.equal(c.phrase, 'Tes trades proches des news ont une expectancy de −0,5 R contre +0,5 R sans news (réussite 20 % contre 50 %) : éviter les 30 minutes autour des news fortes améliorerait tes résultats.');
  const petit = L.comparerProcheNews(trades.slice(0, 29).concat(trades.slice(40)), PUBS);
  assert.equal(petit.suffisant, false);
  assert.match(petit.phrase, /^Échantillon trop faible pour conclure .* \(ici 29 près d’une news, 60 sans\)\.$/);
});

test('données d’exemple : calendrier sur une période passée et news fortes pour le backtest', () => {
  const pubs = L.exemple.publicationsPeriode(Date.UTC(2025, 2, 3), Date.UTC(2025, 5, 30));
  const nfp = pubs.filter((p) => p.type === 'NFP').map((p) => L.formats.dateParis(p.t) + ' ' + L.formats.heureParis(p.t));
  assert.deepEqual(nfp, ['ven. 7 mars 14:30', 'ven. 4 avr. 14:30', 'ven. 2 mai 14:30', 'ven. 6 juin 14:30']);
  // mêmes chiffres qu'avec publications() pour une date commune
  const recent = L.exemple.publicationsPeriode(Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 31)).find((p) => p.type === 'NFP');
  const ref = L.exemple.publications('NFP').find((p) => p.t === recent.t);
  assert.deepEqual([recent.prevision, recent.reel, recent.precedent], [ref.prevision, ref.reel, ref.precedent]);
  assert.equal(recent.reel, 142);
  const fortes = L.exemple.newsFortesPeriode(['EUR/USD', 'NAS100'], Date.UTC(2025, 2, 3), Date.UTC(2025, 5, 30));
  assert.ok(fortes.length >= 12 && fortes.every((x) => L.EFFETS[x.type].impact === 3));
});

// ---------------------------------------------------------------- Heures de marché ouvert
const H = 3600000;
const VEN_1430 = Date.UTC(2026, 10, 6, 13, 30), VEN_23 = Date.UTC(2026, 10, 6, 22, 0), LUN_01 = Date.UTC(2026, 10, 9, 0, 0); // heures de Paris (UTC+1)

test('news forte du vendredi 14:30 : presque le même poids lundi 01:00 que vendredi 23:00', () => {
  ['EUR/USD', 'XAU/USD', 'NAS100'].forEach((a) => {
    const vendredi = L.contribution(a, an('CPI_US', 0, -2), VEN_23 - 0 * H);
    const nouvelle = (t) => L.contribution(a, Object.assign(an('CPI_US', 0, -2), { pub: { t: VEN_1430 } }), t);
    const v = nouvelle(VEN_23), l = nouvelle(LUN_01);
    assert.ok(Math.abs(l.valeur) / Math.abs(v.valeur) > 0.9, a + ' : ' + l.valeur.toFixed(2) + ' contre ' + v.valeur.toFixed(2));
    assert.ok(l.ageH > 58 && l.ageMarcheH < 11, a + ' âge ' + l.ageMarcheH);
    assert.ok(vendredi);
  });
  // le bitcoin, ouvert tout le week-end, continue de vieillir
  const btc = (t) => L.contribution('BTC/USD', Object.assign(an('CPI_US', 0, -2), { pub: { t: VEN_1430 } }), t);
  assert.ok(Math.abs(btc(LUN_01).valeur) < Math.abs(btc(VEN_23).valeur) * 0.3);
});

test('marketHoursBetween : week-end, pause du NAS100 et semaines de changement d’heure', () => {
  close(L.marketHoursBetween('EUR/USD', VEN_1430, VEN_23), 8.5);
  close(L.marketHoursBetween('EUR/USD', VEN_1430, LUN_01), 10.5);          // réouverture dimanche 23:00
  close(L.marketHoursBetween('NAS100', VEN_1430, LUN_01), 9.5);            // réouverture lundi 00:00 (dimanche 18:00 à New York)
  close(L.marketHoursBetween('BTC/USD', VEN_1430, LUN_01), 58.5);          // ouvert 24 h/24
  close(L.marketHoursBetween('NAS100', Date.UTC(2026, 10, 10, 21, 0), Date.UTC(2026, 10, 11, 0, 0)), 2); // pause 23:00–00:00 à Paris
  close(L.marketHoursBetween('EUR/USD', Date.UTC(2026, 10, 7, 12), Date.UTC(2026, 10, 8, 12)), 0);       // samedi → dimanche midi : fermé
  // 8 mars 2026 : New York passe à l'heure d'été, pas encore Paris → le forex rouvre à 22:00 à Paris
  const ouv = L.periodesOuverture('EUR/USD', Date.UTC(2026, 2, 7), Date.UTC(2026, 2, 10))[0][0];
  assert.equal(L.formats.dateParis(ouv) + ' ' + L.formats.heureParis(ouv), 'dim. 8 mars 22:00');
  // 1er nov. 2026 : New York repasse à l'heure d'hiver une semaine après Paris → réouverture 23:00 à Paris
  const ouv2 = L.periodesOuverture('EUR/USD', Date.UTC(2026, 9, 31), Date.UTC(2026, 10, 3))[0][0];
  assert.equal(L.formats.heureParis(ouv2), '23:00');
  assert.equal(L.formats.ageMarcheSiDifferent(8.5, 8.5), '');
  assert.equal(L.formats.ageMarcheSiDifferent(58.5, 10.5), '11 h de marché');
});
