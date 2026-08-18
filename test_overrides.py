# -*- coding: utf-8 -*-
import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\styles\globals.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

overrides = '''
/* ===== OVERRIDES DARK MODE (PREMIUM) ===== */
[class~="text-slate-900"], [class*="text-slate-900/"] { color: #f8fafc !important; }
[class~="text-slate-800"], [class*="text-slate-800/"] { color: #f1f5f9 !important; }
[class~="text-slate-700"], [class*="text-slate-700/"] { color: #e2e8f0 !important; }
[class~="text-slate-600"], [class*="text-slate-600/"] { color: #cbd5e1 !important; }
[class~="text-slate-500"], [class*="text-slate-500/"] { color: #94a3b8 !important; }
[class~="text-slate-400"], [class*="text-slate-400/"] { color: #64748b !important; }

[class~="bg-slate-50"], [class*="bg-slate-50/"] { background-color: rgba(255, 255, 255, 0.03) !important; }
[class~="bg-slate-100"], [class*="bg-slate-100/"] { background-color: rgba(255, 255, 255, 0.05) !important; }
[class~="bg-slate-200"], [class*="bg-slate-200/"] { background-color: rgba(255, 255, 255, 0.1) !important; }
[class~="bg-white"] { background-color: rgba(255, 255, 255, 0.02) !important; }
[class~="bg-white/80"] { background-color: rgba(255, 255, 255, 0.08) !important; }
[class~="bg-white/60"] { background-color: rgba(255, 255, 255, 0.06) !important; }
[class~="bg-white/50"] { background-color: rgba(255, 255, 255, 0.05) !important; }
[class~="bg-white/40"] { background-color: rgba(255, 255, 255, 0.04) !important; }

[class~="border-slate-50"], [class*="border-slate-50/"] { border-color: rgba(255, 255, 255, 0.03) !important; }
[class~="border-slate-100"], [class*="border-slate-100/"] { border-color: rgba(255, 255, 255, 0.05) !important; }
[class~="border-slate-200"], [class*="border-slate-200/"] { border-color: rgba(255, 255, 255, 0.1) !important; }
[class~="border-slate-300"], [class*="border-slate-300/"] { border-color: rgba(255, 255, 255, 0.15) !important; }
'''

if '/* ===== OVERRIDES DARK MODE (PREMIUM) ===== */' not in content:
    content += '\n' + overrides
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
