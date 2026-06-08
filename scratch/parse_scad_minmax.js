const fs = require('fs');

const content = fs.readFileSync('c:/Users/SAM/Documents/Antigravity/aura-lock-2/CAD/Englabs_Logo_Mesh.scad', 'utf8');

const pointsRegex = /points\s*=\s*\[([\s\S]*?)\]\s*,\s*paths/i;
const match = content.match(pointsRegex);
if (!match) {
    console.error('No points match found');
    process.exit(1);
}

const pointsText = match[1];
const points = [];
const lines = pointsText.split('\n');
let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;

for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const numMatch = line.match(/\[\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\]/);
    if (numMatch) {
        const x = parseFloat(numMatch[1]);
        const y = parseFloat(numMatch[2]);
        points.push([x, y]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
}

console.log(`Parsed ${points.length} points.`);
console.log(`SCAD Bounding Box: X=[${minX}, ${maxX}], Y=[${minY}, ${maxY}]`);
