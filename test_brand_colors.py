# -*- coding: utf-8 -*-
import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\styles\globals.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Make brand colors brighter for dark mode WCAG compliance
content = content.replace('--green:#416e7f;', '--green:#5a8fa3;') # Bump up green
content = content.replace('--blue:#3e6b82;', '--blue:#6f9cb2;')   # Bump up blue
content = content.replace('--accent:var(--green-dark);', '--accent:#38bdf8;') # Make accent pop (Sky 400)
content = content.replace('--accent-ink:var(--green-dark);', '--accent-ink:#7dd3fc;')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
