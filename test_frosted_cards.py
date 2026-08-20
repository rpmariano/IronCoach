import os

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
        
    # Replace solid grey dark glass with frosted low-opacity white glass
    content = content.replace('background: rgba(30, 30, 32, 0.65);', 'background: rgba(255, 255, 255, 0.06);')
    content = content.replace('box-shadow: 0 10px 40px rgba(0,0,0,0.05)', 'box-shadow: 0 16px 40px rgba(0,0,0,0.3)')
    content = content.replace('box-shadow: 0 10px 40px rgba(0, 0, 0, 0.05)', 'box-shadow: 0 16px 40px rgba(0,0,0,0.3)')
    
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
