# -*- coding: utf-8 -*-
import os
import glob

chart_files = glob.glob(r'C:\Users\rpmar\IronHealth-antigravity\src\components\BI\*Chart.jsx')
chart_files.extend(glob.glob(r'C:\Users\rpmar\IronHealth-antigravity\src\components\BI\*Donut.jsx'))

for filepath in chart_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace light-mode chart config with dark-mode
    content = content.replace("'#0f172a'", "'#f8fafc'")
    content = content.replace("'#1e293b'", "'#f1f5f9'")
    content = content.replace("'rgba(0,0,0,0.1)'", "'rgba(255,255,255,0.15)'")
    content = content.replace("'rgba(0, 0, 0, 0.1)'", "'rgba(255, 255, 255, 0.15)'")
    content = content.replace("'rgba(0,0,0,0.05)'", "'rgba(255,255,255,0.05)'")
    content = content.replace("'rgba(0, 0, 0, 0.05)'", "'rgba(255, 255, 255, 0.05)'")
    content = content.replace("backgroundColor: 'rgba(255, 255, 255, 0.9)'", "backgroundColor: 'rgba(15, 23, 42, 0.9)'")
    content = content.replace("backgroundColor: 'rgba(255,255,255,0.9)'", "backgroundColor: 'rgba(15, 23, 42, 0.9)'")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
