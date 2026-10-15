/**
 * Conservative ClinicalTrials.gov API v2 results extractor.
 *
 * The registry describes arms, outcome classes/categories, denominators and
 * statistical analyses separately. Never choose a first row implicitly;
 * callers select the estimand and comparison explicitly.
 */
const NCT_ID_PATTERN = /^NCT\d{8}$/;

function array(value) {
    return Array.isArray(value) ? value : [];
}

function integerCount(value, label) {
    const valueText = String(value ?? '');
    if (!/^(0|[1-9]\d*)$/.test(valueText)) {
        throw new Error(label + ' must be an unambiguous non-negative integer.');
    }
    const count = Number(valueText);
    if (!Number.isSafeInteger(count)) {
        throw new Error(label + ' exceeds the safe integer range.');
    }
    return count;
}

function uniqueEntry(entries, groupId, label, key = 'groupId') {
    const matches = entries.filter(row => row?.[key] === groupId);
    if (matches.length !== 1) {
        throw new Error(label + ': expected exactly one row for ' + groupId +
            ', found ' + matches.length + '.');
    }
    return matches[0];
}

function selectDenominators(outcome, outcomeClass, category) {
    // The nearest declared level is authoritative; never silently mix levels.
    const scopes = [
        ['category', category],
        ['class', outcomeClass],
        ['outcome', outcome],
    ];
    for (const [name, scope] of scopes) {
        if (array(scope.denoms).length) return { scope: name, entries: scope.denoms };
    }
    throw new Error('No explicit analyzed denominators are available for this category.');
}

export default class CTGovExtractor {
    constructor({ fetchImpl = globalThis.fetch } = {}) {
        if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
        this.fetchImpl = fetchImpl;
        this.baseUrl = 'https://clinicaltrials.gov/api/v2/studies';
    }

    async getTrialResults(nctId) {
        if (typeof nctId !== 'string' || !NCT_ID_PATTERN.test(nctId)) {
            throw new TypeError('nctId must match NCT followed by exactly 8 digits.');
        }
        const response = await this.fetchImpl(this.baseUrl + '/' + nctId + '?format=json', {
            headers: { Accept: 'application/json' },
        });
        if (!response?.ok) {
            throw new Error('ClinicalTrials.gov request failed (HTTP ' + (response?.status ?? 'unknown') + ').');
        }
        const result = this._parseResults(await response.json());
        if (result.nctId !== nctId) {
            throw new Error('ClinicalTrials.gov returned a different NCT ID (' + result.nctId + ').');
        }
        return result;
    }

    _parseResults(data) {
        const nctId = data?.protocolSection?.identificationModule?.nctId ?? null;
        const measures = data?.resultsSection?.outcomeMeasuresModule?.outcomeMeasures;
        if (!Array.isArray(measures) || !measures.length) {
            return { nctId, outcomes: [], error: 'No posted outcome results available.' };
        }
        // Copy complete API rows, including ALL groups/classes/categories,
        // time frames, denominators, effect analyses and comparison groupIds.
        // No flattening, silent row preference or inferential re-labelling.
        return {
            nctId,
            outcomes: measures.map(measure => JSON.parse(JSON.stringify(measure))),
        };
    }

    /**
     * Derive one auditable 2x2 table ONLY when the caller names its exact
     * outcome/class/category and two declared outcome group IDs. No fuzzy
     * matching, no conversion of event totals to participants, no CI guessing.
     * Returns arm A/B in the requested order, NOT treatment/control labels.
     */
    extractBinaryComparison(result, { outcomeIndex, classIndex, categoryIndex, groupIds } = {}) {
        for (const [name, value] of Object.entries({ outcomeIndex, classIndex, categoryIndex })) {
            if (!Number.isSafeInteger(value) || value < 0) {
                throw new TypeError(name + ' must be a non-negative integer index.');
            }
        }
        if (!Array.isArray(groupIds) || groupIds.length !== 2 ||
            groupIds.some(x => typeof x !== 'string' || !x) || groupIds[0] === groupIds[1]) {
            throw new TypeError('groupIds must contain exactly two distinct declared group IDs.');
        }
        const outcome = result?.outcomes?.[outcomeIndex];
        const outcomeClass = outcome?.classes?.[classIndex];
        const category = outcomeClass?.categories?.[categoryIndex];
        if (!outcome || !outcomeClass || !category) {
            throw new Error('The requested outcome/class/category is not available.');
        }
        if (outcome.paramType !== 'COUNT_OF_PARTICIPANTS') {
            throw new Error('Cannot form participant 2x2 table from ' +
                (outcome.paramType || 'unspecified') + ' outcome type.');
        }
        const declared = array(outcome.groups);
        const groups = groupIds.map(id => uniqueEntry(declared, id, 'Outcome group ID', 'id'));
        const selected = selectDenominators(outcome, outcomeClass, category);
        if (selected.entries.length !== 1 ||
            String(selected.entries[0].units || '').toLowerCase() !== 'participants') {
            throw new Error('A single participant-denominator definition is required; multiple or other units are ambiguous.');
        }
        const denomCounts = array(selected.entries[0].counts);
        const measurements = array(category.measurements);
        const arms = groupIds.map((id, i) => {
            const measurement = uniqueEntry(measurements, id, 'Event measurement');
            const denominator = uniqueEntry(denomCounts, id, 'Analyzed denominator');
            const events = integerCount(measurement.value, 'Events for ' + id);
            const n = integerCount(denominator.value, 'Analyzed N for ' + id);
            if (events > n) throw new Error('Events exceed analyzed participants for ' + id + '.');
            return { groupId: id, label: groups[i].title ?? null, events, nonEvents: n - events, analyzed: n };
        });
        return {
            nctId: result.nctId ?? null,
            outcomeIndex, classIndex, categoryIndex,
            outcomeTitle: outcome.title ?? null,
            timeFrame: outcome.timeFrame ?? null,
            categoryTitle: category.title ?? null,
            denominatorScope: selected.scope,
            arms,
            // Statistical analyses are preserved in outcomes but not assumed
            // equivalent to the manually selected binary event comparison.
            provenance: 'ClinicalTrials.gov posted outcome results; explicit group/category selection',
        };
    }
}
