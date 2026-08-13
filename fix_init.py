import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the standalone initSystemTables() call
content = content.replace('initSystemTables();\n\napp.post(', 'app.post(')

# Add it after db.init()
content = content.replace(
    "console.log('Veritabani basariyla baglandi ve tablolar hazir.');",
    "console.log('Veritabani basariyla baglandi ve tablolar hazir.');\n  initSystemTables();"
)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

