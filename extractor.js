/**
 * CTGov V2 Extractor
 * Fetches and parses structured results from ClinicalTrials.gov API v2.
 */
class CTGovExtractor {
    constructor() {
        this.baseUrl = 'https://clinicaltrials.gov/api/v2/studies';
    }

    async getTrialResults(nctId) {
        const res = await fetch(this.baseUrl + '/' + nctId + '?format=json');
        const data = await res.json();
        return this._parseResults(data);
    }

    _parseResults(data) {
        if (!data.protocolSection || !data.resultsSection) return { error: 'No posted results available.' };
        
        const outcomes = data.resultsSection.outcomeMeasuresModule?.outcomeMeasures || [];
        const extracted = outcomes.map(o => {
            return {
                title: o.title,
                type: o.type,
                groups: o.classes?.[0]?.categories?.[0]?.measurements || []
            };
        });

        return {
            nctId: data.protocolSection.identificationModule.nctId,
            outcomes: extracted
        };
    }
}
export default CTGovExtractor;
