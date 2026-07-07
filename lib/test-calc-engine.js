const fs = require("fs");
const path = require("path");
const {
  calculerStatut,
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

console.log(process.exitCode ? "\nDes tests ont échoué." : "\nTous les tests basiques passent (structure/valeurs plausibles, PAS encore validé vs URSSAF officiel).");
