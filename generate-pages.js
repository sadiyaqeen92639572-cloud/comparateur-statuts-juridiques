/* Comparateur de statuts juridiques — générateur de pages
 * Emet: /simulateur/<statut>/ (implémenté), /comparateur/, /charges/, /migration/,
 * /metier/ (à venir — voir plan de build). Homepage index.html est écrite à la main
 * (non régénérée), même convention que meat-cooking-time-calculator.
 * Run: node generate-pages.js
 */
const fs = require('fs');
const path = require('path');
const {
  calculerStatut,
  comparerStatuts,
  findSeuilBascule
} = require('./lib/calc-engine.js');

const SITE_URL = 'https://calculateur-statuts-juridiques.fr'; // TODO: remplacer avant mise en ligne + fichier CNAME
const TODAY = new Date().toISOString().slice(0, 10);

const GESMINE_ORG_JSONLD = {
  '@type': 'Organization',
  name: 'Comparateur de statuts juridiques',
  legalName: 'Gesmine-Invest Limited',
  identifier: { '@type': 'PropertyValue', propertyID: 'UK Company Number', value: '14120136' },
  address: { '@type': 'PostalAddress', streetAddress: 'Hardy House, 269 Poynders Gardens', addressLocality: 'London', postalCode: 'SW4 8PQ', addressCountry: 'GB' }
};

const STATUTS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/statuts.json')));

// Presets métier — non réglementaires, restent inline (voir avis Gemini dans le plan).
const METIERS = {
  consultant: { nom: 'Consultant / freelance conseil', type_activite: 'prestations_services_bnc', ca_annuel_exemple: 60000, charges_reelles_estimees_pct: 0.08 },
  developpeur: { nom: 'Développeur freelance', type_activite: 'prestations_services_bnc', ca_annuel_exemple: 70000, charges_reelles_estimees_pct: 0.10 },
  graphiste: { nom: 'Graphiste indépendant', type_activite: 'prestations_services_bnc', ca_annuel_exemple: 40000, charges_reelles_estimees_pct: 0.12 },
  'coach-sportif': { nom: 'Coach sportif indépendant', type_activite: 'prestations_services_bic', ca_annuel_exemple: 35000, charges_reelles_estimees_pct: 0.15 },
  'infirmier-liberal': { nom: 'Infirmier libéral', type_activite: 'prestations_services_bnc', ca_annuel_exemple: 65000, charges_reelles_estimees_pct: 0.10 },
  vtc: { nom: 'Chauffeur VTC', type_activite: 'prestations_services_bic', ca_annuel_exemple: 45000, charges_reelles_estimees_pct: 0.22 },
  'e-commercant': { nom: 'E-commerçant', type_activite: 'vente_marchandises', ca_annuel_exemple: 90000, charges_reelles_estimees_pct: 0.55 },
  formateur: { nom: 'Formateur indépendant', type_activite: 'prestations_services_bnc', ca_annuel_exemple: 50000, charges_reelles_estimees_pct: 0.08 }
};

// ── Routing table — une entrée = une page. Étendre ici pour ajouter des pages. ──
const PAGES = [
  {
    type: 'simulateur',
    statut: 'auto-entrepreneur',
    slug: 'simulateur/auto-entrepreneur',
    titre_seo: 'Simulateur auto-entrepreneur 2026 : cotisations, impôt, revenu net',
    h1: 'Simulateur auto-entrepreneur 2026',
    desc: "Calculez vos cotisations sociales, votre impôt sur le revenu et votre revenu net en tant qu'auto-entrepreneur selon votre chiffre d'affaires et votre activité.",
    type_activite_defaut: 'prestations_services_bnc',
    ca_defaut: 40000,
    faq: [
      ["Quel est le plafond de chiffre d'affaires en auto-entrepreneur ?", "203 100 € pour la vente de marchandises, 83 600 € pour les prestations de services (BIC ou BNC) — seuils 2026, révisés à la hausse depuis les 188 700 €/77 700 € en vigueur jusqu'en 2025."],
      ["Le versement libératoire est-il toujours intéressant ?", "Non — il dépend de votre taux marginal d'imposition et de votre revenu fiscal de référence. Il est surtout avantageux si votre TMI est supérieur au taux du versement libératoire."],
      ["Mon patrimoine personnel est-il protégé ?", "Oui, par défaut depuis le 15 mai 2022 votre patrimoine personnel est insaisissable par les créanciers professionnels — sauf en cas de fraude, manquement grave, ou renonciation explicite à la demande d'un créancier (les banques l'exigent quasi-systématiquement pour un prêt professionnel)."]
    ],
    avantages: ["Création gratuite et quasi-instantanée", "Comptabilité ultra-simplifiée (livre de recettes)", "Cotisations calculées uniquement sur le CA encaissé — zéro charge si CA nul", "Patrimoine personnel protégé par défaut"],
    inconvenients: ["Plafond de chiffre d'affaires (83 600 € services, 203 100 € vente en 2026)", "Abattement forfaitaire, pas de déduction des charges réelles", "Crédibilité parfois moindre auprès de gros clients ou banques", "Pas de récupération de TVA"],
    liens_internes: ['/simulateur/eurl', '/simulateur/sasu', '/comparateur/auto-entrepreneur-vs-sasu', '/charges/auto-entrepreneur']
  },
  {
    type: 'simulateur',
    statut: 'entreprise-individuelle',
    slug: 'simulateur/entreprise-individuelle',
    titre_seo: 'Simulateur entreprise individuelle (EI) 2026 : charges et revenu net',
    h1: 'Simulateur entreprise individuelle (EI) 2026',
    desc: "Calculez vos cotisations sociales, votre impôt sur le revenu et votre revenu net en entreprise individuelle au régime réel selon votre chiffre d'affaires et vos charges.",
    note_titre: "Charges sociales et impôt sur le revenu en entreprise individuelle",
    note_html: "En entreprise individuelle au régime réel, vos <strong>charges sociales</strong> (URSSAF) sont calculées sur votre bénéfice — chiffre d'affaires moins charges déductibles réelles — puis votre <strong>impôt sur le revenu</strong> s'applique sur ce même bénéfice net de charges, selon le barème progressif. Le simulateur ci-dessus calcule les deux automatiquement à partir de votre chiffre d'affaires et de vos charges.",
    ca_defaut: 60000,
    faq: [
      ["Quelle différence entre auto-entrepreneur et entreprise individuelle ?", "L'EI au régime réel déduit les charges réelles (pas un abattement forfaitaire) et n'a pas de plafond de chiffre d'affaires — pertinent quand les charges réelles dépassent l'abattement forfaitaire du régime micro."],
      ["Mon patrimoine personnel est-il protégé en EI ?", "Oui, même protection par défaut que l'auto-entrepreneur depuis le 15 mai 2022, avec les mêmes exceptions (fraude, manquement grave, renonciation à la demande d'un créancier)."]
    ],
    avantages: ["Pas de plafond de chiffre d'affaires", "Déduction des charges réelles (matériel, local, sous-traitance...)", "Aucun capital social à constituer", "Patrimoine personnel protégé par défaut, comme l'auto-entrepreneur"],
    inconvenients: ["Comptabilité complète obligatoire (régime réel)", "Cotisations sociales TNS dues même en cas de faible bénéfice", "Pas de personnalité morale distincte (contrairement à l'EURL)"],
    liens_internes: ['/simulateur/auto-entrepreneur', '/charges/entreprise-individuelle']
  },
  {
    type: 'simulateur',
    statut: 'eurl',
    slug: 'simulateur/eurl',
    titre_seo: 'Simulateur EURL 2026 : IS, rémunération gérant, revenu net',
    h1: 'Simulateur EURL 2026',
    desc: "Calculez l'impôt sur les sociétés, les cotisations TNS du gérant et le revenu net total en EURL selon votre chiffre d'affaires et votre rémunération.",
    ca_defaut: 80000,
    faq: [
      ["EURL à l'IR ou à l'IS ?", "Par défaut à l'IR (comme une EI), mais l'option IS est possible et souvent plus avantageuse au-delà d'un certain niveau de bénéfice grâce au taux réduit à 15% jusqu'à 42 500 €."],
      ["Quel régime social pour le gérant d'EURL ?", "Le gérant associé unique relève du régime TNS (travailleur non salarié), avec des cotisations sociales calculées sur sa rémunération."]
    ],
    avantages: ["Cotisations sociales du gérant (régime TNS) généralement moins élevées qu'en SASU", "Responsabilité limitée aux apports", "Choix entre IR et IS", "Passage possible en SARL en accueillant un associé"],
    inconvenients: ["Couverture sociale du régime TNS moins protectrice (indemnités journalières, retraite) que le régime général", "Formalités de création et comptabilité complète obligatoires", "Statuts et annonce légale à rédiger, coût de création non nul"],
    liens_internes: ['/simulateur/sasu', '/comparateur/eurl-vs-sasu', '/charges/eurl']
  },
  {
    type: 'simulateur',
    statut: 'sasu',
    slug: 'simulateur/sasu',
    titre_seo: 'Simulateur SASU 2026 : salaire président, dividendes, IS',
    h1: 'Simulateur SASU 2026',
    desc: "Calculez l'impôt sur les sociétés, les charges du président assimilé salarié, la flat tax sur dividendes et le revenu net total en SASU.",
    ca_defaut: 80000,
    faq: [
      ["Le président de SASU cotise-t-il au chômage ?", "Non — le statut assimilé salarié donne accès au régime général de sécurité sociale mais pas à l'assurance chômage, sauf cumul avec un contrat de travail distinct dans certaines conditions."],
      ["Salaire ou dividendes en SASU, que choisir ?", "Les dividendes évitent les charges sociales (soumis à la flat tax de 31,4% depuis le 1er janvier 2026) mais ne créent aucun droit à la retraite ni de protection sociale — un équilibre est généralement préférable à un choix extrême. Voir le comparateur EURL vs SASU pour le détail du calcul."]
    ],
    avantages: ["Régime général de sécurité sociale (meilleure couverture que le TNS)", "Grande liberté statutaire", "Responsabilité limitée aux apports", "Dividendes non soumis aux cotisations sociales (flat tax uniquement)"],
    inconvenients: ["Charges sociales du président élevées (~65% du net)", "Pas d'assurance chômage pour le président", "Comptabilité complète et formalisme social plus lourds qu'en EURL"],
    liens_internes: ['/simulateur/eurl', '/simulateur/sas', '/comparateur/eurl-vs-sasu', '/arbitrage/sasu-remuneration-vs-dividendes', '/charges/sasu']
  },
  {
    type: 'simulateur',
    statut: 'sarl',
    slug: 'simulateur/sarl',
    titre_seo: 'Simulateur SARL 2026 : gérant majoritaire ou minoritaire',
    h1: 'Simulateur SARL 2026',
    desc: "Calculez l'impôt sur les sociétés et le revenu net du gérant en SARL selon qu'il est majoritaire (régime TNS) ou minoritaire (assimilé salarié).",
    ca_defaut: 100000,
    faq: [
      ["Gérant majoritaire ou minoritaire, quelle différence ?", "Le gérant majoritaire (détient plus de 50% des parts, seul ou avec sa famille) relève du régime TNS. Le gérant minoritaire ou égalitaire relève du régime assimilé salarié, comme un président de SASU."],
      ["Pourquoi choisir une SARL plutôt qu'une SASU ?", "La SARL impose un minimum de 2 associés et un cadre plus encadré par la loi (moins de liberté statutaire que la SASU), mais le régime TNS du gérant majoritaire coûte souvent moins cher en cotisations sociales que le régime assimilé salarié."]
    ],
    avantages: ["Régime TNS du gérant majoritaire souvent moins coûteux en cotisations", "Cadre légal protecteur et éprouvé, statuts types disponibles", "Régime matrimonial des parts sociales protecteur en cas de succession"],
    inconvenients: ["Minimum 2 associés obligatoire", "Moins de liberté statutaire que la SAS (répartition du pouvoir encadrée par la loi)", "Cession de parts sociales plus formaliste (agrément des associés) qu'en SAS"],
    liens_internes: ['/simulateur/sasu', '/simulateur/sas', '/comparateur/sas-vs-sarl', '/arbitrage/sarl-remuneration-vs-dividendes', '/charges/sarl']
  },
  {
    type: 'simulateur',
    statut: 'sas',
    slug: 'simulateur/sas',
    titre_seo: 'Simulateur SAS 2026 : président, associés, IS, dividendes',
    h1: 'Simulateur SAS 2026',
    desc: "Calculez l'impôt sur les sociétés, les charges du président assimilé salarié, la flat tax sur dividendes et le revenu net total en SAS (société pluripersonnelle).",
    ca_defaut: 100000,
    faq: [
      ["Quelle différence entre SAS et SASU ?", "Aucune différence de régime fiscal ou social pour le président — la SAS impose simplement au moins 2 associés, contrairement à la SASU qui reste unipersonnelle. Le calcul de rémunération/dividendes du dirigeant est identique."],
      ["Le président de SAS cotise-t-il au chômage ?", "Non — comme en SASU, le statut assimilé salarié donne accès au régime général de sécurité sociale mais pas à l'assurance chômage, sauf cumul avec un contrat de travail distinct dans certaines conditions."],
      ["Pourquoi choisir une SAS plutôt qu'une SARL pour plusieurs associés ?", "La SAS offre une liberté statutaire bien plus large (répartition du pouvoir, catégories d'actions, entrée d'investisseurs) que la SARL, encadrée par la loi — au prix de charges sociales du président généralement plus élevées que le régime TNS d'un gérant majoritaire de SARL."]
    ],
    avantages: ["Liberté statutaire quasi totale (pactes d'actionnaires, catégories d'actions)", "Forme privilégiée par les investisseurs pour une levée de fonds", "Régime général de sécurité sociale pour le président", "Cession d'actions plus simple qu'en SARL"],
    inconvenients: ["Charges sociales du président élevées (~65% du net)", "Rédaction des statuts plus complexe, souvent avec accompagnement juridique", "Pas d'assurance chômage pour le président"],
    liens_internes: ['/simulateur/sasu', '/comparateur/sas-vs-sarl', '/comparateur/sas-vs-sasu', '/arbitrage/sas-remuneration-vs-dividendes', '/charges/sarl']
  },
  {
    type: 'comparateur',
    statuts: ['auto-entrepreneur', 'sasu'],
    slug: 'comparateur/auto-entrepreneur-vs-sasu',
    titre_seo: 'Auto-entrepreneur ou SASU : simulateur comparatif 2026',
    h1: 'Auto-entrepreneur ou SASU : quel statut choisir ?',
    desc: "Comparez charges, revenu net et fiscalité entre auto-entrepreneur et SASU selon votre chiffre d'affaires.",
    ca_defaut: 60000,
    params_defaut: { type_activite: 'prestations_services_bnc', charges_exploitation: 8000, remuneration_gerant: 25000, dividendes_verses: 15000, tmi: 0.30 },
    faq: [
      ["À partir de quel CA la SASU devient-elle plus intéressante que l'auto-entrepreneur ?", "Cela dépend du split rémunération/dividendes retenu et dépasse rarement une réponse unique — voir le seuil de bascule calculé ci-dessus pour les hypothèses de cette page, et ajustez les paramètres pour votre situation."],
      ["L'auto-entrepreneur est-il toujours plus simple ?", "Oui administrativement (comptabilité simplifiée, pas de statuts à rédiger), mais il est plafonné en chiffre d'affaires (83 600 € en prestations de services, seuil 2026) contrairement à la SASU."]
    ],
    liens_internes: ['/migration/auto-entrepreneur-vers-sasu', '/charges/auto-entrepreneur', '/charges/sasu']
  },
  {
    type: 'comparateur',
    statuts: ['auto-entrepreneur', 'eurl'],
    slug: 'comparateur/auto-entrepreneur-vs-eurl',
    titre_seo: 'Auto-entrepreneur ou EURL : simulateur comparatif 2026',
    h1: 'Auto-entrepreneur ou EURL : quel statut choisir ?',
    desc: "Comparez charges, revenu net et responsabilité entre auto-entrepreneur et EURL selon votre chiffre d'affaires.",
    ca_defaut: 60000,
    params_defaut: { type_activite: 'prestations_services_bnc', charges_exploitation: 8000, remuneration_gerant: 25000, dividendes_verses: 15000, tmi: 0.30 },
    faq: [
      ["Pourquoi passer d'auto-entrepreneur à EURL ?", "Principalement en cas de dépassement du plafond de CA, ou pour déduire des charges réelles importantes que l'abattement forfaitaire micro ne couvre pas."]
    ],
    liens_internes: ['/charges/auto-entrepreneur', '/charges/eurl']
  },
  {
    type: 'comparateur',
    statuts: ['eurl', 'sasu'],
    slug: 'comparateur/eurl-vs-sasu',
    titre_seo: 'EURL ou SASU : comparateur et simulateur 2026',
    h1: 'EURL ou SASU : quel statut choisir ?',
    desc: 'EURL ou SASU ? Comparez régime social, fiscalité et rémunération du dirigeant selon votre situation.',
    ca_defaut: 80000,
    params_defaut: { charges_exploitation: 10000, remuneration_gerant: 30000, dividendes_verses: 20000, tmi: 0.30 },
    faq: [
      ["EURL ou SASU pour les cotisations sociales du dirigeant ?", "Le gérant d'EURL relève du régime TNS (cotisations généralement moins élevées mais couverture sociale moindre); le président de SASU est assimilé salarié (cotisations plus élevées, meilleure couverture sociale hors chômage)."],
      ["Salaire ou dividendes, que choisir dans l'un ou l'autre statut ?", "Les dividendes évitent les cotisations sociales dans les deux statuts mais sont soumis à la flat tax de 31,4% (depuis le 1er janvier 2026) et ne créent pas de droits sociaux. Voir le comparateur détaillé rémunération pour une analyse approfondie."]
    ],
    liens_internes: ['/charges/eurl', '/charges/sasu', '/simulateur/eurl', '/simulateur/sasu']
  },
  {
    type: 'comparateur',
    statuts: ['sasu', 'sarl'],
    slug: 'comparateur/sasu-vs-sarl',
    titre_seo: 'SASU ou SARL : comparateur et simulateur 2026',
    h1: 'SASU ou SARL : quel statut choisir ?',
    desc: 'SASU ou SARL ? Comparez le régime social du dirigeant et la fiscalité selon votre situation.',
    ca_defaut: 100000,
    params_defaut: { charges_exploitation: 15000, remuneration_gerant: 35000, dividendes_verses: 20000, tmi: 0.30 },
    faq: [
      ["SASU ou SARL, quelle différence principale ?", "La SARL impose un minimum de 2 associés et un cadre légal plus rigide; la SASU offre plus de liberté statutaire et peut rester unipersonnelle."]
    ],
    liens_internes: ['/charges/sasu', '/charges/sarl']
  },
  {
    type: 'comparateur',
    statuts: ['sas', 'sarl'],
    slug: 'comparateur/sas-vs-sarl',
    titre_seo: 'SAS ou SARL : comparateur et simulateur 2026',
    h1: 'SAS ou SARL : quel statut choisir à plusieurs associés ?',
    desc: 'SAS ou SARL ? Comparez régime social du dirigeant, fiscalité et liberté statutaire pour une société à plusieurs associés.',
    ca_defaut: 120000,
    params_defaut: { charges_exploitation: 18000, remuneration_gerant: 40000, dividendes_verses: 25000, tmi: 0.30 },
    faq: [
      ["SAS ou SARL, quelle différence principale à plusieurs associés ?", "La SAS offre une liberté statutaire quasi totale (répartition du pouvoir, catégories d'actions, entrée facilitée d'investisseurs) tandis que la SARL est plus encadrée par la loi. Côté social, le président de SAS est assimilé salarié (charges plus élevées) contre TNS pour un gérant majoritaire de SARL (charges plus faibles mais couverture sociale moindre)."],
      ["La SAS est-elle plus adaptée pour lever des fonds ?", "Oui — c'est la forme privilégiée par les investisseurs (capital-risque, business angels) car elle permet des pactes d'actionnaires flexibles et des catégories d'actions différenciées, ce que la SARL ne permet pas."]
    ],
    liens_internes: ['/simulateur/sas', '/simulateur/sarl', '/charges/sarl']
  },
  {
    type: 'comparateur',
    statuts: ['sas', 'sasu'],
    slug: 'comparateur/sas-vs-sasu',
    titre_seo: 'SAS ou SASU : quelle différence en 2026 ?',
    h1: 'SAS ou SASU : quelle différence ?',
    desc: 'SAS ou SASU ? Le calcul de rémunération et fiscalité est identique — la seule différence est le nombre d\'associés.',
    ca_defaut: 100000,
    params_defaut: { charges_exploitation: 15000, remuneration_gerant: 35000, dividendes_verses: 20000, tmi: 0.30 },
    faq: [
      ["Le calcul de revenu net est-il différent entre SAS et SASU ?", "Non — pour un même chiffre d'affaires, mêmes charges et même rémunération du président, le résultat est strictement identique. La SASU est juste une SAS à associé unique."],
      ["Quand transformer une SASU en SAS ?", "Dès qu'un deuxième associé entre au capital (investisseur, cofondateur) — la transformation est une simple modification statutaire, pas une création de société."]
    ],
    liens_internes: ['/simulateur/sas', '/simulateur/sasu', '/comparateur/sas-vs-sarl']
  },
  {
    type: 'comparateur',
    statuts: ['auto-entrepreneur', 'sarl'],
    slug: 'comparateur/auto-entrepreneur-vs-sarl',
    titre_seo: 'Auto-entrepreneur ou SARL : simulateur comparatif 2026',
    h1: 'Auto-entrepreneur ou SARL : quel statut choisir ?',
    desc: "Comparez charges, revenu net et responsabilité entre auto-entrepreneur et SARL selon votre chiffre d'affaires — pertinent dès que vous vous associez.",
    ca_defaut: 70000,
    params_defaut: { type_activite: 'prestations_services_bnc', charges_exploitation: 10000, remuneration_gerant: 28000, dividendes_verses: 15000, tmi: 0.30 },
    faq: [
      ["Pourquoi comparer auto-entrepreneur et SARL alors que l'un est individuel ?", "La question se pose typiquement quand un auto-entrepreneur s'associe avec quelqu'un d'autre — le régime micro ne permet pas plusieurs associés, la SARL devient alors l'alternative naturelle (ou la SAS, voir le comparateur SAS vs SARL)."],
      ["À partir de quel CA la SARL devient-elle plus intéressante ?", "Cela dépend fortement du régime social retenu pour le ou les gérants (majoritaire TNS ou minoritaire assimilé salarié) — voir le seuil de bascule calculé ci-dessus pour vos hypothèses."]
    ],
    liens_internes: ['/charges/auto-entrepreneur', '/charges/sarl', '/comparateur/sas-vs-sarl']
  },
  {
    type: 'comparateur',
    statuts: ['entreprise-individuelle', 'eurl'],
    slug: 'comparateur/entreprise-individuelle-vs-eurl',
    titre_seo: 'Entreprise individuelle (EI) ou EURL : comparateur 2026',
    h1: 'Entreprise individuelle (EI) ou EURL : quel statut choisir ?',
    desc: "Comparez régime social, fiscalité et protection du patrimoine entre entreprise individuelle et EURL selon votre chiffre d'affaires.",
    ca_defaut: 70000,
    params_defaut: { charges_exploitation: 12000, remuneration_gerant: 30000, dividendes_verses: 10000, tmi: 0.30 },
    faq: [
      ["EI ou EURL, la protection du patrimoine est-elle différente ?", "Depuis le 15 mai 2022, l'EI protège déjà le patrimoine personnel par défaut (avec les mêmes exceptions bancaires qu'en EURL) — la différence principale entre les deux statuts est donc surtout fiscale et sociale, pas patrimoniale."],
      ["Pourquoi passer d'EI à EURL ?", "Principalement pour opter pour l'IS et lisser la fiscalité (taux réduit à 15% jusqu'à 42 500€ de bénéfice), ou pour préparer une association future (transformation en SARL) sans changer de forme juridique."]
    ],
    liens_internes: ['/charges/entreprise-individuelle', '/charges/eurl', '/simulateur/eurl']
  },
  {
    type: 'comparateur',
    statuts: ['auto-entrepreneur', 'entreprise-individuelle'],
    slug: 'comparateur/auto-entrepreneur-vs-entreprise-individuelle',
    titre_seo: 'Auto-entrepreneur ou entreprise individuelle : comparateur 2026',
    h1: 'Auto-entrepreneur ou entreprise individuelle (EI) : quel régime choisir ?',
    desc: "Comparez le régime micro (auto-entrepreneur) et le régime réel (EI) selon votre chiffre d'affaires et vos charges réelles.",
    ca_defaut: 50000,
    params_defaut: { type_activite: 'prestations_services_bnc', charges_reelles: 15000, tmi: 0.30 },
    faq: [
      ["Quand le régime réel devient-il plus avantageux que le micro ?", "Quand vos charges réelles dépassent l'abattement forfaitaire du régime micro (34% en BNC, 50% en BIC services) — voir le seuil de bascule ci-dessus pour vos hypothèses."]
    ],
    liens_internes: ['/charges/auto-entrepreneur', '/charges/entreprise-individuelle']
  },
  {
    type: 'charges',
    statut: 'auto-entrepreneur',
    slug: 'charges/auto-entrepreneur',
    titre_seo: 'Charges auto-entrepreneur 2026 : détail des cotisations et impôts',
    h1: 'Charges auto-entrepreneur 2026 : le détail',
    desc: "Détail complet des cotisations sociales, de l'impôt sur le revenu et de la protection du patrimoine personnel en auto-entrepreneur.",
    ca_defaut: 40000,
    type_activite_defaut: 'prestations_services_bnc',
    faq: [
      ["Quelles charges paie un auto-entrepreneur ?", "Uniquement des cotisations sociales proportionnelles au CA encaissé (aucune charge si CA nul), plus l'impôt sur le revenu (bareme ou versement libératoire optionnel)."],
      ["Mon patrimoine personnel est-il vraiment protégé ?", "Oui par défaut depuis le 15 mai 2022, mais les banques exigent quasi-systématiquement une renonciation à cette protection pour accorder un prêt professionnel — voir le tableau ci-dessous."]
    ],
    liens_internes: ['/simulateur/auto-entrepreneur', '/comparateur/auto-entrepreneur-vs-sasu']
  },
  {
    type: 'charges',
    statut: 'eurl',
    slug: 'charges/eurl',
    titre_seo: 'Charges EURL 2026 : IS, cotisations TNS du gérant',
    h1: 'Charges EURL 2026 : le détail',
    desc: "Détail de l'impôt sur les sociétés et des cotisations TNS du gérant associé unique en EURL.",
    ca_defaut: 80000,
    faq: [
      ["Le gérant d'EURL paie-t-il des charges même sans rémunération ?", "Non — les cotisations TNS sont calculées sur la rémunération effectivement versée. Une rémunération nulle minimise les cotisations mais aussi les droits à la retraite."]
    ],
    liens_internes: ['/simulateur/eurl', '/comparateur/eurl-vs-sasu']
  },
  {
    type: 'charges',
    statut: 'sasu',
    slug: 'charges/sasu',
    titre_seo: 'Charges SASU 2026 : IS, charges président, flat tax dividendes',
    h1: 'Charges SASU 2026 : le détail',
    desc: "Détail de l'impôt sur les sociétés, des charges du président assimilé salarié et de la flat tax sur dividendes en SASU.",
    ca_defaut: 80000,
    faq: [
      ["Pourquoi les charges du président de SASU sont-elles élevées ?", "Le statut assimilé salarié donne une meilleure protection sociale (régime général) qu'un TNS, ce qui se traduit par des charges patronales et salariales plus élevées, de l'ordre de 65% du net."]
    ],
    liens_internes: ['/simulateur/sasu', '/comparateur/eurl-vs-sasu']
  },
  {
    type: 'charges',
    statut: 'sarl',
    slug: 'charges/sarl',
    titre_seo: 'Charges SARL 2026 : IS, régime du gérant',
    h1: 'Charges SARL 2026 : le détail',
    desc: "Détail de l'impôt sur les sociétés et des cotisations du gérant, majoritaire (TNS) ou minoritaire (assimilé salarié), en SARL.",
    ca_defaut: 100000,
    faq: [
      ["Comment savoir si mon gérant est majoritaire ?", "En additionnant ses parts avec celles de son conjoint et des enfants mineurs — si le total dépasse 50%, il est gérant majoritaire au sens social."]
    ],
    liens_internes: ['/simulateur/sarl', '/comparateur/sasu-vs-sarl']
  },
  {
    type: 'charges',
    statut: 'entreprise-individuelle',
    slug: 'charges/entreprise-individuelle',
    titre_seo: 'Charges entreprise individuelle (EI) 2026 : le détail',
    h1: 'Charges entreprise individuelle (EI) 2026 : le détail',
    desc: "Détail des cotisations sociales et de l'impôt sur le revenu au régime réel en entreprise individuelle.",
    ca_defaut: 60000,
    faq: [
      ["Quelle différence de charges entre EI et auto-entrepreneur ?", "L'EI déduit les charges réelles (pas d'abattement forfaitaire) — plus avantageux quand les charges réelles dépassent le taux d'abattement du régime micro."]
    ],
    liens_internes: ['/simulateur/entreprise-individuelle', '/comparateur/auto-entrepreneur-vs-entreprise-individuelle']
  },
  {
    type: 'migration',
    from: 'auto-entrepreneur',
    to: 'sasu',
    slug: 'migration/auto-entrepreneur-vers-sasu',
    titre_seo: "Passer d'auto-entrepreneur à SASU : guide et simulation 2026",
    h1: "Comment passer d'auto-entrepreneur à SASU ?",
    desc: "Étapes pour transformer une activité d'auto-entrepreneur en SASU, avec simulation de l'impact sur le revenu net.",
    ca_defaut: 60000,
    params_defaut: { type_activite: 'prestations_services_bnc', charges_exploitation: 8000, remuneration_gerant: 25000, dividendes_verses: 15000, tmi: 0.30 },
    etapes: [
      "Cesser l'activité d'auto-entrepreneur (déclaration de cessation auprès du guichet unique)",
      "Rédiger les statuts de la SASU et constituer le capital social (1€ minimum)",
      "Déposer le capital social sur un compte bloqué et publier une annonce légale",
      "Immatriculer la SASU au guichet unique (RCS)",
      "Transférer ou re-signer les contrats clients au nom de la nouvelle société",
      "Ouvrir un compte bancaire professionnel dédié à la SASU"
    ],
    faq: [
      ["Puis-je garder mes clients existants en passant à la SASU ?", "Oui, mais les contrats en cours doivent généralement être re-signés ou faire l'objet d'un avenant au nom de la nouvelle personne morale."],
      ["Dois-je clôturer mon auto-entreprise avant de créer la SASU ?", "Non obligatoirement dans cet ordre, mais il faut éviter la double immatriculation d'une même activité — dans la pratique, beaucoup cessent l'auto-entreprise une fois la SASU opérationnelle."]
    ],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-sasu', '/charges/sasu']
  },
  {
    type: 'migration',
    from: 'auto-entrepreneur',
    to: 'eurl',
    slug: 'migration/auto-entrepreneur-vers-eurl',
    titre_seo: "Passer d'auto-entrepreneur à EURL : guide et simulation 2026",
    h1: "Comment passer d'auto-entrepreneur à EURL ?",
    desc: "Étapes pour transformer une activité d'auto-entrepreneur en EURL, avec simulation de l'impact sur le revenu net.",
    ca_defaut: 60000,
    params_defaut: { type_activite: 'prestations_services_bnc', charges_exploitation: 8000, remuneration_gerant: 25000, dividendes_verses: 15000, tmi: 0.30 },
    etapes: [
      "Cesser l'activité d'auto-entrepreneur (déclaration de cessation auprès du guichet unique)",
      "Rédiger les statuts de l'EURL et constituer le capital social (1€ minimum)",
      "Déposer le capital social et publier une annonce légale",
      "Immatriculer l'EURL au guichet unique (RCS)",
      "Choisir le régime fiscal (IR par défaut ou option IS)",
      "Ouvrir un compte bancaire professionnel dédié à l'EURL"
    ],
    faq: [
      ["EURL à l'IR ou à l'IS après une auto-entreprise ?", "L'option IS est souvent choisie pour lisser la fiscalité et bénéficier du taux réduit à 15% jusqu'à 42 500 € de bénéfice, mais l'IR peut rester pertinent en début d'activité si les revenus sont modestes."]
    ],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-eurl', '/charges/eurl']
  },
  {
    type: 'migration',
    from: 'auto-entrepreneur',
    to: 'entreprise-individuelle',
    slug: 'migration/auto-entrepreneur-vers-ei',
    titre_seo: "Passer d'auto-entrepreneur à entreprise individuelle (EI) : guide 2026",
    h1: "Comment passer d'auto-entrepreneur à entreprise individuelle (régime réel) ?",
    desc: "Étapes pour basculer du régime micro au régime réel en entreprise individuelle, avec simulation de l'impact sur le revenu net.",
    ca_defaut: 60000,
    params_defaut: { type_activite: 'prestations_services_bnc', charges_reelles: 20000, tmi: 0.30 },
    etapes: [
      "Vérifier que les charges réelles dépassent l'abattement forfaitaire du régime micro (34% en BNC, 50% en BIC services) — sinon le passage n'est pas avantageux",
      "Opter pour le régime réel simplifié ou normal auprès du service des impôts des entreprises",
      "Mettre en place une comptabilité complète (recettes/dépenses ou comptabilité d'engagement selon le régime)",
      "Conserver tous les justificatifs de charges déductibles",
      "Déclarer le résultat réel (bénéfice ou déficit) sur la déclaration de revenus, plus la liasse fiscale si régime normal"
    ],
    faq: [
      ["Cette bascule change-t-elle le statut juridique ?", "Non — il ne s'agit pas de créer une nouvelle structure, seulement de changer de régime fiscal (micro → réel) au sein de la même entreprise individuelle. Pas d'immatriculation supplémentaire nécessaire."],
      ["Peut-on revenir au régime micro ensuite ?", "Oui, sous conditions de seuils de CA et de délai, en formulant une nouvelle option auprès de l'administration fiscale."]
    ],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-entreprise-individuelle', '/charges/entreprise-individuelle']
  },
  {
    type: 'migration',
    from: 'entreprise-individuelle',
    to: 'eurl',
    slug: 'migration/ei-vers-eurl',
    titre_seo: "Passer d'entreprise individuelle (EI) à EURL : guide et simulation 2026",
    h1: "Comment passer d'entreprise individuelle à EURL ?",
    desc: "Étapes pour transformer une entreprise individuelle en EURL (mise en société), avec simulation de l'impact sur le revenu net.",
    ca_defaut: 70000,
    params_defaut: { charges_exploitation: 12000, remuneration_gerant: 30000, dividendes_verses: 10000, tmi: 0.30 },
    etapes: [
      "Évaluer l'entreprise individuelle (fonds de commerce, clientèle, matériel) pour l'apporter ou le vendre à la future EURL",
      "Rédiger les statuts de l'EURL et constituer le capital social (1€ minimum, ou apport du fonds évalué)",
      "Déposer le capital social et publier une annonce légale",
      "Immatriculer l'EURL au guichet unique (RCS)",
      "Cesser l'entreprise individuelle et transférer contrats, bail commercial et salariés le cas échéant",
      "Choisir le régime fiscal de l'EURL (IR par défaut ou option IS)"
    ],
    faq: [
      ["Cette transformation a-t-elle un coût fiscal ?", "L'apport du fonds de commerce à la société peut générer une plus-value imposable — un accompagnement par un expert-comptable ou un notaire est fortement recommandé pour optimiser cette étape."],
      ["Pourquoi passer en société plutôt que rester en EI ?", "Principalement pour opter à l'IS et lisser la fiscalité, ou pour préparer une association future (transformation ultérieure en SARL) sans changer de nouveau de forme juridique."]
    ],
    liens_internes: ['/comparateur/entreprise-individuelle-vs-eurl', '/charges/eurl']
  },
  {
    type: 'migration',
    from: 'eurl',
    to: 'sasu',
    slug: 'migration/eurl-vers-sasu',
    titre_seo: "Passer d'EURL à SASU : guide et simulation 2026",
    h1: "Comment passer d'EURL à SASU ?",
    desc: "Étapes pour transformer une EURL en SASU, avec simulation de l'impact du changement de régime social du dirigeant sur le revenu net.",
    ca_defaut: 90000,
    params_defaut: { charges_exploitation: 12000, remuneration_gerant: 32000, dividendes_verses: 18000, tmi: 0.30 },
    etapes: [
      "Faire évaluer la transformation par un expert-comptable ou un commissaire à la transformation (obligatoire au-delà de certains seuils)",
      "Décider de la transformation en assemblée générale extraordinaire (décision de l'associé unique)",
      "Rédiger les nouveaux statuts de SASU et nommer le président",
      "Publier une annonce légale de transformation",
      "Déposer le dossier de transformation au guichet unique (RCS) — pas de nouvelle immatriculation, la personnalité morale continue",
      "Anticiper le changement de régime social du dirigeant (TNS → assimilé salarié) auprès de l'URSSAF"
    ],
    faq: [
      ["La transformation EURL → SASU crée-t-elle une nouvelle société ?", "Non — la personnalité morale de la société est conservée, seule la forme juridique change. Les contrats en cours restent valables sans re-signature."],
      ["Pourquoi passer d'EURL à SASU ?", "Principalement pour la meilleure protection sociale du régime assimilé salarié, ou pour préparer l'entrée d'investisseurs (la SASU peut ensuite devenir SAS en accueillant un deuxième associé)."]
    ],
    liens_internes: ['/comparateur/eurl-vs-sasu', '/charges/sasu']
  },
  {
    type: 'migration',
    from: 'sasu',
    to: 'sas',
    slug: 'migration/sasu-vers-sas',
    titre_seo: "Passer de SASU à SAS : guide et simulation 2026",
    h1: "Comment passer de SASU à SAS ?",
    desc: "Étapes pour transformer une SASU en SAS lors de l'entrée d'un nouvel associé, avec simulation de l'impact sur le revenu net du président.",
    ca_defaut: 100000,
    params_defaut: { charges_exploitation: 15000, remuneration_gerant: 35000, dividendes_verses: 20000, tmi: 0.30 },
    etapes: [
      "Négocier les conditions d'entrée du ou des nouveaux associés (valorisation, répartition du capital, pacte d'actionnaires)",
      "Décider de l'augmentation de capital ou de la cession de titres en assemblée (décision du président/associé unique avant transformation)",
      "Mettre à jour les statuts pour refléter la pluralité d'associés — la SAS reste juridiquement la continuité de la SASU",
      "Publier une annonce légale de modification si nécessaire",
      "Déposer la modification au guichet unique (RCS) — pas de nouvelle immatriculation",
      "Formaliser un pacte d'actionnaires pour encadrer gouvernance, sortie et clauses de préemption"
    ],
    faq: [
      ["Faut-il recréer la société en passant de SASU à SAS ?", "Non — c'est une simple évolution du nombre d'associés au sein de la même personne morale, pas une transformation de forme juridique comme EURL → SASU. Le régime fiscal et social du président reste inchangé."],
      ["Le calcul de rémunération du président change-t-il ?", "Non — le régime assimilé salarié et la fiscalité des dividendes du président restent identiques qu'il y ait un ou plusieurs associés. Voir le simulateur SAS pour vérifier."]
    ],
    liens_internes: ['/simulateur/sas', '/comparateur/sas-vs-sarl']
  },
  {
    type: 'comparateur_metier',
    metier: 'consultant',
    statuts: ['auto-entrepreneur', 'sasu'],
    slug: 'metier/consultant-auto-entrepreneur-vs-sasu',
    titre_seo: 'Auto-entrepreneur ou SASU pour un consultant ?',
    h1: 'Consultant freelance : auto-entrepreneur ou SASU ?',
    desc: "Comparaison auto-entrepreneur vs SASU pré-remplie avec un CA type de consultant indépendant.",
    params_defaut: { type_activite: 'prestations_services_bnc', charges_exploitation: 5000, remuneration_gerant: 30000, dividendes_verses: 15000, tmi: 0.30 },
    faq: [
      ["Quel statut pour un consultant qui débute ?", "L'auto-entrepreneur est généralement recommandé en phase de test (simplicité, zéro charge fixe), puis la SASU devient pertinente en approchant le plafond de CA ou pour optimiser la fiscalité à plus haut revenu."]
    ],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-sasu', '/simulateur/sasu']
  },
  {
    type: 'comparateur_metier',
    metier: 'developpeur',
    statuts: ['auto-entrepreneur', 'eurl'],
    slug: 'metier/developpeur-auto-entrepreneur-vs-eurl',
    titre_seo: 'Auto-entrepreneur ou EURL pour un développeur freelance ?',
    h1: 'Développeur freelance : auto-entrepreneur ou EURL ?',
    desc: "Comparaison auto-entrepreneur vs EURL pré-remplie avec un CA type de développeur freelance.",
    params_defaut: { type_activite: 'prestations_services_bnc', charges_exploitation: 5000, remuneration_gerant: 35000, dividendes_verses: 15000, tmi: 0.30 },
    faq: [
      ["Quel statut pour un développeur freelance à haut CA ?", "Au-delà du plafond auto-entrepreneur (83 600 €, seuil 2026) ou pour déduire du matériel/formation en charges réelles, l'EURL ou la SASU deviennent pertinentes selon la préférence de régime social."]
    ],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-eurl', '/simulateur/eurl']
  },
  {
    type: 'comparateur_metier',
    metier: 'infirmier-liberal',
    statuts: ['auto-entrepreneur', 'eurl'],
    slug: 'metier/infirmier-liberal-auto-entrepreneur-vs-eurl',
    titre_seo: 'Auto-entrepreneur ou EURL pour un infirmier libéral ?',
    h1: 'Infirmier libéral : auto-entrepreneur ou EURL ?',
    desc: "Comparaison auto-entrepreneur vs EURL pré-remplie avec un CA type d'infirmier libéral.",
    params_defaut: { type_activite: 'prestations_services_bnc', charges_exploitation: 6500, remuneration_gerant: 32000, dividendes_verses: 12000, tmi: 0.30 },
    faq: [
      ["Un infirmier libéral peut-il rester auto-entrepreneur ?", "Oui sous le plafond de CA (83 600 € en prestations de services, seuil 2026), mais beaucoup de professionnels de santé libéraux dépassent ce seuil rapidement, ce qui rend l'EURL ou la SELARL pertinentes."]
    ],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-eurl', '/simulateur/eurl']
  },
  {
    type: 'comparateur_metier',
    metier: 'vtc',
    statuts: ['auto-entrepreneur', 'eurl'],
    slug: 'metier/vtc-auto-entrepreneur-vs-eurl',
    titre_seo: 'Auto-entrepreneur ou EURL pour un chauffeur VTC ?',
    h1: 'Chauffeur VTC : auto-entrepreneur ou EURL ?',
    desc: "Comparaison auto-entrepreneur vs EURL pré-remplie avec un CA type de chauffeur VTC, charges de véhicule incluses.",
    params_defaut: { type_activite: 'prestations_services_bic', charges_exploitation: 10000, remuneration_gerant: 22000, dividendes_verses: 8000, tmi: 0.11 },
    faq: [
      ["Pourquoi les charges réelles comptent-elles particulièrement pour un VTC ?", "Carburant, entretien, assurance et amortissement du véhicule sont souvent élevés — au-delà de l'abattement forfaitaire micro (50% en BIC services), le régime réel (EI ou EURL) devient rapidement plus avantageux."]
    ],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-eurl', '/charges/entreprise-individuelle']
  },
  {
    type: 'comparateur_metier',
    metier: 'e-commercant',
    statuts: ['auto-entrepreneur', 'sasu'],
    slug: 'metier/e-commercant-auto-entrepreneur-vs-sasu',
    titre_seo: 'Auto-entrepreneur ou SASU pour un e-commerçant ?',
    h1: 'E-commerçant : auto-entrepreneur ou SASU ?',
    desc: "Comparaison auto-entrepreneur vs SASU pré-remplie avec un CA type de vente en ligne (vente de marchandises).",
    params_defaut: { type_activite: 'vente_marchandises', charges_exploitation: 45000, remuneration_gerant: 28000, dividendes_verses: 12000, tmi: 0.30 },
    faq: [
      ["Le plafond auto-entrepreneur est-il vite atteint en e-commerce ?", "Le plafond vente de marchandises (203 100 €, seuil 2026) est plus élevé qu'en prestations de services, mais la marge nette étant souvent faible, beaucoup de e-commerçants basculent en société pour déduire leurs charges réelles (achats, publicité, logistique) plutôt que de subir l'abattement forfaitaire de 71%."]
    ],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-sasu', '/simulateur/sasu']
  },
  {
    type: 'comparateur_metier',
    metier: 'formateur',
    statuts: ['auto-entrepreneur', 'sasu'],
    slug: 'metier/formateur-auto-entrepreneur-vs-sasu',
    titre_seo: 'Auto-entrepreneur ou SASU pour un formateur indépendant ?',
    h1: 'Formateur indépendant : auto-entrepreneur ou SASU ?',
    desc: "Comparaison auto-entrepreneur vs SASU pré-remplie avec un CA type de formateur/consultant en formation.",
    params_defaut: { type_activite: 'prestations_services_bnc', charges_exploitation: 4000, remuneration_gerant: 25000, dividendes_verses: 12000, tmi: 0.30 },
    faq: [
      ["Quel statut pour un formateur qui travaille avec des organismes de formation ?", "L'auto-entrepreneur convient en phase de démarrage (peu de charges, CA modéré), la SASU devient pertinente en approchant le plafond de CA ou pour donner une image plus institutionnelle vis-à-vis de grands comptes."]
    ],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-sasu', '/simulateur/sasu']
  },
  {
    type: 'arbitrage',
    statut: 'sasu',
    slug: 'arbitrage/sasu-remuneration-vs-dividendes',
    titre_seo: 'Salaire ou dividendes en SASU 2026 : simulateur d\'arbitrage optimal',
    h1: 'SASU : salaire ou dividendes, quelle répartition optimale ?',
    desc: "Trouvez la répartition rémunération/dividendes qui maximise votre revenu net en SASU, avec la flat tax à 31,4% en 2026.",
    ca_defaut: 100000,
    faq: [
      ["Faut-il tout prendre en dividendes en SASU ?", "Rarement optimal — au-delà d'un certain montant, l'IS puis la flat tax de 31,4% sur dividendes finissent par coûter plus cher qu'une rémunération raisonnable, en plus de ne créer aucun droit à la retraite. Le simulateur teste toutes les répartitions pour trouver l'optimum."],
      ["La hausse de la flat tax en 2026 change-t-elle la donne ?", "Oui — passée de 30% à 31,4% (CSG portée à 18,6%), elle rééquilibre légèrement l'arbitrage en faveur d'un mix salaire/dividendes plutôt que du tout-dividendes par rapport aux années précédentes."],
      ["Le résultat optimal dépend-il de ma TMI ?", "Oui fortement — plus votre taux marginal d'imposition est élevé, plus les dividendes (taxés à taux fixe 31,4%) deviennent avantageux par rapport à un salaire supplémentaire taxé au barème progressif."]
    ],
    liens_internes: ['/simulateur/sasu', '/comparateur/eurl-vs-sasu', '/arbitrage/sarl-remuneration-vs-dividendes']
  },
  {
    type: 'arbitrage',
    statut: 'sarl',
    slug: 'arbitrage/sarl-remuneration-vs-dividendes',
    titre_seo: 'Salaire ou dividendes en SARL 2026 : simulateur d\'arbitrage optimal',
    h1: 'SARL : salaire ou dividendes, quelle répartition optimale ?',
    desc: "Trouvez la répartition rémunération/dividendes qui maximise le revenu net du gérant en SARL, selon le régime TNS ou assimilé salarié.",
    ca_defaut: 100000,
    faq: [
      ["L'arbitrage salaire/dividendes est-il différent pour un gérant majoritaire ?", "Oui — au-delà de 10% du capital social, la part de dividendes versée à un gérant majoritaire est soumise aux cotisations TNS comme un salaire, ce qui réduit fortement l'intérêt des dividendes par rapport à une SASU."],
      ["Pourquoi le calcul ici suppose-t-il un gérant minoritaire ?", "Ce simulateur applique le taux assimilé salarié par défaut sur la rémunération, cohérent avec le moteur de calcul du site — pour un gérant majoritaire (régime TNS), utilisez le simulateur SARL dédié qui permet d'ajuster ce paramètre."]
    ],
    liens_internes: ['/simulateur/sarl', '/comparateur/sasu-vs-sarl', '/arbitrage/sasu-remuneration-vs-dividendes']
  },
  {
    type: 'arbitrage',
    statut: 'sas',
    slug: 'arbitrage/sas-remuneration-vs-dividendes',
    titre_seo: 'Salaire ou dividendes en SAS 2026 : simulateur d\'arbitrage optimal',
    h1: 'SAS : salaire ou dividendes, quelle répartition optimale pour le président ?',
    desc: "Trouvez la répartition rémunération/dividendes qui maximise le revenu net du président de SAS, avec la flat tax à 31,4% en 2026.",
    ca_defaut: 120000,
    faq: [
      ["Le calcul est-il différent entre SAS et SASU ?", "Non — le régime social du président (assimilé salarié) et la fiscalité des dividendes sont identiques, que la société ait un ou plusieurs associés. Seule la répartition du capital entre associés change, pas l'arbitrage individuel du président."],
      ["Et pour les autres associés non-dirigeants ?", "Ce simulateur porte sur la rémunération/dividendes du président uniquement — les dividendes versés aux autres associés suivent la même fiscalité (flat tax 31,4%) mais ne génèrent aucune cotisation sociale, n'étant pas liés à un mandat social rémunéré."]
    ],
    liens_internes: ['/simulateur/sas', '/comparateur/sas-vs-sarl', '/arbitrage/sasu-remuneration-vs-dividendes']
  },
  {
    type: 'simulateur_portage',
    statut: 'portage-salarial',
    slug: 'simulateur/portage-salarial',
    titre_seo: 'Simulateur portage salarial 2026 : net réel en poche, sans email',
    h1: 'Simulateur portage salarial 2026',
    desc: "Calculez votre salaire net réel en poche en portage salarial à partir de votre TJM et vos jours travaillés — résultat immédiat, sans capture d'email, avec comparaison des taux de gestion publics des principales sociétés de portage.",
    tjm_defaut: 500,
    jours_defaut: 18,
    faq: [
      ["Le taux de gestion affiché est-il le taux réel que je paierai ?", "Les taux publiés par les sociétés de portage sont des taux d'appel, souvent négociables selon votre chiffre d'affaires prévisionnel et votre ancienneté. Utilisez le champ \"taux de gestion\" du simulateur pour tester votre propre taux négocié — le tableau de comparaison, lui, garde les taux publics de chaque société pour rester une base de comparaison neutre."],
      ["La réserve financière est-elle perdue ?", "Non — la convention collective du portage salarial (IDCC 3219) impose une réserve financière égale à 10% du salaire de base en CDI. Elle est provisionnée à chaque bulletin de paie puis restituée en fin de mission ou de contrat, ou en cas de période sans activité. Elle n'apparaît pas dans le \"net versé immédiat\" mais est bien à vous."],
      ["Pourquoi le résultat est-il affiché avant impôt sur le revenu ?", "Pour rester comparable aux simulateurs des sociétés de portage, qui n'intègrent pas votre situation fiscale personnelle. L'impôt sur le revenu estimé selon votre TMI est affiché séparément, avec le net après impôt correspondant."]
    ],
    avantages: ["Régime général de la sécurité sociale, y compris l'assurance chômage (contrairement au président de SASU)", "Aucune création de société, aucune comptabilité à gérer soi-même", "Bulletin de paie classique, facilite les démarches (prêt immobilier, etc.)", "Réserve financière obligatoire qui sécurise les périodes sans mission"],
    inconvenients: ["Charges sociales les plus élevées de toutes les formes d'activité indépendante (~45-50% du CA facturé)", "Frais de gestion en plus des charges sociales, prélevés avant même le calcul du salaire", "Nécessite un TJM suffisamment élevé pour rester rentable face aux charges cumulées", "Pas de possibilité d'optimisation rémunération/dividendes comme en société"],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-portage-salarial', '/comparateur/portage-salarial-vs-sasu', '/migration/auto-entrepreneur-vers-portage-salarial']
  },
  {
    type: 'comparateur',
    statuts: ['auto-entrepreneur', 'portage-salarial'],
    slug: 'comparateur/auto-entrepreneur-vs-portage-salarial',
    titre_seo: 'Auto-entrepreneur ou portage salarial 2026 : comparateur',
    h1: 'Auto-entrepreneur ou portage salarial : lequel choisir ?',
    desc: "Comparez le revenu net entre auto-entrepreneur (régime micro-fiscal) et portage salarial (salariat via une société tierce) à chiffre d'affaires identique.",
    ca_defaut: 60000,
    params_defaut: { type_activite: 'prestations_services_bnc', tmi: 0.30 },
    faq: [
      ["Pourquoi le portage salarial coûte-t-il plus cher que l'auto-entreprise ?", "L'auto-entrepreneur paie des cotisations sociales à taux réduit (régime micro, environ 22% du CA en prestations de services) mais n'a aucune assurance chômage et une couverture sociale plus limitée. Le portage salarial applique un régime de salariat classique (charges patronales + salariales, ~45-50% du CA cumulé) en échange d'une protection sociale complète, chômage compris."],
      ["Le plafond de CA de l'auto-entreprise force-t-il à changer de statut ?", "Au-delà du plafond micro-fiscal (voir le simulateur auto-entrepreneur), il faut basculer vers l'EI au régime réel, une société, ou le portage salarial — ce dernier n'a aucun plafond de chiffre d'affaires."]
    ],
    liens_internes: ['/simulateur/auto-entrepreneur', '/simulateur/portage-salarial', '/migration/auto-entrepreneur-vers-portage-salarial']
  },
  {
    type: 'comparateur',
    statuts: ['portage-salarial', 'sasu'],
    slug: 'comparateur/portage-salarial-vs-sasu',
    titre_seo: 'Portage salarial ou SASU 2026 : comparateur de revenu net',
    h1: 'Portage salarial ou SASU : lequel rapporte le plus ?',
    desc: "Comparez le revenu net entre portage salarial (salariat via une société tierce, sans création d'entreprise) et SASU (société avec IS et flat tax sur dividendes) à chiffre d'affaires identique.",
    ca_defaut: 90000,
    params_defaut: { remuneration_gerant: 45000, charges_exploitation: 9000, dividendes_verses: 15000, tmi: 0.30 },
    faq: [
      ["Le portage salarial a-t-il un avantage que la SASU n'a pas ?", "Oui : l'assurance chômage. Le président de SASU, bien qu'assimilé salarié, n'y a pas droit sauf cumul avec un contrat de travail distinct — le salarié porté si, comme tout salarié classique."],
      ["Pourquoi créer une SASU si le portage salarial est plus simple administrativement ?", "La SASU permet d'arbitrer rémunération/dividendes (les dividendes évitent les charges sociales, voir le simulateur d'arbitrage SASU) et n'a pas de frais de gestion prélevés en amont — à CA élevé et gérable en discipline de rémunération, elle dégage souvent un revenu net supérieur au portage."]
    ],
    liens_internes: ['/simulateur/portage-salarial', '/simulateur/sasu', '/arbitrage/sasu-remuneration-vs-dividendes']
  },
  {
    type: 'migration',
    from: 'auto-entrepreneur',
    to: 'portage-salarial',
    slug: 'migration/auto-entrepreneur-vers-portage-salarial',
    titre_seo: "Passer d'auto-entrepreneur à portage salarial : guide 2026",
    h1: "Comment passer d'auto-entrepreneur à portage salarial ?",
    desc: "Étapes pour basculer d'une activité d'auto-entrepreneur vers le portage salarial, avec simulation de l'impact sur le revenu net.",
    ca_defaut: 60000,
    params_defaut: { type_activite: 'prestations_services_bnc', tmi: 0.30 },
    etapes: [
      "Choisir une société de portage salarial (comparer les taux de gestion — voir le simulateur dédié)",
      "Signer le contrat d'adhésion et le contrat de travail (CDD ou CDI de portage) avec la société choisie",
      "Cesser l'activité d'auto-entrepreneur (déclaration de cessation auprès du guichet unique) une fois le premier contrat de prestation sécurisé",
      "Faire signer les contrats de prestation par vos clients au nom de la société de portage (facturation via elle)",
      "Transmettre vos comptes-rendus d'activité mensuels à la société de portage pour déclencher la paie"
    ],
    faq: [
      ["Dois-je clôturer mon auto-entreprise avant de signer avec une société de portage ?", "Non — beaucoup de sociétés de portage recommandent de sécuriser d'abord une mission, puis de cesser l'auto-entreprise une fois le contrat de travail en portage effectif, pour éviter toute rupture de facturation."],
      ["Est-ce réversible si le portage ne convient pas ?", "Oui, plus simplement que pour une société : il suffit de ne pas renouveler le contrat de mission et de redevenir auto-entrepreneur (ou un autre statut) sans formalité de dissolution."]
    ],
    liens_internes: ['/comparateur/auto-entrepreneur-vs-portage-salarial', '/simulateur/portage-salarial']
  }
];

// ── Helpers HTML ──
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function eur(n) { return Math.round(n).toLocaleString('fr-FR') + ' €'; }
function pct(n) { return (n * 100).toFixed(1).replace('.', ',') + ' %'; }

// Grille de liens internes — commune à tous les types de page (même 9-item link-grid
// répété sur chaque page, pattern usgoldpricepergram.com). Le quiz est ajouté d'office
// sur toute page qui ne le référence pas déjà, pour garantir un maillage top-of-funnel.
function linkGridBlock(liensInternes) {
  const hubs = ['/quel-statut-choisir/'];
  const all = [...liensInternes, ...hubs.filter(h => !liensInternes.includes(h))];
  return `
  <div class="link-grid">
    ${all.map(l => `<a class="link-card" href="${l}/">${l.split('/').filter(Boolean).pop().replace(/-/g, ' ')}</a>`).join('')}
  </div>`;
}

function faqBlock(faq) {
  return `
  <h2 class="st">Questions fréquentes</h2>
  ${faq.map(f => `<div class="faq-item"><button class="faq-q" onclick="toggleFaq(this)">${esc(f[0])}</button><div class="faq-a">${f[1]}</div></div>`).join('\n  ')}`;
}

function faqJsonLd(faq) {
  return { '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1].replace(/<[^>]+>/g, '') } })) };
}

function webAppJsonLd(name, url) {
  return { '@type': 'WebApplication', name, url, applicationCategory: 'FinanceApplication', operatingSystem: 'Any', inLanguage: 'fr', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } };
}

// Table des faits générée directement depuis statuts.json — pas de retype manuel (voir plan: GEO/AI-citability
// doit lire la même source que le calcul, sinon on retombe dans le piège 3-copies de pension-alimentaire-belgique).
function formatStatutFacts(statut) {
  const rows = [];
  if (statut.categorie === 'portage_salarial') {
    rows.push(['Statut', 'Salarié en portage (CDD/CDI de mission)']);
    rows.push(['Taux de frais de gestion (défaut)', pct(statut.taux_frais_gestion_defaut)]);
    rows.push(['Charges patronales (estimées)', pct(statut.taux_charges_patronales_portage)]);
    rows.push(['Charges salariales (estimées)', pct(statut.taux_charges_salariales_portage)]);
    rows.push(['Réserve financière obligatoire (CDI)', pct(statut.taux_reserve_financiere_defaut) + ' du salaire de base (récupérable) — en CDD, indemnité de précarité distincte, non calculée ici']);
    return `
    <h2 class="st">Chiffres clés — ${esc(statut.nom)}</h2>
    <table class="data-table"><thead><tr><th>Donnée</th><th>Valeur</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="hl">${r[1]}</td></tr>`).join('')}
    </tbody></table>
    <p style="font-size:.88rem;color:var(--muted);">Données ${STATUTS_DATA.version} — taux publics relevés le ${statut.comparaison_entreprises_portage?.[0]?.date_maj || STATUTS_DATA.version}, négociables selon CA. À titre indicatif, vérifiées par un professionnel avant toute décision. Source structurée : <code>data/statuts.json</code>.</p>`;
  }
  rows.push(['Catégorie', statut.categorie === 'individuel' ? 'Entreprise individuelle' : 'Société']);
  if (statut.regime_fiscal) rows.push(['Régime fiscal', statut.regime_fiscal]);
  if (statut.regime_fiscal_defaut) rows.push(['Régime fiscal par défaut', statut.regime_fiscal_defaut]);
  if (statut.regime_social) rows.push(['Régime social', statut.regime_social]);
  if (statut.seuils_ca) {
    Object.entries(statut.seuils_ca).forEach(([k, v]) => rows.push([`Plafond CA — ${k.replace(/_/g, ' ')}`, eur(v)]));
  }
  if (statut.taux_cotisations_sociales) {
    Object.entries(statut.taux_cotisations_sociales).forEach(([k, v]) => rows.push([`Cotisations sociales — ${k.replace(/_/g, ' ')}`, pct(v)]));
  }
  if (statut.responsabilite) {
    const label = statut.responsabilite === 'patrimoine_personnel_protege_par_defaut'
      ? 'Patrimoine personnel protégé par défaut'
      : statut.responsabilite === 'limitee_aux_apports' ? 'Responsabilité limitée aux apports' : statut.responsabilite;
    rows.push(['Responsabilité', label]);
  }
  if (statut.responsabilite_note_contenu_visible) {
    rows.push(['⚠️ À noter', statut.responsabilite_note_contenu_visible]);
  }
  if (statut.cout_creation_moyen != null) rows.push(['Coût de création moyen', eur(statut.cout_creation_moyen)]);
  return `
  <h2 class="st">Chiffres clés — ${esc(statut.nom)}</h2>
  <table class="data-table"><thead><tr><th>Donnée</th><th>Valeur</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="hl">${r[1]}</td></tr>`).join('')}
  </tbody></table>
  <p style="font-size:.88rem;color:var(--muted);">Données ${STATUTS_DATA.version} — à titre indicatif, vérifiées par un professionnel avant toute décision. Source structurée : <code>data/statuts.json</code>.</p>`;
}

// Formule(s) de calcul par statut + liens sources officiels associés — génère depuis
// statut.categorie/regime_*, pas retapé à la main par page (même principe que formatStatutFacts:
// une seule source, pas de 3e copie manuelle comme dans pension-alimentaire-belgique).
function formuleLinesFor(statut) {
  const lignes = [];
  if (statut.categorie === 'portage_salarial') {
    lignes.push('CA_facturé = TJM × jours travaillés (par mois)');
    lignes.push('frais_gestion = CA_facturé × taux_frais_gestion (négociable selon CA, voir tableau comparatif)');
    lignes.push('budget_salarial = CA_facturé − frais_gestion');
    lignes.push('salaire_brut = budget_salarial ÷ (1 + taux_charges_patronales)  (dérivé, pas un input libre)');
    lignes.push('réserve_financière = salaire_brut × 10%  (CDI uniquement — provisionnée, restituée en fin de mission, pas perdue ; en CDD, indemnité de précarité distincte, non calculée ici)');
    lignes.push('salaire_net_avant_impôt = salaire_brut − (salaire_brut × taux_charges_salariales)');
    lignes.push('net_versé_immédiat = salaire_net_avant_impôt − réserve_financière  (= net avant impôt sur le revenu)');
    lignes.push('impôt_revenu = net_versé_immédiat × TMI');
    lignes.push('net_réel_en_poche = net_versé_immédiat − impôt_revenu');
    return lignes;
  }
  if (statut.regime_fiscal === 'micro-fiscal') {
    lignes.push('cotisations_sociales = CA × taux_cotisations (selon activité)');
    lignes.push('revenu_imposable = CA × (1 − abattement_forfaitaire)');
    lignes.push('impôt = revenu_imposable × TMI  (ou CA × taux_versement_libératoire si option VLF)');
    lignes.push('revenu_net = CA − cotisations_sociales − impôt');
  } else if (statut.categorie === 'individuel') {
    lignes.push('bénéfice = CA − charges_réelles');
    lignes.push('cotisations_sociales = bénéfice × taux_TNS_estimé');
    lignes.push('revenu_imposable = bénéfice − cotisations_sociales');
    lignes.push('impôt = revenu_imposable × TMI');
    lignes.push('revenu_net = bénéfice − cotisations_sociales − impôt');
  } else if (statut.regime_social_president === 'assimile_salarie' || statut.regime_social_gerant_minoritaire === 'assimile_salarie') {
    lignes.push('rémunération_dirigeant saisie = BRUT annuel (avant charges)');
    lignes.push('cotisations_patronales = rémunération_dirigeant × ~42.5% (coût entreprise, s\'ajoute au brut)');
    lignes.push('cotisations_salariales = rémunération_dirigeant × ~21% (déduite du brut pour obtenir le net)');
    lignes.push('bénéfice_avant_IS = CA − charges_exploitation − rémunération_dirigeant − cotisations_patronales');
    lignes.push('IS = bénéfice×15% (jusqu\'à 42 500€) + (bénéfice−42 500€)×25% au-delà');
    lignes.push('rémunération_nette = rémunération_dirigeant − cotisations_salariales');
    lignes.push('dividendes_nets = dividendes_versés × (1 − 31,4%)  (flat tax / PFU)');
    lignes.push('revenu_net_foyer = rémunération_nette − impôt(TMI) + dividendes_nets');
  } else {
    lignes.push('bénéfice_avant_IS = CA − charges_exploitation − rémunération_dirigeant − cotisations_sociales_dirigeant');
    lignes.push('IS = bénéfice×15% (jusqu\'à 42 500€) + (bénéfice−42 500€)×25% au-delà');
    lignes.push('rémunération_nette = rémunération_dirigeant − cotisations_sociales_dirigeant');
    lignes.push('dividendes_nets = dividendes_versés × (1 − 31,4%)  (flat tax / PFU)');
    lignes.push('revenu_net_foyer = rémunération_nette − impôt(TMI) + dividendes_nets');
  }
  return lignes;
}

// Bloc avantages/inconvenients optionnel — cfg.avantages/cfg.inconvenients sont des
// tableaux de strings définis par page dans PAGES[] (pas de retype dans statuts.json,
// ce sont des jugements éditoriaux, pas des données réglementaires).
// Bloc H2 optionnel, propre à une seule page (cfg.note_titre/cfg.note_html dans PAGES[]) —
// pas un bloc partagé comme avantagesInconvenientsBlock/formulesEtSourcesBlock, pour ne pas
// impacter les autres pages simulateur.
function extraNoteBlock(cfg) {
  if (!cfg.note_titre) return '';
  return `
  <h2 class="st">${esc(cfg.note_titre)}</h2>
  <p>${cfg.note_html}</p>`;
}

function avantagesInconvenientsBlock(cfg) {
  if (!cfg.avantages && !cfg.inconvenients) return '';
  const col = (titre, items, cls) => !items ? '' : `
    <div class="ai-col ${cls}">
      <h3 class="sub">${esc(titre)}</h3>
      <ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>`;
  return `
  <h2 class="st">Avantages &amp; inconvénients</h2>
  <div class="ai-grid">
    ${col('✓ Avantages', cfg.avantages, 'ai-pro')}
    ${col('✗ Inconvénients', cfg.inconvenients, 'ai-con')}
  </div>`;
}

function sourcesForStatuts(statutIds) {
  const S = STATUTS_DATA.sources;
  const cles = new Set(['bareme_ir']);
  statutIds.forEach(id => {
    const s = STATUTS_DATA.statuts[id];
    if (s.regime_fiscal === 'micro-fiscal') {
      ['urssaf_taux_micro', 'plafonds_ca_micro', 'abattement_forfaitaire', 'versement_liberatoire', 'franchise_tva'].forEach(k => cles.add(k));
    }
    if (s.categorie === 'individuel') {
      cles.add('loi_patrimoine_ei'); cles.add('loi_patrimoine_ei_explication');
    }
    if (s.categorie === 'societe') {
      cles.add('is_taux'); cles.add('is_taux_reduit_conditions'); cles.add('flat_tax_dividendes');
    }
    if (s.regime_social_gerant_majoritaire || s.regime_social_gerant) cles.add('gerant_sarl');
    if (s.regime_social_president === 'assimile_salarie') cles.add('president_sasu');
    if (s.categorie === 'portage_salarial') {
      cles.add('convention_collective_portage'); cles.add('reserve_financiere_portage'); cles.add('charges_patronales_portage');
    }
  });
  const labels = {
    bareme_ir: 'Barème progressif de l\'impôt sur le revenu — service-public.fr',
    convention_collective_portage: 'Convention collective du portage salarial (IDCC 3219) — code.travail.gouv.fr',
    reserve_financiere_portage: 'Réserve financière en portage salarial — ABC Portage',
    charges_patronales_portage: 'Charges patronales en portage salarial — ITG',
    urssaf_taux_micro: 'Taux de cotisations micro-entrepreneur — URSSAF',
    plafonds_ca_micro: 'Plafonds de chiffre d\'affaires micro-entrepreneur — impots.gouv.fr',
    abattement_forfaitaire: 'Abattement forfaitaire micro-fiscal — service-public.fr',
    versement_liberatoire: 'Versement libératoire de l\'impôt sur le revenu — impots.gouv.fr',
    franchise_tva: 'Franchise en base de TVA — service-public.fr',
    loi_patrimoine_ei: 'Loi n° 2022-172 du 14 février 2022 — Légifrance',
    loi_patrimoine_ei_explication: 'Protection du patrimoine personnel de l\'entrepreneur individuel — service-public.fr',
    is_taux: 'Taux de l\'impôt sur les sociétés — BOFiP',
    is_taux_reduit_conditions: 'Conditions du taux réduit d\'IS (15%) — BOFiP',
    flat_tax_dividendes: 'Prélèvement forfaitaire unique (PFU) sur dividendes — impots.gouv.fr',
    gerant_sarl: 'Régime social du gérant de SARL — service-public.fr',
    president_sasu: 'Régime social assimilé salarié du président (SAS/SASU) — service-public.fr'
  };
  return [...cles].filter(k => S[k]).map(k => ({ label: labels[k] || k, url: S[k] }));
}

function formulesEtSourcesBlock(statutIds) {
  const blocs = statutIds.map(id => {
    const statut = STATUTS_DATA.statuts[id];
    const lignes = formuleLinesFor(statut);
    return `<h3 class="sub">${esc(statut.nom_court || statut.nom)}</h3>
    <div class="code">${lignes.map(esc).join('<br>')}</div>`;
  }).join('');
  const sources = sourcesForStatuts(statutIds);
  return `
  <h2 class="st">Formules de calcul &amp; sources officielles</h2>
  <div class="method">
    ${blocs}
    <p style="font-size:.88rem;color:var(--muted);margin:14px 0 6px;">Formules appliquées de façon déterministe à partir de <code>data/statuts.json</code> (${STATUTS_DATA.version}) — approximations pédagogiques, pas un calcul officiel URSSAF/impots.gouv.fr au barème exact par tranche.</p>
    <h3 class="sub">Sources officielles</h3>
    <ul style="padding-left:18px;font-size:.98rem;">
      ${sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.label)}</a></li>`).join('')}
    </ul>
  </div>`;
}

function eeatBlock() {
  return `
  <div class="eeat-section">
    <h2 class="eeat-title">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--brand);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>
      Transparence, Méthodologie &amp; E-E-A-T
    </h2>
    <div class="eeat-grid">
      <div class="eeat-author-card">
        <div class="eeat-avatar">OS</div>
        <div class="eeat-author-info">
          <h3>Calculateur Statuts Juridiques</h3>
          <div class="eeat-author-subtitle">Outil Open Source Collaboratif</div>
          <p>
            Ce comparateur est un outil pédagogique open-source conçu pour vulgariser et simplifier la compréhension des différents statuts juridiques en France. Les calculs appliquent de manière déterministe les taux et barèmes réglementaires connus.
          </p>
        </div>
      </div>
      <div class="eeat-compliance">
        <div class="eeat-badge-list">
          <span class="eeat-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            Vulgarisation Pédagogique
          </span>
          <span class="eeat-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Taux réglementaires 2026
          </span>
        </div>
        <div class="eeat-compliance-item">
          <svg class="eeat-compliance-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
          <div class="eeat-compliance-text">
            <h4>Méthodologie &amp; Limites du simulateur</h4>
            <p>Les calculs reposent sur les barèmes de la Loi de Finances 2026 et de l'URSSAF (notamment le taux de flat tax de 31,4% sur les dividendes). Nos formules sont simplifiées et ne remplacent pas un calcul au barème progressif par tranche. Pour une simulation officielle complète, référez-vous au moteur de calcul officiel de l'État : <a href="https://mon-entreprise.urssaf.fr/" target="_blank" rel="noopener noreferrer">mon-entreprise.urssaf.fr</a>.</p>
          </div>
        </div>
        <div class="eeat-compliance-item">
          <svg class="eeat-compliance-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <div class="eeat-compliance-text">
            <h4>Conseil &amp; Validation Professionnelle</h4>
            <p>Ce site n'étant pas audité par un expert-comptable, les résultats sont fournis à titre indicatif. Avant toute prise de décision, nous vous recommandons vivement de faire valider vos calculs par un expert-comptable agréé par l'Ordre, ou de vous informer auprès de professionnels reconnus de la ComptaTech, tels que <a href="https://www.linkedin.com/in/patrick-maurice-dougs/" target="_blank" rel="noopener noreferrer">Patrick Maurice (Dougs)</a> ou <a href="https://www.linkedin.com/in/comefouques/" target="_blank" rel="noopener noreferrer">Côme Fouques (Indy)</a>.</p>
          </div>
        </div>
        <div class="eeat-compliance-item">
          <svg class="eeat-compliance-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
          <div class="eeat-compliance-text">
            <h4>Code source auditable</h4>
            <p>Les algorithmes de simulation de ce site sont en accès libre et collaboratif. Vous pouvez inspecter les formules et proposer des améliorations sur notre dépôt <a href="https://github.com/sadiyaqeen92639572-cloud/comparateur-statuts-juridiques" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root { --brand:#1a4d7a; --brand-dark:#0d3352; --brand-light:#e8f0f7; --accent:#1a7a5c; --text:#1a2027; --muted:#5c6b7a; --border:#dde5ec; --bg:#f7f9fb; --radius:12px; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--text); background:var(--bg); font-size:16px; line-height:1.65; }
header { background:linear-gradient(135deg,var(--brand-dark) 0%,var(--brand) 100%); color:#fff; padding:52px 20px 88px; text-align:center; }
header h1 { font-size:clamp(1.4rem,4vw,2.1rem); font-weight:800; margin-bottom:12px; }
header p { color:rgba(255,255,255,.92); font-size:1rem; max-width:600px; margin:0 auto; }
.container { max-width:840px; margin:0 auto; padding:0 20px; }
.tool-wrapper { margin:-56px auto 48px; }
.tool-card { background:#fff; border-radius:var(--radius); box-shadow:0 8px 40px rgba(13,51,82,.14); border:1px solid var(--border); padding:32px 28px; }
@media (max-width:580px){ .tool-card{ padding:22px 16px; } }
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:580px){ .form-grid{ grid-template-columns:1fr; } }
.form-group { display:flex; flex-direction:column; gap:6px; }
.form-group.full { grid-column:1 / -1; }
label { font-size:.89rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; }
select, input[type=number] { border:2px solid var(--border); border-radius:8px; padding:12px 14px; font-size:1rem; color:var(--text); background:#fff; width:100%; }
select:focus, input[type=number]:focus { outline:none; border-color:var(--brand); }
.calc-btn { width:100%; margin-top:22px; padding:17px; background:var(--brand); color:#fff; border:none; border-radius:10px; font-size:1.08rem; font-weight:700; cursor:pointer; }
.calc-btn:hover { background:var(--brand-dark); }
.result { display:none; margin-top:26px; }
.result-hero { background:linear-gradient(135deg,var(--brand-dark),var(--brand)); border-radius:10px; padding:26px; color:#fff; text-align:center; margin-bottom:14px; }
.result-hero .rl { font-size:.86rem; font-weight:700; text-transform:uppercase; letter-spacing:.5px; opacity:.85; margin-bottom:4px; }
.result-hero .ra { font-size:2.3rem; font-weight:900; line-height:1.1; }
.result-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px; }
@media (max-width:480px){ .result-grid{ grid-template-columns:1fr 1fr; } }
.r-stat { background:var(--brand-light); border-radius:8px; padding:14px; text-align:center; }
.r-stat .sv { font-size:1.1rem; font-weight:800; color:var(--brand-dark); }
.r-stat .sl { font-size:.82rem; color:var(--muted); margin-top:2px; }
.content { padding-bottom:64px; }
h2.st { font-size:1.3rem; font-weight:800; margin:48px 0 16px; }
h3.sub { font-size:1rem; font-weight:700; margin:24px 0 10px; color:var(--brand-dark); }
p { color:#2c3844; margin-bottom:14px; line-height:1.75; }
.method { background:#fff; border:1px solid var(--border); border-radius:12px; padding:26px 26px 18px; margin:0 0 36px; font-size:1rem; }
.method .code { background:#0d1b28; color:#dbe8f2; border-radius:8px; padding:16px 18px; font-family:'Courier New',monospace; font-size:.92rem; line-height:1.9; margin:10px 0; overflow-x:auto; }
.method a { color:var(--brand); }
.data-table { width:100%; border-collapse:collapse; margin:18px 0; font-size:.98rem; }
.data-table th { background:var(--brand); color:#fff; padding:10px 14px; text-align:left; font-weight:600; }
.data-table td { padding:10px 14px; border-bottom:1px solid var(--border); }
.data-table tr:nth-child(even) td { background:#f2f6f9; }
.hl { font-weight:700; color:var(--brand-dark); }
.ai-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:0 0 20px; }
@media (max-width:580px){ .ai-grid{ grid-template-columns:1fr; } }
.ai-col { border-radius:10px; padding:18px 20px; }
.ai-col.ai-pro { background:#e6f6f0; }
.ai-col.ai-con { background:#fdeeee; }
.ai-col h3 { margin-top:0; }
.ai-col ul { padding-left:18px; font-size:.95rem; line-height:1.7; }
.link-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; margin:18px 0; }
.link-card { display:block; background:#fff; border:1px solid var(--border); border-radius:8px; padding:12px 14px; text-decoration:none; color:var(--text); font-size:.98rem; font-weight:600; }
.link-card:hover { border-color:var(--brand); color:var(--brand-dark); }
.faq-item { border-bottom:1px solid var(--border); }
.faq-q { width:100%; background:none; border:none; text-align:left; padding:17px 0; font-size:1.02rem; font-weight:600; cursor:pointer; display:flex; justify-content:space-between; align-items:center; color:var(--text); }
.faq-q::after { content:'+'; font-size:1.3rem; color:var(--brand); flex-shrink:0; margin-left:12px; }
.faq-q.open::after { content:'−'; }
.faq-a { display:none; padding:0 0 16px; font-size:.98rem; color:#3d4a56; line-height:1.75; }
.faq-a.open { display:block; }
.back-link { display:inline-flex; align-items:center; gap:6px; color:var(--brand-dark); text-decoration:none; font-weight:600; font-size:.98rem; margin-bottom:28px; }
footer { background:#0d3352; color:#c3d3e0; text-align:center; padding:30px 20px; font-size:.9rem; }
footer p { color:#c3d3e0; }
footer a { color:#dbe8f2; }
.disc { background:#123f66; border-radius:8px; padding:13px 18px; margin-bottom:16px; font-size:.88rem; color:#c3d3e0; line-height:1.6; }

/* E-E-A-T Section styles */
.eeat-section {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 32px;
  margin-top: 32px;
  box-shadow: 0 4px 20px rgba(13,51,82,.02);
}
.eeat-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--brand-dark);
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 2px solid var(--brand-light);
  padding-bottom: 12px;
}
.eeat-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 32px;
}
@media (max-width: 768px) {
  .eeat-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
.eeat-author-card {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.eeat-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 1.4rem;
  flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(26, 77, 122, 0.15);
}
.eeat-author-info h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--brand-dark);
  margin-bottom: 2px;
}
.eeat-author-subtitle {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--brand);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}
.eeat-author-info p {
  font-size: 0.92rem;
  color: var(--muted);
  line-height: 1.6;
}
.eeat-compliance {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.eeat-badge-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.eeat-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--brand-light);
  color: var(--brand-dark);
  font-size: 0.78rem;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid rgba(26, 77, 122, 0.1);
}
.eeat-badge.verified {
  background: #e6f6f0;
  color: #1a7a5c;
  border-color: rgba(26, 122, 92, 0.15);
}
.eeat-compliance-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.eeat-compliance-icon {
  color: var(--brand);
  flex-shrink: 0;
  margin-top: 3px;
}
.eeat-compliance-text h4 {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--brand-dark);
  margin-bottom: 2px;
}
.eeat-compliance-text p {
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.5;
  margin-bottom: 0;
}
.eeat-compliance-text a {
  color: var(--brand);
  text-decoration: underline;
}
.eeat-compliance-text a:hover {
  color: var(--brand-dark);
}
`;

function pageShell({ title, desc, keywords, canonical, jsonld, body }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${keywords ? `<meta name="keywords" content="${esc(keywords)}">` : ''}
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.png" type="image/png">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="https://calculateur-statuts-juridiques.fr/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://calculateur-statuts-juridiques.fr/og-image.png">
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@graph': [...jsonld, GESMINE_ORG_JSONLD] }, null, 1)}
<\/script>
<style>${CSS}</style>
</head>
<body>
${body}
<footer><div class="container">
  <div class="disc">Simulateur à titre indicatif, basé sur des taux ${STATUTS_DATA.version} — ne remplace pas l'avis d'un expert-comptable ou d'un avocat. ${STATUTS_DATA.avertissement} Dernière mise à jour des données et calculs : ${TODAY}.</div>
  <p><a href="/">Comparateur de statuts juridiques</a></p>
  <p style="font-size:.72rem;margin-top:8px;">Comparateur de statuts juridiques fait partie de Gesmine-Invest Limited, société immatriculée au Royaume-Uni sous le numéro 14120136, siège social Hardy House, 269 Poynders Gardens, Londres, Royaume-Uni, SW4 8PQ.</p>
</div></footer>
</body>
</html>`;
}

// ── Widget simulateur — même pattern que meat-cooking: un objet PAGE sérialisé +
// script partagé inline (pas de <script src> externe, cohérent avec convention repo). ──
function simulateurWidget(cfg, statutId) {
  const isIndividuel = STATUTS_DATA.statuts[statutId].categorie === 'individuel';
  const isMicro = STATUTS_DATA.statuts[statutId].regime_fiscal === 'micro-fiscal';
  // Défauts société: rémunération ~50% du CA, charges d'exploitation ~10%, dividendes le solde imposable estimé —
  // ajustables par l'utilisateur, juste des valeurs de départ pédagogiques.
  const remuneration_defaut = Math.round(cfg.ca_defaut * 0.5 / 1000) * 1000;
  const charges_defaut = Math.round(cfg.ca_defaut * 0.1 / 1000) * 1000;
  const dividendes_defaut = Math.round(cfg.ca_defaut * 0.15 / 1000) * 1000;
  const PAGE = {
    statutId, ca_defaut: cfg.ca_defaut, type_activite_defaut: cfg.type_activite_defaut || null, isMicro, isIndividuel,
    remuneration_defaut, charges_defaut, dividendes_defaut
  };

  const typeActiviteField = isMicro
    ? `<div class="form-group full"><label>Type d'activité</label><select id="typeActivite">
        <option value="vente_marchandises">Vente de marchandises</option>
        <option value="prestations_services_bic" selected>Prestations de services (BIC)</option>
        <option value="prestations_services_bnc">Prestations de services (BNC)</option>
      </select></div>` : '';

  const statutRef = STATUTS_DATA.statuts[statutId];
  const estAssimileSalarieRef = statutRef.regime_social_president === 'assimile_salarie' || statutRef.regime_social_gerant_minoritaire === 'assimile_salarie';
  const remunerationLabel = estAssimileSalarieRef ? 'Rémunération brute dirigeant (€/an)' : 'Rémunération dirigeant (€/an)';
  const societeFields = !isIndividuel
    ? `<div class="form-group"><label>${remunerationLabel}</label><input type="number" id="remuneration" min="0" step="1000" value="${remuneration_defaut}"></div>
      <div class="form-group"><label>Charges d'exploitation (€/an)</label><input type="number" id="charges" min="0" step="1000" value="${charges_defaut}"></div>
      <div class="form-group full"><label>Dividendes versés (€/an)</label><input type="number" id="dividendes" min="0" step="1000" value="${dividendes_defaut}"></div>` : '';

  const resultStat = isIndividuel
    ? `<div class="r-stat"><div class="sv" id="r-cotis"></div><div class="sl">Cotisations sociales</div></div>
        <div class="r-stat"><div class="sv" id="r-impot"></div><div class="sl">Impôt sur le revenu</div></div>
        <div class="r-stat"><div class="sv" id="r-taux"></div><div class="sl">Taux de prélèvement global</div></div>`
    : `<div class="r-stat"><div class="sv" id="r-cotis"></div><div class="sl">Cotisations sociales dirigeant</div></div>
        <div class="r-stat"><div class="sv" id="r-impot"></div><div class="sl">IS + impôt sur rémunération</div></div>
        <div class="r-stat"><div class="sv" id="r-taux"></div><div class="sl">Taux de prélèvement global</div></div>`;

  return `
  <div class="tool-card">
    <div class="form-grid">
      <div class="form-group"><label>Chiffre d'affaires annuel (€)</label><input type="number" id="ca" min="0" step="1000" value="${cfg.ca_defaut}"></div>
      <div class="form-group"><label>Taux marginal d'imposition (TMI)</label><select id="tmi">
        <option value="0">0 %</option><option value="0.11">11 %</option><option value="0.30" selected>30 %</option><option value="0.41">41 %</option><option value="0.45">45 %</option>
      </select></div>
      ${typeActiviteField}
      ${societeFields}
    </div>
    <button class="calc-btn" onclick="calculate()">Calculer mon revenu net →</button>
    <div class="result" id="result">
      <div class="result-hero">
        <div class="rl">Revenu net annuel estimé</div>
        <div class="ra" id="r-net"></div>
      </div>
      <div class="result-grid">
        ${resultStat}
      </div>
    </div>
  </div>
  <script>
  const PAGE = ${JSON.stringify(PAGE)};
  ${CALC_ENGINE_CLIENT_SOURCE}
  const STATUTS_DATA = ${JSON.stringify(STATUTS_DATA)};
  function eur(n){ return Math.round(n).toLocaleString('fr-FR')+' €'; }
  function pct(n){ return (n*100).toFixed(1).replace('.',',')+' %'; }
  function calculate(){
    const ca = parseFloat(document.getElementById('ca').value)||0;
    const tmi = parseFloat(document.getElementById('tmi').value);
    const typeActiviteEl = document.getElementById('typeActivite');
    const params = { ca, tmi, type_activite: typeActiviteEl ? typeActiviteEl.value : undefined };
    if (!PAGE.isIndividuel) {
      params.remuneration_gerant = parseFloat(document.getElementById('remuneration').value)||0;
      params.charges_exploitation = parseFloat(document.getElementById('charges').value)||0;
      params.dividendes_verses = parseFloat(document.getElementById('dividendes').value)||0;
    }
    const res = calculerStatut(PAGE.statutId, params, STATUTS_DATA);
    document.getElementById('r-net').textContent = eur(res.revenu_net_apres_impot);
    if (PAGE.isIndividuel) {
      document.getElementById('r-cotis').textContent = eur(res.cotisations_sociales);
      document.getElementById('r-impot').textContent = eur(res.impot_revenu);
    } else {
      document.getElementById('r-cotis').textContent = eur(res.cotisations_sociales_gerant);
      document.getElementById('r-impot').textContent = eur(res.is_du + (res.impot_revenu_remuneration||0));
    }
    document.getElementById('r-taux').textContent = pct(res.taux_prelevement_global);
    document.getElementById('result').style.display='block';
    document.getElementById('result').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function toggleFaq(b){ b.classList.toggle('open'); b.nextElementSibling.classList.toggle('open'); }
  <\/script>`;
}

// Injecte le code source des fonctions du moteur de calcul dans le script client —
// même module que celui utilisé côté build (require), pas de duplication de logique.
const CALC_ENGINE_CLIENT_SOURCE = fs.readFileSync(path.join(__dirname, 'lib/calc-engine.js'), 'utf8')
  .replace(/^if \(typeof module.*$/ms, ''); // retire l'export CommonJS, inutile côté client

function renderSimulateur(cfg) {
  const statut = STATUTS_DATA.statuts[cfg.statut];
  const canonical = `${SITE_URL}/${cfg.slug}/`;
  const jsonld = [webAppJsonLd(cfg.h1, canonical), faqJsonLd(cfg.faq)];
  const body = `
<header><div class="container">
  <h1>${esc(cfg.h1)}</h1>
  <p>${esc(cfg.desc)}</p>
</div></header>
<div class="container tool-wrapper">
  ${simulateurWidget(cfg, cfg.statut)}
</div>
<div class="container content">
  <a class="back-link" href="/">← Tous les statuts</a>
  ${formatStatutFacts(statut)}
  ${extraNoteBlock(cfg)}
  ${avantagesInconvenientsBlock(cfg)}
  ${formulesEtSourcesBlock([cfg.statut])}
  ${faqBlock(cfg.faq)}
  ${eeatBlock()}
  ${linkGridBlock(cfg.liens_internes)}
</div>`;
  return pageShell({ title: cfg.titre_seo, desc: cfg.desc, canonical, jsonld, body });
}

// ── Widget simulateur portage salarial — sibling de simulateurWidget, pas une branche:
// champs TJM×jours (pas CA), pas de remuneration/charges/dividendes, résultat avant IR pour
// rester comparable aux 7 simulateurs concurrents (voir plan de build, section "hero avant
// IR"), + tableau de comparaison inter-sociétés recalculé côté client à chaque changement de
// TJM/jours. Zéro capture email — c'est tout le point du différenciateur. ──
function simulateurWidgetPortage(cfg) {
  const statut = STATUTS_DATA.statuts['portage-salarial'];
  const PAGE = {
    tjm_defaut: cfg.tjm_defaut,
    jours_defaut: cfg.jours_defaut,
    fraisGestion_defaut: statut.taux_frais_gestion_defaut
  };

  const comparaisonRows = (statut.comparaison_entreprises_portage || []).map((e, i) => {
    const slug = e.nom.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `<tr>
      <td>${esc(e.nom)}</td>
      <td class="hl">${pct(e.taux_gestion)}</td>
      <td id="cmp-net-${slug}">—</td>
      <td style="font-size:.82rem;color:var(--muted);">${esc(e.taux_gestion_note || '')}<br>Prix commercial (pas un taux réglementé), relevé le ${esc(e.date_maj)}${e.negociable_selon_ca ? ', négociable selon CA' : ''} — <a href="${esc(e.source_url)}" rel="nofollow noopener" target="_blank">source</a></td>
    </tr>`;
  }).join('');

  return `
  <div class="tool-card">
    <div class="form-grid">
      <div class="form-group"><label>TJM — Taux journalier moyen (€)</label><input type="number" id="tjm" min="0" step="10" value="${cfg.tjm_defaut}"></div>
      <div class="form-group"><label>Jours travaillés (par mois)</label><input type="number" id="jours" min="0" max="25" step="1" value="${cfg.jours_defaut}"></div>
      <div class="form-group"><label>Taux de gestion (votre société, %)</label><input type="number" id="fraisGestion" min="0" max="100" step="0.1" value="${(statut.taux_frais_gestion_defaut * 100).toFixed(1)}"></div>
      <div class="form-group"><label>Taux marginal d'imposition (TMI)</label><select id="tmi">
        <option value="0">0 %</option><option value="0.11">11 %</option><option value="0.30" selected>30 %</option><option value="0.41">41 %</option><option value="0.45">45 %</option>
      </select></div>
    </div>
    <button class="calc-btn" onclick="calculate()">Calculer mon salaire net →</button>
    <div class="result" id="result">
      <div class="result-hero">
        <div class="rl">Net mensuel avant impôt sur le revenu</div>
        <div class="ra" id="r-net"></div>
      </div>
      <div class="result-grid">
        <div class="r-stat"><div class="sv" id="r-cotis"></div><div class="sl">Cotisations patronales + salariales</div></div>
        <div class="r-stat"><div class="sv" id="r-reserve"></div><div class="sl">Réserve financière (récupérable)</div></div>
        <div class="r-stat"><div class="sv" id="r-total-reserve"></div><div class="sl">Total mensuel réserve incluse</div></div>
        <div class="r-stat"><div class="sv" id="r-impot"></div><div class="sl">Impôt sur le revenu estimé (TMI)</div></div>
        <div class="r-stat"><div class="sv" id="r-net-apres-ir"></div><div class="sl">Net après impôt sur le revenu</div></div>
        <div class="r-stat"><div class="sv" id="r-taux"></div><div class="sl">Taux de charges global</div></div>
      </div>
      <p id="r-avertissement-brut-bas" style="display:none;font-size:.85rem;color:var(--muted);margin-top:1rem;">⚠️ Estimation valable au-delà d'un salaire brut mensuel d'environ 2 000€ — en dessous, la réduction générale de cotisations patronales change le calcul réel. Contactez une société de portage pour un devis précis.</p>
      <h3 class="sub" style="margin-top:1.5rem;">Comparaison des sociétés de portage (même TJM, même nombre de jours)</h3>
      <div style="overflow-x:auto;">
        <table class="data-table"><thead><tr><th>Société</th><th>Taux de gestion</th><th>Net mensuel avant IR</th><th>Détail</th></tr></thead>
        <tbody>${comparaisonRows}</tbody></table>
      </div>
      <p style="font-size:.82rem;color:var(--muted);">Taux de gestion publics relevés, à titre indicatif — toujours négociables selon votre chiffre d'affaires prévisionnel. Aucun email ni téléphone requis pour voir ce résultat.</p>
    </div>
  </div>
  <script>
  const PAGE = ${JSON.stringify(PAGE)};
  ${CALC_ENGINE_CLIENT_SOURCE}
  const STATUTS_DATA = ${JSON.stringify(STATUTS_DATA)};
  function eur(n){ return Math.round(n).toLocaleString('fr-FR')+' €'; }
  function pct(n){ return (n*100).toFixed(1).replace('.',',')+' %'; }
  function calculate(){
    const tjm = parseFloat(document.getElementById('tjm').value)||0;
    const jours = parseFloat(document.getElementById('jours').value)||0;
    const fraisGestionPct = parseFloat(document.getElementById('fraisGestion').value)||0;
    const tmi = parseFloat(document.getElementById('tmi').value);
    const statut = STATUTS_DATA.statuts['portage-salarial'];
    const params = { tjm, jours, taux_frais_gestion_override: fraisGestionPct/100, tmi };
    const res = calculerPortageSalarial(statut, params);
    document.getElementById('r-net').textContent = eur(res.net_verse_immediat);
    document.getElementById('r-cotis').textContent = eur(res.cotisations_patronales + res.cotisations_salariales);
    document.getElementById('r-reserve').textContent = eur(res.reserve_financiere);
    document.getElementById('r-total-reserve').textContent = eur(res.net_total_reserve_incluse);
    document.getElementById('r-impot').textContent = eur(res.impot_revenu);
    document.getElementById('r-net-apres-ir').textContent = eur(res.net_reel_en_poche);
    document.getElementById('r-taux').textContent = pct(res.taux_charges_global);
    document.getElementById('r-avertissement-brut-bas').style.display = res.salaire_brut < 2000 ? 'block' : 'none';
    (statut.comparaison_entreprises_portage||[]).forEach(function(e){
      const slug = e.nom.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
      const cell = document.getElementById('cmp-net-'+slug);
      if (!cell) return;
      const resCmp = calculerPortageSalarial(statut, { tjm, jours, taux_frais_gestion_override: e.taux_gestion, tmi });
      cell.textContent = eur(resCmp.net_verse_immediat);
    });
    document.getElementById('result').style.display='block';
    document.getElementById('result').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function toggleFaq(b){ b.classList.toggle('open'); b.nextElementSibling.classList.toggle('open'); }
  window.addEventListener('DOMContentLoaded', calculate);
  <\/script>`;
}

function renderSimulateurPortage(cfg) {
  const statut = STATUTS_DATA.statuts[cfg.statut];
  const canonical = `${SITE_URL}/${cfg.slug}/`;
  const jsonld = [webAppJsonLd(cfg.h1, canonical), faqJsonLd(cfg.faq)];
  const body = `
<header><div class="container">
  <h1>${esc(cfg.h1)}</h1>
  <p>${esc(cfg.desc)}</p>
</div></header>
<div class="container tool-wrapper">
  ${simulateurWidgetPortage(cfg)}
</div>
<div class="container content">
  <a class="back-link" href="/">← Tous les statuts</a>
  ${formatStatutFacts(statut)}
  ${extraNoteBlock(cfg)}
  ${avantagesInconvenientsBlock(cfg)}
  ${formulesEtSourcesBlock([cfg.statut])}
  ${faqBlock(cfg.faq)}
  ${eeatBlock()}
  ${linkGridBlock(cfg.liens_internes)}
</div>`;
  return pageShell({ title: cfg.titre_seo, desc: cfg.desc, canonical, jsonld, body });
}

// ── Widget comparateur — deux colonnes de résultats + seuil de bascule (contenu
// différenciant calculé, pas thin content — voir avis Gemini dans le plan). ──
function comparateurWidget(cfg) {
  const [idA, idB] = cfg.statuts;
  const nomA = STATUTS_DATA.statuts[idA].nom_court || STATUTS_DATA.statuts[idA].nom;
  const nomB = STATUTS_DATA.statuts[idB].nom_court || STATUTS_DATA.statuts[idB].nom;
  const soitMicro = STATUTS_DATA.statuts[idA].regime_fiscal === 'micro-fiscal' || STATUTS_DATA.statuts[idB].regime_fiscal === 'micro-fiscal';
  const PAGE = { idA, idB, ca_defaut: cfg.ca_defaut, params_defaut: cfg.params_defaut, nomA, nomB };

  const typeActiviteField = soitMicro
    ? `<div class="form-group full"><label>Type d'activité (statut micro)</label><select id="typeActivite">
        <option value="vente_marchandises">Vente de marchandises</option>
        <option value="prestations_services_bic">Prestations de services (BIC)</option>
        <option value="prestations_services_bnc"${cfg.params_defaut.type_activite === 'prestations_services_bnc' ? ' selected' : ''}>Prestations de services (BNC)</option>
      </select></div>` : '';

  return `
  <div class="tool-card">
    <div class="form-grid">
      <div class="form-group"><label>Chiffre d'affaires annuel (€)</label><input type="number" id="ca" min="0" step="1000" value="${cfg.ca_defaut}"></div>
      <div class="form-group"><label>Taux marginal d'imposition (TMI)</label><select id="tmi">
        <option value="0">0 %</option><option value="0.11">11 %</option><option value="0.30" selected>30 %</option><option value="0.41">41 %</option><option value="0.45">45 %</option>
      </select></div>
      ${typeActiviteField}
    </div>
    <button class="calc-btn" onclick="calculate()">Comparer les deux statuts →</button>
    <div class="result" id="result">
      <div class="result-hero" id="seuil-hero">
        <div class="rl">Seuil de bascule (CA)</div>
        <div class="ra" id="r-seuil"></div>
        <div class="rs" id="r-seuil-sub"></div>
      </div>
      <div class="result-grid" style="grid-template-columns:1fr 1fr;">
        <div class="r-stat"><div class="sv" id="r-net-a"></div><div class="sl">Revenu net — ${esc(nomA)}</div></div>
        <div class="r-stat"><div class="sv" id="r-net-b"></div><div class="sl">Revenu net — ${esc(nomB)}</div></div>
      </div>
    </div>
  </div>
  <script>
  const PAGE = ${JSON.stringify(PAGE)};
  ${CALC_ENGINE_CLIENT_SOURCE}
  const STATUTS_DATA = ${JSON.stringify(STATUTS_DATA)};
  function eur(n){ return Math.round(n).toLocaleString('fr-FR')+' €'; }
  function calculate(){
    const ca = parseFloat(document.getElementById('ca').value)||0;
    const tmi = parseFloat(document.getElementById('tmi').value);
    const typeActiviteEl = document.getElementById('typeActivite');
    const params = Object.assign({}, PAGE.params_defaut, { ca, tmi });
    if (typeActiviteEl) params.type_activite = typeActiviteEl.value;
    const cmp = comparerStatuts(PAGE.idA, PAGE.idB, params, STATUTS_DATA);
    document.getElementById('r-net-a').textContent = eur(cmp.resA.revenu_net_apres_impot);
    document.getElementById('r-net-b').textContent = eur(cmp.resB.revenu_net_apres_impot);
    if (cmp.seuil_bascule_ca == null) {
      document.getElementById('r-seuil').textContent = 'Aucun croisement';
      document.getElementById('r-seuil-sub').textContent = (cmp.delta_revenu_net >= 0 ? PAGE.nomB : PAGE.nomA) + ' reste préférable sur toute la plage 0–300k€ (à ces hypothèses)';
    } else {
      document.getElementById('r-seuil').textContent = eur(cmp.seuil_bascule_ca);
      document.getElementById('r-seuil-sub').textContent = 'CA à partir duquel le statut le plus avantageux change (à ces hypothèses)';
    }
    document.getElementById('result').style.display='block';
    document.getElementById('result').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function toggleFaq(b){ b.classList.toggle('open'); b.nextElementSibling.classList.toggle('open'); }
  <\/script>`;
}

function renderComparateur(cfg) {
  const [idA, idB] = cfg.statuts;
  const statutA = STATUTS_DATA.statuts[idA];
  const statutB = STATUTS_DATA.statuts[idB];
  const canonical = `${SITE_URL}/${cfg.slug}/`;

  const buildParams = params => Object.assign({}, cfg.params_defaut, { ca: cfg.ca_defaut }, params);
  const seuilBuild = findSeuilBascule(idA, idB, buildParams({}), STATUTS_DATA);
  const seuilCopy = seuilBuild != null
    ? `<p>À hypothèses constantes (rémunération, charges et dividendes fixés comme ci-dessus), le statut le plus avantageux bascule autour d'un chiffre d'affaires de <strong>${eur(seuilBuild)}</strong>. Ajustez les paramètres du simulateur pour votre situation réelle.</p>`
    : `<p>Sur la plage de chiffre d'affaires testée (0 à 300 000 €), l'un des deux statuts reste préférable à ces hypothèses — utilisez le simulateur ci-dessus pour tester vos propres paramètres.</p>`;

  const jsonld = [webAppJsonLd(cfg.h1, canonical), faqJsonLd(cfg.faq)];
  const body = `
<header><div class="container">
  <h1>${esc(cfg.h1)}</h1>
  <p>${esc(cfg.desc)}</p>
</div></header>
<div class="container tool-wrapper">
  ${comparateurWidget(cfg)}
</div>
<div class="container content">
  <a class="back-link" href="/">← Tous les statuts</a>
  <h2 class="st">Seuil de bascule</h2>
  ${seuilCopy}
  ${formatStatutFacts(statutA)}
  ${formatStatutFacts(statutB)}
  ${formulesEtSourcesBlock([idA, idB])}
  ${faqBlock(cfg.faq)}
  ${eeatBlock()}
  ${linkGridBlock(cfg.liens_internes)}
</div>`;
  return pageShell({ title: cfg.titre_seo, desc: cfg.desc, canonical, jsonld, body });
}

// renderCharges réutilise le widget simulateur — même moteur, cadrage éditorial différent
// (détail des lignes de charges plutôt que "combien il me reste").
function renderCharges(cfg) {
  const statut = STATUTS_DATA.statuts[cfg.statut];
  const canonical = `${SITE_URL}/${cfg.slug}/`;
  const jsonld = [webAppJsonLd(cfg.h1, canonical), faqJsonLd(cfg.faq)];
  const body = `
<header><div class="container">
  <h1>${esc(cfg.h1)}</h1>
  <p>${esc(cfg.desc)}</p>
</div></header>
<div class="container tool-wrapper">
  ${simulateurWidget(cfg, cfg.statut)}
</div>
<div class="container content">
  <a class="back-link" href="/">← Tous les statuts</a>
  ${formatStatutFacts(statut)}
  ${formulesEtSourcesBlock([cfg.statut])}
  ${faqBlock(cfg.faq)}
  ${eeatBlock()}
  ${linkGridBlock(cfg.liens_internes)}
</div>`;
  return pageShell({ title: cfg.titre_seo, desc: cfg.desc, canonical, jsonld, body });
}

function migrationJsonLd(cfg) {
  return { '@type': 'HowTo', name: cfg.h1, step: cfg.etapes.map((texte, i) => ({ '@type': 'HowToStep', position: i + 1, text: texte })) };
}

function renderMigration(cfg) {
  const canonical = `${SITE_URL}/${cfg.slug}/`;
  const cmp = comparerStatuts(cfg.from, cfg.to, Object.assign({}, cfg.params_defaut, { ca: cfg.ca_defaut }), STATUTS_DATA);
  const nomFrom = STATUTS_DATA.statuts[cfg.from].nom_court || STATUTS_DATA.statuts[cfg.from].nom;
  const nomTo = STATUTS_DATA.statuts[cfg.to].nom_court || STATUTS_DATA.statuts[cfg.to].nom;
  const jsonld = [webAppJsonLd(cfg.h1, canonical), faqJsonLd(cfg.faq), migrationJsonLd(cfg)];
  const body = `
<header><div class="container">
  <h1>${esc(cfg.h1)}</h1>
  <p>${esc(cfg.desc)}</p>
</div></header>
<div class="container content">
  <a class="back-link" href="/">← Tous les statuts</a>
  <h2 class="st">Les étapes</h2>
  <table class="data-table"><thead><tr><th>#</th><th>Étape</th></tr></thead><tbody>
    ${cfg.etapes.map((e, i) => `<tr><td class="hl">${i + 1}</td><td>${esc(e)}</td></tr>`).join('')}
  </tbody></table>
  <h2 class="st">Impact estimé sur le revenu net (exemple à ${eur(cfg.ca_defaut)} de CA)</h2>
  <table class="data-table"><thead><tr><th>Statut</th><th>Revenu net estimé</th></tr></thead><tbody>
    <tr><td>${esc(nomFrom)} (avant)</td><td class="hl">${eur(cmp.resA.revenu_net_apres_impot)}</td></tr>
    <tr><td>${esc(nomTo)} (après)</td><td class="hl">${eur(cmp.resB.revenu_net_apres_impot)}</td></tr>
  </tbody></table>
  <p style="font-size:.88rem;color:var(--muted);">Estimation à titre d'exemple, hypothèses de rémunération/dividendes fixées ci-dessus — utilisez le <a href="/comparateur/${cfg.from}-vs-${cfg.to}/">comparateur ${esc(nomFrom)} vs ${esc(nomTo)}</a> pour ajuster à votre situation.</p>
  ${formulesEtSourcesBlock([cfg.from, cfg.to])}
  ${faqBlock(cfg.faq)}
  ${eeatBlock()}
  ${linkGridBlock(cfg.liens_internes)}
</div>`;
  return pageShell({ title: cfg.titre_seo, desc: cfg.desc, canonical, jsonld, body });
}

// comparateur_metier réutilise le widget comparateur avec des presets métier (CA/charges) —
// METIERS reste inline (non réglementaire, cf. avis Gemini dans le plan).
function renderComparateurMetier(cfg) {
  const metier = METIERS[cfg.metier];
  const [idA, idB] = cfg.statuts;
  const statutA = STATUTS_DATA.statuts[idA];
  const statutB = STATUTS_DATA.statuts[idB];
  const canonical = `${SITE_URL}/${cfg.slug}/`;
  const caDefaut = metier.ca_annuel_exemple;
  const comparateurCfg = Object.assign({}, cfg, {
    ca_defaut: caDefaut,
    params_defaut: Object.assign({ type_activite: metier.type_activite }, cfg.params_defaut)
  });

  const jsonld = [webAppJsonLd(cfg.h1, canonical), faqJsonLd(cfg.faq)];
  const body = `
<header><div class="container">
  <h1>${esc(cfg.h1)}</h1>
  <p>${esc(cfg.desc)}</p>
</div></header>
<div class="container tool-wrapper">
  ${comparateurWidget(comparateurCfg)}
</div>
<div class="container content">
  <a class="back-link" href="/">← Tous les statuts</a>
  <p>Simulation pré-remplie pour un profil <strong>${esc(metier.nom)}</strong> (CA type ${eur(caDefaut)}). Ajustez librement les paramètres ci-dessus.</p>
  ${formatStatutFacts(statutA)}
  ${formatStatutFacts(statutB)}
  ${formulesEtSourcesBlock([idA, idB])}
  ${faqBlock(cfg.faq)}
  ${eeatBlock()}
  ${linkGridBlock(cfg.liens_internes)}
</div>`;
  return pageShell({ title: cfg.titre_seo, desc: cfg.desc, canonical, jsonld, body });
}

// ── Widget arbitrage — balaye le split rémunération/dividendes via
// optimiserSplitRemunerationDividendes() (déjà présente dans calc-engine.js, pas de
// nouvelle logique de calcul: seule la restitution visuelle/HTML est nouvelle). ──
function arbitrageWidget(cfg) {
  const statutId = cfg.statut;
  const nom = STATUTS_DATA.statuts[statutId].nom_court || STATUTS_DATA.statuts[statutId].nom;
  const charges_defaut = cfg.charges_defaut != null ? cfg.charges_defaut : Math.round(cfg.ca_defaut * 0.1 / 1000) * 1000;
  const PAGE = { statutId, ca_defaut: cfg.ca_defaut, charges_defaut, nom };

  return `
  <div class="tool-card">
    <div class="form-grid">
      <div class="form-group"><label>Chiffre d'affaires annuel (€)</label><input type="number" id="ca" min="0" step="1000" value="${cfg.ca_defaut}"></div>
      <div class="form-group"><label>Charges d'exploitation (€/an)</label><input type="number" id="charges" min="0" step="1000" value="${charges_defaut}"></div>
      <div class="form-group full"><label>Taux marginal d'imposition (TMI)</label><select id="tmi">
        <option value="0">0 %</option><option value="0.11">11 %</option><option value="0.30" selected>30 %</option><option value="0.41">41 %</option><option value="0.45">45 %</option>
      </select></div>
    </div>
    <button class="calc-btn" onclick="calculate()">Trouver la répartition optimale →</button>
    <div class="result" id="result">
      <div class="result-hero">
        <div class="rl">Répartition optimale — revenu net max</div>
        <div class="ra" id="r-net"></div>
      </div>
      <div class="result-grid">
        <div class="r-stat"><div class="sv" id="r-remu"></div><div class="sl">Rémunération optimale</div></div>
        <div class="r-stat"><div class="sv" id="r-div"></div><div class="sl">Dividendes optimaux</div></div>
        <div class="r-stat"><div class="sv" id="r-part"></div><div class="sl">Part rémunération / budget</div></div>
      </div>
      <h3 class="sub" style="margin-top:22px;">Revenu net selon la part de rémunération</h3>
      <svg id="chart" viewBox="0 0 600 220" style="width:100%;height:auto;background:#fff;border:1px solid var(--border);border-radius:8px;">
        <polyline id="chart-line" fill="none" stroke="#1a4d7a" stroke-width="2.5"></polyline>
        <circle id="chart-best" r="5" fill="#1a7a5c"></circle>
      </svg>
      <p style="font-size:.82rem;color:var(--muted);margin-top:8px;">Point vert = répartition optimale. Chaque point du budget distribuable (CA − charges) est testé en rémunération, le solde étant versé en dividendes.</p>
    </div>
  </div>
  <script>
  const PAGE = ${JSON.stringify(PAGE)};
  ${CALC_ENGINE_CLIENT_SOURCE}
  const STATUTS_DATA = ${JSON.stringify(STATUTS_DATA)};
  function eur(n){ return Math.round(n).toLocaleString('fr-FR')+' €'; }
  function pct(n){ return (n*100).toFixed(1).replace('.',',')+' %'; }
  function calculate(){
    const ca = parseFloat(document.getElementById('ca').value)||0;
    const charges_exploitation = parseFloat(document.getElementById('charges').value)||0;
    const tmi = parseFloat(document.getElementById('tmi').value);
    const budget = Math.max(0, ca - charges_exploitation);
    const pas = Math.max(1000, Math.round(budget / 40 / 1000) * 1000);
    const { meilleur, points } = optimiserSplitRemunerationDividendes(PAGE.statutId, { ca, charges_exploitation, tmi }, STATUTS_DATA, { pas });
    document.getElementById('r-net').textContent = eur(meilleur.revenu_net_total_foyer);
    document.getElementById('r-remu').textContent = eur(meilleur.remuneration);
    document.getElementById('r-div').textContent = eur(Math.max(0, budget - meilleur.remuneration));
    document.getElementById('r-part').textContent = budget > 0 ? pct(meilleur.remuneration / budget) : '—';
    if (points.length > 1) {
      const xs = points.map(p => p.remuneration);
      const ys = points.map(p => p.revenu_net_total_foyer);
      const xMin = Math.min(...xs), xMax = Math.max(...xs) || 1;
      const yMin = Math.min(...ys), yMax = Math.max(...ys) || 1;
      const sx = x => 10 + (x - xMin) / (xMax - xMin || 1) * 580;
      const sy = y => 210 - (y - yMin) / (yMax - yMin || 1) * 200;
      document.getElementById('chart-line').setAttribute('points', points.map(p => sx(p.remuneration) + ',' + sy(p.revenu_net_total_foyer)).join(' '));
      document.getElementById('chart-best').setAttribute('cx', sx(meilleur.remuneration));
      document.getElementById('chart-best').setAttribute('cy', sy(meilleur.revenu_net_total_foyer));
    }
    document.getElementById('result').style.display='block';
    document.getElementById('result').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function toggleFaq(b){ b.classList.toggle('open'); b.nextElementSibling.classList.toggle('open'); }
  <\/script>`;
}

function renderArbitrage(cfg) {
  const statut = STATUTS_DATA.statuts[cfg.statut];
  const canonical = `${SITE_URL}/${cfg.slug}/`;
  const jsonld = [webAppJsonLd(cfg.h1, canonical), faqJsonLd(cfg.faq)];
  const body = `
<header><div class="container">
  <h1>${esc(cfg.h1)}</h1>
  <p>${esc(cfg.desc)}</p>
</div></header>
<div class="container tool-wrapper">
  ${arbitrageWidget(cfg)}
</div>
<div class="container content">
  <a class="back-link" href="/">← Tous les statuts</a>
  <h2 class="st">Pourquoi arbitrer entre rémunération et dividendes ?</h2>
  <p>En ${esc(statut.nom_court || statut.nom)}, chaque euro versé en rémunération au dirigeant supporte des cotisations sociales (${pct(statut.taux_charges_president_salaire || statut.taux_cotisations_tns_estime || 0.65)} environ) mais ouvre des droits sociaux (retraite, maladie). Chaque euro versé en dividendes évite ces cotisations mais passe par l'impôt sur les sociétés puis la flat tax de ${pct(STATUTS_DATA.constantes_communes.flat_tax_dividendes)} — et ne crée aucun droit social. Le simulateur ci-dessus teste toutes les répartitions possibles du budget distribuable (CA − charges d'exploitation) et identifie celle qui maximise le revenu net du foyer, à taux marginal d'imposition constant.</p>
  ${formatStatutFacts(statut)}
  ${formulesEtSourcesBlock([cfg.statut])}
  ${faqBlock(cfg.faq)}
  ${eeatBlock()}
  ${linkGridBlock(cfg.liens_internes)}
</div>`;
  return pageShell({ title: cfg.titre_seo, desc: cfg.desc, canonical, jsonld, body });
}

// ═════════════════════════════════════════════════════════════
// EMITTERS
// ═════════════════════════════════════════════════════════════
const OUT = __dirname;
// '/' et '/quel-statut-choisir/' sont écrites à la main (pas dans PAGES[]) mais doivent
// figurer dans le sitemap au même titre que les pages générées.
const urls = ['/', '/quel-statut-choisir/'];
function emit(relDir, html) {
  const dir = path.join(OUT, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  urls.push('/' + relDir.replace(/\\/g, '/') + '/');
}

const renderers = {
  simulateur: renderSimulateur,
  simulateur_portage: renderSimulateurPortage,
  comparateur: renderComparateur,
  charges: renderCharges,
  migration: renderMigration,
  comparateur_metier: renderComparateurMetier,
  arbitrage: renderArbitrage
};

PAGES.forEach(cfg => {
  const renderer = renderers[cfg.type];
  if (!renderer) {
    console.log(`(skip) type "${cfg.type}" pas encore implémenté: ${cfg.slug}`);
    return;
  }
  emit(cfg.slug, renderer(cfg));
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE_URL}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap);

console.log(`Généré ${urls.length - 1} page(s) + sitemap.xml`);
