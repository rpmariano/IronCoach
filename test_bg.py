import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\styles\globals.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the simple html, body rule with a premium background
old_bg = 'html, body { background: var(--page-bg); }'
new_bg = '''html, body { 
  /* Premium Apple-like dark metallic background */
  background: radial-gradient(circle at 10% 0%, #3a3a3c 0%, #1c1c1e 40%, #000000 100%);
  background-attachment: fixed;
  min-height: 100vh;
}'''

content = content.replace(old_bg, new_bg)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
