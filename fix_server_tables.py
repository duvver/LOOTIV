import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add gameTables to /admin render
content = re.sub(
    r"res\.render\('admin',\s*\{([\s\S]*?)\}\);",
    r"const gameTables = await db.getAllGameTables();\n      res.render('admin', {\1, gameTables });",
    content,
    count=1
)

# Add initSystemTables and admin routes
routes = '''
// ---- Admin Game Tables ----
async function initSystemTables() {
  try {
    // Sadece sistem odalarini temizle, kullanici odalarini koru
    for (const [id, room] of activeUserRooms.entries()) {
      if (room.isSystem) activeUserRooms.delete(id);
    }
    const tables = await db.getAllGameTables();
    for (const t of tables) {
      if (!t.is_active) continue;
      const roomId = 'sys_' + t.id;
      let tableInstance;
      if (t.game_slug === 'poker') tableInstance = new PokerTable({ buyIn: t.stake * 10, smallBlind: t.stake, bigBlind: t.stake * 2 });
      else if (t.game_slug === 'turkpoker') tableInstance = new TurkPokerTable({ buyIn: t.stake * 10, smallBlind: t.stake });
      else if (t.game_slug === 'okey') tableInstance = new OkeyTable();
      else if (t.game_slug === 'okey101') tableInstance = new Okey101Table();
      else continue;
      
      tableInstance.stake = t.stake;
      activeUserRooms.set(roomId, {
        id: roomId,
        game: t.game_slug,
        title: t.title,
        stake: t.stake,
        mode: 'Tekli',
        privacy: 'public',
        table: tableInstance,
        isSystem: true
      });
    }
  } catch (err) {
    console.error('Sistem masalari yuklenemedi', err);
  }
}
initSystemTables();

app.post('/admin/game_tables', requireAdmin, asyncHandler(async (req, res) => {
  const { game_slug, title, stake } = req.body;
  await db.addGameTable(game_slug, title, parseInt(stake, 10));
  await initSystemTables();
  res.redirect('/admin');
}));

app.post('/admin/game_tables/:id/delete', requireAdmin, asyncHandler(async (req, res) => {
  await db.deleteGameTable(req.params.id);
  await initSystemTables();
  res.redirect('/admin');
}));

app.post('/admin/game_tables/:id/toggle', requireAdmin, asyncHandler(async (req, res) => {
  await db.toggleGameTable(req.params.id);
  await initSystemTables();
  res.redirect('/admin');
}));

'''

if 'initSystemTables' not in content:
    content = content.replace('// ================= Admin paneli =================', routes + '\n// ================= Admin paneli =================')

# Prevent system tables from being deleted when empty
# checkUserRoomCleanup
content = content.replace(
    'if (humanCount === 0) {',
    'if (humanCount === 0 && !room.isSystem) {'
)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
