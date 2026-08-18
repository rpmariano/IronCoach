import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\components\Layout\Layout.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('bg-black/40 backdrop-blur-2xl', 'bg-[#0f172a]/70 backdrop-blur-3xl')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
