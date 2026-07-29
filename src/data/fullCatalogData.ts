export const LIVE_SERVICE_CATEGORIES = [
  { id: "cat-01", name: "Consultations", description: "Complimentary consultations to discuss your goals and build a personalized plan.", display_order: 1, is_active: true },
  { id: "cat-02", name: "Neurotoxins", description: "Botox & wrinkle relaxers", display_order: 2, is_active: true },
  { id: "cat-03", name: "Medical Wellness", description: "Hormone, weight management & peptide therapies", display_order: 3, is_active: true },
  { id: "cat-04", name: "Dermal Fillers", description: "Restore volume and contour", display_order: 4, is_active: true },
  { id: "cat-05", name: "Biostimulators", description: "Collagen-stimulating treatments", display_order: 5, is_active: true },
  { id: "cat-06", name: "Chemical Peels", description: "Resurfacing peels", display_order: 6, is_active: true },
  { id: "cat-07", name: "Microneedling", description: "Pen & RF microneedling", display_order: 7, is_active: true },
  { id: "cat-08", name: "Skin Tightening", description: "Non-invasive lifting", display_order: 8, is_active: true },
  { id: "cat-09", name: "Lasers", description: "IPL, Pico, Nd:YAG, CO₂ & more", display_order: 9, is_active: true },
  { id: "cat-10", name: "Body Contouring", description: "Sculpt and tone", display_order: 10, is_active: true },
  { id: "cat-11", name: "Laser Hair Reduction", description: "Long-lasting hair reduction", display_order: 11, is_active: true },
  { id: "cat-12", name: "Televisit", description: "Secure online visits for GLP-1, hormone replacement, and peptide therapy. Initial visit complimentary.", display_order: 12, is_active: true },
  { id: "cat-13", name: "Follow-Ups", description: "Post-treatment and follow-up visits", display_order: 13, is_active: true },
  { id: "cat-14", name: "Signature Facials", description: "Results-driven facials tailored to your skin. Clinical facials also available in San Jose.", display_order: 14, is_active: true },
  { id: "cat-15", name: "Facial Add-Ons", description: "Enhance any facial", display_order: 15, is_active: true }
];

export const LIVE_SERVICES = [
  // 1. Consultations
  { id: "svc-01-01", category_id: "cat-01", name: "Complimentary Consultation", description: "A 30-minute one-on-one consultation to discuss your aesthetic goals.", duration_minutes: 30, price_cents: 0, price_note: "Complimentary", is_active: true, display_order: 1 },
  { id: "svc-01-02", category_id: "cat-01", name: "Model Day", description: "Model day session for marketing, model release, and photo/video.", duration_minutes: 120, price_cents: 0, price_note: "Complimentary", is_active: true, display_order: 2 },

  // 2. Neurotoxins
  { id: "svc-02-01", category_id: "cat-02", name: "Neurotoxins", description: "Botox or Daxxify injections that relax expression muscles to smooth forehead lines, 11s, and crow's feet. Results appear in 7–14 days and last 3–4 months with Botox, up to ~6 months with Daxxify. Priced per unit.", duration_minutes: 30, price_cents: 1200, price_note: "per unit (Botox, Jeuveau, Xeomin, Letybo)", is_active: true, display_order: 1 },
  { id: "svc-02-02", category_id: "cat-02", name: "Daxxify", description: "Next-generation neurotoxin that softens expression lines (forehead, 11s, crow's feet) with results that can last up to 6 months — longer than traditional Botox.", duration_minutes: 30, price_cents: 800, price_note: "per unit", is_active: true, display_order: 2 },
  { id: "svc-02-03", category_id: "cat-02", name: "Botox Full Face", description: "Full face neurotoxin treatment targeting forehead, glabella (11s), and crow's feet for a smooth, refreshed look.", duration_minutes: 60, price_cents: 260000, price_note: "comprehensive treatment", is_active: true, display_order: 3 },

  // 3. Medical Wellness
  { id: "svc-03-01", category_id: "cat-03", name: "Hormone Replacement Therapy", description: "Bioidentical HRT consult & treatment (testosterone, estrogen, progesterone, pellets).", duration_minutes: 60, price_cents: 15000, price_note: "initial consultation · meds, labs & pharmacy billed separately", is_active: true, display_order: 1 },
  { id: "svc-03-02", category_id: "cat-03", name: "GLP-1 Wellness Management — Televisit", description: "Semaglutide / Tirzepatide weight management program.", duration_minutes: 45, price_cents: 25000, price_note: "$150 evaluation + $100 labs · medication & pharmacy billed separately", is_active: true, display_order: 2 },
  { id: "svc-03-03", category_id: "cat-03", name: "Peptide Therapy — Televisit", description: "Peptide therapy including Retatrutide and other compounded peptides.", duration_minutes: 45, price_cents: 25000, price_note: "Includes evaluation + labs · medication not included", is_active: true, display_order: 3 },
  { id: "svc-03-04", category_id: "cat-03", name: "GLP-1 Wellness Management — In-Person", description: "Semaglutide / Tirzepatide weight management program.", duration_minutes: 45, price_cents: 25000, price_note: "$150 evaluation + $100 labs · medication & pharmacy billed separately", is_active: true, display_order: 4 },
  { id: "svc-03-05", category_id: "cat-03", name: "Peptide Therapy — In-Person", description: "Peptide therapy including Retatrutide and other compounded peptides.", duration_minutes: 45, price_cents: 25000, price_note: "Includes evaluation + labs · medication not included", is_active: true, display_order: 5 },

  // 4. Dermal Fillers
  { id: "svc-04-01", category_id: "cat-04", name: "Dermal Filler", description: "Hyaluronic-acid filler used to restore lost volume, contour cheeks and jawline, refine lips, and smooth deeper folds.", duration_minutes: 45, price_cents: 60000, price_note: "$600 • per syringe", is_active: true, display_order: 1 },
  { id: "svc-04-02", category_id: "cat-04", name: "Hyaluronidase (Filler Dissolving)", description: "Enzyme injection used to dissolve previously placed hyaluronic acid dermal filler.", duration_minutes: 45, price_cents: 25000, price_note: "$250", is_active: true, display_order: 2 },

  // 5. Biostimulators
  { id: "svc-05-01", category_id: "cat-05", name: "Sculptra", description: "Poly-L-lactic acid biostimulator that gradually rebuilds your own collagen to restore facial volume and firmness.", duration_minutes: 60, price_cents: 80000, price_note: "$800 • per vial", is_active: true, display_order: 1 },
  { id: "svc-05-02", category_id: "cat-05", name: "Radiesse", description: "Calcium-hydroxyapatite biostimulator that delivers immediate lift plus long-term collagen renewal.", duration_minutes: 60, price_cents: 80000, price_note: "$800 • per syringe", is_active: true, display_order: 2 },

  // 6. Chemical Peels
  { id: "svc-06-01", category_id: "cat-06", name: "Light Peel", description: "Gentle, lunchtime-friendly chemical peel that exfoliates the surface to brighten dullness and smooth texture.", duration_minutes: 45, price_cents: 15000, price_note: "$150", is_active: true, display_order: 1 },
  { id: "svc-06-02", category_id: "cat-06", name: "Advanced Peel", description: "Stronger medical-grade peel that targets sun damage, pigmentation, fine lines, and uneven texture.", duration_minutes: 60, price_cents: 18500, price_note: "$185", is_active: true, display_order: 2 },
  { id: "svc-06-03", category_id: "cat-06", name: "Perfect Derma Peel", description: "Signature medium-depth blend peel that improves melasma, sun spots, acne scars, and tone.", duration_minutes: 60, price_cents: 35000, price_note: "$350", is_active: true, display_order: 3 },
  { id: "svc-06-04", category_id: "cat-06", name: "TCA CROSS", description: "Focal application of high-concentration TCA into individual icepick and narrow boxcar acne scars.", duration_minutes: 45, price_cents: 50000, price_note: "$500 • per session", is_active: true, display_order: 4 },

  // 7. Microneedling
  { id: "svc-07-01", category_id: "cat-07", name: "Pen Microneedling", description: "Automated micro-channels that trigger natural collagen and elastin production to refine pores and texture.", duration_minutes: 60, price_cents: 40000, price_note: "$400", is_active: true, display_order: 1 },
  { id: "svc-07-02", category_id: "cat-07", name: "RF Microneedling", description: "Radiofrequency microneedling that combines collagen-stimulating micro-channels with RF energy deep in skin.", duration_minutes: 75, price_cents: 55000, price_note: "$550", is_active: true, display_order: 2 },
  { id: "svc-07-03", category_id: "cat-07", name: "Subcision (Scar Release)", description: "In-office mechanical release of tethered atrophic and acne scars using a sterile cannula or needle.", duration_minutes: 60, price_cents: 65000, price_note: "$650 • per session", is_active: true, display_order: 3 },
  { id: "svc-07-04", category_id: "cat-07", name: "Exosomes Add-On", description: "Regenerative growth-factor add-on applied after microneedling or laser to accelerate healing.", duration_minutes: 15, price_cents: 15000, price_note: "$150", is_active: true, display_order: 4 },
  { id: "svc-07-05", category_id: "cat-07", name: "Subcision + Filler/Biostimulator Add-On", description: "Subcision combined with an add-on injectable of your choice — HA filler, Sculptra, Radiesse, or skin boosters.", duration_minutes: 75, price_cents: 130000, price_note: "From $1,050 to $1,500 all-inclusive", is_active: true, display_order: 5 },

  // 8. Skin Tightening
  { id: "svc-08-01", category_id: "cat-08", name: "Exilis Ultra 360", description: "Radiofrequency + ultrasound device that tightens skin, contours the body and face, and softens cellulite.", duration_minutes: 45, price_cents: 35000, price_note: "$350 • single session", is_active: true, display_order: 1 },
  { id: "svc-08-02", category_id: "cat-08", name: "Ultherapy PRIME", description: "FDA-cleared microfocused ultrasound that lifts the brow, jawline, and neck.", duration_minutes: 90, price_cents: 190000, price_note: "$1,900 • full face", is_active: true, display_order: 2 },
  { id: "svc-08-03", category_id: "cat-08", name: "Everesse by Volnewmer — Full Face", description: "Korea's premier monopolar RF skin-tightening platform for full face lift.", duration_minutes: 60, price_cents: 75000, price_note: "$750 • full face", is_active: true, display_order: 3 },
  { id: "svc-08-04", category_id: "cat-08", name: "Everesse by Volnewmer — Under Eyes", description: "July-only Everesse by Volnewmer monopolar RF skin tightening under-eye area.", duration_minutes: 30, price_cents: 25000, price_note: "$250 • July promo", promo_group: "everesse-undereyes", is_active: true, display_order: 4 },
  { id: "svc-08-05", category_id: "cat-08", name: "Everesse by Volnewmer — Neck / Jawline", description: "July-only Everesse by Volnewmer monopolar RF skin tightening neck and jawline.", duration_minutes: 60, price_cents: 25000, price_note: "$250 • July promo", promo_group: "everesse-neck", is_active: true, display_order: 5 },
  { id: "svc-08-06", category_id: "cat-08", name: "Everesse by Volnewmer — Promo Full Face", description: "July-only Everesse by Volnewmer monopolar RF skin tightening full face.", duration_minutes: 60, price_cents: 35000, price_note: "$350 • July promo", promo_group: "everesse-fullface", is_active: true, display_order: 6 },
  { id: "svc-08-07", category_id: "cat-08", name: "Everesse by Volnewmer — Package of 2", description: "Two-session Volnewmer full face package spaced 4–6 weeks apart.", duration_minutes: 60, price_cents: 140000, price_note: "$1,400 (save $100)", is_active: true, display_order: 7 },
  { id: "svc-08-08", category_id: "cat-08", name: "Everesse by Volnewmer — Package of 3", description: "Three-session Volnewmer full face package for maximum collagen remodeling.", duration_minutes: 60, price_cents: 195000, price_note: "$1,950 (save $300)", is_active: true, display_order: 8 },
  { id: "svc-08-09", category_id: "cat-08", name: "Everesse by Volnewmer — Full Face + Neck Pkg of 2", description: "Two-session Volnewmer full face + neck package.", duration_minutes: 90, price_cents: 180000, price_note: "$1,800 (save $100)", is_active: true, display_order: 9 },

  // 9. Lasers
  { id: "svc-09-01", category_id: "cat-09", name: "IPL", description: "Intense Pulsed Light photofacial that fades sun spots, broken capillaries, and redness.", duration_minutes: 45, price_cents: 30000, price_note: "$300", is_active: true, display_order: 1 },
  { id: "svc-09-02", category_id: "cat-09", name: "Pico Laser", description: "Picosecond laser that targets melasma, sun spots, and tone irregularities.", duration_minutes: 45, price_cents: 35000, price_note: "$350", is_active: true, display_order: 2 },
  { id: "svc-09-03", category_id: "cat-09", name: "Nd:YAG Laser", description: "Nd:YAG laser for vascular lesions, leg & facial veins, and deeper pigment.", duration_minutes: 45, price_cents: 30000, price_note: "$300", is_active: true, display_order: 3 },
  { id: "svc-09-04", category_id: "cat-09", name: "CO₂ Laser", description: "Fractional CO₂ laser resurfacing for deep wrinkles, acne scars, and significant sun damage.", duration_minutes: 60, price_cents: 60000, price_note: "$600 • per session", is_active: true, display_order: 4 },

  // 10. Body Contouring
  { id: "svc-10-01", category_id: "cat-10", name: "HIFEM", description: "High-intensity electromagnetic muscle-stimulation that builds muscle and burns fat.", duration_minutes: 30, price_cents: 17500, price_note: "$175", is_active: true, display_order: 1 },
  { id: "svc-10-02", category_id: "cat-10", name: "Lipolytic Injections", description: "Injectable fat-dissolving treatment (deoxycholic acid / Lemon Bottle) for targeted fullness.", duration_minutes: 30, price_cents: 25000, price_note: "$250 • PCDC / Lemon Bottle", is_active: true, display_order: 2 },

  // 11. Laser Hair Reduction
  { id: "svc-11-01", category_id: "cat-11", name: "Laser Hair Reduction – Upper Lip", description: "Permanent laser hair reduction for the upper lip.", duration_minutes: 15, price_cents: 5000, price_note: "$50", is_active: true, display_order: 1 },
  { id: "svc-11-02", category_id: "cat-11", name: "Laser Hair Reduction – Chin", description: "Permanent laser hair reduction along the chin and jawline.", duration_minutes: 15, price_cents: 6000, price_note: "$60", is_active: true, display_order: 2 },
  { id: "svc-11-03", category_id: "cat-11", name: "Laser Hair Reduction – Neck", description: "Permanent laser hair reduction across the neck.", duration_minutes: 15, price_cents: 8500, price_note: "$85", is_active: true, display_order: 3 },
  { id: "svc-11-04", category_id: "cat-11", name: "Laser Hair Reduction – Underarms", description: "Permanent laser hair reduction for the underarms.", duration_minutes: 20, price_cents: 9500, price_note: "$95", is_active: true, display_order: 4 },
  { id: "svc-11-05", category_id: "cat-11", name: "Laser Hair Reduction – Bikini", description: "Permanent laser hair reduction for standard bikini line.", duration_minutes: 20, price_cents: 12000, price_note: "$120", is_active: true, display_order: 5 },
  { id: "svc-11-06", category_id: "cat-11", name: "Laser Hair Reduction – Brazilian", description: "Permanent laser hair reduction of the full Brazilian area.", duration_minutes: 30, price_cents: 20000, price_note: "$200", is_active: true, display_order: 6 },
  { id: "svc-11-07", category_id: "cat-11", name: "Laser Hair Reduction – Full Face", description: "Permanent laser hair reduction across full face.", duration_minutes: 30, price_cents: 15000, price_note: "$150", is_active: true, display_order: 7 },
  { id: "svc-11-08", category_id: "cat-11", name: "Laser Hair Reduction – Abdomen", description: "Permanent laser hair reduction for the abdomen.", duration_minutes: 30, price_cents: 18000, price_note: "$180", is_active: true, display_order: 8 },
  { id: "svc-11-09", category_id: "cat-11", name: "Laser Hair Reduction – Arms", description: "Permanent laser hair reduction for full arms.", duration_minutes: 30, price_cents: 20000, price_note: "$200", is_active: true, display_order: 9 },
  { id: "svc-11-10", category_id: "cat-11", name: "Laser Hair Reduction – Chest", description: "Permanent laser hair reduction across the chest.", duration_minutes: 30, price_cents: 18000, price_note: "$180", is_active: true, display_order: 10 },
  { id: "svc-11-11", category_id: "cat-11", name: "Laser Hair Reduction – Back", description: "Permanent laser hair reduction for full back.", duration_minutes: 45, price_cents: 22000, price_note: "$220", is_active: true, display_order: 11 },
  { id: "svc-11-12", category_id: "cat-11", name: "Laser Hair Reduction – Legs", description: "Permanent laser hair reduction for full legs.", duration_minutes: 60, price_cents: 35000, price_note: "$350", is_active: true, display_order: 12 },

  // 12. Televisit
  { id: "svc-12-01", category_id: "cat-12", name: "Televisit Consultation", description: "Complimentary virtual consultation with Kiem to discuss any service, treatment, or wellness concern.", duration_minutes: 30, price_cents: 0, price_note: "Complimentary initial consultation", is_active: true, display_order: 1 },
  { id: "svc-12-02", category_id: "cat-12", name: "GLP-1 / HRT / Peptides", description: "Secure video visit with a California-licensed clinician for evaluation, prescribing, and management.", duration_minutes: 30, price_cents: 25000, price_note: "$250 • $150 evaluation + $100 labs", is_active: true, display_order: 2 },
  { id: "svc-12-03", category_id: "cat-12", name: "Televisit Follow-Up", description: "Virtual follow-up visit with Kiem to review progress, labs, or medication adjustments.", duration_minutes: 15, price_cents: 0, price_note: "Complimentary follow-up", is_active: true, display_order: 3 },
  { id: "svc-12-04", category_id: "cat-12", name: "Neurotoxin Follow-Up", description: "2-week neurotoxin touch-up check after your treatment.", duration_minutes: 15, price_cents: 0, price_note: "Complimentary follow-up", is_active: true, display_order: 4 },
  { id: "svc-12-05", category_id: "cat-12", name: "Generalized follow up", description: "Brief follow-up visit with your provider.", duration_minutes: 15, price_cents: 0, price_note: "Complimentary", is_active: true, display_order: 5 },

  // 13. Follow-Ups
  { id: "svc-13-01", category_id: "cat-13", name: "Follow-Up Visit", description: "Quick check-in and assessment after a prior treatment.", duration_minutes: 30, price_cents: 0, price_note: "Complimentary", is_active: true, display_order: 1 },

  // 14. Signature Facials
  { id: "svc-14-01", category_id: "cat-14", name: "Glo2 Facial", description: "Oxygenating facial that deep-cleans pores, exfoliates, and infuses skin with CO₂-activated serums.", duration_minutes: 75, price_cents: 20000, price_note: "$200", is_active: true, display_order: 1 },
  { id: "svc-14-02", category_id: "cat-14", name: "RDS Regenerative Facial", description: "Factor Five RDS — a 'no-peel peel' regenerative facial powered by exosome-derived growth factors.", duration_minutes: 75, price_cents: 18500, price_note: "$185", is_active: true, display_order: 2 },
  { id: "svc-14-03", category_id: "cat-14", name: "Velvet Reset Facial", description: "BioRePeel — a 'no-peel peel' facial combining TCA, salicylic acid, tartaric acid, and amino acids.", duration_minutes: 75, price_cents: 18500, price_note: "$185", is_active: true, display_order: 3 },
  { id: "svc-14-04", category_id: "cat-14", name: "PRX Facial", description: "PRX-T33 — a 'no-peel peel' facial. European bio-revitalization combining 33% TCA with kojic acid.", duration_minutes: 60, price_cents: 18500, price_note: "$185", is_active: true, display_order: 4 },

  // 15. Facial Add-Ons
  { id: "svc-15-01", category_id: "cat-15", name: "LED Light Therapy", description: "Medical-grade LED therapy that calms acne, reduces inflammation, and stimulates collagen.", duration_minutes: 30, price_cents: 5000, price_note: "$50", is_active: true, display_order: 1 },
  { id: "svc-15-02", category_id: "cat-15", name: "Facial Block (Lidocaine ± Epi)", description: "Targeted facial nerve block using lidocaine, with or without epinephrine, for profound anesthesia.", duration_minutes: 15, price_cents: 17500, price_note: "$175 • lidocaine ± epi add-on", is_active: true, display_order: 2 },
];
