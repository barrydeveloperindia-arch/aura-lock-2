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
for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const numMatch = line.match(/\[\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\]/);
    if (numMatch) {
        points.push([parseFloat(numMatch[1]), parseFloat(numMatch[2])]);
    }
}

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

const path1 = points.slice(0, 206);
const path2 = points.slice(206);

let d = '';
d += `M ${scaleX(path1[0][0])} ${scaleY(path1[0][1])} `;
for (let i = 1; i < path1.length; i++) {
    d += `L ${scaleX(path1[i][0])} ${scaleY(path1[i][1])} `;
}
d += 'Z ';

d += `M ${scaleX(path2[0][0])} ${scaleY(path2[0][1])} `;
for (let i = 1; i < path2.length; i++) {
    d += `L ${scaleX(path2[i][0])} ${scaleY(path2[i][1])} `;
}
d += 'Z';

const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #0a0f1e; margin: 50px; }
  </style>
</head>
<body>
  <div style="color: #52b39a;">
    <h2>Flat (L) Path</h2>
    <svg width="200" height="200" viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="${d}" fill="currentColor" fill-rule="evenodd" />
    </svg>
  </div>
</body>
</html>`;

fs.writeFileSync('c:/Users/SAM/Documents/Antigravity/aura-lock-2/scratch/test_svg_flat.html', html);
console.log('Flat SVG test HTML generated successfully.');
