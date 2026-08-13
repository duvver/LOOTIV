with open('views/settings-profile.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<a href="/market"', '<a href="/vip"')

with open('views/settings-profile.ejs', 'w', encoding='utf-8') as f:
    f.write(content)
