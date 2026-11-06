/**
 * Demo seed: creates several products (projects) with documents for the
 * "Byrsa Pharma" pharmaceutical scenario (06_Demo_Data_Pharma).
 *
 * Products come from each pharma product folder's product.json; every product
 * gets its own document set from ./seed-data/<seedFolder>/ (.docx).
 *
 * Run from the repo root against the RUNNING stack (host ports):
 *   cd services/document-service
 *   SEED_DB_HOST=localhost SEED_DB_PORT=5433 SEED_MINIO_ENDPOINT=localhost \
 *     npx ts-node seed.ts
 *
 * (5433 = the host port Postgres is published on, see docker-compose.yml.)
 * Optionally target a specific tenant with SEED_COMPANY_ID=<uuid>; otherwise
 * the first company in the database is used.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';
import {
  Document,
  DocumentVersion,
  Product,
  FileFolder,
  DocumentType,
  DocumentStatus,
  DocumentApprovalStatus,
} from './src/database/entities/document.entity';
import { DocumentAccessRule } from './src/database/entities/document-access-rule.entity';
import { DocumentAuditEvent } from './src/database/entities/document-audit-event.entity';

// ── Minimal .env loader (repo root) for local runs; real env / SEED_* win ──
function loadEnv() {
  const p = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnv();

const DB_HOST = process.env.SEED_DB_HOST || process.env.POSTGRES_HOST || 'localhost';
const DB_PORT = Number(process.env.SEED_DB_PORT || process.env.POSTGRES_PORT || 5432);
const MINIO_ENDPOINT = process.env.SEED_MINIO_ENDPOINT || process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = Number(process.env.SEED_MINIO_PORT || process.env.MINIO_PORT || 9000);
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'qurelio-docs';

// ── Market code → label (matches the company/product wizard labels) ────────
const MARKET_LABEL: Record<string, string> = {
  EU: 'European Union',
  UK: 'United Kingdom',
  GCC: 'Gulf (GCC / GSO)',
  MAGHREB: 'North Africa / Maghreb',
};
const marketLabels = (codes: string[]) => codes.map((c) => MARKET_LABEL[c] ?? c);

// ── Product definitions (from product_registry.json) ───────────────────────
type SeedProduct = Partial<Product> & { name: string };

const PHARMA_PRODUCTS: SeedProduct[] = [
  {
    name: 'Furolix 20 mg/2 mL: furosemide, solution for injection',
    reference: 'BYR-FUR-020',
    sku: 'BYR-FUR-020',
    description: 'Sterile, preservative-free aqueous solution of furosemide 10 mg/mL for intravenous or intramuscular administration, filled in 2 mL amber Type I glass ampoules and terminally sterilised by moist heat (121 °C, F0 ≥ 15 min) at the Sidi Thabet sterile site. Supplied in cartons of 10 and hospital cartons of 50. Photolabile, protected by amber glass and the outer carton.',
    brandName: 'Furolix',
    productFamily: 'Byrsa Sterile Injectables',
    productType: 'finished',
    productStatus: 'active',
    categoryTags: [
      'Medicinal product for human use: sterile small-volume parenteral (ampoule)',
    ],
    intendedUse: 'Oedema associated with congestive heart failure, hepatic cirrhosis or renal disease including nephrotic syndrome, where a rapid onset of diuresis is required or oral administration is not practicable; acute pulmonary oedema; adjunct in hypertensive crisis. Administered by healthcare professionals in hospital and emergency settings. Adults: 20–40 mg by slow intravenous injection over 1–2 minutes, not exceeding 4 mg/minute; paediatric 0.5–1 mg/kg per dose (max 20 mg/day). Single-dose container; any unused portion is discarded. Incompatible with acidic solutions (pH < 7), notably glucose 5 %.',
    targetUsers: [
      'Hospital prescribers, nurses, hospital pharmacists',
      'B2B: hospital tenders, wholesalers',
    ],
    keyMaterials: [
      'Furosemide (active substance, CEP-covered API)',
      'Sodium chloride (tonicity agent)',
      'Sodium hydroxide 1 M (pH adjustment to 8.0–9.3)',
      'Water for injections (Ph. Eur.)',
      'Nitrogen, 0.2 µm filtered (headspace overlay)',
      '2 mL amber Type I glass ampoule, one-point-cut',
    ],
    physicalForm: 'Liquid',
    hsTariffCode: '3004.90',
    countryOfOrigin: 'TN',
    targetMarkets: [
      'Tunisia (domestic)',
      'Libya',
      'Algeria',
      'Iraq',
      'Saudi Arabia (SFDA, under evaluation)',
      'Senegal',
      'European Union (via MAH Pharmelis SAS)',
    ],
    requiredCertifications: [
      'Marketing authorisation (AMM): DPM Tunisia',
      'GMP certificate, sterile scope: DPM Tunisia',
      'EU GMP certificate for a third-country sterile site: ANSM (France)',
      'WHO-format Certificate of a Pharmaceutical Product (CPP)',
      'CEP for the active substance: EDQM (supplier-held)',
      'Ph. Eur. monographs and general chapters 2.6.1 / 2.6.14 / 2.9.19 / 2.9.20 / 5.1.1 (USER_SUPPLIED: referenced by number only)',
    ],
    applicableRegulations: [
      'Loi n° 85-91 du 22 novembre 1985 réglementant les activités pharmaceutiques (Tunisia)',
      'Directive 2001/83/EC: Community code relating to medicinal products for human use',
      'EudraLex Volume 4: EU GMP Part I and **Annex 1 (2022 revision)**, Annex 15, Annex 16',
      'Regulation (EC) No 1234/2008: variations',
      'Commission Delegated Regulation (EU) 2016/161: safety features',
      'ICH Q1A(R2), Q1B, Q3D, Q7, Q9(R1), Q10',
      'WHO TRS: GMP for sterile pharmaceutical products',
    ],
    industryLabels: [],
    productionSites: [
      'Sidi Thabet Sterile Site: line SVP-1',
    ],
    productionProcesses: [
      'Water for injections production and distribution',
      'Compounding under nitrogen (Grade C)',
      'Clarifying filtration (0.45 + 0.2 µm)',
      'Ampoule washing and depyrogenation tunnel (≥ 250 °C)',
      'Filling and tip-sealing (Grade A air supply in Grade C background)',
      'Terminal moist-heat sterilisation (121 °C, F0 ≥ 15)',
      '100 % visual inspection',
      'Quality Control: sterility, endotoxins, particulates',
    ],
    criticalSuppliers: [
      'Anhui Kangtai Fine Chemicals Co. Ltd, China: furosemide API (CEP R1-CEP-2018-244/02)',
      'Verrerie Médicale Adriatica S.p.A.: amber Type I ampoules (primary source)',
      'Sfax Glass Industries: ampoules (secondary source)',
    ],
    productCertifications: [
      {
        standardName: 'Marketing Authorisation (AMM): Tunisia',
        certifyingBody: 'Direction de la Pharmacie et du Médicament (DPM)',
        certificateNumber: 'AMM 2019-0207/DPM',
        marketScope: 'Tunisia',
        issueDate: '2019-06-11',
        expiryDate: '2029-06-10',
      },
      {
        standardName: 'GMP Certificate: sterile products, terminally sterilised SVP',
        certifyingBody: 'DPM Tunisia',
        certificateNumber: 'GMP/TN-2024-0069',
        marketScope: 'Tunisia + export',
        issueDate: '2024-04-11',
        expiryDate: '2027-02-18',
      },
      {
        standardName: 'EU GMP Certificate: third-country sterile site',
        certifyingBody: 'ANSM (France)',
        certificateNumber: 'FR/GMP/2024/0188',
        marketScope: 'European Union / EEA',
        issueDate: '2024-02-29',
        expiryDate: '2027-02-28',
      },
      {
        standardName: 'Certificate of a Pharmaceutical Product (WHO format)',
        certifyingBody: 'DPM Tunisia',
        certificateNumber: 'CPP/TN-2025-0412',
        marketScope: 'Saudi Arabia (importing authority: SFDA)',
        issueDate: '2025-12-04',
        expiryDate: '2027-12-03',
      },
    ],
    onboardingStatus: 'COMPLETED',
    currentStep: 6,
    seedFolder: 'Furolix_Injectable',
  },
  {
    name: 'Glucoryl 850: metformin hydrochloride 850 mg film-coated tablets',
    reference: 'BYR-GLU-850',
    sku: 'BYR-GLU-850',
    description: 'Generic immediate-release film-coated tablet of metformin hydrochloride 850 mg for the treatment of type 2 diabetes mellitus. Manufactured by high-shear wet granulation, compression and aqueous film coating at the Ben Arous plant. Packed in PVC/PVDC–aluminium blisters, carton of 30 tablets. Bioequivalence to the reference product demonstrated in study BE-MET-2021-07.',
    brandName: 'Glucoryl',
    productFamily: 'Byrsa Oral Antidiabetics',
    productType: 'finished',
    productStatus: 'active',
    categoryTags: [
      'Medicinal product for human use: solid oral form (film-coated tablet)',
    ],
    intendedUse: 'Treatment of type 2 diabetes mellitus, particularly in overweight patients, when dietary management and exercise alone do not achieve adequate glycaemic control, in adults as monotherapy or in combination with other oral antidiabetic agents or insulin, and in children from 10 years of age and adolescents. Prescription-only (liste I). Usual starting dose 850 mg once or twice daily with or after meals; maximum 3 000 mg daily in divided doses. Contraindicated in severe renal impairment (GFR < 30 mL/min/1.73 m²) and in conditions predisposing to lactic acidosis.',
    targetUsers: [
      'Prescribers and pharmacists',
      'B2B: wholesalers, tender bodies',
      'Patients (self-administration)',
    ],
    keyMaterials: [
      'Metformin hydrochloride (active substance, CEP-covered API)',
      'Povidone K30 (binder)',
      'Maize starch (diluent/disintegrant)',
      'Magnesium stearate, vegetable origin (lubricant)',
      'Opadry II White 85F18422: hypromellose, titanium dioxide E171, macrogol 3350, talc',
      'PVC/PVDC 250/60 µm forming film + 20 µm aluminium lidding',
    ],
    physicalForm: 'Solid',
    hsTariffCode: '3004.90',
    countryOfOrigin: 'TN',
    targetMarkets: [
      'Tunisia (domestic)',
      'Libya',
      'Algeria',
      'Senegal',
      'Côte d\'Ivoire',
      'Iraq (under evaluation)',
      'European Union (via MAH Pharmelis SAS)',
    ],
    requiredCertifications: [
      'Marketing authorisation (AMM): DPM Tunisia',
      'GMP certificate: DPM Tunisia',
      'EU GMP certificate for a third-country site: ANSM (France)',
      'WHO-format Certificate of a Pharmaceutical Product (CPP)',
      'CEP for the active substance: EDQM (supplier-held)',
      'Ph. Eur. monographs (USER_SUPPLIED: referenced by number only, never hosted)',
    ],
    applicableRegulations: [
      'Loi n° 85-91 du 22 novembre 1985 réglementant les activités pharmaceutiques (Tunisia)',
      'Directive 2001/83/EC: Community code relating to medicinal products for human use',
      'EudraLex Volume 4: EU GMP, Part I and Annexes 15 & 16',
      'Regulation (EC) No 1234/2008: variations',
      'Commission Delegated Regulation (EU) 2016/161: safety features',
      'ICH Q1A(R2), Q3C, Q3D, M7(R2), Q7, Q9(R1), Q10',
    ],
    industryLabels: [],
    productionSites: [
      'Ben Arous Solid & Semi-Solid Plant',
    ],
    productionProcesses: [
      'Dispensing',
      'High-shear wet granulation',
      'Fluid-bed drying',
      'Blending and compression',
      'Aqueous film coating',
      'Blistering and cartoning',
      'Quality Control (chemical/physical, microbiological)',
    ],
    criticalSuppliers: [
      'Shreeji Actives Pvt Ltd, India: metformin hydrochloride API (CEP R1-CEP-2016-118, single source)',
      'Colorcon: Opadry II film coat',
      'Univar Maghreb: povidone, maize starch',
      'Klöckner Pentaplast / Amcor Tunisia: primary and secondary packaging',
    ],
    productCertifications: [
      {
        standardName: 'Marketing Authorisation (AMM): Tunisia',
        certifyingBody: 'Direction de la Pharmacie et du Médicament (DPM)',
        certificateNumber: 'AMM 2022-0418/DPM',
        marketScope: 'Tunisia',
        issueDate: '2022-03-14',
        expiryDate: '2027-03-13',
      },
      {
        standardName: 'GMP Certificate: non-sterile solid oral & semi-solid forms',
        certifyingBody: 'DPM Tunisia',
        certificateNumber: 'GMP/TN-2023-0142',
        marketScope: 'Tunisia + export',
        issueDate: '2023-11-08',
        expiryDate: '2027-09-11',
      },
      {
        standardName: 'EU GMP Certificate: third-country manufacturing site',
        certifyingBody: 'ANSM (France)',
        certificateNumber: 'FR/GMP/2024/0731',
        marketScope: 'European Union / EEA',
        issueDate: '2024-08-30',
        expiryDate: '2027-06-23',
      },
      {
        standardName: 'Certificate of a Pharmaceutical Product (WHO format)',
        certifyingBody: 'DPM Tunisia',
        certificateNumber: 'CPP/TN-2025-0388',
        marketScope: 'Iraq (importing authority: MoH / KIMADIA)',
        issueDate: '2025-11-19',
        expiryDate: '2027-11-18',
      },
    ],
    onboardingStatus: 'COMPLETED',
    currentStep: 6,
    seedFolder: 'Glucoryl850_Tablet',
  },
  {
    name: 'Mycozan 2 % cream: ketoconazole 20 mg/g',
    reference: 'BYR-MYC-020',
    sku: 'BYR-MYC-020',
    description: 'Topical imidazole antifungal cream, 2 % ketoconazole in an oil-in-water emulsion, manufactured by hot-process emulsification and high-shear homogenisation at the Ben Arous semi-solid suite. Preserved with methyl and propyl parahydroxybenzoate; contains 10 % w/w propylene glycol. Packed in 30 g internally lacquered aluminium tubes.',
    brandName: 'Mycozan',
    productFamily: 'Byrsa Dermatology',
    productType: 'finished',
    productStatus: 'active',
    categoryTags: [
      'Medicinal product for human use: semi-solid cutaneous form (cream)',
    ],
    intendedUse: 'Topical treatment of dermatomycoses caused by dermatophytes and/or yeasts: tinea corporis, tinea cruris, tinea pedis, tinea manuum, cutaneous candidosis, pityriasis versicolor and seborrhoeic dermatitis. Applied once or twice daily to the affected area and immediately surrounding skin for 2–6 weeks depending on indication. Cutaneous use only; not for ophthalmic, oral or intravaginal use. Multi-dose container used by the patient over several weeks.',
    targetUsers: [
      'Patients (self-application)',
      'Prescribers, dermatologists, pharmacists',
      'B2B: wholesalers and distributors',
    ],
    keyMaterials: [
      'Ketoconazole (active substance, CEP-covered API)',
      'Propylene glycol 10 % w/w: high-risk excipient, distributor-supplied',
      'Cetostearyl alcohol / stearyl alcohol (consistency agents)',
      'Polysorbate 60 and sorbitan monostearate (emulsifier pair)',
      'Isopropyl myristate (emollient)',
      'Methyl and propyl parahydroxybenzoate (preservatives)',
      'Sodium sulfite anhydrous (antioxidant)',
      'Internally lacquered aluminium tube (epoxy-phenolic), HDPE cap',
    ],
    physicalForm: 'Semi-solid',
    hsTariffCode: '3004.20',
    countryOfOrigin: 'TN',
    targetMarkets: [
      'Tunisia (domestic)',
      'Libya',
      'Algeria',
      'Morocco',
      'Senegal',
      'Côte d\'Ivoire (submitted)',
      'European Union (via MAH Pharmelis SAS)',
    ],
    requiredCertifications: [
      'Marketing authorisation (AMM): DPM Tunisia',
      'GMP certificate (semi-solid scope): DPM Tunisia',
      'EU GMP certificate for a third-country site: ANSM (France)',
      'WHO-format Certificate of a Pharmaceutical Product (CPP)',
      'CEP for the active substance: EDQM (supplier-held)',
      'Ph. Eur. 5.1.3 / 5.1.4 and USP ⟨51⟩ (USER_SUPPLIED: referenced by number only, never hosted)',
    ],
    applicableRegulations: [
      'Loi n° 85-91 du 22 novembre 1985 réglementant les activités pharmaceutiques (Tunisia)',
      'Directive 2001/83/EC: Community code relating to medicinal products for human use (labelling, Title V)',
      'EU guideline on excipients in the labelling and package leaflet of medicinal products for human use',
      'EudraLex Volume 4: EU GMP Part I (Ch. 5 supplier qualification, Ch. 6 QC)',
      'Regulation (EC) No 1234/2008: variations',
      'Commission Delegated Regulation (EU) 2016/161: safety features',
      'ICH Q1A(R2), Q3D, Q7, Q9(R1), Q10',
    ],
    industryLabels: [],
    productionSites: [
      'Ben Arous Solid & Semi-Solid Plant: semi-solid suite SS-2',
    ],
    productionProcesses: [
      'Dispensing',
      'Hot-process oil/water phase preparation (72 ± 3 °C)',
      'Vacuum emulsification and high-shear homogenisation',
      'Active addition at 45 °C and controlled cooling (≤ 1.5 °C/min)',
      'Aluminium tube filling and crimping',
      'Cartoning',
      'Quality Control: physicochemical, rheology, microbiology',
    ],
    criticalSuppliers: [
      'Ravensa Fine Chemicals S.L., Spain: ketoconazole API (CEP R1-CEP-2015-097/03)',
      'Chemitrade Maghreb SARL: propylene glycol (DISTRIBUTOR, questionnaire-qualified only)',
      'Univar Maghreb: parabens, sodium sulfite, isopropyl myristate',
      'Peter Greven: cetostearyl and stearyl alcohol',
      'Tuboplast Maghreb: aluminium tubes',
    ],
    productCertifications: [
      {
        standardName: 'Marketing Authorisation (AMM): Tunisia',
        certifyingBody: 'Direction de la Pharmacie et du Médicament (DPM)',
        certificateNumber: 'AMM 2020-0533/DPM',
        marketScope: 'Tunisia',
        issueDate: '2020-09-08',
        expiryDate: '2030-09-07',
      },
      {
        standardName: 'GMP Certificate: non-sterile solid oral & semi-solid forms',
        certifyingBody: 'DPM Tunisia',
        certificateNumber: 'GMP/TN-2023-0142',
        marketScope: 'Tunisia + export',
        issueDate: '2023-11-08',
        expiryDate: '2027-09-11',
      },
      {
        standardName: 'EU GMP Certificate: third-country manufacturing site',
        certifyingBody: 'ANSM (France)',
        certificateNumber: 'FR/GMP/2024/0731',
        marketScope: 'European Union / EEA',
        issueDate: '2024-08-30',
        expiryDate: '2027-06-23',
      },
      {
        standardName: 'Certificate of a Pharmaceutical Product (WHO format)',
        certifyingBody: 'DPM Tunisia',
        certificateNumber: 'CPP/TN-2026-0044',
        marketScope: 'Côte d\'Ivoire (importing authority: DPML)',
        issueDate: '2026-03-05',
        expiryDate: '2028-03-04',
      },
    ],
    onboardingStatus: 'COMPLETED',
    currentStep: 6,
    seedFolder: 'Mycozan_Cream',
  },
  {
    name: 'Pedialgic 120 mg/5 mL: paracetamol oral suspension, sugar-free',
    reference: 'BYR-PED-120',
    sku: 'BYR-PED-120',
    description: 'Sugar-free paediatric paracetamol oral suspension, strawberry-flavoured, preserved with sodium benzoate and suspended with xanthan gum and microcrystalline cellulose/carmellose. Manufactured on line LIQ-1 at the Grombalia liquids plant. Supplied in a 100 mL amber PET bottle with a child-resistant closure, bottle adapter and a 5 mL graduated oral syringe. Vehicle contains three high-risk polyol/glycol excipients: sorbitol 70 %, glycerol and propylene glycol.',
    brandName: 'Pedialgic',
    productFamily: 'Byrsa Paediatrics',
    productType: 'finished',
    productStatus: 'active',
    categoryTags: [
      'Medicinal product for human use: oral liquid (suspension), paediatric',
    ],
    intendedUse: 'Short-term symptomatic treatment of mild to moderate pain and/or fever in infants and children weighing 4 kg to 32 kg (approximately 1 month to 12 years). Dosing is by body weight: 15 mg/kg per dose up to four times daily, minimum interval 4 hours, maximum 60 mg/kg per day. Administered by parents and carers using the graduated oral syringe supplied; the bottle must be shaken before each use. OTC pharmacy sale. In-use period 3 months after first opening.',
    targetUsers: [
      'Parents and carers (paediatric patients from 1 month)',
      'Pharmacists, paediatricians',
      'B2B: wholesalers, public tenders',
    ],
    keyMaterials: [
      'Paracetamol, micronised (active substance, CEP-covered API)',
      'Sorbitol 70 % non-crystallising: HIGH-RISK EXCIPIENT (1 750 mg/5 mL)',
      'Glycerol: HIGH-RISK EXCIPIENT (500 mg/5 mL)',
      'Propylene glycol: HIGH-RISK EXCIPIENT (200 mg/5 mL)',
      'Xanthan gum, microcrystalline cellulose + carmellose sodium (suspending system)',
      'Sodium benzoate E211 (preservative), citrate buffer',
      'Strawberry flavour (propylene glycol carrier), carmoisine E122',
      '100 mL amber PET bottle, child-resistant closure, 5 mL graduated oral syringe',
    ],
    physicalForm: 'Liquid',
    hsTariffCode: '3004.90',
    countryOfOrigin: 'TN',
    targetMarkets: [
      'Tunisia (domestic)',
      'Libya',
      'Algeria',
      'Morocco',
      'Senegal',
      'Côte d\'Ivoire',
      'Iraq',
      'European Union (via MAH Pharmelis SAS)',
    ],
    requiredCertifications: [
      'Marketing authorisation (AMM), DPM Tunisia: EXPIRES 2026-11-21, renewal overdue',
      'GMP certificate (liquid oral scope): DPM Tunisia',
      'EU GMP certificate for a third-country site: ANSM (France)',
      'WHO-format Certificate of a Pharmaceutical Product (CPP): supports 6 export registrations',
      'CEP for the active substance: EDQM (supplier-held)',
      'Ph. Eur. 5.1.3 / 5.1.4 and ISO 15378 (USER_SUPPLIED: referenced by number only, never hosted)',
    ],
    applicableRegulations: [
      'Loi n° 85-91 du 22 novembre 1985 réglementant les activités pharmaceutiques (Tunisia)',
      'DPM circular of 2025-09-04: per-container identity and DEG/EG testing for oral liquid manufacturers',
      'Directive 2001/83/EC: Community code relating to medicinal products for human use',
      'EudraLex Volume 4: EU GMP Part I, Chapter 5 (starting materials and suppliers), Chapter 6 (QC)',
      'Commission Delegated Regulation (EU) 2016/161: safety features',
      'Regulation (EC) No 1234/2008: variations',
      'WHO guidance and medical product alerts on contaminated paediatric oral liquids',
      'ICH Q1A(R2), Q3D, Q7, Q9(R1), Q10',
    ],
    industryLabels: [],
    productionSites: [
      'Grombalia Liquids & Packaging Plant: line LIQ-1',
    ],
    productionProcesses: [
      'Purified water production and distribution',
      'Vehicle preparation and polyol addition',
      'High-shear hydration of the suspending system',
      'Micronised API dispersion and homogenisation',
      'Volumetric filling, child-resistant closure application, induction sealing',
      'Packing with dosing syringe and leaflet',
      'Quality Control: physicochemical, dose uniformity, microbiology',
    ],
    criticalSuppliers: [
      'Anhui Kangtai Fine Chemicals Co. Ltd, China: paracetamol API (CEP R1-CEP-2017-315/02)',
      'Chemitrade Maghreb SARL: sorbitol 70 %, glycerol, propylene glycol (DISTRIBUTOR; questionnaire-qualified 2021, never audited; upstream manufacturer undocumented)',
      'Aromatica Tunisie: strawberry flavour (propylene glycol carrier)',
      'Univar Maghreb: sodium benzoate, buffers',
      'Emballages du Cap Bon: amber PET bottles, child-resistant closures, oral syringes',
    ],
    productCertifications: [
      {
        standardName: 'Marketing Authorisation (AMM): Tunisia',
        certifyingBody: 'Direction de la Pharmacie et du Médicament (DPM)',
        certificateNumber: 'AMM 2021-0692/DPM',
        marketScope: 'Tunisia (and the basis for 6 export registrations + the CPP)',
        issueDate: '2021-11-22',
        expiryDate: '2026-11-21',
      },
      {
        standardName: 'GMP Certificate: non-sterile liquid oral forms',
        certifyingBody: 'DPM Tunisia',
        certificateNumber: 'GMP/TN-2024-0211',
        marketScope: 'Tunisia + export',
        issueDate: '2024-06-14',
        expiryDate: '2027-04-30',
      },
      {
        standardName: 'EU GMP Certificate: third-country manufacturing site',
        certifyingBody: 'ANSM (France)',
        certificateNumber: 'FR/GMP/2025/0104',
        marketScope: 'European Union / EEA',
        issueDate: '2025-03-18',
        expiryDate: '2028-01-19',
      },
      {
        standardName: 'Certificate of a Pharmaceutical Product (WHO format)',
        certifyingBody: 'DPM Tunisia',
        certificateNumber: 'CPP/TN-2025-0501',
        marketScope: 'Iraq, Senegal, Côte d\'Ivoire',
        issueDate: '2025-12-22',
        expiryDate: '2027-12-21',
      },
    ],
    onboardingStatus: 'COMPLETED',
    currentStep: 6,
    seedFolder: 'Pedialgic_Syrup',
  },
];

const DOC_CATEGORY_JSON: Record<string, Record<string, string>> = {
  "Furolix_Injectable": {
    "Marketing Authorisation (AMM) & Export Registrations.docx": "Certificate",
    "Finished Product Specification (sterile SVP).docx": "Specification",
    "Manufacturing Process & Batch Formula.docx": "Technical File",
    "Stability Study Report (ICH Q1A + Q1B).docx": "Test Report",
    "Certificate of Analysis, batch FUR20-2602.docx": "Test Report",
    "SmPC & Package Leaflet + Labelling.docx": "Specification",
    "GMP Certificate (sterile scope) & WHO-format CPP.docx": "Certificate",
    "Product Quality Review (PQR) 2025.docx": "Quality Plan",
    "Sterility Assurance & Contamination Control Strategy (Annex 1) DRAFT.docx": "Quality Plan"
  },
  "Glucoryl850_Tablet": {
    "Marketing Authorisation (AMM) & Export Registrations.docx": "Certificate",
    "Finished Product Specification (release & shelf-life).docx": "Specification",
    "Manufacturing Process & Batch Formula.docx": "Technical File",
    "Stability Study Report (ICH Q1A(R2)).docx": "Test Report",
    "Certificate of Analysis, batch GLU850-2603.docx": "Test Report",
    "SmPC & Package Leaflet + Labelling.docx": "Specification",
    "GMP Certificate & WHO-format CPP.docx": "Certificate",
    "Product Quality Review (PQR) 2025.docx": "Quality Plan",
    "Nitrosamine Risk Assessment (ICH M7).docx": "Technical File"
  },
  "Mycozan_Cream": {
    "Marketing Authorisation (AMM) & Export Registrations.docx": "Certificate",
    "Finished Product Specification (semi-solid).docx": "Specification",
    "Manufacturing Process & Batch Formula (O-W emulsion).docx": "Technical File",
    "Stability Study Report (ICH Q1A(R2)).docx": "Test Report",
    "Certificate of Analysis, batch MYC02-2601.docx": "Test Report",
    "SmPC & Package Leaflet + Labelling.docx": "Specification",
    "GMP Certificate & WHO-format CPP.docx": "Certificate",
    "Product Quality Review (PQR) 2025.docx": "Quality Plan",
    "Microbiological Quality & Preservative Efficacy Report.docx": "Test Report"
  },
  "Pedialgic_Syrup": {
    "Marketing Authorisation (AMM) & Export Registrations.docx": "Certificate",
    "Finished Product Specification (oral suspension).docx": "Specification",
    "Manufacturing Process & Batch Formula.docx": "Technical File",
    "Stability Study Report (ICH Q1A(R2)) incl. in-use study.docx": "Test Report",
    "Certificate of Analysis, batch PED120-2605.docx": "Test Report",
    "SmPC & Package Leaflet + Labelling + dosing device.docx": "Specification",
    "GMP Certificate & WHO-format CPP.docx": "Certificate",
    "Product Quality Review (PQR) 2025.docx": "Quality Plan",
    "Excipient Risk Assessment (DEG-EG in high-risk excipients) DRAFT.docx": "Technical File"
  }
};

/**
 * Document category per file, keyed by seed folder. Generated from each
 * product.json `documents[]` in 06_Demo_Data_Pharma, the folder name comes from
 * the product's `seedFolder`, so every product gets its own document set.
 */
const DOC_CATEGORY: Record<string, Record<string, string>> = DOC_CATEGORY_JSON;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function storageKey(companyId: string, productName: string, filename: string): string {
  const safe = productName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${companyId}/products/${safe}/${DocumentType.PRODUCT_DOC}/${Date.now()}-${filename}`;
}

const ds = new DataSource({
  type: 'postgres',
  host: DB_HOST,
  port: DB_PORT,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [Document, DocumentVersion, Product, FileFolder, DocumentAccessRule, DocumentAuditEvent],
  // Tables are already created by the services (auth + document), no DDL from the seed.
  synchronize: false,
});

// Demo tenant login (created if it doesn't exist so `up` fills the DB end-to-end).
const DEMO_EMAIL = 'director@althea-medtech.demo';
const DEMO_PASSWORD = 'Demo@2024!';
// bcrypt hash of DEMO_PASSWORD (cost 12).
const DEMO_PASSWORD_HASH = '$2b$12$LaZUvntrbaibXuq98rlF.eGaaHSBCWjgnsnPvRxtSpNE/FPpWZ0z2';

async function seed() {
  console.log(`→ Postgres ${DB_HOST}:${DB_PORT} · MinIO ${MINIO_ENDPOINT}:${MINIO_PORT}`);
  await ds.initialize();

  // Resolve the target tenant + an uploader user (from the shared auth tables).
  let companyId: string = process.env.SEED_COMPANY_ID || '';
  if (!companyId) {
    // Prefer the demo tenant; create it if missing so `up` fills the DB with a working login.
    const existing = await ds.query('SELECT id FROM companies WHERE email = $1 LIMIT 1', [DEMO_EMAIL]);
    if (existing[0]) {
      companyId = existing[0].id;
      console.log(`= demo company exists (${DEMO_EMAIL})`);
    } else {
      const inserted = await ds.query(
        `INSERT INTO companies
           (name, company_code, field, email, phone, description, capacity, password_hash, status, is_email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', true)
         RETURNING id`,
        [
          'Althea Medical Devices S.A.S.',
          'QURALTH1',
          'Medical Devices',
          DEMO_EMAIL,
          '+33 4 00 00 00 00',
          'Demo tenant: AlphaFlow medical devices (seeded)',
          '184',
          DEMO_PASSWORD_HASH,
        ],
      );
      companyId = inserted[0].id;
      console.log(`+ demo company created: login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    }
  }
  // Prefer a real member of the tenant; otherwise attribute to the company (director) principal.
  const uploaderRow = (
    await ds.query('SELECT id FROM users WHERE company_id = $1 ORDER BY created_at ASC LIMIT 1', [companyId])
  )[0];
  const uploadedBy: string = uploaderRow?.id || companyId;
  console.log(`→ Tenant ${companyId} · uploader ${uploadedBy}`);

  const productRepo = ds.getRepository(Product);
  const docRepo = ds.getRepository(Document);

  // ── Retire products from earlier demo datasets ───────────────────────────
  // The pharma dataset replaces the medical-device one; leaving the old rows
  // behind would mix two unrelated portfolios in the same tenant.
  const keepNames = PHARMA_PRODUCTS.map((p) => p.name);
  const stale = (await productRepo.find({ where: { companyId } })).filter(
    (p) => !keepNames.includes(p.name),
  );
  for (const old of stale) {
    await docRepo.delete({ productId: old.id });
    await productRepo.delete({ id: old.id });
    console.log(`- removed previous demo product: ${old.name}`);
  }

  // ── Products (idempotent by companyId + name) ────────────────────────────
  const productIds = new Map<string, string>();
  for (const p of PHARMA_PRODUCTS) {
    const existing = await productRepo.findOne({ where: { companyId, name: p.name } });
    // seedFolder drives the document folder; it is not a Product column.
    const { seedFolder, ...columns } = p as SeedProduct & { seedFolder?: string };
    let product: Product;
    if (existing) {
      // Upsert: refresh the full profile so re-running enriches older minimal rows.
      product = await productRepo.save(productRepo.merge(existing, { ...columns, companyId }));
      console.log(`~ product updated: ${p.name}`);
    } else {
      product = await productRepo.save(productRepo.create({ ...columns, companyId }));
      console.log(`+ product created: ${p.name}`);
    }
    if (seedFolder) productIds.set(seedFolder, product.id);
  }

  // ── Product documents: each product gets its own folder ─────────────────
  const minio = new Minio.Client({
    endPoint: MINIO_ENDPOINT,
    port: MINIO_PORT,
    useSSL: (process.env.MINIO_USE_SSL || 'false') === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
  });
  if (!(await minio.bucketExists(MINIO_BUCKET))) {
    await minio.makeBucket(MINIO_BUCKET, 'us-east-1');
  }

  let total = 0;
  for (const p of PHARMA_PRODUCTS) {
    const folder = (p as SeedProduct & { seedFolder?: string }).seedFolder;
    const productId = folder ? productIds.get(folder) : undefined;
    if (!folder || !productId) continue;

    // Idempotent per product: an existing document set is left untouched.
    const existingDocs = await docRepo.count({ where: { productId } });
    if (existingDocs > 0) {
      console.log(`= ${p.name} already has ${existingDocs} document(s): skipping`);
      continue;
    }

    const dir = path.join(__dirname, 'seed-data', folder);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.docx')) : [];
    const categories = DOC_CATEGORY[folder] || {};
    let count = 0;
    for (const filename of files) {
      // Anything without a declared category is not a product document
      // (e.g. the deliberately blocked pharmacopoeia samples).
      const category = categories[filename];
      if (!category) {
        console.log(`  · skipped (not a product doc): ${filename}`);
        continue;
      }
      const buffer = fs.readFileSync(path.join(dir, filename));
      const key = storageKey(companyId, p.name, filename);
      await minio.putObject(MINIO_BUCKET, key, buffer, buffer.length, { 'Content-Type': DOCX_MIME });
      await docRepo.save(
        docRepo.create({
          name: filename,
          mimeType: DOCX_MIME,
          sizeBytes: buffer.length,
          type: DocumentType.PRODUCT_DOC,
          status: DocumentStatus.READY,
          approvalStatus: DocumentApprovalStatus.APPROVED,
          storageKey: key,
          companyId,
          productId,
          uploadedBy,
          version: 1,
          tags: [category],
        }),
      );
      count++;
    }
    total += count;
    console.log(`✓ ${count} document(s) attached to ${p.name}`);
  }
  console.log(`✓ ${total} document(s) across ${PHARMA_PRODUCTS.length} product(s)`);

  await ds.destroy();
  console.log('✅ Seed complete');
}

seed().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
