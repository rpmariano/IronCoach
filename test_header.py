# -*- coding: utf-8 -*-
import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\components\Layout\Layout.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace header style
content = content.replace(
'''<div className="sticky top-0 z-20" style={{ background: 'color-mix(in srgb, var(--surf-950) 95%, transparent)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--brd-800)' }}>''',
'''<div className="sticky top-0 z-20 bg-[#0f172a]/70 backdrop-blur-3xl border-b border-white/10">'''
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
