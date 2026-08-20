import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\styles\globals.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Comment out overrides
import re
content = re.sub(r'(\[class~="text-white"\].*?color:#0f172a !important; \})', r'/* \1 */', content)
content = re.sub(r'(\[class~="text-slate-200"\].*?color:#1e293b !important; \})', r'/* \1 */', content)
content = re.sub(r'(\[class~="text-slate-300"\].*?color:#334155 !important; \})', r'/* \1 */', content)
content = re.sub(r'(\[class~="text-slate-400"\].*?color:#475569 !important; \})', r'/* \1 */', content)
content = re.sub(r'(\[class~="text-slate-500"\].*?color:#516071 !important; \})', r'/* \1 */', content)
content = re.sub(r'(\[class~="bg-neutral-950"\].*?var\(--surf-950\) !important; \})', r'/* \1 */', content)
content = re.sub(r'(\[class~="bg-neutral-900"\].*?var\(--surf-900\) !important; \})', r'/* \1 */', content)
content = re.sub(r'(\[class~="bg-neutral-800"\].*?var\(--surf-800\) !important; \})', r'/* \1 */', content)

# Change body text color
content = content.replace('color: #1e293b;', 'color: #f8fafc;')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
