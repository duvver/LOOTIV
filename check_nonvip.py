import re

with open('views/settings-profile.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the block starting with <% } else { %> and replacing it
pattern = re.compile(r'(<% } else { %>\s*<!-- VIP Aktifle.*?)(<% } %>)', re.DOTALL)
matches = pattern.findall(content)
print("Found matches:", len(matches))
if len(matches) > 0:
    print("Match length:", len(matches[0][0]))
