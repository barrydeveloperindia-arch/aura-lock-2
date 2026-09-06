/**
 * Unit tests for the attendance photo service.
 * Run:  npm test (jest)
 * Uses an in-memory fake of the Supabase Storage client so no network,
 * keys, or real bucket are needed.
 */
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const photos = require('./attendancePhotos');

const ATT_ID = '4f220617-f387-4505-a8c1-429292e61369';
const ATT_ID_2 = 'a519eefb-4c77-400e-8691-84ecea895426';

/** Minimal in-memory Supabase Storage fake supporting upload/list/remove/createSignedUrl. */
function makeFakeStorage(initialFiles = {}) {
    const files = { ...initialFiles }; // path -> Buffer
    const calls = { upload: [], remove: [], list: [], signed: [] };
    const bucketApi = {
        upload: async (path, buffer, opts) => {
            calls.upload.push({ path, size: buffer.length, opts });
            if (path.includes('FAIL')) return { error: { message: 'simulated failure' } };
            files[path] = buffer;
            return { data: { path }, error: null };
        },
        list: async (prefix, opts) => {
            calls.list.push({ prefix, opts });
            const names = new Set();
            for (const p of Object.keys(files)) {
                if (prefix === '') {
                    names.add(p.split('/')[0]);
                } else if (p.startsWith(prefix + '/')) {
                    names.add(p.slice(prefix.length + 1));
                }
            }
            return { data: [...names].map(name => ({ name })), error: null };
        },
        remove: async (paths) => {
            calls.remove.push(paths);
            for (const p of paths) delete files[p];
            return { data: paths, error: null };
        },
        createSignedUrl: async (path, ttl) => {
            calls.signed.push({ path, ttl });
            if (!files[path]) return { data: null, error: { message: 'Object not found' } };
            return { data: { signedUrl: `https://signed.example/${path}?ttl=${ttl}` }, error: null };
        },
    };
    return { client: { storage: { from: () => bucketApi } }, files, calls };
}

describe('attendancePhotos.saveAttendancePhoto', () => {
    let fake;
    beforeEach(() => { fake = makeFakeStorage(); photos._setClientForTests(fake.client); });

    test('uploads to <date>/<id>_<kind>.jpg with upsert and jpeg content type', async () => {
        const buf = Buffer.from('jpegdata');
        const path = await photos.saveAttendancePhoto({ buffer: buf, attendanceId: ATT_ID, date: '2026-09-06', kind: 'in' });
        assert.equal(path, `2026-09-06/${ATT_ID}_in.jpg`);
        assert.equal(fake.calls.upload.length, 1);
        assert.equal(fake.calls.upload[0].opts.upsert, true);
        assert.equal(fake.calls.upload[0].opts.contentType, 'image/jpeg');
    });

    test('check-out overwrites the "out" photo (rolling check-out semantics)', async () => {
        await photos.saveAttendancePhoto({ buffer: Buffer.from('first'), attendanceId: ATT_ID, date: '2026-09-06', kind: 'out' });
        await photos.saveAttendancePhoto({ buffer: Buffer.from('second'), attendanceId: ATT_ID, date: '2026-09-06', kind: 'out' });
        assert.equal(Object.keys(fake.files).length, 1);
        assert.equal(fake.files[`2026-09-06/${ATT_ID}_out.jpg`].toString(), 'second');
    });

    test('rejects invalid ids, dates, kinds and empty buffers without throwing', async () => {
        assert.equal(await photos.saveAttendancePhoto({ buffer: Buffer.from('x'), attendanceId: 'not-a-uuid', date: '2026-09-06', kind: 'in' }), null);
        assert.equal(await photos.saveAttendancePhoto({ buffer: Buffer.from('x'), attendanceId: ATT_ID, date: '06-09-2026', kind: 'in' }), null);
        assert.equal(await photos.saveAttendancePhoto({ buffer: Buffer.from('x'), attendanceId: ATT_ID, date: '2026-09-06', kind: 'selfie' }), null);
        assert.equal(await photos.saveAttendancePhoto({ buffer: Buffer.alloc(0), attendanceId: ATT_ID, date: '2026-09-06', kind: 'in' }), null);
        assert.equal(fake.calls.upload.length, 0);
    });

    test('rejects frames above 2 MB', async () => {
        const big = Buffer.alloc(2 * 1024 * 1024 + 1);
        assert.equal(await photos.saveAttendancePhoto({ buffer: big, attendanceId: ATT_ID, date: '2026-09-06', kind: 'in' }), null);
        assert.equal(fake.calls.upload.length, 0);
    });

    test('returns null (never throws) when storage rejects the upload', async () => {
        const failing = makeFakeStorage();
        failing.client.storage.from = () => ({ upload: async () => ({ error: { message: 'RLS violation' } }) });
        photos._setClientForTests(failing.client);
        const r = await photos.saveAttendancePhoto({ buffer: Buffer.from('x'), attendanceId: ATT_ID, date: '2026-09-06', kind: 'in' });
        assert.equal(r, null);
    });
});

describe('attendancePhotos.listPhotoAvailability', () => {
    test('maps attendance ids to {in, out} across multiple dates with one list call per date', async () => {
        const fake = makeFakeStorage({
            [`2026-09-05/${ATT_ID}_in.jpg`]: Buffer.from('a'),
            [`2026-09-05/${ATT_ID}_out.jpg`]: Buffer.from('b'),
            [`2026-09-06/${ATT_ID_2}_in.jpg`]: Buffer.from('c'),
            '2026-09-06/junk.txt': Buffer.from('ignored'),
        });
        photos._setClientForTests(fake.client);

        const map = await photos.listPhotoAvailability(['2026-09-05', '2026-09-06', '2026-09-06', 'bad-date']);
        assert.deepEqual(map.get(ATT_ID), { in: true, out: true });
        assert.deepEqual(map.get(ATT_ID_2), { in: true, out: false });
        assert.equal(map.size, 2);
        assert.equal(fake.calls.list.length, 2, 'duplicate and invalid dates must not trigger extra list calls');
    });

    test('returns an empty map for no dates', async () => {
        photos._setClientForTests(makeFakeStorage().client);
        assert.equal((await photos.listPhotoAvailability([])).size, 0);
    });
});

describe('attendancePhotos.getSignedPhotoUrl', () => {
    test('returns a 1-hour signed url with expiry for an existing photo', async () => {
        const fake = makeFakeStorage({ [`2026-09-06/${ATT_ID}_in.jpg`]: Buffer.from('a') });
        photos._setClientForTests(fake.client);
        const r = await photos.getSignedPhotoUrl({ date: '2026-09-06', attendanceId: ATT_ID, kind: 'in' });
        assert.ok(r.url.startsWith('https://signed.example/2026-09-06/'));
        assert.equal(fake.calls.signed[0].ttl, 3600);
        assert.ok(new Date(r.expires_at) > new Date());
    });

    test('returns null when the photo does not exist or the request is malformed', async () => {
        const fake = makeFakeStorage();
        photos._setClientForTests(fake.client);
        assert.equal(await photos.getSignedPhotoUrl({ date: '2026-09-06', attendanceId: ATT_ID, kind: 'in' }), null);
        assert.equal(await photos.getSignedPhotoUrl({ date: '2026-09-06', attendanceId: '../etc', kind: 'in' }), null);
    });
});

describe('attendancePhotos.cleanupExpiredPhotos', () => {
    test('deletes only date folders older than the retention window', async () => {
        const today = new Date();
        const daysAgo = (n) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().split('T')[0]; };
        const oldDate = daysAgo(100), edgeDate = daysAgo(89), recent = daysAgo(1);
        const fake = makeFakeStorage({
            [`${oldDate}/${ATT_ID}_in.jpg`]: Buffer.from('a'),
            [`${oldDate}/${ATT_ID}_out.jpg`]: Buffer.from('b'),
            [`${edgeDate}/${ATT_ID_2}_in.jpg`]: Buffer.from('c'),
            [`${recent}/${ATT_ID_2}_in.jpg`]: Buffer.from('d'),
        });
        photos._setClientForTests(fake.client);

        const summary = await photos.cleanupExpiredPhotos(90);
        assert.deepEqual(summary.deletedFolders, [oldDate]);
        assert.equal(summary.deletedFiles, 2);
        assert.equal(Object.keys(fake.files).length, 2);
        assert.ok(fake.files[`${edgeDate}/${ATT_ID_2}_in.jpg`], 'photo inside the window must survive');
    });

    test('is a no-op on an empty bucket', async () => {
        photos._setClientForTests(makeFakeStorage().client);
        const summary = await photos.cleanupExpiredPhotos(90);
        assert.deepEqual(summary, { deletedFolders: [], deletedFiles: 0 });
    });
});

describe('attendancePhotos validators', () => {
    test('photoPath and validators', () => {
        assert.equal(photos.photoPath('2026-09-06', ATT_ID, 'out'), `2026-09-06/${ATT_ID}_out.jpg`);
        assert.equal(photos.isValidKind('in'), true);
        assert.equal(photos.isValidKind('IN'), false);
        assert.equal(photos.isValidDate('2026-09-06'), true);
        assert.equal(photos.isValidDate('2026-9-6'), false);
        assert.equal(photos.isValidAttendanceId(ATT_ID), true);
        assert.equal(photos.isValidAttendanceId('..'), false);
    });
});

describe('attendancePhotos.stampPhoto', () => {
    const Jimp = require('jimp');
    const makeFrame = async (w, h) => new Jimp(w, h, 0x336699FF).quality(80).getBufferAsync(Jimp.MIME_JPEG);

    test('formatStampTime renders IST with short month', () => {
        assert.equal(photos.formatStampTime('2026-09-06T06:09:51.824+00:00'), '06 Sep 2026, 11:39:51 IST');
        assert.equal(photos.formatStampTime('not-a-date'), '');
    });

    test('burns a caption band into a landscape frame and keeps dimensions', async () => {
        const src = await makeFrame(640, 480);
        const out = await photos.stampPhoto(src, { name: 'Gaurav Panchal', employeeId: 'EMP-012', kind: 'out', capturedAt: '2026-09-06T06:09:51.824+00:00' });
        assert.notEqual(out, src, 'should return a new buffer');
        const img = await Jimp.read(out);
        assert.equal(img.bitmap.width, 640);
        assert.equal(img.bitmap.height, 480);
        // bottom band is dark, top-left of frame keeps original colour
        const bottom = Jimp.intToRGBA(img.getPixelColor(5, 475));
        const top = Jimp.intToRGBA(img.getPixelColor(5, 5));
        assert.ok(bottom.r < 60 && bottom.g < 80, `band should be dark, got ${JSON.stringify(bottom)}`);
        assert.ok(top.b > 100, 'top of frame should be untouched');
    });

    test('portrait frame still fits every line (no wrapping past the band)', async () => {
        const src = await makeFrame(480, 640);
        const out = await photos.stampPhoto(src, { name: 'Uditanshu Chandel', employeeId: 'EMP-0021', kind: 'in', capturedAt: '2026-09-06T03:44:59.476+00:00' });
        const img = await Jimp.read(out);
        assert.equal(img.bitmap.width, 480);
        assert.equal(img.bitmap.height, 640);
    });

    test('returns the original buffer when the input is not an image', async () => {
        const junk = Buffer.from('definitely not a jpeg');
        const out = await photos.stampPhoto(junk, { name: 'x', kind: 'in' });
        assert.equal(out, junk);
    });

    test('saveAttendancePhoto stamps before upload when stamp is given', async () => {
        const fake = makeFakeStorage();
        photos._setClientForTests(fake.client);
        const src = await makeFrame(640, 480);
        await photos.saveAttendancePhoto({ buffer: src, attendanceId: ATT_ID, date: '2026-09-06', kind: 'in', stamp: { name: 'A', employeeId: 'EMP-1', capturedAt: '2026-09-06T03:44:59Z' } });
        assert.equal(fake.calls.upload.length, 1);
        assert.notEqual(fake.calls.upload[0].size, src.length, 'uploaded bytes should be the stamped image');
    });
});

describe('attendancePhotos location (geo-stamp)', () => {
    const Jimp = require('jimp');
    const frame = () => new Jimp(640, 480, 0x336699FF).quality(80).getBufferAsync(Jimp.MIME_JPEG);

    test('normalizeLocation accepts numeric strings from multipart and rejects junk', () => {
        assert.deepEqual(photos.normalizeLocation({ lat: '28.613939', lng: '77.209021', accuracy: '14.6', fix_time: 't' }),
            { lat: 28.613939, lng: 77.209021, accuracy_m: 15, fix_time: 't' });
        assert.equal(photos.normalizeLocation({ lat: 'abc', lng: '77' }), null);
        assert.equal(photos.normalizeLocation({ lat: 95, lng: 10 }), null);
        assert.equal(photos.normalizeLocation(undefined), null);
        assert.equal(photos.normalizeLocation({ lat: 28.6, lng: 77.2 }).accuracy_m, null);
    });

    test('formatStampLocation renders 5 decimals and accuracy', () => {
        assert.equal(photos.formatStampLocation({ lat: 28.613939, lng: 77.209021, accuracy: 15 }), 'LOC 28.61394, 77.20902  +/-15 m');
        assert.equal(photos.formatStampLocation(null), '');
    });

    test('stampPhoto adds a location line without breaking the frame', async () => {
        const out = await photos.stampPhoto(await frame(), { name: 'A B', employeeId: 'EMP-1', kind: 'in', capturedAt: '2026-09-06T03:44:59Z', location: { lat: 28.613939, lng: 77.209021, accuracy: 15 } });
        const img = await Jimp.read(out);
        assert.equal(img.bitmap.width, 640);
        assert.equal(img.bitmap.height, 480);
    });

    test('saveAttendancePhoto writes a JSON sidecar only when a valid location is given', async () => {
        const fake = makeFakeStorage();
        photos._setClientForTests(fake.client);
        await photos.saveAttendancePhoto({ buffer: await frame(), attendanceId: ATT_ID, date: '2026-09-06', kind: 'in',
            stamp: { name: 'A', employeeId: 'EMP-1', capturedAt: '2026-09-06T03:44:59Z', location: { lat: '28.6', lng: '77.2', accuracy: '9' } } });
        assert.equal(fake.calls.upload.length, 2);
        assert.equal(fake.calls.upload[1].path, `2026-09-06/${ATT_ID}_in.json`);
        assert.equal(fake.calls.upload[1].opts.contentType, 'application/json');
        const sidecar = JSON.parse(fake.files[`2026-09-06/${ATT_ID}_in.json`].toString());
        assert.deepEqual(sidecar.location, { lat: 28.6, lng: 77.2, accuracy_m: 9, fix_time: null });

        const noLoc = makeFakeStorage();
        photos._setClientForTests(noLoc.client);
        await photos.saveAttendancePhoto({ buffer: await frame(), attendanceId: ATT_ID, date: '2026-09-06', kind: 'in', stamp: { name: 'A' } });
        assert.equal(noLoc.calls.upload.length, 1, 'no sidecar without a fix');
    });

    test('listPhotoAvailability ignores sidecar json files', async () => {
        const fake = makeFakeStorage({ [`2026-09-06/${ATT_ID}_in.jpg`]: Buffer.from('a'), [`2026-09-06/${ATT_ID}_in.json`]: Buffer.from('{}') });
        photos._setClientForTests(fake.client);
        const m = await photos.listPhotoAvailability(['2026-09-06']);
        assert.deepEqual(m.get(ATT_ID), { in: true, out: false });
    });

    test('getPhotoLocation reads the sidecar through storage.download', async () => {
        const body = JSON.stringify({ attendance_id: ATT_ID, kind: 'in', location: { lat: 28.6, lng: 77.2, accuracy_m: 9, fix_time: null }, source: 'terminal' });
        const client = { storage: { from: () => ({ download: async (p) => p.endsWith('_in.json') ? { data: { text: async () => body }, error: null } : { data: null, error: { message: 'nf' } } }) } };
        photos._setClientForTests(client);
        const r = await photos.getPhotoLocation({ date: '2026-09-06', attendanceId: ATT_ID, kind: 'in' });
        assert.equal(r.source, 'terminal');
        assert.equal(r.location.lat, 28.6);
        assert.equal(await photos.getPhotoLocation({ date: '2026-09-06', attendanceId: ATT_ID, kind: 'out' }), null);
    });
});

describe('attendancePhotos avatars', () => {
    const Jimp = require('jimp');
    const frame = (w, h) => new Jimp(w, h, 0x336699FF).quality(80).getBufferAsync(Jimp.MIME_JPEG);

    test('makeAvatar returns a 256x256 square from portrait and landscape frames', async () => {
        for (const [w, h] of [[480, 640], [640, 480]]) {
            const img = await Jimp.read(await photos.makeAvatar(await frame(w, h)));
            assert.equal(img.bitmap.width, 256);
            assert.equal(img.bitmap.height, 256);
        }
    });

    test('saveEmployeeAvatar upserts avatars/<id>.jpg and rejects bad ids', async () => {
        const fake = makeFakeStorage();
        photos._setClientForTests(fake.client);
        assert.equal(await photos.saveEmployeeAvatar('EMP-012', await frame(480, 640)), 'avatars/EMP-012.jpg');
        assert.equal(fake.calls.upload[0].opts.upsert, true);
        assert.equal(await photos.saveEmployeeAvatar('../etc/passwd', await frame(100, 100)), null);
        assert.equal(await photos.saveEmployeeAvatar('EMP-1', Buffer.alloc(0)), null);
        assert.equal(fake.calls.upload.length, 1);
    });

    test('getAvatarUrls signs only ids that exist, in one batch', async () => {
        const fake = makeFakeStorage({ 'avatars/EMP-012.jpg': Buffer.from('a'), 'avatars/EMP-004.jpg': Buffer.from('b') });
        let batch = null;
        fake.client.storage.from = () => ({
            list: async (prefix) => ({ data: prefix === 'avatars' ? [{ name: 'EMP-012.jpg' }, { name: 'EMP-004.jpg' }] : [], error: null }),
            createSignedUrls: async (paths, ttl) => { batch = { paths, ttl }; return { data: paths.map(p => ({ path: p, signedUrl: 'https://s/' + p })), error: null }; },
        });
        photos._setClientForTests(fake.client);
        const urls = await photos.getAvatarUrls(['EMP-012', 'EMP-999', 'EMP-004', 'bad id!', 'EMP-012']);
        assert.deepEqual(Object.keys(urls).sort(), ['EMP-004', 'EMP-012']);
        assert.equal(batch.paths.length, 2, 'one batch call, only existing avatars');
        assert.equal(batch.ttl, 3600);
        assert.deepEqual(await photos.getAvatarUrls([]), {});
    });
});
