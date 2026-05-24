import CTGovExtractor from './extractor.js';
const extractor = new CTGovExtractor();
console.log('Extractor initialized successfully.');
const mockData = {
    protocolSection: { identificationModule: { nctId: 'NCT01234567' } },
    resultsSection: { outcomeMeasuresModule: { outcomeMeasures: [ { title: 'Outcome 1', type: 'PRIMARY' } ] } }
};
const result = extractor._parseResults(mockData);
console.log('Parsed result:', result);
