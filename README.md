# ClinicalTrials.gov API v2 Extractor

A zero-dependency, browser-compatible JavaScript extractor for **posted** ClinicalTrials.gov results. It reads the [official API v2](https://clinicaltrials.gov/data-api/api) without inventing arm assignments, event counts or effect estimates.

## Scientific safeguards

- Preserves **every** posted outcome, time frame, outcome group, class, category, denominator and statistical analysis (including comparison `groupIds` and confidence intervals). Nothing is selected merely because it appears first.
- The `extractBinaryComparison` operation derives a 2×2 table only from an **explicitly selected** outcome/class/category and two registry outcome-group IDs. It requires `COUNT_OF_PARTICIPANTS` and an unambiguous participant denominator at the most specific available scope; it checks that each event count is an integer not exceeding the analyzed population.
- Does **not** fuzz-match interventions to outcome groups, assume which is treatment/control, convert counts of events into participant counts, pool outcomes, select one of several registered analyses, or substitute registry results for independent trial appraisal.
- Registry output may be incomplete or inconsistent; posted results do not prove randomization, comparator identity, absence of selective reporting or eligibility for meta-analysis.

## Use

```js
import CTGovExtractor from './extractor.js';
const extractor = new CTGovExtractor();
const registry = await extractor.getTrialResults('NCT01234567');
if (!registry.error) {
  // Inspect registry.outcomes[0].groups, .classes, .denoms, .analyses first.
  const table = extractor.extractBinaryComparison(registry, {
    outcomeIndex: 0,
    classIndex: 0,
    categoryIndex: 0,
    groupIds: ['OG000', 'OG001'], // check actual IDs in each registry record
  });
  console.log(table.arms); // requested group order; NOT inferred active/control
}
```

The example NCT ID and group IDs are illustrative only. Statistical `analyses` are retained with their registered group identities but are **not** assumed equivalent to the selected 2×2 contrast.

## Tests

Node 18+: `npm test` (15 offline synthetic-v2 regression tests). Passing tests does not establish that the live API or a particular trial's reported numbers are correct. Live integration validation remains a separate step.
