const assert = require('node:assert/strict');
const geocode = require('./geocode');

const nominatim = (address, display_name = 'x') => ({ data: { display_name, address } });

describe('geocode.formatAddress', () => {
    test('builds a short address from Nominatim parts', () => {
        assert.equal(geocode.formatAddress(nominatim({
            house_number: '613', road: 'Franklin Avenue', neighbourhood: 'Crown Heights', city: 'Brooklyn', state: 'New York', postcode: '11238', country: 'United States',
        }).data), '613 Franklin Avenue, Crown Heights, Brooklyn, New York 11238, United States');
    });
    test('falls back through town / village and drops duplicates', () => {
        assert.equal(geocode.formatAddress(nominatim({ road: 'Sector 18', village: 'Kharar', town: 'Kharar', state: 'Punjab', country: 'India' }).data),
            'Sector 18, Kharar, Punjab, India');
    });
    test('puts the matched feature name first when Nominatim returns one', () => {
        assert.equal(geocode.formatAddress({ name: 'Chitkara Innovation Incubator', address: { city: 'Panchkula', state: 'Haryana', postcode: '134114', country: 'India' } }), 'Chitkara Innovation Incubator, Panchkula, Haryana 134114, India');
    });
    test('uses display_name when there is no address block, null when nothing', () => {
        assert.equal(geocode.formatAddress({ display_name: 'Somewhere, India' }), 'Somewhere, India');
        assert.equal(geocode.formatAddress({}), null);
        assert.equal(geocode.formatAddress(null), null);
    });
});

describe('geocode.reverseGeocode', () => {
    let calls;
    beforeEach(() => {
        calls = [];
        geocode._setHttpForTests({
            get: async (url, opts) => {
                calls.push({ url, params: opts.params, ua: opts.headers['User-Agent'] });
                if (opts.params.lat === 0) throw new Error('simulated outage');
                return nominatim({ road: 'Industrial Area', city: 'Mohali', state: 'Punjab', postcode: '160055', country: 'India' });
            },
        });
    });
    afterEach(() => { geocode._setHttpForTests(null); geocode._setKnownPlacesForTests(''); });

    test('a fix inside a known place is labelled with it first, and the label survives an OSM outage', async () => {
        geocode._setKnownPlacesForTests(JSON.stringify([{ name: 'EngLabs Office', lat: 30.7218, lng: 76.8525, radius_m: 120 }]));
        assert.equal(await geocode.reverseGeocode(30.721836, 76.852475), 'EngLabs Office, Industrial Area, Mohali, Punjab 160055, India');
        assert.equal(await geocode.reverseGeocode(30.75, 76.90), 'Industrial Area, Mohali, Punjab 160055, India', 'outside the radius: plain OSM address');
        geocode._setKnownPlacesForTests(JSON.stringify([{ name: 'EngLabs Office', lat: 0, lng: 0, radius_m: 50 }]));
        assert.equal(await geocode.reverseGeocode(0, 0), 'EngLabs Office');
        assert.equal(geocode.parseKnownPlaces('not json').length, 0);
        geocode._setKnownPlacesForTests('EngLabs Office@30.72182,76.85247,120');
        assert.deepEqual(geocode.nearestPlace(30.722956, 76.853971), { name: 'EngLabs Office', distance_m: 191, inside: false });
        assert.equal(geocode.nearestPlace(30.72183, 76.85248).inside, true);
        geocode._setKnownPlacesForTests('');
        assert.equal(geocode.nearestPlace(30.72183, 76.85248), null);
        assert.deepEqual(geocode.parseKnownPlaces('EngLabs Office@30.72182,76.85247,120; Site B@30.7,76.8'), [
            { name: 'EngLabs Office', lat: 30.72182, lng: 76.85247, radius_m: 120 }, { name: 'Site B', lat: 30.7, lng: 76.8, radius_m: 100 }]);
    });

    test('resolves an address and caches per ~11 m cell', async () => {
        const a = await geocode.reverseGeocode(30.721805, 76.852932);
        assert.equal(a, 'Industrial Area, Mohali, Punjab 160055, India');
        const b = await geocode.reverseGeocode('30.72184', '76.85290'); // same 4-dp cell
        assert.equal(b, a);
        assert.equal(calls.length, 1, 'second lookup served from cache');
        assert.match(calls[0].ua, /EngLabs-Attendance/);
        assert.equal(calls[0].params.format, 'jsonv2');
    });

    test('returns null on failure or bad input and keeps working afterwards', async () => {
        assert.equal(await geocode.reverseGeocode(0, 0), null);
        assert.equal(await geocode.reverseGeocode('abc', 1), null);
        assert.equal(await geocode.reverseGeocode(30.7, 76.8), 'Industrial Area, Mohali, Punjab 160055, India');
    });
});
