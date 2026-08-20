import os

files = [
    r'src\components\GraphicsLibrary\NextRaceCard.css',
    r'src\components\GraphicsLibrary\HydrationOptionA.css',
    r'src\components\GraphicsLibrary\NutritionOptionA.css'
]

fixes = '''  transform: translateZ(0);
  -webkit-transform: translateZ(0);
  -webkit-mask-image: -webkit-radial-gradient(white, black);'''

for f_path in files:
    full_path = os.path.join(r'C:\Users\rpmar\IronHealth-antigravity', f_path)
    if not os.path.exists(full_path): continue
    
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Find border-radius: 28px; and append the fixes
    content = content.replace('border-radius: 28px;', 'border-radius: 28px;\n' + fixes)
    
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
