with open('views/settings-profile.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

import re
matches = re.findall(r'<% if.*?%>', content)
print("If matches:", [m for m in matches if 'if' in m])
