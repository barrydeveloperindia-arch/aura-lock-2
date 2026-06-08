import base64
import os

test_svg_file = r"c:\Users\SAM\Documents\Antigravity\aura-lock-2\scratch\test_svg.html"
with open(test_svg_file, "r", encoding="utf-8") as f:
    content = f.read()

# Encode to base64
b64_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")
data_url = f"data:text/html;base64,{b64_content}"

output_dir = r"C:\Users\SAM\.gemini\antigravity-ide\brain\903d68c9-c1ef-49ca-baf5-6fef97bfd053\browser"
os.makedirs(output_dir, exist_ok=True)

output_file = os.path.join(output_dir, "data_url.txt")
with open(output_file, "w", encoding="utf-8") as f:
    f.write(data_url)

print("Wrote data URL to browser directory successfully")
