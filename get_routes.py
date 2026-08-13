with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()
import re
routes = re.findall(r"app\.get\(['\"]([^'\"]+)['\"]", content)
print('GET Routes:')
for r in routes:
    print(r)
