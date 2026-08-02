import re

with open(r'public\css\okey101.css', 'r', encoding='utf-8') as f:
    css = f.read()

css = re.sub(r'\n\s*\n\s*\n', '\n\n', css)

# 1. Update .ok1-tablewrap
css = re.sub(
    r'\.ok1-tablewrap\s*\{[^}]*\}',
    '.ok1-tablewrap {\n  width: 100%;\n  max-width: 1050px;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}',
    css
)

# 2. Update .ok1-felt
css = re.sub(
    r'\.ok1-felt\s*\{[^{]*?radial-gradient[^{]*?\}',
    '.ok1-felt {\n  position: relative;\n  border-radius: 14px;\n  min-height: 480px;\n  background:\n    radial-gradient(circle at 50% 45%, #1a6a88, var(--ok1-felt) 62%, var(--ok1-felt-deep));\n  border: 3px solid #0a2331;\n  box-shadow: inset 0 0 60px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.4);\n}',
    css
)

# 3. Update .ok1-gridbg
css = re.sub(
    r'\.ok1-gridbg\s*\{[^}]*\}',
    '.ok1-gridbg {\n  position: absolute;\n  left: 0; right: 0; top: 0; bottom: 0;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  z-index: 1;\n}',
    css
)

# 4. Update .play-area
css = re.sub(
    r'\.play-area\s*\{[^}]*\}',
    '.play-area {\n  display: flex;\n  gap: 15px;\n  position: relative;\n  align-items: center;\n  justify-content: center;\n  transform: scale(0.88);\n}',
    css
)

# 5. Update .game-modes-panel
css = re.sub(
    r'\.game-modes-panel\s*\{[^}]*\}',
    '.game-modes-panel {\n  display: flex;\n  flex-direction: column;\n  justify-content: center;\n  align-items: center;\n  gap: 10px;\n  margin-bottom: 20px;\n}',
    css
)

# 6. Update .okey-seat-pos-X
css = re.sub(
    r'\.ok1-body \.okey-seat-pos-1\s*\{[^}]*\}',
    '.ok1-body .okey-seat-pos-1 { left: 4%; top: 50%; }',
    css
)
css = re.sub(
    r'\.ok1-body \.okey-seat-pos-2\s*\{[^}]*\}',
    '.ok1-body .okey-seat-pos-2 { left: 50%; top: 6%; }',
    css
)
css = re.sub(
    r'\.ok1-body \.okey-seat-pos-3\s*\{[^}]*\}',
    '.ok1-body .okey-seat-pos-3 { left: 96%; top: 50%; }',
    css
)
css = re.sub(
    r'\.ok1-body \.okey-seat-pos-0\s*\{[^}]*\}',
    '.ok1-body .okey-seat-pos-0 { left: 50%; top: 92%; }',
    css
)

# 7. Update .game-info-panel
css = re.sub(
    r'\.game-info-panel\s*\{[^}]*\}',
    '.game-info-panel {\n  display: flex;\n  flex-direction: column;\n  justify-content: center;\n  align-items: center;\n  gap: 15px;\n  width: 140px;\n}',
    css
)

with open(r'public\css\okey101.css', 'w', encoding='utf-8') as out:
    out.write(css)

print("CSS updated successfully via script.")
