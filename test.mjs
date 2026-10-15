import test from 'node:test';
import assert from 'node:assert/strict';
import CTGovExtractor from './extractor.js';

const registryStudy = () => ({
    protocolSection: { identificationModule: { nctId: 'NCT01234567' } },
    resultsSection: { outcomeMeasuresModule: { outcomeMeasures: [
        {
            title: 'Participants with event', type: 'PRIMARY', timeFrame: '12 months',
            paramType: 'COUNT_OF_PARTICIPANTS',
            groups: [{ id: 'OG000', title: 'Drug A' }, { id: 'OG001', title: 'Placebo' }],
            denoms: [{ units: 'Participants', counts: [
                { groupId: 'OG000', value: '100' }, { groupId: 'OG001', value: '90' },
            ] }],
            classes: [
                { title: 'Events at 12 months', categories: [
                    { title: 'Had an event', measurements: [
                        { groupId: 'OG000', value: '12' }, { groupId: 'OG001', value: '21' },
                    ] },
                    { title: 'Did not have event', measurements: [
                        { groupId: 'OG000', value: '88' }, { groupId: 'OG001', value: '69' },
                    ] },
                ] },
                { title: 'Other outcome cut', denoms: [{ units: 'Participants', counts: [
                    { groupId: 'OG000', value: '80' }, { groupId: 'OG001', value: '70' },
                ] }], categories: [{ title: 'Severe events', measurements: [
                    { groupId: 'OG000', value: '2' }, { groupId: 'OG001', value: '3' },
                ] }] },
            ],
            analyses: [
                { groupIds: ['OG001', 'OG000'], paramType: 'HAZARD_RATIO', paramValue: '0.65', ciPctValue: 95,
                  ciLowerLimit: '0.40', ciUpperLimit: '1.12', method: 'Cox regression' },
                { groupIds: ['OG000', 'OG001'], paramType: 'RISK_RATIO', paramValue: '0.51' },
            ],
        },
    ] } },
});
const extractor = new CTGovExtractor({ fetchImpl: async () => ({ ok: true, json: async () => registryStudy() }) });
const selection = { outcomeIndex: 0, classIndex: 0, categoryIndex: 0, groupIds: ['OG000', 'OG001'] };

test('preserves every class, category, denominator and statistical analysis', () => {
    const study = registryStudy();
    const result = extractor._parseResults(study);
    assert.deepEqual(result.outcomes[0], study.resultsSection.outcomeMeasuresModule.outcomeMeasures[0]);
    assert.equal(result.outcomes[0].classes.length, 2);
    assert.equal(result.outcomes[0].classes[0].categories.length, 2);
    assert.equal(result.outcomes[0].analyses[0].groupIds[0], 'OG001');
    result.outcomes[0].analyses[0].groupIds.reverse();
    assert.equal(study.resultsSection.outcomeMeasuresModule.outcomeMeasures[0].analyses[0].groupIds[0], 'OG001');
});

test('never selects an analysis just because it is first', () => {
    const study = registryStudy();
    study.resultsSection.outcomeMeasuresModule.outcomeMeasures[0].analyses.reverse();
    const result = extractor._parseResults(study);
    assert.deepEqual(result.outcomes[0].analyses.map(a => a.paramType), ['RISK_RATIO', 'HAZARD_RATIO']);
});

test('2x2 count calculation respects explicit group IDs and reported denominators', () => {
    const result = extractor.extractBinaryComparison(extractor._parseResults(registryStudy()), selection);
    assert.deepEqual(result.arms.map(a => [a.events, a.nonEvents, a.analyzed]), [[12, 88, 100], [21, 69, 90]]);
    assert.equal(result.denominatorScope, 'outcome');
    assert.equal(result.timeFrame, '12 months');
});

test('specific class denominators take precedence', () => {
    const result = extractor.extractBinaryComparison(extractor._parseResults(registryStudy()), { ...selection, classIndex: 1, categoryIndex: 0 });
    assert.deepEqual(result.arms.map(a => a.analyzed), [80, 70]);
    assert.equal(result.denominatorScope, 'class');
});

test('explicit group order is preserved without guessed active/control assignment', () => {
    const result = extractor.extractBinaryComparison(extractor._parseResults(registryStudy()), { ...selection, groupIds: ['OG001', 'OG000'] });
    assert.deepEqual(result.arms.map(a => a.groupId), ['OG001', 'OG000']);
    assert.deepEqual(result.arms.map(a => a.events), [21, 12]);
});

test('rejects event totals and continuous measures as participant counts', () => {
    for (const paramType of ['COUNT_OF_EVENTS', 'MEAN', undefined]) {
        const study = registryStudy();
        study.resultsSection.outcomeMeasuresModule.outcomeMeasures[0].paramType = paramType;
        assert.throws(() => extractor.extractBinaryComparison(extractor._parseResults(study), selection), /Cannot form participant 2x2/);
    }
});

test('rejects more events than participants', () => {
    const study = registryStudy();
    study.resultsSection.outcomeMeasuresModule.outcomeMeasures[0].classes[0].categories[0].measurements[0].value = '101';
    assert.throws(() => extractor.extractBinaryComparison(extractor._parseResults(study), selection), /Events exceed/);
});

test('rejects missing, noninteger and ambiguous counts', () => {
    for (const value of ['N/A', '12.3', '-2', null, '1,200']) {
        const study = registryStudy();
        study.resultsSection.outcomeMeasuresModule.outcomeMeasures[0].classes[0].categories[0].measurements[0].value = value;
        assert.throws(() => extractor.extractBinaryComparison(extractor._parseResults(study), selection), /unambiguous/);
    }
});

test('rejects unrecognized outcome groups and duplicate event rows', () => {
    const result = extractor._parseResults(registryStudy());
    assert.throws(() => extractor.extractBinaryComparison(result, { ...selection, groupIds: ['OG000', 'OG999'] }), /Outcome group ID/);
    result.outcomes[0].classes[0].categories[0].measurements.push({ groupId: 'OG000', value: '12' });
    assert.throws(() => extractor.extractBinaryComparison(result, selection), /expected exactly one row/);
});

test('does not infer which two arms or endpoint to compare', () => {
    const result = extractor._parseResults(registryStudy());
    assert.throws(() => extractor.extractBinaryComparison(result, { ...selection, groupIds: ['OG000', 'OG000'] }), /distinct/);
    assert.throws(() => extractor.extractBinaryComparison(result, { ...selection, categoryIndex: -1 }), /categoryIndex/);
});

test('returns a no-results state without fake outcomes', () => {
    const result = extractor._parseResults({ protocolSection: { identificationModule: { nctId: 'NCT01234567' } } });
    assert.equal(result.error, 'No posted outcome results available.');
    assert.deepEqual(result.outcomes, []);
});

test('invalid NCT IDs are rejected before the network request', async () => {
    await assert.rejects(extractor.getTrialResults('NCT1234?x=1'), /exactly 8 digits/);
});

test('non-OK HTTP response fails closed', async () => {
    const failed = new CTGovExtractor({ fetchImpl: async () => ({ ok: false, status: 404 }) });
    await assert.rejects(failed.getTrialResults('NCT01234567'), /HTTP 404/);
});

test('rejects an NCT identity mismatch in the returned data', async () => {
    const changed = new CTGovExtractor({ fetchImpl: async () => ({ ok: true, json: async () => ({
        ...registryStudy(), protocolSection: { identificationModule: { nctId: 'NCT99999999' } },
    }) }) });
    await assert.rejects(changed.getTrialResults('NCT01234567'), /different NCT ID/);
});

test('valid NCT ID requests the correct v2 endpoint', async () => {
    let requested;
    const fetcher = new CTGovExtractor({ fetchImpl: async (url, options) => {
        requested = { url, options };
        return { ok: true, json: async () => registryStudy() };
    } });
    const result = await fetcher.getTrialResults('NCT01234567');
    assert.equal(result.nctId, 'NCT01234567');
    assert.match(requested.url, /\/studies\/NCT01234567\?format=json$/);
    assert.equal(requested.options.headers.Accept, 'application/json');
});
