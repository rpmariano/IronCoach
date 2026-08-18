# -*- coding: utf-8 -*-
import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\components\Dashboard\Dashboard.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('bg-white/40 backdrop-blur-[20px] border border-white/80', 'bg-white/5 backdrop-blur-[20px] border border-white/10')
content = content.replace('shadow-[0_10px_40px_rgba(0,0,0,0.05),inset_0_2px_10px_rgba(255,255,255,0.6)]', 'shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.15)]')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
