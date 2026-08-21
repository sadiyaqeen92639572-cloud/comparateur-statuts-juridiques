const fs = require("fs");
const path = require("path");
const {
  calculerStatut,
  calculerPortageSalarial,
  comparerStatuts,
  testMonotonicite,
  optimiserSplitRemunerationDividendes
} = require("./calc-engine.js");

const statutsData = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/statuts.json")));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

// Auto-entrepreneur, prestations BNC, CA 60000, sans VLF
const ae = calculerStatut("auto-entrepreneur", { ca: 60000, type_activite: "prestations_services_bnc", tmi: 0.30 }, statutsData);
assert(ae.cotisations_sociales > 0, "AE cotisations_sociales > 0");
assert(ae.revenu_net_apres_impot < 60000, "AE revenu net < CA brut");
console.log("  détail AE:", ae);

// EURL vs SASU comparaison
const cmp = comparerStatuts("eurl", "sasu", { ca: 80000, charges_exploitation: 10000, remuneration_gerant: 30000, tmi: 0.30, dividendes_verses: 20000 }, statutsData);
console.log("  détail comparateur EURL/SASU:", cmp);
assert(typeof cmp.delta_revenu_net === "number", "delta_revenu_net est numérique");

// Monotonicité auto-entrepreneur vs SASU
const mono = testMonotonicite("auto-entrepreneur", "sasu", { type_activite: "prestations_services_bnc", charges_exploitation: 10000, remuneration_gerant: 30000, tmi: 0.30, dividendes_verses: 0 }, statutsData);
console.log("  monotonicité AE vs SASU:", mono);
assert(mono.monotone, "AE vs SASU: pas plus d'1 changement de signe (0-300k, pas 1000)");

// Split optimal SASU
const split = optimiserSplitRemunerationDividendes("sasu", { ca: 100000, charges_exploitation: 20000, tmi: 0.30 }, statutsData, { pas: 5000 });
console.log("  split optimal SASU:", split.meilleur);
assert(split.meilleur.remuneration >= 0, "split optimal trouvé");

// Portage salarial — TJM 500€, 18 jours/mois, TMI 30%
const portage = calculerPortageSalarial(statutsData.statuts["portage-salarial"], { tjm: 500, jours: 18, tmi: 0.30 });
console.log("  détail portage salarial:", portage);
assert(portage.net_reel_en_poche < portage.ca_facture, "Portage: net réel en poche < CA facturé");
assert(portage.reserve_financiere > 0, "Portage: réserve financière > 0");
assert(portage.taux_charges_global > 0.35 && portage.taux_charges_global < 0.55, "Portage: taux de charges global dans une plage plausible (0.35-0.55)");
const EPS = 0.01;
assert(
  Math.abs((portage.ca_facture - portage.frais_gestion - portage.cotisations_patronales - portage.cotisations_salariales - portage.reserve_financiere) - portage.net_verse_immediat) < EPS,
  "Portage: identité comptable exacte avant IR (CA - frais_gestion - patronales - salariales - réserve === net_versé_immédiat)"
);
assert(
  Math.abs((portage.net_verse_immediat - portage.impot_revenu) - portage.net_reel_en_poche) < EPS,
  "Portage: identité comptable exacte après IR (net_versé_immédiat - impôt === net_réel_en_poche)"
);

// Adapter CA→TJM du portage (réutilisé par comparateur/migration) — ca_facture doit
// retomber exactement sur le CA d'entrée, sinon tous les montants dérivés seraient
// silencieusement mensuels au lieu d'annuels (bug réel trouvé et corrigé en build).
const portageViaCA = calculerPortageSalarial(statutsData.statuts["portage-salarial"], { ca: 60000, tmi: 0.30 });
assert(Math.abs(portageViaCA.ca_facture - 60000) < EPS, "Portage via adapter CA: ca_facture === CA d'entrée (pas 1/12e)");

const cmpPortage = comparerStatuts("auto-entrepreneur", "portage-salarial", { ca: 60000, type_activite: "prestations_services_bnc", tmi: 0.30 }, statutsData);
console.log("  détail comparateur AE/portage:", cmpPortage);
assert(typeof cmpPortage.delta_revenu_net === "number", "comparerStatuts AE vs portage: delta numérique");

console.log(process.exitCode ? "\nDes tests ont échoué." : "\nTous les tests basiques passent (structure/valeurs plausibles, PAS encore validé vs URSSAF officiel).");
