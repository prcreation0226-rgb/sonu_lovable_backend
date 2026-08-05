"use strict";
// Radiantilyk EMR — Client Service Catalog Import Script
// Imports all 15 categories and 60 services from frontend/service.md into live MySQL database.
// Idempotent: Uses stable unique slugs to update existing records without creating duplicates.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLIENT_SERVICE_CATALOG = void 0;
exports.importServiceCatalog = importServiceCatalog;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
exports.CLIENT_SERVICE_CATALOG = [
    {
        name: 'Consultations',
        description: 'Complimentary consultations to discuss your goals and build a personalized plan.',
        displayOrder: 1,
        services: [
            {
                name: 'Complimentary Consultation',
                slug: 'consultation-complimentary',
                description: 'A 30-minute one-on-one consultation to discuss your aesthetic goals.',
                durationMinutes: 30,
                priceCents: 0,
                priceNote: 'Complimentary',
                displayOrder: 1,
            },
            {
                name: 'Model Day',
                slug: 'consultation-model-day',
                description: 'Model day session for marketing, model release, and photo/video.',
                durationMinutes: 120,
                priceCents: null,
                priceNote: 'Model day session for marketing, model release, and photo/video.',
                displayOrder: 2,
            },
        ],
    },
    {
        name: 'Neurotoxins',
        description: 'Botox & wrinkle relaxers',
        displayOrder: 2,
        services: [
            {
                name: 'Neurotoxins',
                slug: 'neurotoxin-per-unit',
                description: 'Botox or Daxxify injections that relax expression muscles to smooth forehead lines, 11s, and crow\'s feet. Results appear in 7–14 days and last 3–4 months with Botox, up to ~6 months with Daxxify. Priced per unit.',
                durationMinutes: 30,
                priceCents: 1200,
                priceNote: 'per unit (Botox, Jeuveau, Xeomin, Letybo)',
                displayOrder: 1,
            },
            {
                name: 'Daxxify',
                slug: 'neurotoxin-daxxify',
                description: 'Next-generation neurotoxin that softens expression lines (forehead, 11s, crow\'s feet) with results that can last up to 6 months — longer than traditional Botox.',
                durationMinutes: 30,
                priceCents: 800,
                priceNote: 'per unit',
                displayOrder: 2,
            },
            {
                name: 'Botox Full Face',
                slug: 'neurotoxin-botox-full-face',
                description: 'Full face neurotoxin treatment targeting forehead, glabella (11s), and crow\'s feet for a smooth, refreshed look.',
                durationMinutes: 60,
                priceCents: 260000,
                priceNote: 'comprehensive treatment',
                displayOrder: 3,
            },
        ],
    },
    {
        name: 'Medical Wellness',
        description: 'Hormone, weight management & peptide therapies',
        displayOrder: 3,
        services: [
            {
                name: 'Hormone Replacement Therapy',
                slug: 'medical-wellness-hrt',
                description: 'Bioidentical HRT consult & treatment (testosterone, estrogen, progesterone, pellets).',
                durationMinutes: 60,
                priceCents: 15000,
                priceNote: 'initial consultation · meds, labs & pharmacy billed separately',
                displayOrder: 1,
            },
            {
                name: 'GLP-1 Wellness Management — Televisit',
                slug: 'medical-wellness-glp1-televisit',
                description: 'Semaglutide / Tirzepatide weight management program.',
                durationMinutes: 45,
                priceCents: 25000,
                priceNote: '$150 evaluation + $100 labs · medication & pharmacy billed separately',
                displayOrder: 2,
            },
            {
                name: 'Peptide Therapy — Televisit',
                slug: 'medical-wellness-peptide-televisit',
                description: 'Peptide therapy including Retatrutide and other compounded peptides.',
                durationMinutes: 45,
                priceCents: 25000,
                priceNote: 'Includes evaluation + labs · medication not included',
                displayOrder: 3,
            },
            {
                name: 'GLP-1 Wellness Management — In-Person',
                slug: 'medical-wellness-glp1-in-person',
                description: 'Semaglutide / Tirzepatide weight management program.',
                durationMinutes: 45,
                priceCents: 25000,
                priceNote: '$150 evaluation + $100 labs · medication & pharmacy billed separately',
                displayOrder: 4,
            },
            {
                name: 'Peptide Therapy — In-Person',
                slug: 'medical-wellness-peptide-in-person',
                description: 'Peptide therapy including Retatrutide and other compounded peptides.',
                durationMinutes: 45,
                priceCents: 25000,
                priceNote: 'Includes evaluation + labs · medication not included',
                displayOrder: 5,
            },
        ],
    },
    {
        name: 'Dermal Fillers',
        description: 'Restore volume and contour',
        displayOrder: 4,
        services: [
            {
                name: 'Dermal Filler',
                slug: 'dermal-filler-per-syringe',
                description: 'Hyaluronic-acid filler used to restore lost volume, contour cheeks and jawline, refine lips, and smooth deeper folds. Priced per syringe; longevity 6–18 months.',
                durationMinutes: 45,
                priceCents: 60000,
                priceNote: 'per syringe',
                displayOrder: 1,
            },
            {
                name: 'Hyaluronidase (Filler Dissolving)',
                slug: 'dermal-filler-hyaluronidase',
                description: 'Enzyme injection used to dissolve previously placed hyaluronic acid (HA) dermal filler. Used for asymmetry, overcorrection, vascular occlusion, nodules, or migration. Results vary; multiple sessions may be required.',
                durationMinutes: 45,
                priceCents: 25000,
                priceNote: null,
                displayOrder: 2,
            },
        ],
    },
    {
        name: 'Biostimulators',
        description: 'Collagen-stimulating treatments',
        displayOrder: 5,
        services: [
            {
                name: 'Sculptra',
                slug: 'biostimulators-sculptra',
                description: 'Poly-L-lactic acid biostimulator that gradually rebuilds your own collagen to restore facial volume and firmness. Series of 2–3 sessions; results last up to 2 years.',
                durationMinutes: 60,
                priceCents: 80000,
                priceNote: 'per vial',
                displayOrder: 1,
            },
            {
                name: 'Radiesse',
                slug: 'biostimulators-radiesse',
                description: 'Calcium-hydroxyapatite biostimulator that delivers immediate lift plus long-term collagen renewal. Excellent for jawline, cheeks, and hand rejuvenation.',
                durationMinutes: 60,
                priceCents: 80000,
                priceNote: 'per syringe',
                displayOrder: 2,
            },
        ],
    },
    {
        name: 'Chemical Peels',
        description: 'Resurfacing peels',
        displayOrder: 6,
        services: [
            {
                name: 'Light Peel',
                slug: 'chemical-peels-light',
                description: 'Gentle, lunchtime-friendly chemical peel that exfoliates the surface to brighten dullness, smooth texture, and even out tone with little to no downtime.',
                durationMinutes: 45,
                priceCents: 15000,
                priceNote: null,
                displayOrder: 1,
            },
            {
                name: 'Advanced Peel',
                slug: 'chemical-peels-advanced',
                description: 'Stronger medical-grade peel that targets sun damage, pigmentation, fine lines, and uneven texture. Expect light flaking for 3–5 days.',
                durationMinutes: 60,
                priceCents: 18500,
                priceNote: null,
                displayOrder: 2,
            },
            {
                name: 'Perfect Derma Peel',
                slug: 'chemical-peels-perfect-derma',
                description: 'Signature medium-depth blend peel that improves melasma, sun spots, acne scars, and tone. Visible peeling on days 3–5; results unfold over 2 weeks.',
                durationMinutes: 60,
                priceCents: 35000,
                priceNote: null,
                displayOrder: 3,
            },
            {
                name: 'TCA CROSS',
                slug: 'chemical-peels-tca-cross',
                description: 'Focal application of high-concentration TCA into individual icepick and narrow boxcar acne scars to trigger collagen remodeling. Per-session pricing; series of 3–6 typically recommended.',
                durationMinutes: 45,
                priceCents: 50000,
                priceNote: 'per session · series of 3–6 typically recommended',
                displayOrder: 4,
            },
        ],
    },
    {
        name: 'Microneedling',
        description: 'Pen & RF microneedling',
        displayOrder: 7,
        services: [
            {
                name: 'Pen Microneedling',
                slug: 'microneedling-pen',
                description: 'Automated micro-channels that trigger natural collagen and elastin production to refine pores, fine lines, tone, and superficial scarring. Series of 3 recommended.',
                durationMinutes: 60,
                priceCents: 40000,
                priceNote: null,
                displayOrder: 1,
            },
            {
                name: 'RF Microneedling',
                slug: 'microneedling-rf',
                description: 'Radiofrequency microneedling that combines collagen-stimulating micro-channels with RF energy deep in the skin to tighten, lift, and resurface. Series of 3 recommended.',
                durationMinutes: 75,
                priceCents: 55000,
                priceNote: null,
                displayOrder: 2,
            },
            {
                name: 'Subcision (Scar Release)',
                slug: 'microneedling-subcision',
                description: 'In-office mechanical release of tethered atrophic and acne scars using a sterile needle or cannula to free fibrous bands and stimulate collagen remodeling.',
                durationMinutes: 60,
                priceCents: 65000,
                priceNote: 'per session · series of 3–6 typically recommended',
                displayOrder: 3,
            },
            {
                name: 'Exosomes Add-On',
                slug: 'microneedling-exosomes-addon',
                description: 'Regenerative growth-factor add-on applied after microneedling or laser to accelerate healing, calm redness, and boost glow, firmness, and tone.',
                durationMinutes: 15,
                priceCents: 15000,
                priceNote: null,
                displayOrder: 4,
            },
            {
                name: 'Subcision + Filler/Biostimulator/Booster Add-On',
                slug: 'microneedling-subcision-bundled-addon',
                description: 'Subcision (manual scar release) combined with an add-on injectable of your choice — HA filler, Sculptra, Radiesse, or skin boosters — to lift and remodel atrophic scars in a single session. Add-on selected and consented at your visit.',
                durationMinutes: 75,
                priceCents: 130000,
                priceNote: 'Subcision + HA filler — $1,300 Subcision + Skin booster — $1,050 Subcision + Radiesse — $1,450 Subcision + Sculptra — $1,500 (Bundled pricing, all-inclusive per session)',
                displayOrder: 5,
            },
        ],
    },
    {
        name: 'Skin Tightening',
        description: 'Non-invasive lifting',
        displayOrder: 8,
        services: [
            {
                name: 'Exilis Ultra 360',
                slug: 'skin-tightening-exilis-ultra-360',
                description: 'Radiofrequency + ultrasound device that tightens skin, contours the body and face, and softens cellulite. No downtime; series of 4–6 recommended.',
                durationMinutes: 45,
                priceCents: 35000,
                priceNote: 'single session · packages from $675',
                displayOrder: 1,
            },
            {
                name: 'Ultherapy PRIME',
                slug: 'skin-tightening-ultherapy-prime',
                description: 'FDA-cleared microfocused ultrasound that lifts the brow, jawline, and neck by stimulating deep foundational collagen. No downtime; results unfold over 2–3 months.',
                durationMinutes: 90,
                priceCents: 190000,
                priceNote: 'full face · neck $950 · face & neck $2,300',
                displayOrder: 2,
            },
            {
                name: 'Everesse by Volnewmer — Full Face',
                slug: 'skin-tightening-everesse-full-face-standard',
                description: 'Korea\'s premier monopolar RF skin-tightening platform that delivers visible lift and tightening across face, neck, and body in a single session. No downtime.',
                durationMinutes: 60,
                priceCents: 75000,
                priceNote: 'full face $750 · full face & neck $950 · neck $350 · pkg of 2 available',
                displayOrder: 3,
            },
            {
                name: 'Everesse by Volnewmer — Under Eyes',
                slug: 'skin-tightening-everesse-under-eyes-july-promo',
                description: 'July-only Everesse by Volnewmer (monopolar RF skin tightening) — under-eye area. Limited to 10 spots total across all Everesse promo services. Online booking only — phone/text bookings not accepted.',
                durationMinutes: 30,
                priceCents: 25000,
                priceNote: 'July promo · $250 (under eyes)',
                promoGroup: 'July Promo',
                displayOrder: 4,
            },
            {
                name: 'Everesse by Volnewmer — Neck / Jawline',
                slug: 'skin-tightening-everesse-neck-jawline-july-promo',
                description: 'July-only Everesse by Volnewmer (monopolar RF skin tightening) — neck and jawline. Limited to 10 spots total across all Everesse promo services. Online booking only — phone/text bookings not accepted.',
                durationMinutes: 60,
                priceCents: 25000,
                priceNote: 'July promo · $250 (neck/jawline)',
                promoGroup: 'July Promo',
                displayOrder: 5,
            },
            {
                name: 'Everesse by Volnewmer — Full Face',
                slug: 'skin-tightening-everesse-full-face-july-promo',
                description: 'July-only Everesse by Volnewmer (monopolar RF skin tightening) — full face. Limited to 10 spots total across all Everesse promo services. Online booking only — phone/text bookings not accepted.',
                durationMinutes: 60,
                priceCents: 35000,
                priceNote: 'July promo · $350 (full face)',
                promoGroup: 'July Promo',
                displayOrder: 6,
            },
            {
                name: 'Everesse by Volnewmer — Full Face · Package of 2',
                slug: 'skin-tightening-everesse-full-face-pkg-2',
                description: 'Two-session Volnewmer (Everesse) full face package. Sessions spaced 4–6 weeks apart for compounding lift and tightening.',
                durationMinutes: 60,
                priceCents: 140000,
                priceNote: '$1,400 (save $100) · 2 sessions · $700/session',
                displayOrder: 7,
            },
            {
                name: 'Everesse by Volnewmer — Full Face · Package of 3',
                slug: 'skin-tightening-everesse-full-face-pkg-3',
                description: 'Three-session Volnewmer (Everesse) full face package for maximum collagen remodeling. Sessions spaced 4–6 weeks apart.',
                durationMinutes: 60,
                priceCents: 195000,
                priceNote: '$1,950 (save $300) · 3 sessions · $650/session',
                displayOrder: 8,
            },
            {
                name: 'Everesse by Volnewmer — Full Face + Neck · Package of 2',
                slug: 'skin-tightening-everesse-full-face-neck-pkg-2',
                description: 'Two-session Volnewmer (Everesse) full face + neck package. Sessions spaced 4–6 weeks apart.',
                durationMinutes: 90,
                priceCents: 180000,
                priceNote: '$1,800 (save $100) · 2 sessions · $900/session',
                displayOrder: 9,
            },
        ],
    },
    {
        name: 'Lasers',
        description: 'IPL, Pico, Nd:YAG, CO₂ & more',
        displayOrder: 9,
        services: [
            {
                name: 'IPL',
                slug: 'lasers-ipl',
                description: 'Intense Pulsed Light photofacial that fades sun spots, broken capillaries, redness, and rosacea while evening out overall tone. Series of 3–5 recommended.',
                durationMinutes: 45,
                priceCents: 30000,
                priceNote: 'single · package of 3 from $900',
                displayOrder: 1,
            },
            {
                name: 'Pico Laser',
                slug: 'lasers-pico',
                description: 'Picosecond laser that targets melasma, sun spots, tattoos, and tone & texture irregularities with minimal downtime.',
                durationMinutes: 45,
                priceCents: 35000,
                priceNote: 'single · package of 3 from $900',
                displayOrder: 2,
            },
            {
                name: 'Nd:YAG Laser',
                slug: 'lasers-nd-yag',
                description: 'Nd:YAG laser for vascular lesions, leg & facial veins, deeper pigment, and laser hair reduction on darker skin tones. Safe across skin types.',
                durationMinutes: 45,
                priceCents: 30000,
                priceNote: 'single · package of 3 from $800',
                displayOrder: 3,
            },
            {
                name: 'CO₂ Laser',
                slug: 'lasers-co2',
                description: 'Fractional CO₂ laser resurfacing for deep wrinkles, acne scars, and significant sun damage. One treatment delivers dramatic skin renewal; 5–7 days of social downtime.',
                durationMinutes: 60,
                priceCents: 60000,
                priceNote: 'per session · full face $1,500 · packages available',
                displayOrder: 4,
            },
        ],
    },
    {
        name: 'Body Contouring',
        description: 'Sculpt and tone',
        displayOrder: 10,
        services: [
            {
                name: 'HIFEM',
                slug: 'body-contouring-hifem',
                description: 'High-intensity electromagnetic muscle-stimulation that builds muscle and burns fat — the equivalent of thousands of crunches or squats per session. No downtime.',
                durationMinutes: 30,
                priceCents: 17500,
                priceNote: 'single · package of 6 from $945',
                displayOrder: 1,
            },
            {
                name: 'Lipolytic Injections',
                slug: 'body-contouring-lipolytic-injections',
                description: 'Injectable fat-dissolving treatment (deoxycholic acid) used for stubborn small pockets such as under-chin fullness. Typically 2–4 sessions spaced 4–6 weeks apart.',
                durationMinutes: 30,
                priceCents: 25000,
                priceNote: 'PCDC / Lemon Bottle',
                displayOrder: 2,
            },
        ],
    },
    {
        name: 'Laser Hair Reduction',
        description: 'Long-lasting hair reduction',
        displayOrder: 11,
        services: [
            {
                name: 'Laser Hair Reduction – Upper Lip',
                slug: 'lhr-upper-lip',
                description: 'Permanent laser hair reduction for the upper lip. Series of 6–8 sessions spaced 4–6 weeks apart for best clearance.',
                durationMinutes: 15,
                priceCents: 5000,
                priceNote: null,
                displayOrder: 1,
            },
            {
                name: 'Laser Hair Reduction – Chin',
                slug: 'lhr-chin',
                description: 'Permanent laser hair reduction along the chin and jawline. Series of 6–8 sessions for optimal results.',
                durationMinutes: 15,
                priceCents: 6000,
                priceNote: null,
                displayOrder: 2,
            },
            {
                name: 'Laser Hair Reduction – Neck',
                slug: 'lhr-neck',
                description: 'Permanent laser hair reduction across the neck (front or back). Series of 6–8 sessions recommended.',
                durationMinutes: 15,
                priceCents: 8500,
                priceNote: null,
                displayOrder: 3,
            },
            {
                name: 'Laser Hair Reduction – Underarms',
                slug: 'lhr-underarms',
                description: 'Permanent laser hair reduction for the underarms — one of the fastest, most popular areas to treat. Series of 6–8 sessions.',
                durationMinutes: 20,
                priceCents: 9500,
                priceNote: null,
                displayOrder: 4,
            },
            {
                name: 'Laser Hair Reduction – Bikini',
                slug: 'lhr-bikini',
                description: 'Permanent laser hair reduction for the standard bikini line. Series of 6–8 sessions recommended.',
                durationMinutes: 20,
                priceCents: 12000,
                priceNote: null,
                displayOrder: 5,
            },
            {
                name: 'Laser Hair Reduction – Brazilian',
                slug: 'lhr-brazilian',
                description: 'Permanent laser hair reduction of the full Brazilian area. Series of 6–8 sessions for best clearance.',
                durationMinutes: 30,
                priceCents: 20000,
                priceNote: null,
                displayOrder: 6,
            },
            {
                name: 'Laser Hair Reduction – Full Face',
                slug: 'lhr-full-face',
                description: 'Permanent laser hair reduction across the full face. Series of 6–8 sessions; great for hormonally driven hair growth.',
                durationMinutes: 30,
                priceCents: 15000,
                priceNote: null,
                displayOrder: 7,
            },
            {
                name: 'Laser Hair Reduction – Abdomen',
                slug: 'lhr-abdomen',
                description: 'Permanent laser hair reduction for the abdomen, including the happy-trail area. Series of 6–8 sessions recommended.',
                durationMinutes: 30,
                priceCents: 18000,
                priceNote: null,
                displayOrder: 8,
            },
            {
                name: 'Laser Hair Reduction – Arms',
                slug: 'lhr-arms',
                description: 'Permanent laser hair reduction for full arms (or half arms by request). Series of 6–8 sessions recommended.',
                durationMinutes: 30,
                priceCents: 20000,
                priceNote: null,
                displayOrder: 9,
            },
            {
                name: 'Laser Hair Reduction – Chest',
                slug: 'lhr-chest',
                description: 'Permanent laser hair reduction across the chest. Series of 6–8 sessions for best clearance.',
                durationMinutes: 30,
                priceCents: 18000,
                priceNote: null,
                displayOrder: 10,
            },
            {
                name: 'Laser Hair Reduction – Back',
                slug: 'lhr-back',
                description: 'Permanent laser hair reduction for the full back. Series of 6–8 sessions recommended.',
                durationMinutes: 45,
                priceCents: 22000,
                priceNote: null,
                displayOrder: 11,
            },
            {
                name: 'Laser Hair Reduction – Legs',
                slug: 'lhr-legs',
                description: 'Permanent laser hair reduction for the full legs. Series of 6–8 sessions recommended.',
                durationMinutes: 60,
                priceCents: 35000,
                priceNote: null,
                displayOrder: 12,
            },
        ],
    },
    {
        name: 'Televisit',
        description: 'Secure online visits for GLP-1, hormone replacement, and peptide therapy. Initial visit complimentary.',
        displayOrder: 12,
        services: [
            {
                name: 'Televisit Consultation',
                slug: 'televisit-consultation-complimentary',
                description: 'Complimentary virtual consultation with Kiem to discuss any service, treatment, or wellness concern — including aesthetics, skincare, medical wellness, or general questions. We\'ll help you decide what\'s right for you, no commitment required.',
                durationMinutes: 30,
                priceCents: 0,
                priceNote: 'Complimentary initial consultation',
                displayOrder: 1,
            },
            {
                name: 'GLP-1 / HRT / Peptides',
                slug: 'televisit-glp1-hrt-peptides',
                description: 'Secure video visit with a California-licensed clinician for evaluation, prescribing, and ongoing management of GLP-1 weight-loss medications, hormone replacement therapy, and peptide therapy. Labs and follow-up included as clinically indicated.',
                durationMinutes: 30,
                priceCents: 25000,
                priceNote: '$150 evaluation + $100 labs · medication & pharmacy billed separately',
                displayOrder: 2,
            },
            {
                name: 'Televisit Follow-Up',
                slug: 'televisit-follow-up-complimentary',
                description: 'Virtual follow-up visit with Kiem to review progress, labs, medication adjustments, or any questions after a prior visit. Conducted by phone/video.',
                durationMinutes: 15,
                priceCents: 0,
                priceNote: 'Complimentary follow-up',
                displayOrder: 3,
            },
            {
                name: 'Neurotoxin Follow-Up',
                slug: 'televisit-neurotoxin-follow-up',
                description: '2-week neurotoxin touch-up check after your treatment.',
                durationMinutes: 15,
                priceCents: 0,
                priceNote: 'Complimentary follow-up',
                displayOrder: 4,
            },
            {
                name: 'Generalized follow up',
                slug: 'televisit-generalized-follow-up',
                description: 'Brief follow-up visit with your provider.',
                durationMinutes: 15,
                priceCents: 0,
                priceNote: 'Complimentary',
                displayOrder: 5,
            },
        ],
    },
    {
        name: 'Follow-Ups',
        description: 'Post-treatment and follow-up visits',
        displayOrder: 13,
        services: [
            {
                name: 'Follow-Up Visit',
                slug: 'follow-ups-visit',
                description: 'Quick check-in and assessment after a prior treatment. No consents required.',
                durationMinutes: 30,
                priceCents: null,
                priceNote: null,
                displayOrder: 1,
            },
        ],
    },
    {
        name: 'Signature Facials',
        description: 'Results-driven facials tailored to your skin. Clinical facials also available in San Jose.',
        displayOrder: 14,
        services: [
            {
                name: 'Glo2 Facial',
                slug: 'signature-facials-glo2',
                description: 'Oxygenating facial that deep-cleans pores, exfoliates, and infuses skin with CO₂-activated serums for instant hydration and a luminous, plumped finish.',
                durationMinutes: 75,
                priceCents: 20000,
                priceNote: null,
                displayOrder: 1,
            },
            {
                name: 'RDS Regenerative Facial',
                slug: 'signature-facials-rds-regenerative',
                description: 'Factor Five RDS — a "no-peel peel" regenerative facial. Powered by Factor Five\'s patented exosome-derived growth factors and RDS serum, it signals your skin to produce more collagen, elastin, and hyaluronic acid. Brightens, repairs, and rejuvenates at the cellular level with zero peeling and zero downtime.',
                durationMinutes: 75,
                priceCents: 18500,
                priceNote: null,
                displayOrder: 2,
            },
            {
                name: 'Velvet Reset Facial',
                slug: 'signature-facials-velvet-reset',
                description: 'BioRePeel — a "no-peel peel" facial. Italian-formulated 2-phase treatment combining TCA, salicylic acid, and tartaric acid with amino acids, vitamins, and GABA. Resurfaces, refines pores, fades dark spots, softens fine lines, and stimulates collagen — with no visible flaking or downtime. Glow without the social calendar hit.',
                durationMinutes: 75,
                priceCents: 18500,
                priceNote: null,
                displayOrder: 3,
            },
            {
                name: 'PRX Facial',
                slug: 'signature-facials-prx',
                description: 'PRX-T33 — a "no-peel peel" facial. The European bio-revitalization gold standard, combining 33% TCA with kojic acid and hydrogen peroxide. The H₂O₂ buffers the acid so it remodels collagen deep in the dermis without burning the surface — no injections, no peeling. Firms, tightens, brightens. Often called "liquid microneedling."',
                durationMinutes: 60,
                priceCents: 18500,
                priceNote: null,
                displayOrder: 4,
            },
        ],
    },
    {
        name: 'Facial Add-Ons',
        description: 'Enhance any facial',
        displayOrder: 15,
        services: [
            {
                name: 'LED Light Therapy',
                slug: 'facial-add-ons-led-light-therapy',
                description: 'Medical-grade LED therapy that calms acne, reduces inflammation, and stimulates collagen. Often added on after treatments to speed recovery.',
                durationMinutes: 30,
                priceCents: 5000,
                priceNote: null,
                displayOrder: 1,
            },
            {
                name: 'Facial Block (Lidocaine ± Epi)',
                slug: 'facial-add-ons-lidocaine-block',
                description: 'Targeted facial nerve block using lidocaine, with or without epinephrine, for profound anesthesia prior to injectable, laser, or microneedling procedures. Performed by a licensed injector.',
                durationMinutes: 15,
                priceCents: 17500,
                priceNote: 'lidocaine ± epi add-on',
                displayOrder: 2,
            },
        ],
    },
];
async function importServiceCatalog() {
    console.log('================================================================');
    console.log('STARTING CLIENT SERVICE CATALOG RESTORATION');
    console.log('================================================================');
    let totalCategoriesCreated = 0;
    let totalCategoriesUpdated = 0;
    let totalServicesCreated = 0;
    let totalServicesUpdated = 0;
    for (const catData of exports.CLIENT_SERVICE_CATALOG) {
        // Upsert Category by exact name
        let category = await prisma.serviceCategory.findFirst({
            where: { name: catData.name },
        });
        if (category) {
            category = await prisma.serviceCategory.update({
                where: { id: category.id },
                data: {
                    description: catData.description,
                    displayOrder: catData.displayOrder,
                    isActive: true,
                },
            });
            totalCategoriesUpdated++;
            console.log(`[CATEGORY UPDATED] ${category.name}`);
        }
        else {
            category = await prisma.serviceCategory.create({
                data: {
                    name: catData.name,
                    description: catData.description,
                    displayOrder: catData.displayOrder,
                    isActive: true,
                },
            });
            totalCategoriesCreated++;
            console.log(`[CATEGORY CREATED] ${category.name}`);
        }
        for (const svcData of catData.services) {
            // Upsert Service by unique stable slug
            let service = await prisma.service.findFirst({
                where: { slug: svcData.slug },
            });
            if (service) {
                service = await prisma.service.update({
                    where: { id: service.id },
                    data: {
                        categoryId: category.id,
                        name: svcData.name,
                        description: svcData.description,
                        durationMinutes: svcData.durationMinutes,
                        priceCents: svcData.priceCents,
                        priceNote: svcData.priceNote,
                        promoGroup: svcData.promoGroup || null,
                        isActive: true,
                        deletedAt: null,
                    },
                });
                totalServicesUpdated++;
                console.log(`  [SERVICE UPDATED] ${service.name} (${service.slug})`);
            }
            else {
                service = await prisma.service.create({
                    data: {
                        categoryId: category.id,
                        name: svcData.name,
                        slug: svcData.slug,
                        description: svcData.description,
                        durationMinutes: svcData.durationMinutes,
                        priceCents: svcData.priceCents,
                        priceNote: svcData.priceNote,
                        promoGroup: svcData.promoGroup || null,
                        isActive: true,
                    },
                });
                totalServicesCreated++;
                console.log(`  [SERVICE CREATED] ${service.name} (${service.slug})`);
            }
        }
    }
    // Deactivate any test services created during Phase 2A/2B testing
    const cleanedCount = await prisma.service.updateMany({
        where: {
            OR: [
                { name: { startsWith: 'Test Service' } },
                { name: { startsWith: 'Phase2' } },
            ],
            deletedAt: null,
        },
        data: {
            deletedAt: new Date(),
            isActive: false,
        },
    });
    if (cleanedCount.count > 0) {
        console.log(`[TEST CLEANUP] Soft-deleted ${cleanedCount.count} temporary test service fixtures.`);
    }
    console.log('\n----------------------------------------------------------------');
    console.log('SERVICE CATALOG RESTORATION SUMMARY:');
    console.log(`- Categories Processed: ${exports.CLIENT_SERVICE_CATALOG.length} (${totalCategoriesCreated} created, ${totalCategoriesUpdated} updated)`);
    console.log(`- Services Processed: ${exports.CLIENT_SERVICE_CATALOG.reduce((sum, c) => sum + c.services.length, 0)} (${totalServicesCreated} created, ${totalServicesUpdated} updated)`);
    console.log('----------------------------------------------------------------\n');
}
if (require.main === module) {
    importServiceCatalog()
        .then(() => {
        console.log('Service catalog restoration finished successfully.');
        process.exit(0);
    })
        .catch(async (err) => {
        if (err.message && err.message.includes("Can't reach database server")) {
            console.log('\n[NOTICE] Local MySQL unavailable. Triggering remote Railway service catalog import via HTTPS...');
            try {
                const https = require('https');
                const url = require('url');
                const makeRequest = (method, path, body, cookies) => {
                    return new Promise((resolve, reject) => {
                        const fullUrl = `https://sonulovablebackend-production.up.railway.app/api/v1${path}`;
                        const parsed = url.parse(fullUrl);
                        const payload = body ? JSON.stringify(body) : '';
                        const req = https.request({
                            hostname: parsed.hostname,
                            port: 443,
                            path: parsed.path,
                            method,
                            headers: {
                                'Content-Type': 'application/json',
                                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                                ...(cookies ? { Cookie: cookies.join('; ') } : {}),
                            },
                        }, (res) => {
                            let data = '';
                            const resCookies = res.headers['set-cookie'] || cookies || [];
                            res.on('data', (chunk) => (data += chunk));
                            res.on('end', () => {
                                try {
                                    resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {}, cookies: resCookies });
                                }
                                catch {
                                    resolve({ status: res.statusCode, body: data, cookies: resCookies });
                                }
                            });
                        });
                        req.on('error', reject);
                        if (payload)
                            req.write(payload);
                        req.end();
                    });
                };
                // Login as Admin
                const loginRes = await makeRequest('POST', '/auth/login', {
                    email: 'phase1-admin@radiantilyk.com',
                    password: 'AdminPassword123!',
                });
                if (loginRes.status !== 200) {
                    throw new Error(`Admin login failed: ${loginRes.status} — ${JSON.stringify(loginRes.body)}`);
                }
                // Trigger Catalog Import
                const importRes = await makeRequest('POST', '/services/import-catalog', {}, loginRes.cookies);
                if (importRes.status === 200) {
                    console.log('✅ Remote Railway Service Catalog Import succeeded via HTTPS!');
                    process.exit(0);
                }
                else {
                    console.error(`Remote import failed: ${importRes.status} — ${JSON.stringify(importRes.body)}`);
                    process.exit(1);
                }
            }
            catch (remoteErr) {
                console.error('Remote Railway import failed:', remoteErr);
                process.exit(1);
            }
        }
        else {
            console.error('Service catalog restoration failed:', err);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=import-client-service-catalog.js.map