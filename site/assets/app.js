/* Tesla suivi : code du site V1.3.
   Le site ne contient aucune donnée de veille. Il lit quatre fichiers :
   data/entrees.json, data/historique.json, data/journal.json et data/prix.json (voir « Interface de données du site »). V1.1. */
(function () {
  'use strict';
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var THEMES = ['Prix France', 'Model 3', 'Model Y', 'Hardware', 'FSD'];
  var STATUTS = {
    'Confirmé': { g: '●', c: 's-confirme' },
    'Annoncé, déploiement à vérifier': { g: '◐', c: 's-annonce' },
    'Retour d’expérience': { g: '◇', c: 's-retour' },
    'Rumeur non confirmée': { g: '?', c: 's-rumeur' },
    'Corrigé': { g: '✎', c: 's-corrige' }
  };
  var ROLES = { originale: 'Originale', reprise: 'Reprise', complementaire: 'Complémentaire' };
  var JOURS_FIL = 60;
  var D = { entrees: [], historique: [], journal: [], prix: [] };
  var F = { q: '', theme: '', model: '', terr: '', status: '', period: '' };
  var app = document.getElementById('app');
  var NOM = 'Tesla suivi', AN = String(new Date().getFullYear());

  /* ---------- Outils ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function parseDay(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; }
  function fr(s) { var d = parseDay(s); return d ? d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear() : ''; }
  function short(s) { var d = parseDay(s); return d ? ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) : ''; }
  function frDT(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d).replace(' à ', ', ');
  }
  function ageDays(s) { var d = parseDay(s); return d ? (Date.now() - d.getTime()) / 86400000 : 99999; }
  function euros(n) { return typeof n === 'number' && isFinite(n) ? new Intl.NumberFormat('fr-FR').format(n) + ' €' : 'Non relevé'; }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function link(u, label) { var s = safeUrl(u); return s ? '<a href="' + esc(s) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>' : esc(label); }
  function byId(id) { return D.entrees.filter(function (e) { return e.id === id; })[0]; }

  /* ---------- Données ---------- */
  function load(name) {
    return fetch('data/' + name + '.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + ' : HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!Array.isArray(j)) throw new Error(name + ' : format inattendu');
      return j;
    });
  }
  function normaliser(e) {
    e.modeles = arr(e.modeles); e.sources = arr(e.sources); e.contradictions = arr(e.contradictions);
    e.statut = String(e.statut || ''); e.territoire = String(e.territoire || ''); e.theme = String(e.theme || '');
    return e;
  }
  function journalOk() {
    return D.journal.filter(function (r) { return r && /^succ[eè]s$/i.test(String(r.resultat || '')) && !isNaN(new Date(r.date_execution)); });
  }
  function derniere(rows) {
    return rows.reduce(function (m, r) { return !m || new Date(r.date_execution) > new Date(m.date_execution) ? r : m; }, null);
  }
  function isExpired(e) { var d = e.prix && parseDay(e.prix.echeance); return !!d && d.getTime() < Date.now() - 86400000; }
  function inFeed(e) { return ageDays(e.date_publication) <= JOURS_FIL; }
  function sorted(list) { return list.slice().sort(function (a, b) { return (a.date_publication || '') < (b.date_publication || '') ? 1 : -1; }); }

  /* ---------- Éléments communs ---------- */
  function statusHTML(e) {
    var s = STATUTS[e.statut] || { g: '·', c: 's-autre' };
    return '<span class="status ' + s.c + '"><span class="glyph" aria-hidden="true">' + s.g + '</span><span><span class="sr">Statut : </span>' + esc(e.statut) + '</span></span>';
  }
  function metaHTML(e) {
    var dup = e.modeles.length === 1 && e.modeles[0] === e.theme;
    return (isNew(e) ? '<b class="new">Nouveau</b> ' : '') + fr(e.date_publication) + '<span class="sep">·</span>' + esc(e.theme) + (dup || !e.modeles.length ? '' : '<span class="sep">·</span>' + esc(e.modeles.join(' / '))) + '<span class="sep">·</span>' + esc(e.territoire) + (isExpired(e) ? ' <span class="expired">offre échue</span>' : '');
  }
  function videoHTML(v) {
    var img = safeUrl(v.miniature_url), href = safeUrl(v.url);
    var thumb = '<div class="thumb">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '<span class="play" aria-hidden="true"></span></div>';
    var body = '<div><p class="v-title">' + esc(v.titre) + '</p><p class="v-meta">' + esc(v.chaine) + (v.date ? ' · ' + esc(fr(v.date) || v.date) : '') + (v.base_analyse ? '<br>Base d’analyse : ' + esc(v.base_analyse) : '') + '</p></div>';
    return href ? '<a class="video" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir la vidéo : ' + esc(v.titre) + '">' + thumb + body + '</a>' : '<div class="video">' + thumb + body + '</div>';
  }
  function groupeHTML(e) {
    var n = e.sources.filter(function (s) { return s.role === 'reprise'; }).length;
    return n ? '<div class="group"><b>Regroupement :</b> cette entrée réunit une source originale et ' + n + (n > 1 ? ' reprises' : ' reprise') + ' de la même déclaration. L’ensemble compte pour une seule confirmation.</div>' : '';
  }

  /* ---------- Accueil ---------- */
  function feedItems() {
    return sorted(D.entrees.filter(inFeed)).filter(function (e) {
      if (F.theme && e.theme !== F.theme) return false;
      if (F.model && e.modeles.indexOf(F.model) < 0) return false;
      if (F.terr && e.territoire.indexOf(F.terr) !== 0) return false;
      if (F.status && e.statut !== F.status) return false;
      if (F.period && ageDays(e.date_publication) > parseInt(F.period, 10)) return false;
      if (F.q) {
        var h = [e.titre, e.resume, e.theme, e.modeles.join(' '), e.hardware, e.territoire].join(' ').toLowerCase();
        if (h.indexOf(F.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
  }
  function itemHTML(e) {
    var href = '#/info/' + encodeURIComponent(e.id);
    return '<li class="item"><div class="meta">' + metaHTML(e) + '</div><h3><a href="' + href + '">' + esc(e.titre) + '</a></h3><p class="resume">' + esc(e.resume) + '</p>' + groupeHTML(e) + (e.video ? videoHTML(e.video) : '') +
      '<div class="row">' + statusHTML(e) + '<a class="more-link" href="' + href + '">Lire l’analyse et les sources <span aria-hidden="true">&nbsp;→</span></a></div></li>';
  }
  function retenirHTML() {
    var base = sorted(D.entrees.filter(inFeed));
    var choix = base.filter(function (e) { return e.alerte === true; }).concat(base.filter(function (e) { return e.alerte !== true; })).slice(0, 3);
    if (!choix.length) return '';
    return '<section class="retenir" aria-labelledby="h-ret"><h2 id="h-ret">À retenir</h2><p class="sub">Les points essentiels de la veille</p><ol class="cards">' + choix.map(function (e, i) {
      var c = String(e.consequence || '').split(/(?<=[.!?])\s/)[0];
      return '<li class="card"><span class="cn">' + ('0' + (i + 1)).slice(-2) + '</span><span class="ct">' + esc(e.theme) + (isNew(e) ? ' · <b class="new">Nouveau</b>' : '') + '</span><a class="ctitle" href="#/info/' + encodeURIComponent(e.id) + '">' + esc(String(e.titre).replace(/[.\s]+$/, '')) + '</a><span class="cc">' + esc(c) + '</span><span class="cgo">Lire <span aria-hidden="true">→</span></span></li>';
    }).join('') + '</ol></section>';
  }

  /* ---------- Accueil vivant : bande des prix, silhouette, cartes ---------- */
  var SILH = '<svg class="silh" viewBox="0 0 260 96" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 70 L16 56 C16 51 20 48 28 47 C44 45 56 42 68 36 C88 22 120 18 148 22 C170 26 188 38 206 45 L224 50 C230 52 232 58 232 70"/><path d="M16 70 L40 70 M92 70 L148 70 M200 70 L232 70"/><path d="M40 70 A26 26 0 0 1 92 70"/><path d="M148 70 A26 26 0 0 1 200 70"/><circle cx="66" cy="70" r="15"/><circle cx="174" cy="70" r="15"/><path d="M82 40 C96 30 118 27 142 29 C158 31 172 38 186 44 Z"/></svg>';
  function eur(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, String.fromCharCode(8239)) + String.fromCharCode(160) + '€'; }
  function stripHTML() {
    var ok = relevesLisibles(), last = ok[ok.length - 1];
    if (!last) return '';
    var prev = ok.length > 1 ? ok[ok.length - 2] : null;
    function carte(modele) {
      var v = versionsDe(last, modele).filter(function (x) { return x.version === 'Propulsion'; })[0] || versionsDe(last, modele)[0];
      if (!v) return '';
      var pv = prev && versionsDe(prev, modele).filter(function (x) { return x.version === v.version; })[0];
      var d = pv ? v.catalogue_eur - pv.catalogue_eur : null;
      var delta = d === null ? 'Premier relevé' : (d === 0 ? 'Inchangé depuis le relevé précédent' : (d > 0 ? '▲ +' : '▼ ') + eur(d).replace('+', ''));
      return '<a class="pcard" href="#/prix"><span class="pl">' + modele + ' · à partir de</span><span class="pv">' + eur(v.catalogue_eur) + '</span><span class="pd">' + esc(v.version) + ' · ' + delta + '</span></a>';
    }
    return '<div class="pstrip" role="group" aria-label="Prix catalogue du jour">' + carte('Model 3') + carte('Model Y') +
      '<p class="pnote">Prix catalogue lus sur le configurateur Tesla France le ' + esc(fr(last.date_releve)) + '. <a href="#/prix">Grille complète et évolution →</a></p></div>';
  }
  function refDay() { var m = ''; D.entrees.forEach(function (e) { if ((e.date_verification || '') > m) m = e.date_verification; }); return m; }
  function isNew(e) { var r = parseDay(refDay()), d = parseDay(e.date_publication); return r && d && (r - d) <= 2 * 864e5; }
  function veilleHTML() {
    var ok = derniere(journalOk()), nv = derniere(journalOk().filter(function (r) { return r.nouveautes === true; }));
    if (!ok) return '<p class="veille"><b>Veille :</b> aucune exécution enregistrée pour l’instant.</p>';
    return '<p class="veille"><b>Dernière veille réussie :</b> ' + esc(frDT(ok.date_execution)) + '<br><b>Dernière nouveauté trouvée :</b> ' + (nv ? esc(frDT(nv.date_execution)) : 'aucune pour l’instant') + '</p>';
  }
  function homeHTML() {
    var counts = {};
    D.entrees.filter(inFeed).forEach(function (e) { counts[e.theme] = (counts[e.theme] || 0) + 1; });
    var chips = '<button class="chip" type="button" data-chip="" aria-pressed="' + (F.theme === '' ? 'true' : 'false') + '">Tout</button>' + THEMES.map(function (t) {
      return '<button class="chip" type="button" data-chip="' + t + '" aria-pressed="' + (F.theme === t ? 'true' : 'false') + '">' + t + '</button>';
    }).join('');
    function opts(list, cur) {
      return '<option value="">Tous</option>' + list.map(function (a) { var v = Array.isArray(a) ? a[0] : a, l = Array.isArray(a) ? a[1] : a; return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
    }
    var vide = !D.entrees.length ? '<div class="empty"><p><b>Aucune information publiée pour l’instant.</b> Le site est prêt ; la première veille doit encore être chargée. Rien n’est affiché tant qu’aucune information vérifiée n’existe.</p></div>' : '';
    return '<section class="hero"><p class="kicker">Veille Tesla · Model 3 et Model Y · France</p><h1>' + NOM + ' <span class="an">' + AN + '</span></h1><p class="lede">L’essentiel des évolutions, ce qui est confirmé et ce qui ne l’est pas, avec les sources.</p>' + SILH + stripHTML() + veilleHTML() + '</section>' +
      '<div class="wrap">' + retenirHTML() + '<div class="layout"><div>' +
      '<section class="tools" aria-labelledby="h-fil"><h2 id="h-fil">Fil chronologique</h2>' +
      '<label class="sr" for="q">Rechercher dans la veille</label><input class="search" id="q" type="search" placeholder="Rechercher : prix, FSD, calculateur…" value="' + esc(F.q) + '" autocomplete="off">' +
      '<div class="chips" role="group" aria-label="Filtrer par thème">' + chips + '</div>' +
      '<details class="more"' + ((F.model || F.terr || F.status || F.period) ? ' open' : '') + '><summary>Plus de filtres : modèle, territoire, statut, période</summary><div class="more-grid">' +
      '<div class="field"><label for="f-model">Modèle</label><select id="f-model">' + opts(['Model 3', 'Model Y'], F.model) + '</select></div>' +
      '<div class="field"><label for="f-terr">Territoire</label><select id="f-terr">' + opts(['France', 'Europe', 'International'], F.terr) + '</select></div>' +
      '<div class="field"><label for="f-status">Statut</label><select id="f-status">' + opts(Object.keys(STATUTS), F.status) + '</select></div>' +
      '<div class="field"><label for="f-period">Période</label><select id="f-period">' + opts([['7', '7 derniers jours'], ['30', '30 derniers jours']], F.period) + '</select></div></div></details>' +
      '<div class="count-row"><span id="count" aria-live="polite"></span><button class="linkbtn" type="button" id="reset">Réinitialiser les filtres</button></div></section>' +
      vide + '<ol class="feed" id="feed"></ol>' +
      '<p style="padding:30px 0 0;border-top:1px solid var(--line)"><a class="more-link" href="#/archives">Consulter les archives <span aria-hidden="true">&nbsp;→</span></a></p></div>' +
      '<aside class="aside" aria-label="Repères"><section><h2>Rubriques</h2><ul>' + THEMES.map(function (t) { return '<li><a href="#/" data-theme="' + t + '"><span>' + t + '</span><span class="n">' + (counts[t] || 0) + '</span></a></li>'; }).join('') + '</ul></section>' +
      '<section><h2>État de la veille</h2><p>Dernière exécution réussie et dernière nouveauté trouvée sont deux informations distinctes. Sans nouveauté, la page garde son contenu et le dit.</p></section>' +
      '<section><h2>Prix</h2><p>Prix catalogue relevés sur le configurateur Tesla France, avec leur évolution dans le temps.</p><ul><li><a href="#/prix"><span>Ouvrir la grille des prix</span><span aria-hidden="true">→</span></a></li></ul></section>' +
      '<section><h2>Archives</h2><p>Le fil montre les ' + JOURS_FIL + ' derniers jours. Tout le reste, y compris les offres échues et les corrections, reste consultable.</p><ul><li><a href="#/archives"><span>Ouvrir les archives</span><span aria-hidden="true">→</span></a></li></ul></section></aside></div></div>';
  }
  function updateFeed() {
    var feed = document.getElementById('feed'), count = document.getElementById('count');
    if (!feed) return;
    var items = feedItems();
    feed.innerHTML = items.length ? items.map(itemHTML).join('') : (D.entrees.length ? '<li class="item"><p class="resume">Aucune information ne correspond à ces filtres.</p></li>' : '');
    count.textContent = items.length + (items.length > 1 ? ' informations affichées' : ' information affichée');
  }

  /* ---------- Détail ---------- */
  function prixHTML(e) {
    var p = e.prix;
    if (!p || typeof p !== 'object') return '';
    var rien = [p.catalogue_eur, p.remise_eur, p.apres_aides_eur].every(function (v) { return typeof v !== 'number'; });
    var h = '<h2>Prix' + (p.version ? ' : ' + esc(p.version) : '') + '</h2>';
    if (rien) h += '<div class="callout"><strong>Aucun prix relevé.</strong> Les montants ne sont affichés que lorsqu’ils ont été lus sur une source officielle, avec leur date.</div>';
    else h += '<div class="pricegrid"><div class="pr"><span>Prix catalogue</span><span>' + euros(p.catalogue_eur) + '</span></div><div class="pr"><span>Prix remisé</span><span>' + euros(p.remise_eur) + '</span></div><div class="pr"><span>Prix après aides</span><span>' + euros(p.apres_aides_eur) + '</span></div>' + (p.echeance ? '<div class="pr"><span>Échéance de l’offre</span><span>' + esc(fr(p.echeance)) + '</span></div>' : '') + '</div>';
    if (p.conditions) h += '<p>' + esc(p.conditions) + '</p>';
    if (p.date_releve || p.source_url) h += '<p>' + (p.date_releve ? 'Relevé du ' + esc(fr(p.date_releve)) + '. ' : '') + (safeUrl(p.source_url) ? link(p.source_url, 'Source du relevé') : '') + '</p>';
    return h;
  }
  function limitesHTML(e) {
    var l = [];
    e.sources.forEach(function (s) { if (s.accessible === false) l.push('Source inaccessible lors de la vérification : ' + s.nom + (s.role === 'originale' ? ' (source originale)' : '') + '.'); });
    if (e.video && e.video.base_analyse && e.video.base_analyse !== 'visionnage') l.push('Vidéo : ' + e.video.base_analyse + ' seulement ; le contenu n’a pas été analysé en entier.');
    if (e.statut === 'Confirmé' && !e.sources.some(function (s) { return s.role === 'originale' && s.accessible !== false; })) l.push('Aucune source originale accessible n’est indiquée pour cette confirmation.');
    var h = l.length ? '<ul class="list">' + l.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p>Aucune limite particulière n’est signalée pour cette entrée.</p>';
    if (e.contradictions.length) h += '<h3 style="font-size:22px;margin:18px 0 6px">Points non arbitrés</h3><ul class="list">' + e.contradictions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    return h;
  }
  function historiqueEntree(e) {
    var rows = [[e.date_publication, 'Publication de l’entrée']];
    D.historique.filter(function (h) { return h && h.id_entree === e.id; }).forEach(function (h) {
      var t = (h.champ ? h.champ + ' : ' : '') + (h.ancienne_valeur !== undefined && h.ancienne_valeur !== '' ? h.ancienne_valeur + ' → ' : '') + (h.nouvelle_valeur !== undefined ? h.nouvelle_valeur : '') + (h.motif ? ' (' + h.motif + ')' : '');
      rows.push([h.date, t]);
    });
    if (e.date_verification) rows.push([e.date_verification, 'Dernière vérification']);
    return rows;
  }
  function detailHTML(e) {
    var corr = '';
    if (e.statut === 'Corrigé') {
      var cs = D.historique.filter(function (h) { return h && h.id_entree === e.id && h.motif; }).sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; })[0];
      corr = '<div class="callout"><strong>Correction' + (cs ? ' du ' + esc(fr(cs.date)) : '') + '.</strong> ' + (cs ? esc(cs.motif) : 'Cette entrée a été corrigée ; voir l’historique ci-dessous.') + '</div>';
    }
    var exp = isExpired(e) ? '<div class="callout"><strong>Offre échue le ' + esc(fr(e.prix.echeance)) + '.</strong> L’entrée reste conservée avec ses conditions d’origine.</div>' : '';
    var fsd = e.fsd ? '<dt>Étape FSD</dt><dd>' + esc(e.fsd.etape) + '</dd><dt>Supervision</dt><dd>' + esc(e.fsd.supervision) + '</dd>' : '';
    var h = '<div class="wrap"><article class="detail"><a class="back" href="#/"><span aria-hidden="true">←&nbsp;</span> Retour au fil</a><div class="meta">' + metaHTML(e) + '</div><h1>' + esc(e.titre) + '</h1><div class="row">' + statusHTML(e) + '</div>' + corr + exp +
      '<dl class="facts"><dt>Publié</dt><dd>' + esc(fr(e.date_publication)) + '</dd><dt>Vérifié</dt><dd>' + esc(fr(e.date_verification)) + '</dd><dt>Thème</dt><dd>' + esc(e.theme) + '</dd><dt>Modèles</dt><dd>' + esc(e.modeles.join(', ') || '—') + '</dd><dt>Matériel</dt><dd>' + esc(e.hardware || '—') + '</dd><dt>Territoire</dt><dd>' + esc(e.territoire) + '</dd>' + fsd + '</dl>' +
      '<h2>Ce qui est nouveau</h2><p>' + esc(e.resume) + '</p><h2>Ce que cela change pour vous</h2><p>' + esc(e.consequence) + '</p>' + prixHTML(e) + (e.video ? '<h2>Vidéo associée</h2>' + videoHTML(e.video) : '') +
      '<h2>Preuves et limites de vérification</h2>' + groupeHTML(e) + limitesHTML(e) +
      '<h2>Sources</h2><ul class="sources">' + (e.sources.length ? e.sources.map(function (s) {
        return '<li><span class="role">' + esc(ROLES[s.role] || s.role) + (s.type ? ' · ' + esc(s.type) : '') + '</span>' + link(s.url, s.nom || s.url) + '<span class="note">' + (s.date ? esc(fr(s.date) || s.date) : 'Date non indiquée') + (s.accessible === false ? ' · inaccessible' : '') + (s.interet_commercial === 'oui' ? ' · intérêt commercial' : '') + '</span></li>';
      }).join('') : '<li>Aucune source indiquée.</li>') + '</ul>' +
      '<h2>Historique de l’entrée</h2><ul class="hist">' + historiqueEntree(e).map(function (r) { return '<li><span class="d">' + esc(fr(r[0])) + '</span><span>' + esc(r[1]) + '</span></li>'; }).join('') + '</ul>' +
      '<h2>Adresse stable</h2><p class="addr">#/info/' + esc(e.id) + '</p></article></div>';
    return h;
  }

  /* ---------- Archives ---------- */
  function archivesHTML() {
    var all = sorted(D.entrees), g = {};
    all.forEach(function (e) { var k = (e.date_publication || '').slice(0, 7) || 'inconnu'; (g[k] = g[k] || []).push(e); });
    var keys = Object.keys(g).sort().reverse();
    var corps = keys.length ? keys.map(function (k) {
      var m = parseInt(k.slice(5), 10) - 1;
      return '<h2>' + (MOIS[m] || '') + ' ' + k.slice(0, 4) + '</h2><ul>' + g[k].map(function (e) {
        return '<li><span class="d">' + short(e.date_publication) + '</span><a href="#/info/' + encodeURIComponent(e.id) + '">' + esc(e.titre) + '</a><span class="s">' + esc(e.theme) + ' · ' + esc(e.statut) + (isExpired(e) ? ' · offre échue' : '') + '</span></li>';
      }).join('') + '</ul>';
    }).join('') : '<p class="empty">Aucune information archivée pour l’instant.</p>';
    return '<div class="wrap"><section class="arch"><a class="back" href="#/"><span aria-hidden="true">←&nbsp;</span> Retour au fil</a><h1>Archives</h1><p style="color:var(--soft);max-width:60ch">Toutes les informations restent consultables à leur adresse. Les offres échues et les corrections gardent leur statut daté.</p>' + corps + '</section></div>';
  }

  /* ---------- Grille des prix (data/prix.json) ---------- */
  var DASH = ['', '10 5', '3 4', '10 4 2 4'];
  function ms(k) { return Date.parse(k + 'T12:00:00Z'); }
  function dayKey(iso) { return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(iso)); }
  function courtVersion(n) { return String(n).replace('Premium Grande Autonomie', 'Premium GA').replace('Transmission Intégrale', 'TI'); }
  function relevesLisibles() {
    return D.prix.filter(function (r) { return r && typeof r === 'object' && !isNaN(new Date(r.date_releve)) && arr(r.versions).length && r.statut_lecture !== 'indisponible'; })
      .sort(function (a, b) { return new Date(a.date_releve) - new Date(b.date_releve); });
  }
  function versionsDe(r, modele) {
    return arr(r.versions).filter(function (v) { return v && v.modele === modele && typeof v.catalogue_eur === 'number' && isFinite(v.catalogue_eur); });
  }
  function series(modele) {
    var days = {}, order = [], names = [];
    relevesLisibles().forEach(function (r) { var k = dayKey(r.date_releve); if (!days[k]) order.push(k); days[k] = r; });
    order.forEach(function (k) { versionsDe(days[k], modele).forEach(function (v) { if (names.indexOf(v.version) < 0) names.push(v.version); }); });
    return {
      days: order,
      names: names.map(function (n) {
        return { nom: n, pts: order.map(function (k) { var v = versionsDe(days[k], modele).filter(function (x) { return x.version === n; })[0]; return v ? { k: k, v: v.catalogue_eur } : null; }).filter(Boolean) };
      })
    };
  }
  function lineKey(i) {
    return '<svg width="34" height="10" aria-hidden="true" focusable="false"><line x1="1" y1="5" x2="33" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"' + (DASH[i % 4] ? ' stroke-dasharray="' + DASH[i % 4] + '"' : '') + '/></svg>';
  }
  function grilleHTML(modele) {
    var ok = relevesLisibles(), last = ok[ok.length - 1], prev = ok.length > 1 ? ok[ok.length - 2] : null;
    var rows = versionsDe(last, modele).map(function (v) {
      var pv = prev ? versionsDe(prev, modele).filter(function (x) { return x.version === v.version; })[0] : null;
      var evo = !pv ? '—' : (v.catalogue_eur === pv.catalogue_eur ? 'inchangé' : (v.catalogue_eur > pv.catalogue_eur ? '+ ' : '− ') + euros(Math.abs(v.catalogue_eur - pv.catalogue_eur)));
      var aides = arr(v.aides).map(function (a) {
        return esc(a.libelle) + ' : ' + (typeof a.montant_eur === 'number' ? esc(euros(a.montant_eur)) : 'montant non relevé') + (a.condition ? ' (' + esc(a.condition) + ')' : '');
      }).join('<br>') || 'Aucune aide relevée';
      return '<tr><th scope="row" data-label="Version">' + esc(v.version) + '</th><td data-label="Prix catalogue" class="num">' + esc(euros(v.catalogue_eur)) + '</td><td data-label="Depuis le relevé précédent">' + esc(evo) + '</td><td data-label="Aides affichées">' + aides + '</td></tr>';
    }).join('');
    if (!rows) return '<p class="empty">Aucune version de ' + esc(modele) + ' relevée.</p>';
    return '<table class="ptable"><caption class="sr">Prix catalogue ' + esc(modele) + ', relevé du ' + esc(frDT(last.date_releve)) + '</caption><thead><tr><th scope="col">Version</th><th scope="col">Prix catalogue</th><th scope="col">Depuis le relevé précédent</th><th scope="col">Aides affichées</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function valeursHTML(modele) {
    var s = series(modele);
    if (!s.names.length) return '';
    var head = '<tr><th scope="col">Date</th>' + s.names.map(function (n) { return '<th scope="col">' + esc(courtVersion(n.nom)) + '</th>'; }).join('') + '</tr>';
    var body = s.days.map(function (k) {
      return '<tr><th scope="row">' + esc(fr(k)) + '</th>' + s.names.map(function (n) { var p = n.pts.filter(function (x) { return x.k === k; })[0]; return '<td class="num">' + (p ? esc(euros(p.v)) : 'Non relevé') + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<details class="vals"><summary>Voir les valeurs en tableau</summary><div class="vals-wrap"><table class="vtable"><caption class="sr">Prix catalogue ' + esc(modele) + ' par date de relevé</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></details>';
  }
  function chartHTML(modele) {
    var s = series(modele);
    if (!s.names.length) return '';
    var note = s.days.length < 2 ? '<p class="chart-note">Un seul jour de relevé pour l’instant. La courbe se dessinera dès le deuxième relevé ; un prix qui ne change pas reste une ligne droite.</p>' : '';
    return '<figure class="chart"><figcaption>Évolution du prix catalogue, ' + esc(modele) + '</figcaption><div class="chart-box" data-chart="' + esc(modele) + '"></div><ul class="legend">' + s.names.map(function (n, i) { return '<li>' + lineKey(i) + '<span>' + esc(n.nom) + '</span></li>'; }).join('') + '</ul>' + note + valeursHTML(modele) + '</figure>';
  }
  function prixPageHTML() {
    var ok = relevesLisibles(), last = ok[ok.length - 1];
    var tous = D.prix.filter(function (r) { return r && !isNaN(new Date(r.date_releve)); }).sort(function (a, b) { return new Date(a.date_releve) - new Date(b.date_releve); });
    var dernierTentative = tous[tous.length - 1];
    var h = '<div class="wrap"><section class="arch prixpage"><a class="back" href="#/"><span aria-hidden="true">←&nbsp;</span> Retour au fil</a><h1>Grille des prix</h1>' +
      '<p class="lede2">Prix catalogue des Model 3 et Model Y en France, lus sur le configurateur officiel de Tesla, avec la date de chaque relevé. Un prix qui n’a pas pu être lu n’est jamais remplacé par un ancien prix.</p>';
    if (!last) return h + '<div class="callout"><strong>Aucun relevé de prix publié pour l’instant.</strong> Les prix ne sont affichés qu’après lecture sur le configurateur Tesla France, avec leur date.</div><p><a class="more-link" href="#/" data-theme="Prix France">Voir les actualités sur les prix <span aria-hidden="true">&nbsp;→</span></a></p></section></div>';
    var src = [];
    [['Model 3', last.source_url_model3], ['Model Y', last.source_url_modely]].forEach(function (x) { if (safeUrl(x[1])) src.push(link(x[1], 'Configurateur ' + x[0])); });
    h += '<p class="veille"><b>Dernier relevé lu :</b> ' + esc(frDT(last.date_releve)) + (last.statut_lecture === 'partiel' ? ' <span class="expired">lecture partielle</span>' : '') + (src.length ? '<br><b>Sources :</b> ' + src.join(' · ') : '') + '</p>';
    if (dernierTentative && dernierTentative !== last && new Date(dernierTentative.date_releve) > new Date(last.date_releve)) {
      h += '<div class="callout"><strong>Relevé du ' + esc(frDT(dernierTentative.date_releve)) + ' : indisponible.</strong> Les prix ci-dessous datent du relevé précédent' + (dernierTentative.note ? ' (' + esc(dernierTentative.note) + ')' : '') + '.</div>';
    }
    ['Model 3', 'Model Y'].forEach(function (m) { h += '<h2>' + m + '</h2>' + grilleHTML(m) + chartHTML(m); });
    h += '<div class="callout"><strong>Ce ne sont pas des devis.</strong> Les montants sont ceux que le configurateur affiche sans code postal ; l’éligibilité aux aides n’est pas validée. Relire le configurateur avant toute décision.</div>' +
      '<p><a class="more-link" href="#/" data-theme="Prix France">Voir les actualités sur les prix <span aria-hidden="true">&nbsp;→</span></a></p></section></div>';
    return h;
  }
  function drawChart(box) {
    var modele = box.getAttribute('data-chart'), s = series(modele);
    if (!s.names.length) return;
    var W = Math.max(280, box.clientWidth), wide = W >= 560, H = W < 520 ? 250 : 310;
    var m = { l: 64, r: wide ? 176 : 22, t: 18, b: 38 };
    var all = [];
    s.names.forEach(function (n) { n.pts.forEach(function (p) { all.push(p.v); }); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), step = (hi - lo) > 12000 ? 5000 : 2000;
    lo = Math.floor((lo - 1000) / step) * step; hi = Math.ceil((hi + 1000) / step) * step;
    var t0 = ms(s.days[0]), t1 = ms(s.days[s.days.length - 1]), single = t0 === t1, pw = W - m.l - m.r, ph = H - m.t - m.b;
    function X(t) { return single ? m.l + pw / 2 : m.l + (t - t0) / (t1 - t0) * pw; }
    function Y(v) { return m.t + (hi - v) / (hi - lo) * ph; }
    var g = '', i;
    for (var v = lo; v <= hi; v += step) g += '<line class="g" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (m.l - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + new Intl.NumberFormat('fr-FR').format(v) + '</text>';
    var idx = [];
    s.days.forEach(function (k, j) {
      var x = X(ms(k));
      if (!idx.length) { idx.push(j); return; }
      var lx = X(ms(s.days[idx[idx.length - 1]]));
      if (x - lx >= 64) idx.push(j);
      else if (j === s.days.length - 1 && idx.length > 1) { idx[idx.length - 1] = j; }
    });
    if (idx.length > 1 && idx[idx.length - 1] !== s.days.length - 1) {
      var lastX = X(t1), prevX = X(ms(s.days[idx[idx.length - 1]]));
      if (lastX - prevX >= 64) idx.push(s.days.length - 1); else idx[idx.length - 1] = s.days.length - 1;
    }
    idx.forEach(function (j) { var k = s.days[j]; g += '<text x="' + X(ms(k)) + '" y="' + (H - 10) + '" text-anchor="' + (idx.length > 1 && j === 0 ? 'start' : (idx.length > 1 && j === s.days.length - 1 ? 'end' : 'middle')) + '">' + short(k) + '</text>'; });
    var lines = '', ends = [], labels = '';
    s.names.forEach(function (n, si) {
      var d = '';
      n.pts.forEach(function (p, pi) { var x = X(ms(p.k)), y = Y(p.v); d += pi === 0 ? 'M' + x + ' ' + y : ' H' + x + ' V' + y; });
      if (n.pts.length > 1) lines += '<path d="' + d + '" fill="none" stroke="#0A0A0A" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + (DASH[si % 4] ? ' stroke-dasharray="' + DASH[si % 4] + '"' : '') + '/>';
      var lp = n.pts[n.pts.length - 1];
      ends.push({ x: X(ms(lp.k)), y: Y(lp.v), nom: n.nom });
    });
    ends.forEach(function (e) { lines += '<circle cx="' + e.x + '" cy="' + e.y + '" r="4.5" fill="#0A0A0A" stroke="#FDFBF7" stroke-width="2"/>'; });
    if (wide) {
      var ys = ends.map(function (e) { return { y: e.y, nom: e.nom }; }).sort(function (a, b) { return a.y - b.y; });
      for (i = 1; i < ys.length; i++) if (ys[i].y - ys[i - 1].y < 16) ys[i].y = ys[i - 1].y + 16;
      ys.forEach(function (e) { labels += '<text class="dl" x="' + (X(t1) + 12) + '" y="' + (e.y + 4) + '">' + esc(courtVersion(e.nom)) + '</text>'; });
    }
    box.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" tabindex="0" role="img" aria-label="Évolution du prix catalogue ' + esc(modele) + ' : ' + s.days.length + ' jour(s) de relevé. Les valeurs sont aussi dans le tableau ci-dessous.">' + g + lines + labels + '<line class="xh" x1="0" x2="0" y1="' + m.t + '" y2="' + (H - m.b) + '" visibility="hidden"/><rect x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '" fill="transparent" class="hit"/></svg><div class="tip" role="status" hidden></div>';
    var svg = box.firstChild, tip = box.querySelector('.tip'), xh = svg.querySelector('.xh'), cur = s.days.length - 1;
    function show(j) {
      cur = Math.max(0, Math.min(s.days.length - 1, j));
      var k = s.days[cur], x = X(ms(k));
      xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
      tip.textContent = '';
      var t = document.createElement('div'); t.className = 'tip-d'; t.textContent = fr(k); tip.appendChild(t);
      s.names.forEach(function (n, si) {
        var p = n.pts.filter(function (q) { return q.k === k; })[0], row = document.createElement('div'); row.className = 'tip-r';
        row.innerHTML = lineKey(si);
        var val = document.createElement('b'); val.textContent = p ? euros(p.v) : 'Non relevé';
        var nom = document.createElement('span'); nom.textContent = courtVersion(n.nom);
        row.appendChild(val); row.appendChild(nom); tip.appendChild(row);
      });
      tip.hidden = false;
      var tw = tip.offsetWidth, left = x + 14; if (left + tw > W - 4) left = x - tw - 14; tip.style.left = Math.max(4, left) + 'px'; tip.style.top = (m.t + 6) + 'px';
    }
    function hide() { xh.setAttribute('visibility', 'hidden'); tip.hidden = true; }
    svg.addEventListener('pointermove', function (ev) {
      var r = svg.getBoundingClientRect(), px = ev.clientX - r.left, best = 0, bd = 1e9;
      s.days.forEach(function (k, j) { var dd = Math.abs(X(ms(k)) - px); if (dd < bd) { bd = dd; best = j; } });
      show(best);
    });
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', function () { show(cur); });
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowLeft') { show(cur - 1); ev.preventDefault(); } else if (ev.key === 'ArrowRight') { show(cur + 1); ev.preventDefault(); } else if (ev.key === 'Escape') hide();
    });
  }
  function drawCharts() { document.querySelectorAll('.chart-box').forEach(drawChart); }
  var rz = null;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(drawCharts, 150); });

  /* ---------- Mentions légales et méthode ---------- */
  function mentionsHTML() {
    var u = ['vttpolux25', 'gmail.com'].join('@');
    return '<div class="wrap"><section class="arch mentions"><a class="back" href="#/"><span aria-hidden="true">←&nbsp;</span> Retour au fil</a><h1>Mentions légales et méthode</h1>' +
      '<h2>Éditeur</h2><p>Site personnel, non professionnel, édité par un particulier qui souhaite rester anonyme. Conformément à l’article 6 de la loi du 21 juin 2004 pour la confiance dans l’économie numérique, son identité a été communiquée à l’hébergeur.</p>' +
      '<h2>Hébergeur</h2><p>GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis (service GitHub Pages).</p>' +
      '<h2>Contact, corrections et droit de réponse</h2><p>Pour signaler une erreur, demander une correction ou exercer un droit de réponse : <a href="mailto:' + u + '">' + u + '</a>. Toute information corrigée garde une trace datée de la correction.</p>' +
      '<h2>Indépendance</h2><p>Ce site est indépendant et n’a aucun lien avec Tesla, Inc. Tesla, Model 3 et Model Y sont des marques de leurs propriétaires, citées uniquement pour désigner les produits dont il est question. Le site ne contient ni publicité, ni lien d’affiliation, ni parrainage.</p>' +
      '<h2>Méthode</h2><p>Chaque information est rattachée à ses sources, avec sa date de publication et sa date de vérification. Un statut indique son degré de certitude : <b>Confirmé</b> (source d’origine accessible), <b>Annoncé, déploiement à vérifier</b>, <b>Retour d’expérience</b>, <b>Rumeur non confirmée</b>, <b>Corrigé</b>. Un titre, une miniature ou une vidéo promotionnelle ne constituent jamais une preuve suffisante.</p>' +
      '<p>La veille est préparée avec l’aide d’outils d’intelligence artificielle, puis validée par l’éditeur avant publication. Les prix sont lus sur le configurateur officiel de Tesla France, avec la date de chaque relevé ; un prix qui n’a pas pu être lu n’est jamais remplacé par un ancien prix.</p>' +
      '<h2>Limites</h2><p>Ce site est une veille d’information personnelle. Il ne constitue ni un conseil d’achat, ni un devis, ni une offre. Les prix et conditions sont indicatifs : seuls font foi le configurateur et les conditions de Tesla au moment de la commande.</p>' +
      '<h2>Données personnelles</h2><p>Le site n’utilise ni cookie, ni outil de mesure d’audience, ni publicité. Il est hébergé par GitHub Pages, qui peut enregistrer des données techniques de connexion (dont l’adresse IP) selon sa propre politique. Les polices de caractères sont actuellement chargées depuis le service Google Fonts, ce qui transmet l’adresse IP du visiteur à Google ; elles seront prochainement hébergées sur le site même.</p>' +
      '</section></div>';
  }

  /* ---------- Routage ---------- */
  function setNav(view, theme) {
    document.querySelectorAll('#navlinks a').forEach(function (a) {
      a.removeAttribute('aria-current');
      if ((view === 'archives' || view === 'prix') && a.dataset.view === view) a.setAttribute('aria-current', 'page');
      if (view === 'home' && !a.dataset.view && (a.dataset.theme || '') === (theme || '')) a.setAttribute('aria-current', 'page');
    });
  }
  function route(noScroll) {
    var h = location.hash || '#/', m = h.match(/^#\/info\/(.+)$/), id = m ? decodeURIComponent(m[1]) : '';
    if (m && byId(id)) { app.innerHTML = detailHTML(byId(id)); setNav('detail'); document.title = byId(id).titre + ' — ' + NOM; }
    else if (h === '#/prix') { app.innerHTML = prixPageHTML(); setNav('prix'); document.title = 'Grille des prix — ' + NOM; drawCharts(); }
    else if (h === '#/mentions') { app.innerHTML = mentionsHTML(); setNav('mentions'); document.title = 'Mentions légales et méthode — ' + NOM; }
    else if (h === '#/archives') { app.innerHTML = archivesHTML(); setNav('archives'); document.title = 'Archives — ' + NOM; }
    else {
      if (m) { app.innerHTML = '<div class="wrap"><p class="notice"><b>Information introuvable.</b> Cette adresse ne correspond à aucune entrée. <a href="#/">Retour au fil</a>.</p></div>'; setNav('detail'); document.title = 'Information introuvable — ' + NOM; }
      else { app.innerHTML = homeHTML(); updateFeed(); setNav('home', F.theme); document.title = NOM; }
    }
    if (!noScroll) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', function () { route(); });
  document.addEventListener('click', function (ev) {
    var chip = ev.target.closest('[data-chip]');
    if (chip) { F.theme = chip.dataset.chip; route(true); return; }
    var nl = ev.target.closest('a[data-theme]');
    if (nl) {
      ev.preventDefault(); F.theme = nl.dataset.theme;
      if ((location.hash || '#/') !== '#/') location.hash = '#/'; else route(true);
      setTimeout(function () { var el = document.getElementById('h-fil'); if (el) el.scrollIntoView({ block: 'start' }); }, 30);
      return;
    }
    if (ev.target.id === 'reset') { F = { q: '', theme: '', model: '', terr: '', status: '', period: '' }; route(true); }
  });
  document.addEventListener('input', function (ev) { if (ev.target.id === 'q') { F.q = ev.target.value; updateFeed(); } });
  document.addEventListener('change', function (ev) {
    var map = { 'f-model': 'model', 'f-terr': 'terr', 'f-status': 'status', 'f-period': 'period' };
    if (map[ev.target.id]) { F[map[ev.target.id]] = ev.target.value; updateFeed(); }
  });

  /* ---------- Démarrage ---------- */
  Promise.all([load('entrees'), load('historique'), load('journal'), load('prix').catch(function () { return []; })]).then(function (r) {
    D.entrees = r[0].filter(function (e) { return e && typeof e === 'object' && e.id && e.titre; }).map(normaliser);
    D.historique = r[1]; D.journal = r[2]; D.prix = r[3];
    try { var bv = document.querySelector('.brand-version'); if (bv) bv.textContent = AN; } catch (x) {}
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (x) {}
    route(false);
  }).catch(function (err) {
    app.innerHTML = '<div class="wrap"><p class="notice"><b>La veille est momentanément indisponible.</b> Les données n’ont pas pu être lues. Rien n’a été modifié ; réessayez plus tard.<br><span class="addr">' + esc(err && err.message) + '</span></p></div>';
  });
})();
