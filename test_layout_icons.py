# -*- coding: utf-8 -*-
import os
import re

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\components\Layout\Layout.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Make active tab icon have a better dark mode highlight
content = content.replace(
    "activeTab === tab ? 'bg-slate-100 text-[var(--accent)]' : 'text-slate-500'",
    "activeTab === tab ? 'bg-white/10 text-sky-400' : 'text-slate-400'"
)

# And fix any hardcoded text colors in Layout
content = content.replace('text-slate-800', 'text-slate-100')
content = content.replace('text-slate-700', 'text-slate-200')
content = content.replace('text-slate-600', 'text-slate-300')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
