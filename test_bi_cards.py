# -*- coding: utf-8 -*-
import os
import glob

files = glob.glob(r'C:\Users\rpmar\IronHealth-antigravity\src\components\BI\*.jsx')
files.append(r'C:\Users\rpmar\IronHealth-antigravity\src\components\Dashboard\CrossAnalyticsDashboard.jsx')

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Clean up hardcoded light theme glassmorphism in BI components
    content = content.replace('bg-white/40', 'bg-white/5')
    content = content.replace('bg-white/50', 'bg-white/5')
    content = content.replace('bg-white/60', 'bg-white/5')
    content = content.replace('bg-white/80', 'bg-white/10')
    content = content.replace('bg-white', 'bg-white/5')
    
    content = content.replace('border-white/60', 'border-white/10')
    content = content.replace('border-white/80', 'border-white/10')
    content = content.replace('border-slate-200/80', 'border-white/10')
    
    content = content.replace('shadow-[0_4px_24px_rgba(0,0,0,0.04)]', 'shadow-lg')
    content = content.replace('shadow-[0_8px_32px_rgba(0,0,0,0.08)]', 'shadow-xl')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
