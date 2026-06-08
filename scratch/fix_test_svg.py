import os
import re

svg_file = r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\terminal-app\englabs_logo.svg"
with open(svg_file, "r", encoding="utf-8") as f:
    svg_content = f.read()

match = re.search(r'd="([^"]+)"', svg_content)
if not match:
    print("Could not find path 'd' attribute in SVG file")
    exit(1)

correct_path = match.group(1)

test_svg_file = r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\scratch\test_svg.html"
with open(test_svg_file, "r", encoding="utf-8") as f:
    content = f.read()

pattern = re.compile(r'd="M\s*11\.9\s+57\.65\s+C[^"]+Z"', re.DOTALL)
new_content = pattern.sub(f'd="{correct_path}"', content)

with open(test_svg_file, "w", encoding="utf-8") as f:
    f.write(new_content)
print("Updated scratch/test_svg.html successfully")
