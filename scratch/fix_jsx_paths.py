import os
import re

svg_file = r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\terminal-app\englabs_logo.svg"
with open(svg_file, "r", encoding="utf-8") as f:
    svg_content = f.read()

# Extract the path from englabs_logo.svg
match = re.search(r'd="([^"]+)"', svg_content)
if not match:
    print("Could not find path 'd' attribute in SVG file")
    exit(1)

correct_path = match.group(1)
print(f"Correct path length: {len(correct_path)}")
print(f"Correct path starts with: {correct_path[:50]}")
print(f"Correct path ends with: {correct_path[-50:]}")

files_to_fix = [
    r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\terminal-app\src\TerminalHome.jsx",
    r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\terminal-app\src\admin-app\pages\Home.jsx",
    r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\terminal-app\src\admin-app\components\Sidebar.jsx",
    r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\terminal-app\src\admin-app\components\Layout.jsx",
    r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\admin-panel\src\pages\Login.jsx",
    r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\admin-panel\src\pages\Home.jsx",
    r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\admin-panel\src\components\Sidebar.jsx"
]

# Pattern to find any path d starting with "M 11.9 57.65 C" or "M 11.9 57.65" and ending in "Z"
# Since it could be long and contain newlines/carriage returns, use re.DOTALL
pattern = re.compile(r'd="M\s*11\.9\s+57\.65\s+C[^"]+Z"', re.DOTALL)

for file_path in files_to_fix:
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        continue
    
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    matches = pattern.findall(content)
    if not matches:
        print(f"No match found in: {file_path}")
        continue
    
    print(f"Found {len(matches)} matches in: {file_path}")
    
    new_content = pattern.sub(f'd="{correct_path}"', content)
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"Successfully fixed: {file_path}")

