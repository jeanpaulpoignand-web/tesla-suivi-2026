# Tesla suivi 2026

## État — porte 3

Code du site de Claude intégré à l’identique sur la branche integration-site-v1, en attente de validation. La branche main et le site public conservent la page d’attente.

- site/index.html, site/assets/style.css, site/assets/app.js : livraison Claude V1.
- data/entrees.json, data/historique.json, data/journal.json : tableaux vides sur cette branche.
- .github/workflows/pages.yml : inchangé ; publication uniquement sur main (ou lancement manuel).

La branche essai-lot-test est réservée au test à blanc et au test de restauration. Ne pas fusionner ses données dans main. Aucun lancement manuel de publication pendant les essais.
