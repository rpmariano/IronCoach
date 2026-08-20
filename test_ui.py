# -*- coding: utf-8 -*-
import os
import re

# 1. Fix Layout.jsx
layout_path = r'src\components\Layout\Layout.jsx'
with open(layout_path, 'r', encoding='utf-8') as f:
    content = f.read()
# Remove background inline style
content = content.replace("style={{ background: 'var(--page-bg)' }}", "")
with open(layout_path, 'w', encoding='utf-8') as f:
    f.write(content)

# 2. Fix App.jsx and Auth.jsx
for path in [r'src\App.jsx', r'src\components\Auth\Auth.jsx']:
    if not os.path.exists(path): continue
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace("bg-[var(--page-bg)]", "bg-transparent")
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# 3. Move dots inside in Home.jsx
home_path = r'src\components\Home\Home.jsx'
with open(home_path, 'r', encoding='utf-8') as f:
    content = f.read()

# NextRaceCard dots
content = content.replace(
'''    <div className="flex flex-col gap-3 relative">
      <div ''',
'''    <div className="relative">
      <div ''')

content = content.replace(
'''      {upcoming.length > 1 && (
        <div className="flex justify-center pt-2">
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/5 shadow-sm px-2 py-1.5 rounded-full">''',
'''      {upcoming.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/5 shadow-sm px-2 py-1.5 rounded-full pointer-events-auto">''')

# NutritionWaterCarousel dots
content = content.replace(
'''    <div className="flex flex-col gap-2 relative">
      <div''',
'''    <div className="relative">
      <div''')

content = content.replace(
'''    <div className="flex flex-col gap-2">
      <div
        ref={scrollRef}''',
'''    <div className="relative">
      <div
        ref={scrollRef}''')

content = content.replace(
'''      <div className="flex justify-center">
        <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/5 shadow-sm px-2 py-1.5 rounded-full">''',
'''      <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-10">
        <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/5 shadow-sm px-2 py-1.5 rounded-full pointer-events-auto">''')

# Fix previous comment block in Home.jsx that said why dots were outside
content = re.sub(r'\{\/\* Pontos fora do cart.*? \*\/\}', '', content, flags=re.DOTALL)

with open(home_path, 'w', encoding='utf-8') as f:
    f.write(content)

# 4. Add bottom padding to cards
css_files = [
    r'src\components\GraphicsLibrary\NextRaceCard.css',
    r'src\components\GraphicsLibrary\HydrationOptionA.css',
    r'src\components\GraphicsLibrary\NutritionOptionA.css'
]
for css in css_files:
    if not os.path.exists(css): continue
    with open(css, 'r', encoding='utf-8') as f:
        css_content = f.read()
    # Replace padding: 24px; with padding: 24px 24px 44px 24px;
    css_content = css_content.replace('padding: 24px;', 'padding: 24px 24px 44px 24px;')
    with open(css, 'w', encoding='utf-8') as f:
        f.write(css_content)

