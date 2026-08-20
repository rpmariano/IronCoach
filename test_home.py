import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\components\Home\Home.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('bg-white shadow-sm px-2 py-1.5', 'bg-white/10 backdrop-blur-md border border-white/5 shadow-sm px-2 py-1.5')
content = content.replace('bg-[var(--accent)]', 'bg-slate-300')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
