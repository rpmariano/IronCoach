import os
import re

files = [
    r'src\components\GraphicsLibrary\NextRaceCard.css',
    r'src\components\GraphicsLibrary\HydrationOptionA.css',
    r'src\components\GraphicsLibrary\NutritionOptionA.css',
    r'src\components\Home\CoachDailySummaryCard.css',
    r'src\components\Home\WeeklyPlanCard.css'
]

for f_path in files:
    full_path = os.path.join(r'C:\Users\rpmar\IronHealth-antigravity', f_path)
    if not os.path.exists(full_path): continue
    
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Replace white glass with dark glass
    content = content.replace('background: rgba(255, 255, 255, 0.4);', 'background: rgba(30, 30, 32, 0.65);')
    content = content.replace('border: 1px solid rgba(255, 255, 255, 0.8);', 'border: 1px solid rgba(255, 255, 255, 0.15);')
    content = content.replace('inset 0 2px 10px rgba(255, 255, 255, 0.6)', 'inset 0 1px 1px rgba(255, 255, 255, 0.15)')
    content = content.replace('inset 0 2px 10px rgba(255,255,255,0.6)', 'inset 0 1px 1px rgba(255, 255, 255, 0.15)')
    
    # Text colors
    content = content.replace('color: #1e293b;', 'color: #f8fafc;')
    content = content.replace('color: #0f172a;', 'color: #f8fafc;')
    content = content.replace('color: #64748b;', 'color: #94a3b8;')
    content = content.replace('color: #475569;', 'color: #cbd5e1;')
    
    # Progress bar backgrounds
    content = content.replace('background: rgba(0,0,0,0.05);', 'background: rgba(255,255,255,0.1);')
    content = content.replace('background: rgba(0, 0, 0, 0.05);', 'background: rgba(255, 255, 255, 0.1);')
    content = content.replace('background: rgba(0,0,0,0.1);', 'background: rgba(255,255,255,0.15);')
    
    # Traffic lights container
    content = content.replace('background: rgba(255,255,255,0.4);', 'background: rgba(255,255,255,0.1);')
    
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
