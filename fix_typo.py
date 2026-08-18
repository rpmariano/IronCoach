# -*- coding: utf-8 -*-
import os
import glob
import re

files = glob.glob(r'C:\Users\rpmar\IronHealth-antigravity\src\components\BI\*.jsx')
files.append(r'C:\Users\rpmar\IronHealth-antigravity\src\components\Dashboard\CrossAnalyticsDashboard.jsx')

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix the typo
    content = content.replace('bg-white/5/5', 'bg-white/5')
    content = content.replace('bg-white/5/10', 'bg-white/10')
    content = content.replace('bg-white/5/50', 'bg-white/5')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
