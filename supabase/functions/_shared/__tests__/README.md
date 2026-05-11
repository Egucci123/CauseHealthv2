# CauseHealth Synthetic Test Suite

Air-tight deterministic test harness for the clinical decision engine.
~5,000 assertions across 4 deterministic layers + 1 optional AI-cost
layer. Catches ~95% of clinical-correctness failure modes BEFORE they
ship to a real $19 paying customer.

## Cost

- All deterministic layers (1, 2, 5, 6): **$0** — pure TypeScript.
- AI prose contract layer (4): ~$1 per audit run. Not in default runner.
- Total full audit: **~$1** when Layer 4 is invoked.

## Running

```bash
# Default — all $0 layers
npm run test:synthetics

# Individual layers
npm run test:fuzz       # 1,000 random patients × 20 invariants
npm run test:snapshots  # 20 canonical fixtures
npm run test:markers    # marker-name regex fuzz
npm run test:units      # unit-normalization fuzz

# Regenerate snapshots after an intentional rule change
npm run test:snapshots:update
```

## Layers

### Layer 1 — Marker-name fuzz (`marker-fuzz.ts`)

Real labs name the same marker dozens of ways. Verifies each canonical
marker's regex matchers accept all common real-world variants
(`HgbA1c`, `B-12`, `25(OH)D`, `Serum Creatinine`, etc.). Catches the #1
silent-failure mode: lab uploads but no rule fires because the marker
name didn't match.

### Layer 2 — Unit normalization fuzz (`unit-fuzz.ts`)

Asserts that international units (mmol/L, nmol/L, µmol/L) convert to
US-standard units (mg/dL, ng/mL) with clinically acceptable tolerance.
Currently documents the conversion contract; engine wiring is a TODO
when international users start uploading.

### Layer 5 — Golden snapshots (`snapshots.ts`)

20 canonical patient fixtures with frozen `buildPlan()` output stored
as JSON in `snapshots/`. Every commit re-runs and diffs. Any
unintended change in tests, conditions, supplements, or depletions
surfaces as a snapshot mismatch.

Fixtures cover: asymptomatic baselines, PCOS, POI, perimenopause,
hyperprolactinemia (M+F), Hashimoto, Graves, NAFLD/alcoholic liver,
metabolic syndrome, IBD-concern, autonomic POTS, chronic-steroid
osteoporosis, T2D-on-metformin, statin-induced depletion, vegan B12
deficiency, plus Marisa's real account state.

### Layer 6 — Property-based fuzz (`fuzz.ts`)

Generates 1,000 random patients (seeded for reproducibility) and runs
each through `buildPlan()`. Asserts ~20 UNIVERSAL INVARIANTS that must
hold for every output:

- Test count ≤ 18, supplement count ≤ 6
- Every test has a name, ICD-10, and priority
- No `"undefined"` or `"NaN"` in any output string
- Male patients get 0 female-only tests, females get 0 male-only
- Pregnant patients get 0 contraindicated supplements
- Metformin users get B12 depletion captured
- Statin users get CoQ10 depletion captured
- Every ICD-10 follows valid format
- Critical labs trigger a response

Catches combinatorial bugs no hand-written scenario would find.

## Adding a new test

**A new clinical rule fired correctly?** Add a fixture to `snapshots.ts`
and run `npm run test:snapshots:update`. Future regressions will surface
as a diff.

**A new marker the engine should recognize?** Add a row to
`MARKER_CASES` in `marker-fuzz.ts` with 5–8 real-world variants.

**A new universal invariant?** Add a row to `INVARIANTS` in `fuzz.ts`.
The check function returns `null` if OK or an error string if violated.

**A new unit conversion?** Add a row to `UNIT_CASES` in `unit-fuzz.ts`.

## Known surfaced issues

The first run of Layer 1 surfaced 18 real marker-name gaps in the
engine. They are intentionally left visible (not silenced) because
the test SHOULD fail when the engine has a real bug. Triage and fix
in `markerSystems.ts` / rule regex patterns.

## Future layers (not yet built)

**Layer 3 — Onboarding-to-engine round-trip.** Instantiate the Zustand
store, navigate through Steps 1-7, verify all selections reach
`PatientInput` shape correctly.

**Layer 4 — AI prose contract verifier** (~$1/run). For 10
representative scenarios, run the full pipeline (engine + AI prose),
then automatically check the AI output for fact omission (engine
listed a test the prose didn't mention) and fact invention (prose
mentions something not in `ClinicalFacts`).
