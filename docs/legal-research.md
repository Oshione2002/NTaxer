# Legal research and implementation register

Review date: **8 September 2026**. Ruleset: **NTA2025-NASS-2026.1**. This is a fixed research snapshot, not a guarantee that every subsequent or difficult-to-locate order has been found.

## Source selection

The uploaded `NIGERIA_TAX_ACT_2025_ef6bb812a5(1).pdf` was extracted and compared with the subsequently released National Assembly copy. The National Assembly copy is the primary calculation and section-number reference throughout the app.

| Source | URL / origin | SHA-256 of inspected PDF |
| --- | --- | --- |
| National Assembly NTA 2025, January 2026 release | https://nass.gov.ng/documents/download/11249 | `41abf6887bc58a3c97116fd9a048aa91ad49c1cab156f39065a58401c0fce94f` |
| User-supplied NRS-hosted NTA 2025 version | Uploaded PDF; corresponding public URL https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf | `ac60221d06b8f7a453436103ccfbbb1ef3bb487663fe4faa15e6f4d754c3e027` |
| Nigeria Presumptive Tax Regulations 2026 | https://www.jtb.gov.ng/documents/nigeria-presumptive-tax-regulations-2026.pdf | `2b09d56597f416d7cdde56b981386538067b606851d8c2b127db9ff1c6d32f62` |
| NRS Virtual Assets Circular 2026/21, 31 July 2026 | https://www.nrs.gov.ng/uploads/Guidelines_on_taxation_of_Virtual_Assets_31_7_26_7cd2ef8dab.pdf | `107043f895a7bfecd6981dbeefee82376323c786c1d4f60eb05a296275a53e70` |

The Presumptive Regulations PDF is scanned. Relevant pages were OCR-extracted and the rate, scope and definition pages were visually inspected. The app links to the actual gazette, not the OCR output.

Release notice: https://fiscalreforms.ng/news/gazetted-tax-reform-acts-authorised-by-national-assembly

Additional original legal document: [Deduction of Tax at Source (Withholding) Regulations 2024, Federal Gazette No. 168, S.I. 34](https://bomesresourcesconsulting.com/wp-content/uploads/2024/10/Gazette_Deduction-of-Tax-at-Source-Withholding-Regulations-2024.pdf). This primary document is hosted by a professional firm, not a government domain. Its rules are read subject to the savings provisions and the 2025 Acts.

Minimum-wage benchmark source: [State House announcement of ₦70,000 monthly](https://statehouse.gov.ng/labour-leaders-praise-president-tinubu-over-approval-of-n70000-minimum-wage-and-promise-review-after-three-years/). Annualisation in the software: ₦70,000 × 12 = ₦840,000. This is used to validate the explicit minimum-wage employment selection, not as a blanket exemption for all other income.

## Material version differences

The supplied version uses a ₦50m small-company turnover threshold and a professional-services exclusion. The National Assembly definition in section 201 uses ₦100m turnover and ₦250m fixed assets. The software does not import a separate tax-administration definition into this company-income-tax classification.

Section numbering diverges after the petroleum provisions: VAT rate is section 147 in the calculation source, not section 148; surcharge begins at 158, not 159. The indexed source runs through section 202. All app citations refer to this source, with PDF page links.

The National Assembly document itself contains typographical/cross-reference inconsistencies. The source PDF has not been rewritten. The searchable extraction is only a reading aid, and the PDF remains available for checking exact wording and page layout.

## Implemented rules

| Area | Controlling reference | Implementation / scope |
| --- | --- | --- |
| Personal income | NTA ss. 12–14, 28, 30–32, 58; Fourth Schedule | Annual progressive tax after eligible payments and rent relief. Monthly figure is annual/12, not full cumulative payroll reconciliation. |
| PIT bands | Fourth Schedule | First ₦800k 0%; next ₦2.2m 15%; next ₦9m 18%; next ₦13m 21%; next ₦25m 23%; excess over ₦50m 25%. |
| Rent relief | s. 30(2)(a)(vi) | Lower of 20% of annual rent paid and ₦500k. Documentation still required. |
| Self-employment | ss. 20–22, 28, 30, 58 | Receipts less allowable costs and eligible claims; current losses do not generate a negative tax bill. Cross-source pooling is not inferred. |
| Company tax | ss. 27, 56, 201 | 0% if both small-company thresholds met; otherwise 30%. Inputs are already tax-adjusted operating profits and separately classified gains. |
| Development levy | s. 59 | 4% of relevant assessable profit. Small and non-resident company exclusions; no levy on the hydrocarbon-tax assessable base. |
| Minimum effective tax | s. 57 | `max(0, 15% × statutory net income − covered taxes)`, after explicit scope confirmation. |
| Asset gains | ss. 33–55, 56, 58 | Gain calculation and incremental personal tax / company rate. Specific exemptions require classification. |
| Nigerian-share relief | s. 34 | Aggregate proceeds strictly below ₦150m AND gains ≤ ₦10m over 12 consecutive months; alternative same-year reinvestment relief proportional to proceeds reinvested. |
| Compensation | s. 50; s. 162 | Applies remaining ₦50m exemption to loss-of-employment compensation, then incremental annual personal tax on excess. Source deduction is a separate mechanism. |
| VAT | ss. 143–157, 185–188; Eleventh Schedule | 7.5% exclusive/inclusive computation, zero/exempt distinction and eligible input-tax offset. Excess input is credit, not automatic refund. |
| Withholding | WHT Regulations 2024 regs. 3–6, 10; First Schedule; NTA s. 198 | Resident/non-resident and corporate/non-corporate rates, non-passive no-TIN doubling, gross-up, supplied treaty/exemption gates. N/A returns review, not zero. |
| Stamp duties | ss. 123–142, 184; Ninth Schedule | All 48 listed instruments; ad valorem/fixed arithmetic, threshold checks, explicit exemption selection and uniform batches. |
| Electronic transfers | s. 184(i); Ninth Schedule item 48 | ₦50 from ₦10,000 inclusive; salary and qualifying intra-bank self-transfer exemptions. Transferor liability. |
| Capital allowances | First Schedule Part I para. 6 and Table I | New-regime non-petroleum classes 10%, 20%, 25%; basis-period proration; cap at unrelieved cost. Legacy transition and disposals are outside calculator. |
| Economic development credit | ss. 165–183; Tenth Schedule | 5% annual credit for eligible QCE; offset limited to eligible tax, excluding effective-tax top-up. Certificate and credit age are user-verified. |
| Foreign-tax relief | s. 119 | Lower of foreign tax paid and proportionately attributable Nigerian tax. Single-source, non-Chapter-Three case. |
| Hydrocarbon tax | s. 72 | 30% / 15% on a verified chargeable-profit base for the selected licence regime. |
| Legacy PPT / PSC | ss. 98, 103 | 85%, qualifying 65.75%, or qualifying 50% regime. Additional tax and credits supplied; no claim to prepare the underlying petroleum profit schedule. |
| PIA crude-oil royalty | Seventh Schedule Part III para. 6 | Production tranches by terrain plus price royalty, 2% annual price-threshold indexation from 2020. One field, constant daily production/price. USD output. |
| Mineral royalty | s. 64(3); Eighth Schedule | All 73 entries; value must use the statutory official/market basis. |
| Non-resident companies | ss. 17–19 | Supplied PE/SEP profit compared with global-margin base; WHT or 4% revenue floor as applicable. Shipping uses verified profits with a 2% qualifying-carriage revenue floor. |
| Presumptive income | 2026 Regulations regs. 3, 4, 6, 10, 12 | Company/adequate-records exclusions; turnover ≤ ₦12m or verified exempt trade gives zero; otherwise 1%. Daily estimate uses no more than 300 work days. |
| Presumptive disposal payment | 2026 Regulations reg. 7 | Explicitly gated 2% of consideration for a chargeable individual disposal. No automatic conclusion on annual-tax reconciliation. |
| Category 1 crypto disposal | NRS Circular 2026/21 para. 9.1 | Single fiat-acquired/disposed lot; USD-referenced gain expressed as proceeds − historical cost × disposal FX/acquisition FX. Tested against the NRS ₦470k gain example. |
| Fuel surcharge | ss. 158–161 | 5% scenario only unless exempt. No confirmed commencement order in the research record. |
| Other local/customs/regulatory assessments | Applicable charging instrument required | Arithmetic-only supplied-rate/base worksheet. No nationwide rate or liability is assumed. |

## Explicit unresolved issues

1. **Leases:** section 134 states an exemption for annual values below ₦10m or ten times annual minimum wage, whichever is higher; Ninth Schedule item 22 says below ₦1m. The software blocks the disputed ₦1m–below-₦10m interval unless an exemption is explicitly verified by the user. Above the interval, it uses the schedule rate on supplied legal consideration; this is not an interpretation resolving the conflict.
2. **Minimum-effective-tax group currency:** section 57 in the NASS file prints “£750 million”, while other publications describe a euro threshold. The tool requires user-confirmed eligibility rather than guessing the intended currency.
3. **Corporate rate order:** section 56 provides for a future 25% rate by Presidential order. No operative order was verified, so the pinned ruleset uses 30% and discloses the dependency.
4. **Surcharge commencement:** section 160 requires a Ministerial order; no order was verified. A scenario never claims a present amount due.
5. **Eleventh Schedule VAT items:** collection/classification depends on ministerial orders. The UI labels the non-collection treatment as an order-dependent scenario.
6. **Digital-asset collection:** the July circular separately describes token-transfer stamp duties, WHT on gross proceeds and VAT on services. The crypto module calculates income tax only; it does not silently substitute ordinary naira-to-naira gain arithmetic or claim to compute a complete exchange settlement.
7. **Presumptive disposal reconciliation:** regulation 7 and annual income-tax treatment need case-specific reconciliation. The payment module does not tell users to sum the two taxes.

## Full-Act coverage, not full automatic assessment

Every section and schedule is available for search and PDF verification. Sector guides explain insurance, gaming, partnerships, trusts/estates, collective investment, free zones, agriculture, charities, petroleum streams, donations/R&D, related-party finance, restructuring and transition. A guide or source reference is not represented as a fully automated assessment.

Tax administration/returns/penalties under the separate NTAA and state/local/customs charging laws require further implementation before the app could be used as a complete filing system.

## Validation evidence

37 automated tests cover cumulative bands, one-kobo boundaries, monthly/annual equivalence, relief caps, small-company boundaries, credits, inclusive VAT reconciliation, share relief, WHT classifications/gross-up, stamp rates and lease conflicts, royalties, non-resident floors, presumptive scope and the NRS crypto example. Static validation checks all law-section IDs, schedule page mappings, source assets, JavaScript syntax and Vercel configuration.

No browser, screenshot, visual or end-to-end test was performed. Automated arithmetic checks do not establish legal certification or cover every possible factual arrangement.
