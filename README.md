# NTaxer

A responsive Nigeria tax calculator and legal-reference web app, prepared for Vercel. The application runs entirely in the browser, with no database, API keys, analytics or financial-data uploads.

## Included

- 24 calculator workspaces covering personal income/PAYE, self-employment, gains, crypto disposals, compensation, companies income tax, development levy, minimum effective tax, presumptive income/disposal payments, VAT, withholding, stamp/transfer duties, capital allowances, economic-development credits, foreign tax relief, hydrocarbon/PPT/PSC taxes, petroleum/mineral royalties, non-residents and assessment scenarios.
- All 48 Ninth Schedule stamp-duty categories and 73 Eighth Schedule mineral-royalty entries.
- Searchable reference for all 202 sections and 14 schedules of the National Assembly version of the Nigeria Tax Act 2025, with a preserved source PDF.
- Per-calculator itemised results, assumptions and source references; print/save-PDF layout and JSON calculation-record exports.
- Custom NTaxer icon, favicon and web app manifest.
- Responsive desktop/mobile layout, keyboard-accessible native form controls, labelled errors, reduced-motion handling, no external script dependencies and restrictive Vercel security headers.

## Deploy on Vercel

1. Sign in at [Vercel](https://vercel.com/new) and import **Oshione2002/NTaxer**.
2. Use the repository root, framework preset **Other**, and Node.js **22.x or newer**.
3. `vercel.json` supplies the build command (`npm run check`) and output directory (`dist`). No environment variables are required.
4. Deploy. Vercel runs the calculation tests and static validation before publishing.

Official configuration documentation: https://vercel.com/docs/project-configuration/vercel-json

This repository is ready for import. A Vercel deployment/account connection is not created by the code itself.

## Run checks locally

Node.js 22 or later. There are no third-party packages to install.

```sh
npm run check
```

Alternatively, run the dependency-free commands directly:

```sh
node --test tests/tax.test.mjs
node scripts/validate.mjs
```

Serve `dist` with any static HTTP server; opening the HTML via `file://` will not load ES modules and the searchable JSON reference reliably. For example, with Python installed:

```sh
python -m http.server 8000 --directory dist
```

Open http://localhost:8000. Navigation uses URL fragments, so no server route rewrites are needed.

## Legal basis and limits

**Ruleset:** `NTA2025-NASS-2026.1` · **Research review:** 8 September 2026 · **Calculation year:** 2026.

The supplied NRS-hosted PDF differs materially from the subsequent National Assembly release. NTaxer consistently uses the [National Assembly copy](https://nass.gov.ng/documents/download/11249), not a mixture of section numbers or small-company definitions. See [the research and rule register](docs/legal-research.md).

Additional sources include the gazetted 2024 Withholding Regulations, the JRB-hosted 2026 Presumptive Tax Regulations and NRS Virtual Assets Circular 2026/21.

**Coverage is explicitly tiered.** Common calculations implement statutory formulas. Specialist calculators accept verified taxable bases and require classification. Unverified commencement orders and unresolved source conflicts produce a review-needed result or a clearly labelled scenario, not a fabricated tax liability.

This is a planning tool, not a complete tax return preparation system. Insurance reserves, free-zone apportionment, trust allocation, petroleum chargeable-profit schedules, full crypto ledgers, treaty eligibility, customs tariffs, state/local levies, administrative penalties and filing are not fully automated. The coverage page explains each boundary. A zero result is not proof of exemption from filing.

Do not add every output together. Withholding, credits, presumptive tax and final income tax can overlap; development levy is already included in the company calculator.

## Architecture

| File | Purpose |
| --- | --- |
| `dist/engine.js` | Pure calculation functions; integer-kobo arithmetic and explicit review states |
| `dist/calculators.js` | Form schemas, examples and source register |
| `dist/schedules.js` | Stamp, mineral and VAT category data |
| `dist/app.js` | UI, navigation, validation, printing, exports and legal search |
| `dist/coverage.js` | Sector coverage and chapter mapping |
| `dist/law.json` | Extracted source text and PDF page references |
| `tests/tax.test.mjs` | Boundary, calculation, credit, exemption and input tests |
| `scripts/validate.mjs` | Static asset, JavaScript, law-index and deployment checks |

Money outputs are integer minor units. Inputs are decimal strings in naira unless otherwise labelled. Ratios use BigInt to avoid floating-point currency multiplication; royalty modelling uses decimal volumes/prices with final US-cent rounding. Rates and sources are pinned, not updated from the internet automatically.

## Maintaining the rules

Before a legal update: verify an official law/order/circular, record the precise provision and effective date in `docs/legal-research.md`, amend the pure engine and form guidance, add a meaningful boundary/reference-example test, increment the ruleset and review date, then run all checks. Do not silently resolve contradictory source text or apply draft proposals as enacted law.

Financial inputs stay in page memory and are cleared on reload. Downloaded records include the user's inputs; they remain the user's responsibility. No authentication, payment collection or tax-authority integration is implemented.

Validation performed: automated calculation tests and static validation. Browser/visual/end-to-end tests were not performed in the creation session.
