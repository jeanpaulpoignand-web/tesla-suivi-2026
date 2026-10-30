/* Tesla suivi 2026 : code du site V1.
   Le site ne contient aucune donnée de veille. Il lit trois fichiers :
   data/entrees.json, data/historique.json, data/journal.json (voir « Interface de données du site »). */
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
  var D = { entrees: [], historique: [], journal: [] };
  var F = { q: '', theme: '', model: '', terr: '', status: '', period: '' };
  var app = document.getElementById('app');

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
    return fr(e.date_publication) + '<span class="sep">·</span>' + esc(e.theme) + (dup || !e.modeles.length ? '' : '<span class="sep">·</span>' + esc(e.modeles.join(' / '))) + '<span class="sep">·</span>' + esc(e.territoire) + (isExpired(e) ? ' <span class="expired">offre échue</span>' : '');
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
    return '<section class="retenir" aria-labelledby="h-ret"><h2 id="h-ret">À retenir</h2><p class="sub">Les points essentiels de la veille</p><ol>' + choix.map(function (e) {
      var c = String(e.consequence || '').split(/(?<=[.!?])\s/)[0];
      return '<li><p><strong>' + esc(String(e.titre).replace(/[.\s]+$/, '')) + '.</strong> ' + esc(c) + ' <a href="#/info/' + encodeURIComponent(e.id) + '">Détail</a></p></li>';
    }).join('') + '</ol></section>';
  }
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
    return '<section class="hero"><p class="kicker">Veille Tesla · Model 3 et Model Y · France</p><h1>Tesla suivi 2026</h1><p class="lede">L’essentiel des évolutions, ce qui est confirmé et ce qui ne l’est pas, avec les sources.</p>' + veilleHTML() + '</section>' +
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

  /* ---------- Routage ---------- */
  function setNav(view, theme) {
    document.querySelectorAll('#navlinks a').forEach(function (a) {
      a.removeAttribute('aria-current');
      if (view === 'archives' && a.dataset.view === 'archives') a.setAttribute('aria-current', 'page');
      if (view === 'home' && a.dataset.view !== 'archives' && (a.dataset.theme || '') === (theme || '')) a.setAttribute('aria-current', 'page');
    });
  }
  function route(noScroll) {
    var h = location.hash || '#/', m = h.match(/^#\/info\/(.+)$/), id = m ? decodeURIComponent(m[1]) : '';
    if (m && byId(id)) { app.innerHTML = detailHTML(byId(id)); setNav('detail'); document.title = byId(id).titre + ' — Tesla suivi 2026'; }
    else if (h === '#/archives') { app.innerHTML = archivesHTML(); setNav('archives'); document.title = 'Archives — Tesla suivi 2026'; }
    else {
      if (m) { app.innerHTML = '<div class="wrap"><p class="notice"><b>Information introuvable.</b> Cette adresse ne correspond à aucune entrée. <a href="#/">Retour au fil</a>.</p></div>'; setNav('detail'); document.title = 'Information introuvable — Tesla suivi 2026'; }
      else { app.innerHTML = homeHTML(); updateFeed(); setNav('home', F.theme); document.title = 'Tesla suivi 2026'; }
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
  Promise.all([load('entrees'), load('historique'), load('journal')]).then(function (r) {
    D.entrees = r[0].filter(function (e) { return e && typeof e === 'object' && e.id && e.titre; }).map(normaliser);
    D.historique = r[1]; D.journal = r[2];
    route(true);
  }).catch(function (err) {
    app.innerHTML = '<div class="wrap"><p class="notice"><b>La veille est momentanément indisponible.</b> Les données n’ont pas pu être lues. Rien n’a été modifié ; réessayez plus tard.<br><span class="addr">' + esc(err && err.message) + '</span></p></div>';
  });
})();
