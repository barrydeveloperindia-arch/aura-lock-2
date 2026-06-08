const fs = require('fs');

const smoothHtml = fs.readFileSync('c:/Users/SAM/Documents/Antigravity/aura-lock-2/scratch/test_svg.html', 'utf8');
const flatHtml = fs.readFileSync('c:/Users/SAM/Documents/Antigravity/aura-lock-2/scratch/test_svg_flat.html', 'utf8');

const smoothB64 = Buffer.from(smoothHtml).toString('base64');
const flatB64 = Buffer.from(flatHtml).toString('base64');

console.log('SMOOTH_DATA_URL: data:text/html;base64,' + smoothB64);
console.log('FLAT_DATA_URL: data:text/html;base64,' + flatB64);
