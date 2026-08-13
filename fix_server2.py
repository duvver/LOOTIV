import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

correct_footer = '''// ================= GÜNLÜK GÖREV SIFIRLAMA KONTROLÜ =================
let lastCheckedDate = new Date().toDateString();
setInterval(async () => {
  const currentDate = new Date().toDateString();
  if (currentDate !== lastCheckedDate) {
    lastCheckedDate = currentDate;
    try {
      await db.clearNonFixedDailyTasks();
    } catch (err) {
      console.error('Günlük görevleri temizlerken hata:', err);
    }
  }
}, 60 * 1000); // Her dakika kontrol et

db.init()
  .then(() => {
    server.listen(PORT, () => {
      console.log('Sunucu calisiyor: port ' + PORT);
    });
  })
  .catch((err) => {
    writeStartupLog('Veritabani baslatilamadi', err);
    process.exit(1);
  });
'''

# Find the start of the footer and slice off the corrupted rest
index = content.find('// ================= GÜNLÜK GÖREV SIFIRLAMA KONTROLÜ =================')
if index != -1:
    content = content[:index] + correct_footer
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed server.js")
else:
    print("Could not find footer")
