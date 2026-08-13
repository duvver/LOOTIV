import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("    , gameTables });", "      gameTables\n    });")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
