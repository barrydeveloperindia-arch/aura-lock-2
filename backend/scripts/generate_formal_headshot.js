/**
 * Generates a CANDIDATE formal headshot (blazer/shirt + tie, neatened hair, plain white
 * background) from an employee's existing photo, using Gemini's image-generation model.
 *
 * SAFETY / WHY THIS IS A "CANDIDATE", NEVER AN AUTO-APPLY:
 *   - The prompt explicitly instructs the model to preserve the person's real face and
 *     identity, changing only clothing/hair-neatness/background. It is still a generative
 *     edit, not the person's real photo, so it can drift (wrong skin tone, an odd hairline,
 *     an artifact near the collar). This script only WRITES the result next to the original
 *     for a human to look at side-by-side -- it never uploads to the employee's profile
 *     automatically.
 *   - After you review a candidate and it genuinely looks like the same person, upload it
 *     yourself via the admin panel's "Upload Passport Photo" (Edit Employee -> ID Card Photo),
 *     the same as any other photo -- there is no separate "auto-accept" path, on purpose.
 *
 * REQUIRES: GOOGLE_API_KEY in backend/.env with access to an image-generation-capable Gemini
 * model (set GEMINI_IMAGE_MODEL to override the default if your key uses a different one).
 *
 * USAGE
 *   node scripts/generate_formal_headshot.js EL024              # one employee, from their current photo
 *   node scripts/generate_formal_headshot.js EL024 EL043 EL033  # several
 *
 * Output: scratch/formal_headshots/<EMP_ID>_candidate.jpg (created next to this script's repo)
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const attendancePhotos = require('../services/attendancePhotos');

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const OUT_DIR = path.join(__dirname, '..', 'scratch', 'formal_headshots');

const PROMPT = `This is a photo of a real employee for a company ID card. Edit it into a
professional headshot suitable for an official ID card:
- Keep the person's actual face, skin tone, and identity completely unchanged -- do not alter
  facial features, expression, or make them look like a different person.
- Replace their current clothing with a simple formal outfit: a collared shirt, blazer/coat,
  and a tie, in neutral colors (navy, grey, or black).
- Neaten the hair (as if just combed), without changing hairstyle or hair color.
- Replace the background with a plain, evenly lit white/light-grey studio background.
- Keep the framing as a head-and-shoulders portrait, facing forward.
Do not add glasses, jewelry, or anything else that isn't already part of the person's real
appearance. This must still look recognizably like the same real person.`;

const ids = process.argv.slice(2);
if (!ids.length) { console.error('Usage: node scripts/generate_formal_headshot.js EMP_ID [EMP_ID ...]'); process.exit(1); }
if (!API_KEY) { console.error('GOOGLE_API_KEY is not set in backend/.env -- get one with Gemini image-generation access first.'); process.exit(1); }

async function getCurrentPhotoBuffer(employeeId) {
    const [profileUrls, avatarUrls] = await Promise.all([
        attendancePhotos.getProfilePhotoUrls([employeeId]),
        attendancePhotos.getAvatarUrls([employeeId]),
    ]);
    const url = profileUrls[employeeId] || avatarUrls[employeeId];
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
}

async function generateCandidate(imageBuffer) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const body = {
        contents: [{
            parts: [
                { text: PROMPT },
                { inlineData: { mimeType: 'image/jpeg', data: imageBuffer.toString('base64') } },
            ],
        }],
    };
    const res = await axios.post(endpoint, body, { timeout: 60000 });
    const parts = res.data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.data);
    if (!imagePart) throw new Error('Model did not return an image -- check GEMINI_IMAGE_MODEL supports image output.');
    return Buffer.from(imagePart.inlineData.data, 'base64');
}

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const id of ids) {
        try {
            const original = await getCurrentPhotoBuffer(id);
            if (!original) { console.log(`${id}: no current photo found, skipped`); continue; }
            console.log(`${id}: generating candidate...`);
            const candidate = await generateCandidate(original);
            const outPath = path.join(OUT_DIR, `${id}_candidate.jpg`);
            fs.writeFileSync(outPath, candidate);
            console.log(`${id}: wrote ${outPath} -- REVIEW this before uploading it anywhere.`);
        } catch (err) {
            console.log(`${id}: FAILED -- ${err.response?.data?.error?.message || err.message}`);
        }
    }
})();
