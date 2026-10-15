/**
 * Live API contract check — intentionally isolated from deterministic unit tests.
 * Verify against NCT02993146 as published on the public ClinicalTrials.gov v2 API.
 * This test does NOT validate clinical appropriateness of its outcomes.
 */
import assert from 'node:assert/strict';
import CTGovExtractor from './extractor.js';

const nctId = 'NCT02993146';
const extractor = new CTGovExtractor();

async function main() {
    const timeout = AbortSignal.timeout(25000);
    const versionResponse = await fetch('https://clinicaltrials.gov/api/v2/version', {
        headers: { Accept: 'application/json' },
        signal: timeout,
    });
    assert.equal(versionResponse.status, 200, 'API version endpoint must be accessible');
    const version = await versionResponse.json();
    assert.match(version.apiVersion, /^\d+\.\d+/);
    assert.match(version.dataTimestamp, /^\d{4}-\d\d-\d\dT/);

    const trial = await extractor.getTrialResults(nctId);
    assert.equal(trial.nctId, nctId);
    const firstOutcomeIndex = trial.outcomes.findIndex(o => o.title ===
        'Number of Participants Experiencing a Dose Limiting Toxicity');
    assert.notEqual(firstOutcomeIndex, -1, 'Expected named primary outcome not found');
    const primary = trial.outcomes[firstOutcomeIndex];
    assert.equal(primary.type, 'PRIMARY');
    assert.equal(primary.paramType, 'COUNT_OF_PARTICIPANTS');
    assert.equal(primary.groups.length, 4);
    assert.ok(primary.classes[0].categories.length >= 2);

    const ids = ['OG000', 'OG001', 'OG002', 'OG003'];
    const expected = [[0, 1], [0, 1], [0, 6], [1, 1]];
    for (let i = 0; i < ids.length; i++) {
        const other = i === 0 ? 1 : 0;
        const choice = [ids[i], ids[other]];
        const result = extractor.extractBinaryComparison(trial, {
            outcomeIndex: firstOutcomeIndex, classIndex: 0,
            categoryIndex: 0, groupIds: choice,
        });
        assert.equal(result.arms[0].groupId, ids[i]);
        assert.deepEqual([result.arms[0].events, result.arms[0].analyzed], expected[i]);
        assert.equal(result.denominatorScope, 'outcome');
        assert.equal(result.timeFrame, 'Up to week 8');
    }
    // The complementary registered category must be retained, not overwritten.
    const complements = primary.classes[0].categories[1].measurements;
    for (const [i, groupId] of ids.entries()) {
        const complementary = complements.find(x => x.groupId === groupId);
        assert.ok(complementary, 'Complementary category must retain identity');
        assert.equal(Number(complementary.value) + expected[i][0], expected[i][1]);
    }

    const audit = {
        source: 'ClinicalTrials.gov API v2',
        apiVersion: version.apiVersion,
        apiDataTimestamp: version.dataTimestamp,
        testedAt: new Date().toISOString(),
        nctId,
        outcomeTitle: primary.title,
        outcomeTimeFrame: primary.timeFrame,
        groups: ids.map((id, index) => ({
            id, events: expected[index][0], analyzed: expected[index][1],
        })),
        verdict: 'PASS: verified posted outcome counts and denominators against live API',
        caveat: 'Contract smoke test, not validation of efficacy or trial eligibility',
    };
    console.log(JSON.stringify(audit, null, 2));
}

await main();
