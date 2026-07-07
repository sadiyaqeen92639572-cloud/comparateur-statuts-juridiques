# Comparateur de statuts juridiques

Simulateurs et comparateurs gratuits pour choisir un statut juridique en France (auto-entrepreneur,
entreprise individuelle, EURL, SASU, SARL) : cotisations sociales, impôt, IS, revenu net.

**Homepage** (`index.html`) est écrite à la main et n'est pas régénérée.
Toutes les autres pages (`simulateur/`, `comparateur/`, `charges/`, `migration/`, `metier/`) sont
générées par `generate-pages.js` à partir de la routing table `PAGES[]` et de la donnée
réglementaire `data/statuts.json`.

## Structure

- `data/statuts.json` — source de vérité réglementaire (taux, seuils, régime fiscal/social par
  statut). **À faire valider par un expert-comptable avant publication** (`verifie_expert_comptable: false`
  tant que ce n'est pas fait).
- `lib/calc-engine.js` — moteur de calcul pur, utilisé à la fois côté build (`require`) et inliné
  côté client dans chaque page générée.
- `lib/test-calc-engine.js` — tests de structure/plausibilité (`node lib/test-calc-engine.js`).
  Ne remplace pas une validation contre le simulateur officiel URSSAF.
- `generate-pages.js` — génère toutes les pages + `sitemap.xml`. Run: `node generate-pages.js`.

## Ajouter une page

Ajouter une entrée dans `PAGES[]` (dans `generate-pages.js`) avec le `type` voulu
(`simulateur` / `comparateur` / `charges` / `migration` / `comparateur_metier`), puis
`node generate-pages.js`.

## Ajouter un statut

Ajouter une entrée dans `data/statuts.json`, puis les fonctions de calcul spécifiques dans
`lib/calc-engine.js` si sa logique diffère des statuts existants (`categorie: "individuel"` ou
`"societe"`).

## Déploiement

GitHub Pages via Actions (`.github/workflows/pages.yml`) — build & deploy déclenchés sur push vers
`main`.
