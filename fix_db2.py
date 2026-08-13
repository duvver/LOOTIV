import re

with open('lib/db.js', 'r', encoding='utf-8') as f:
    content = f.read()

funcs = '''
async function getAllGameTables() {
  const res = await pool.query('SELECT * FROM game_tables ORDER BY game_slug, stake ASC');
  return res.rows;
}

async function addGameTable(game_slug, title, stake) {
  const res = await pool.query(
    'INSERT INTO game_tables (game_slug, title, stake) VALUES (, , ) RETURNING *',
    [game_slug, title, stake]
  );
  return res.rows[0];
}

async function deleteGameTable(id) {
  await pool.query('DELETE FROM game_tables WHERE id = ', [id]);
}

async function toggleGameTable(id) {
  await pool.query('UPDATE game_tables SET is_active = NOT is_active WHERE id = ', [id]);
}
'''

if 'getAllGameTables' not in content:
    # insert before module.exports
    content = content.replace('module.exports = {', funcs + '\nmodule.exports = {')
    
    # insert into module.exports
    content = content.replace('module.exports = {', 'module.exports = {\n  getAllGameTables,\n  addGameTable,\n  deleteGameTable,\n  toggleGameTable,')
    
    with open('lib/db.js', 'w', encoding='utf-8') as f:
        f.write(content)
