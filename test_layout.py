import os

filepath = r'C:\Users\rpmar\IronHealth-antigravity\src\components\Layout\Layout.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Bottom Nav Bar
content = content.replace('bg-white border-t border-slate-200/80 shadow-lg', 'bg-black/40 backdrop-blur-2xl border-t border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]')
# Top Profile Chip
content = content.replace('bg-white border border-slate-200/80 shadow-md', 'bg-white/10 backdrop-blur-xl border border-white/10 shadow-[0_4px_15px_rgba(0,0,0,0.3)] text-slate-100')
# Top Status Icons
content = content.replace('text-slate-600', 'text-slate-300')
content = content.replace('text-slate-700', 'text-slate-100')
content = content.replace('text-slate-500', 'text-slate-300')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
