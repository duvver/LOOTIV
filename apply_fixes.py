import re

with open(r'public\css\okey101.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Fix 1: pointer-events for seats so they don't block deck clicks
if '.okey-seats { position: absolute; inset: 0; z-index: 2; pointer-events: none; }' not in css:
    css = css.replace(
        '.okey-seats { position: absolute; inset: 0; z-index: 2; }',
        '.okey-seats { position: absolute; inset: 0; z-index: 2; pointer-events: none; }'
    )
    if '{ pointer-events: auto; }' not in css.split('.okey-seat ')[-1]:
        css += '\n.okey-seat { pointer-events: auto; }\n'

# Fix 2 & 3: Corners z-index and tile sizes
if 'z-index: 15;' not in css.split('.okey-corner {')[1]:
    css = css.replace(
        '.okey-corner {\n\n  position: absolute;\n\n  width: 50px; height: 64px;',
        '.okey-corner {\n  position: absolute;\n  z-index: 15;\n  width: 60px; height: 74px;'
    )
    
css += '\n.okey-corner .okey-tile { transform: scale(1.1); }\n'

# Fix 4: Indicator size
css += '\n.okey-indicator .okey-tile { transform: scale(1.4); }\n'
css += '\n.okey-deck { z-index: 15; position: relative; }\n'
css += '\n.game-info-panel { z-index: 15; position: relative; }\n'

with open(r'public\css\okey101.css', 'w', encoding='utf-8') as out:
    out.write(css)

print("Applied 4 requested fixes to CSS.")
