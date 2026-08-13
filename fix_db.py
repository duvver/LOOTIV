import re

with open('lib/db.js', 'r', encoding='utf-8') as f:
    content = f.read()

table_sql = '''
    CREATE TABLE IF NOT EXISTS game_tables (
      id SERIAL PRIMARY KEY,
      game_slug VARCHAR(50) NOT NULL,
      title VARCHAR(100) NOT NULL,
      stake INTEGER NOT NULL DEFAULT 1000,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
'''

# Add after CREATE TABLE IF NOT EXISTS "session"
if 'CREATE TABLE IF NOT EXISTS game_tables' not in content:
    content = content.replace(
        'CREATE TABLE IF NOT EXISTS "session"',
        'CREATE TABLE IF NOT EXISTS "session" (\n      "sid" varchar NOT NULL COLLATE "default",\n      "sess" json NOT NULL,\n      "expire" timestamp(6) NOT NULL,\n      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")\n    );\n' + table_sql
    )
    with open('lib/db.js', 'w', encoding='utf-8') as f:
        f.write(content)
