import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\styles\globals.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the previous dark background
old_bg = '''html, body { 
  /* Premium Apple-like dark metallic background */
  background: radial-gradient(circle at 10% 0%, #3a3a3c 0%, #1c1c1e 40%, #000000 100%);
  background-attachment: fixed;
  min-height: 100vh;
}'''

new_bg = '''html, body { 
  /* IronHealth Premium Deep Slate & Teal Background */
  background-color: #0f172a;
  background-image: radial-gradient(circle at top right, rgba(45, 74, 87, 0.5) 0%, #0f172a 60%, #020617 100%);
  background-attachment: fixed;
  min-height: 100vh;
}'''

content = content.replace(old_bg, new_bg)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
