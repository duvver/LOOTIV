import re

# Fix db.js
with open('lib/db.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'CREATE TABLE IF NOT EXISTS "session" \([\s\S]*?\);\n \(\n      "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,\n      "sess" json NOT NULL,\n      "expire" timestamp\(6\) NOT NULL\n    \);',
    '''CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_tables (
      id SERIAL PRIMARY KEY,
      game_slug VARCHAR(50) NOT NULL,
      title VARCHAR(100) NOT NULL,
      stake INTEGER NOT NULL DEFAULT 1000,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );''',
    content
)

with open('lib/db.js', 'w', encoding='utf-8') as f:
    f.write(content)

# Fix server.js scope issue
with open('server.js', 'r', encoding='utf-8') as f:
    server_content = f.read()

# Extract initSystemTables block
match = re.search(r'// ---- Admin Game Tables ----\nasync function initSystemTables\(\) \{[\s\S]*?initSystemTables\(\);\n', server_content)
if match:
    block = match.group(0)
    server_content = server_content.replace(block, '')
    # Insert it after activeUserRooms definition
    server_content = server_content.replace('const activeUserRooms = new Map();', 'const activeUserRooms = new Map();\n\n' + block)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(server_content)

