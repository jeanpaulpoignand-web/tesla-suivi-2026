# Tesla suivi 2026

Site statique de veille Tesla Model 3 / Model Y, marché français.

## État — porte 2

Page d’attente uniquement : « Tesla suivi 2026, site en préparation ».
Aucune donnée de veille, aucun lot de test, aucune tâche planifiée.

## Structure

- `site/` : fichiers de présentation ; contient actuellement la page d’attente.
- `data/entrees.json` : tableau vide.
- `data/historique.json` : tableau vide.
- `data/journal.json` : tableau vide.
- `.github/workflows/pages.yml` : validation des JSON, assemblage et publication Pages.

Le workflow copie `site/` à la racine de l’artefact puis `data/` dans son sous-dossier `data/`. Le site pourra ainsi lire les données par URL relative. Seul cet artefact est publié ; le README et les outils restent hors du site.

## Publication

Dans Settings → Pages → Build and deployment → Source, choisir **GitHub Actions**.
Le workflow part sur chaque push vers `main`, ou manuellement depuis Actions → Publier la page d’attente → Run workflow.
Aucun déclencheur périodique n’est défini.

Si Pages n’est pas encore activé, le workflow échouera à l’étape de configuration ; activer la source comme indiqué, puis relancer le workflow complet. L’adresse finale est fournie par l’étape de déploiement.

## Étapes suivantes

Intégration du code de Claude, test avec un lot de type test et test de restauration : porte 3, après validation.
Ne publier aucune donnée de démonstration, donnée personnelle ou secret.
