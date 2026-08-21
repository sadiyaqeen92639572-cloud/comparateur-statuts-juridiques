/*
 * Moteur de calcul pur — aucune ref DOM, aucun accès fichier.
 * Utilisé (a) côté build par generate-pages.js via require(), (b) inliné
 * côté client dans les pages générées (même pattern que meat-cooking-time-calculator).
 *
 * Approximations MVP à valider contre le simulateur officiel URSSAF avant publication
 * (voir plan de build, étape 2): calcul de l'IR simplifié via TMI marginal plutôt que
 * barème progressif complet par tranche; cotisations société traitées en taux moyen
 * plutôt qu'en barème réel (PASS, tranches TNS, etc.).
 *
 * Portage salarial (calculerPortageSalarial): taux_charges_patronales_portage traité
 * comme constante (~42%) — approximation valable pour TJM 400-700€ (largement au-dessus
 * du seuil de réduction générale ex-Fillon ~1,6 SMIC). Sous ce seuil de brut, la réduction
 * générale de cotisations patronales change le calcul réel — voir avertissement affiché
 * dans le widget (generate-pages.js) en dessous d'un salaire brut mensuel bas. Pas de
 * barème par tranches (PASS, AGIRC-ARRCO) implémenté en v1.
 */

function appliquerTmi(revenuImposable, tmi) {
  return Math.max(0, revenuImposable) * tmi;
}

function calculIS(benefice, constantes) {
  const b = Math.max(0, benefice);
  const { seuil_benefice, taux } = constantes.is_taux_reduit;
  const tauxNormal = constantes.is_taux_normal;
  if (b <= seuil_benefice) return b * taux;
  return seuil_benefice * taux + (b - seuil_benefice) * tauxNormal;
}

function calculerIndividuel(statut, params) {
  const { ca, type_activite, charges_reelles = 0, option_vlf = false, tmi = 0.30 } = params;

  if (statut.regime_fiscal === "micro-fiscal") {
    const tauxCotis = statut.taux_cotisations_sociales[type_activite];
    const abattement = statut.abattement_forfaitaire[type_activite];
    const seuil = statut.seuils_ca[type_activite];

    const cotisations_sociales = ca * tauxCotis;
    const revenu_imposable = ca * (1 - abattement);

    let impot_revenu;
    if (option_vlf) {
      impot_revenu = ca * statut.versement_liberatoire_taux[type_activite];
    } else {
      impot_revenu = appliquerTmi(revenu_imposable, tmi);
    }

    const revenu_net_apres_impot = ca - cotisations_sociales - impot_revenu;

    return {
      revenu_imposable,
      cotisations_sociales,
      impot_revenu,
      revenu_net_apres_impot,
      taux_prelevement_global: ca > 0 ? (cotisations_sociales + impot_revenu) / ca : 0,
      alerte_depassement_seuil: seuil != null && ca > seuil
    };
  }

  // EI régime réel (BIC/BNC)
  const benefice = ca - charges_reelles;
  const cotisations_sociales = Math.max(0, benefice) * (statut.taux_cotisations_sociales_estime || 0.30);
  const revenu_imposable = benefice - cotisations_sociales;
  const impot_revenu = appliquerTmi(revenu_imposable, tmi);
  const revenu_net_apres_impot = benefice - cotisations_sociales - impot_revenu;

  return {
    revenu_imposable,
    cotisations_sociales,
    impot_revenu,
    revenu_net_apres_impot,
    taux_prelevement_global: ca > 0 ? (cotisations_sociales + impot_revenu) / ca : 0,
    alerte_depassement_seuil: false
  };
}

function calculerSociete(statut, params, constantes) {
  const {
    ca,
    charges_exploitation = 0,
    remuneration_gerant = 0,
    tmi = 0.30,
    dividendes_verses = 0
  } = params;

  const estAssimileSalarie = statut.regime_social_president === "assimile_salarie"
    || statut.regime_social_gerant_minoritaire === "assimile_salarie" && params.gerant_minoritaire;

  const tauxChargesTns = statut.taux_cotisations_tns_estime || 0.45;

  // Assimilé salarié (SASU/SAS président, gérant minoritaire SARL) : remuneration_gerant est le
  // SALAIRE BRUT. Les cotisations patronales (~42.5% du brut) s'ajoutent au coût pour l'entreprise ;
  // les cotisations salariales (~21% du brut) se déduisent du brut pour obtenir le net. Ce sont deux
  // bases distinctes appliquées au MÊME brut -- ne jamais soustraire le taux combiné (65%) deux fois.
  const tauxChargesPatronales = statut.taux_charges_patronales_president
    || statut.taux_charges_patronales_gerant_minoritaire
    || 0.425;
  const tauxChargesSalariales = statut.taux_charges_salariales_president
    || statut.taux_charges_salariales_gerant_minoritaire
    || 0.21;

  const cotisations_patronales_gerant = estAssimileSalarie ? remuneration_gerant * tauxChargesPatronales : 0;
  const cotisations_salariales_gerant = estAssimileSalarie
    ? remuneration_gerant * tauxChargesSalariales
    : remuneration_gerant * tauxChargesTns;
  // Pour le TNS, il n'y a pas de "part patronale" distincte -- le régime TNS applique son taux
  // directement, donc cotisations_sociales_gerant (affiché) = la seule charge, patronale = 0.
  const cotisations_sociales_gerant = estAssimileSalarie
    ? cotisations_patronales_gerant + cotisations_salariales_gerant
    : cotisations_salariales_gerant;

  const remuneration_nette_sociale = remuneration_gerant - cotisations_salariales_gerant;

  const benefice_avant_is = estAssimileSalarie
    ? ca - charges_exploitation - remuneration_gerant - cotisations_patronales_gerant
    : ca - charges_exploitation - remuneration_gerant - cotisations_salariales_gerant;
  const is_du = calculIS(benefice_avant_is, constantes);
  const benefice_apres_is = Math.max(0, benefice_avant_is) - is_du;

  const dividendes = Math.min(dividendes_verses, Math.max(0, benefice_apres_is));
  const dividendes_nets_apres_flat_tax = dividendes * (1 - constantes.flat_tax_dividendes);

  const impot_revenu_remuneration = appliquerTmi(remuneration_nette_sociale, tmi);
  const revenu_net_total_foyer = remuneration_nette_sociale - impot_revenu_remuneration + dividendes_nets_apres_flat_tax;

  return {
    benefice_avant_is,
    is_du,
    remuneration_nette_sociale,
    cotisations_sociales_gerant,
    impot_revenu_remuneration,
    dividendes_nets_apres_flat_tax,
    revenu_net_total_foyer,
    taux_prelevement_global: ca > 0 ? 1 - (revenu_net_total_foyer / ca) : 0
  };
}

// Portage salarial n'est pas un statut individuel/société : pas de forme sociale, pas de
// capital, pas d'arbitrage rémunération/dividendes. Toute la marge de la société de portage
// est le frais_gestion, prélevé en amont -- le salaire_brut est DÉRIVÉ (reverse-solve), pas
// un input libre comme remuneration_gerant en société. Voir plan de build pour le détail de
// l'ordre des opérations et pourquoi il ne faut pas réutiliser calculerSociete() ici.
function calculerPortageSalarial(statut, params) {
  let { tjm, jours, taux_frais_gestion_override, tmi = 0.30, ca } = params;
  if (tjm == null && ca != null) {
    // Adaptation pour réutilisation par comparateur/migration, qui raisonnent en CA annuel
    // (pas en TJM×jours) -- convertit le CA annuel en TJM équivalent sur une base standard
    // de jours facturables/AN (pas /mois: jours ici doit rester la base ANNUELLE complète
    // pour que ca_facture = tjm*jours retombe exactement sur le CA annuel d'entrée, sinon
    // tous les montants dérivés seraient mensuels alors que les autres statuts raisonnent en
    // annuel -- silencieusement 12x trop bas). Le simulateur dédié (TJM/jours saisis
    // directement, jours = jours/MOIS) n'emprunte jamais cette branche.
    const joursFacturablesAn = statut.jours_facturables_an_defaut || 216;
    jours = joursFacturablesAn;
    tjm = ca / joursFacturablesAn;
  }
  tjm = tjm || 0;
  jours = jours || 0;

  const ca_facture = tjm * jours;

  const taux_frais_gestion = taux_frais_gestion_override ?? statut.taux_frais_gestion_defaut ?? 0.05;
  const frais_gestion = ca_facture * taux_frais_gestion;

  const budget_salarial = ca_facture - frais_gestion;

  const taux_patronales = statut.taux_charges_patronales_portage || 0.42;
  // DIVISER pour isoler le brut à partir du budget total (brut + patronales) -- ne pas
  // multiplier budget_salarial par taux_patronales, ce serait appliquer le taux à la
  // mauvaise base (même piège que le warning ci-dessus sur calculerSociete).
  const salaire_brut = budget_salarial / (1 + taux_patronales);
  const cotisations_patronales = budget_salarial - salaire_brut;

  const taux_reserve = statut.taux_reserve_financiere_defaut || 0.10;
  const reserve_financiere = salaire_brut * taux_reserve; // provisionnée, PAS perdue -- restituable en fin de mission

  const taux_salariales = statut.taux_charges_salariales_portage || 0.22;
  const cotisations_salariales = salaire_brut * taux_salariales;
  const salaire_net_avant_impot = salaire_brut - cotisations_salariales;

  // Net avant impôt sur le revenu -- c'est ce chiffre qui va dans le hero du widget, pour
  // rester comparable terme à terme aux simulateurs concurrents (qui n'intègrent pas la
  // situation fiscale personnelle de l'utilisateur). Voir plan de build, section "hero avant IR".
  const net_verse_immediat = salaire_net_avant_impot - reserve_financiere;

  const impot_revenu = appliquerTmi(net_verse_immediat, tmi);
  const net_reel_en_poche = net_verse_immediat - impot_revenu;

  // Deux taux distincts, volontairement séparés (même logique que le hero avant IR) : les
  // charges de portage (gestion+patronales+salariales+réserve) sont structurelles et
  // comparables entre sociétés, l'IR dépend de la situation fiscale personnelle -- les
  // mélanger dans un seul taux rendrait "taux_charges_global" faussement élevé et
  // incohérent avec les chiffres "40-60% de net" publiés par les sociétés de portage
  // elles-mêmes (qui n'intègrent jamais l'IR personnel).
  const taux_charges_global = ca_facture > 0 ? 1 - (net_verse_immediat / ca_facture) : 0; // avant IR
  const taux_prelevement_global = ca_facture > 0 ? 1 - (net_reel_en_poche / ca_facture) : 0; // après IR, cohérent avec les autres statuts

  return {
    ca_facture,
    frais_gestion,
    salaire_brut,
    cotisations_patronales,
    cotisations_salariales,
    reserve_financiere,
    salaire_net_avant_impot,
    net_verse_immediat,
    impot_revenu,
    net_reel_en_poche,
    taux_charges_global,
    net_total_reserve_incluse: net_verse_immediat + reserve_financiere,
    taux_prelevement_global,
    revenu_net_apres_impot: net_reel_en_poche
  };
}

function calculerStatut(statutId, params, statutsData) {
  const statut = statutsData.statuts[statutId];
  if (!statut) throw new Error(`Statut inconnu: ${statutId}`);
  const resultat = statut.categorie === "individuel" ? calculerIndividuel(statut, params)
    : statut.categorie === "portage_salarial" ? calculerPortageSalarial(statut, params)
    : calculerSociete(statut, params, statutsData.constantes_communes);
  return { ...resultat, revenu_net_apres_impot: resultat.revenu_net_apres_impot ?? resultat.revenu_net_total_foyer };
}

function comparerStatuts(idA, idB, params, statutsData) {
  const resA = calculerStatut(idA, params, statutsData);
  const resB = calculerStatut(idB, params, statutsData);
  return {
    resA,
    resB,
    delta_revenu_net: resB.revenu_net_apres_impot - resA.revenu_net_apres_impot,
    seuil_bascule_ca: findSeuilBascule(idA, idB, params, statutsData)
  };
}

function deltaAt(idA, idB, ca, baseParams, statutsData) {
  const params = { ...baseParams, ca };
  const resA = calculerStatut(idA, params, statutsData);
  const resB = calculerStatut(idB, params, statutsData);
  return resB.revenu_net_apres_impot - resA.revenu_net_apres_impot;
}

function findSeuilBascule(idA, idB, baseParams, statutsData, opts = {}) {
  const { min = 0, max = 300000, tol = 100 } = opts;
  let lo = min, hi = max;
  const deltaLo = deltaAt(idA, idB, lo, baseParams, statutsData);
  const deltaHi = deltaAt(idA, idB, hi, baseParams, statutsData);

  // CA=0 est une égalité dégénérée pour la quasi-totalité des paires de statuts (les deux
  // valent structurellement 0 à CA nul) -- Math.sign(0) ne doit jamais être traité comme un
  // signe réel, sinon une "bascule" fantôme est détectée à quelques euros de CA (bug trouvé
  // lors de l'intégration du portage salarial ; reproductible aussi sur des paires déjà en
  // prod, ex: auto-entrepreneur vs SASU).
  const signeLo = deltaLo === 0 ? Math.sign(deltaHi) : Math.sign(deltaLo);
  const signeHi = Math.sign(deltaHi);

  if (signeLo === signeHi) {
    // Pas de croisement détecté dans l'intervalle — dominance monotone (ou absence de test fin,
    // voir testMonotonicite() pour vérifier avant de généraliser sur une nouvelle paire).
    return null;
  }

  while (hi - lo > tol) {
    const mid = (lo + hi) / 2;
    const deltaMid = deltaAt(idA, idB, mid, baseParams, statutsData);
    if (Math.sign(deltaMid) === signeLo) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.round((lo + hi) / 2);
}

function testMonotonicite(idA, idB, baseParams, statutsData, opts = {}) {
  const { min = 0, max = 300000, pas = 1000 } = opts;
  let changementsDeSigne = 0;
  let signePrecedent = null;
  for (let ca = min; ca <= max; ca += pas) {
    const delta = deltaAt(idA, idB, ca, baseParams, statutsData);
    const signe = Math.sign(delta);
    if (signePrecedent !== null && signe !== 0 && signe !== signePrecedent) {
      changementsDeSigne++;
    }
    if (signe !== 0) signePrecedent = signe;
  }
  return { changementsDeSigne, monotone: changementsDeSigne <= 1 };
}

function optimiserSplitRemunerationDividendes(statutId, params, statutsData, opts = {}) {
  const { pas = 5000 } = opts;
  const statut = statutsData.statuts[statutId];
  const budgetDistribuable = params.ca - (params.charges_exploitation || 0);

  let meilleur = null;
  const points = [];
  for (let remuneration = 0; remuneration <= budgetDistribuable; remuneration += pas) {
    const resultat = calculerSociete(statut, { ...params, remuneration_gerant: remuneration, dividendes_verses: budgetDistribuable }, statutsData.constantes_communes);
    points.push({ remuneration, revenu_net_total_foyer: resultat.revenu_net_total_foyer });
    if (!meilleur || resultat.revenu_net_total_foyer > meilleur.revenu_net_total_foyer) {
      meilleur = { remuneration, revenu_net_total_foyer: resultat.revenu_net_total_foyer };
    }
  }
  return { meilleur, points };
}

if (typeof module !== "undefined") {
  module.exports = {
    calculerIndividuel,
    calculerSociete,
    calculerPortageSalarial,
    calculerStatut,
    comparerStatuts,
    findSeuilBascule,
    testMonotonicite,
    optimiserSplitRemunerationDividendes
  };
}
