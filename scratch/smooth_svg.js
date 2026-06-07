const fs = require('fs');
const path = require('path');

const scadPath = 'c:/Users/SAM/Documents/Antigravity/aura-lock-2/CAD/Englabs_Logo_Mesh.scad';
const content = fs.readFileSync(scadPath, 'utf8');

// Match points
const pointsRegex = /points\s*=\s*\[([\s\S]*?)\]\s*,\s*paths/i;
const match = content.match(pointsRegex);
if (!match) {
    console.error('No points match found');
    process.exit(1);
}

const pointsText = match[1];
const points = [];
const lines = pointsText.split('\n');
for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const numMatch = line.match(/\[\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\]/);
    if (numMatch) {
        points.push([parseFloat(numMatch[1]), parseFloat(numMatch[2])]);
    }
}

console.log(`Parsed ${points.length} points.`);

const x_min = -10.5;
const x_max = 10.5;
const y_min = -8.5;
const y_max = 8.5;

function scaleX(x) {
    return parseFloat(((x - x_min) / (x_max - x_min) * 80 + 10).toFixed(2));
}

function scaleY(y) {
    return parseFloat(((y_max - y) / (y_max - y_min) * 80 + 10).toFixed(2));
}

const path1Raw = points.slice(0, 206);
const path2Raw = points.slice(206);

// Scale all points
const path1 = path1Raw.map(p => [scaleX(p[0]), scaleY(p[1])]);
const path2 = path2Raw.map(p => [scaleX(p[0]), scaleY(p[1])]);

// Catmull-Rom to Bezier path generator
function getCurvePath(pts, closed = true) {
    if (pts.length < 3) return '';
    
    let d = '';
    const len = pts.length;
    
    d += `M ${pts[0][0]} ${pts[0][1]} `;
    
    for (let i = 0; i < len; i++) {
        let p0, p1, p2, p3;
        
        if (closed) {
            p0 = pts[(i - 1 + len) % len];
            p1 = pts[i];
            p2 = pts[(i + 1) % len];
            p3 = pts[(i + 2) % len];
        } else {
            p0 = i === 0 ? pts[0] : pts[i - 1];
            p1 = pts[i];
            p2 = i === len - 1 ? pts[len - 1] : pts[i + 1];
            p3 = i >= len - 2 ? pts[len - 1] : pts[i + 2];
        }
        
        // Catmull-Rom to Bezier control points calculation
        const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
        const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
        
        const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
        const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
        
        d += `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)} `;
    }
    
    if (closed) d += 'Z ';
    return d;
}

const d1 = getCurvePath(path1, true);
const d2 = getCurvePath(path2, true);

const svg = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="${d1}${d2}" fill="currentColor" fill-rule="evenodd" />
</svg>`;

fs.writeFileSync('c:/Users/SAM/Documents/Antigravity/aura-lock-2/terminal-app/englabs_logo.svg', svg);
console.log('Smooth SVG written to englabs_logo.svg');
