# -*- coding: utf-8 -*-
import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\lib\chartSetup.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

setup = '''
ChartJS.defaults.color = '#cbd5e1';
ChartJS.defaults.font.family = 'ui-sans-serif, system-ui, sans-serif';
ChartJS.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
ChartJS.defaults.scale.ticks.color = '#94a3b8';
'''

if 'ChartJS.defaults.color' not in content:
    content = content.replace('export default ChartJS;', setup + '\nexport default ChartJS;')
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
