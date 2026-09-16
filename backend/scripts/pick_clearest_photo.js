/**
 * For each employee, looks through their recent attendance check-in photos, scores each one
 * for sharpness, and -- if a clearly sharper shot exists than their current ID-card photo --
 * uploads it as their profile photo (the same "Upload Passport Photo" feature in the admin
 * panel, services/attendancePhotos.uploadProfilePhoto).
 *
 * WHAT THIS CAN AND CAN'T JUDGE:
 *   - Sharpness (motion blur / focus) is scored automatically (Laplacian-variance-style edge
 *     strength via Jimp) and is the only thing this script decides on its own.
 *   - Framing problems a human eye catches at a glance -- looking down, on a phone call, face
 *     turned away, a cap covering the forehead -- are NOT detected here. A photo can score
 *     "sharp" and still be a bad ID photo. Treat this script's picks as raw candidates, not a
 *     final answer -- spot check a few results before trusting it broadly.
 *
 * USAGE
 *   node scripts/pick_clearest_photo.js [EMP_ID ...]        # dry run; default = all active employees
 *   node scripts/pick_clearest_photo.js --apply [EMP_ID ...]
 *   node scripts/pick_clearest_photo.js --apply --candidates=8   # look further back per person (default 5)
 *   node scripts/pick_clearest_photo.js --apply --margin=1.15    # require the new pick to beat the
 *                                                                  current photo by this factor (default 1.15 = 15%)
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');
const Jimp = require('jimp');
const attendancePhotos = require('../services/attendancePhotos');

const APPLY = process.argv.includes('--apply');
const idArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
const CANDIDATES = parseInt((process.argv.find(a => a.startsWith('--candidates=')) || '').split('=')[1], 10) || 5;
const MARGIN = parseFloat((process.argv.find(a => a.startsWith('--margin=')) || '').split('=')[1]) || 1.15;

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET = attendancePhotos.BUCKET;

// Simple sharpness proxy: average absolute difference between each pixel and its right/below
// neighbour in greyscale. Blurry/motion-smeared photos have low local contrast; sharp,
// in-focus ones have high local contrast. Not a substitute for looking at the photo.
async function sharpness(buffer) {
    const img = await Jimp.read(buffer);
    img.resize(200, Jimp.AUTO).greyscale();
    const { data, width, height } = img.bitmap;
    let total = 0, count = 0;
    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {
            const i = (y * width + x) * 4;
            const iRight = (y * width + x + 1) * 4;
            const iDown = ((y + 1) * width + x) * 4;
            total += Math.abs(data[i] - data[iRight]) + Math.abs(data[i] - data[iDown]);
            count += 2;
        }
    }
    return total / count;
}

async function fetchBuffer(signedUrl) {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    return Buffer.from(await res.arrayBuffer());
}

(async () => {
    let query = sb.from('employees').select('id, employee_id, name').eq('status', 'Active').eq('is_deleted', false);
    if (idArgs.length) query = query.in('employee_id', idArgs);
    const { data: employees, error } = await query;
    if (error) throw error;

    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — up to ${CANDIDATES} recent check-ins per person, margin ${MARGIN}x`);

    for (const emp of employees) {
        try {
            // Current best photo (profile photo if uploaded, else the biometric avatar)
            const [profileUrls, avatarUrls] = await Promise.all([
                attendancePhotos.getProfilePhotoUrls([emp.employee_id]),
                attendancePhotos.getAvatarUrls([emp.employee_id]),
            ]);
            const currentUrl = profileUrls[emp.employee_id] || avatarUrls[emp.employee_id];
            const currentScore = currentUrl ? await sharpness(await fetchBuffer(currentUrl)) : 0;

            // Recent attendance rows with a check-in photo
            const { data: rows } = await sb.from('attendance')
                .select('id, date')
                .eq('employee_id', emp.id)
                .order('date', { ascending: false })
                .limit(CANDIDATES * 3); // some rows may have no stored photo; over-fetch a bit
            if (!rows?.length) { console.log(`  ${emp.employee_id} ${emp.name}: no attendance rows`); continue; }

            let best = null;
            for (const row of rows) {
                const path = `${row.date}/${row.id}_in.jpg`;
                const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 300);
                if (!signed?.signedUrl) continue;
                let buf;
                try { buf = await fetchBuffer(signed.signedUrl); } catch { continue; }
                const score = await sharpness(buf);
                if (!best || score > best.score) best = { score, buf, date: row.date };
                if ([...rows].filter(r => r === row).length && best && rows.indexOf(row) >= CANDIDATES - 1) break;
            }

            if (!best) { console.log(`  ${emp.employee_id} ${emp.name}: no usable check-in photo found`); continue; }

            const improved = !currentUrl || best.score > currentScore * MARGIN;
            console.log(`  ${emp.employee_id} ${emp.name}: current=${currentScore.toFixed(1)} best_candidate=${best.score.toFixed(1)} (${best.date}) -> ${improved ? 'REPLACE' : 'keep current'}`);

            if (improved && APPLY) {
                const path = await attendancePhotos.uploadProfilePhoto(emp.employee_id, best.buf);
                console.log(`    ${path ? 'uploaded -> ' + path : 'upload FAILED'}`);
            }
        } catch (err) {
            console.log(`  ${emp.employee_id} ${emp.name}: ERROR ${err.message}`);
        }
    }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
