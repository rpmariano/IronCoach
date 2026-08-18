# -*- coding: utf-8 -*-
import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\styles\globals.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Update the overrides for better WCAG compliance
content = content.replace('color: #64748b !important;', 'color: #94a3b8 !important;') # bump 400 to 500
content = content.replace('color: #94a3b8 !important;', 'color: #cbd5e1 !important;') # bump 500 to 600

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
