import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace secure: true with secure: process.env.NODE_ENV === 'production'
content = re.sub(r'secure:\s*true\s*,', "secure: process.env.NODE_ENV === 'production',", content)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
