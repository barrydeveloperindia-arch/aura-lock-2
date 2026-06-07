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
console.log('pointsText length:', pointsText.length);
console.log('Sample pointsText:', pointsText.substring(0, 200));

const points = [];
const lines = pointsText.split('\n');
for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    // Extract numbers
    const numMatch = line.match(/\[\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\]/);
    if (numMatch) {
        points.push([parseFloat(numMatch[1]), parseFloat(numMatch[2])]);
    } else {
        console.log('Unmatched line:', line);
    }
}

console.log(`Parsed ${points.length} points.`);

const x_min = -10.5;
const x_max = 10.5;
const y_min = -8.5;
const y_max = 8.5;

function scaleX(x) {
    return ((x - x_min) / (x_max - x_min) * 80 + 10).toFixed(2);
}

function scaleY(y) {
    return ((y_max - y) / (y_max - y_min) * 80 + 10).toFixed(2);
}

if (points.length < 2) {
    console.error('Not enough points');
    process.exit(1);
}

const path1 = points.slice(0, 206);
const path2 = points.slice(206);

let d = '';

// Path 1
d += `M ${scaleX(path1[0][0])} ${scaleY(path1[0][1])} `;
for (let i = 1; i < path1.length; i++) {
    d += `L ${scaleX(path1[i][0])} ${scaleY(path1[i][1])} `;
}
d += 'Z ';

// Path 2
d += `M ${scaleX(path2[0][0])} ${scaleY(path2[0][1])} `;
for (let i = 1; i < path2.length; i++) {
    d += `L ${scaleX(path2[i][0])} ${scaleY(path2[i][1])} `;
}
d += 'Z';

const svg = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="${d}" fill="currentColor" fill-rule="evenodd" />
</svg>`;

fs.writeFileSync('c:/Users/SAM/Documents/Antigravity/aura-lock-2/terminal-app/englabs_logo.svg', svg);
console.log('SVG logo written successfully');
