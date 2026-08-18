const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/lib/turkPokerTable.js';
let content = fs.readFileSync(file, 'utf8');

// The faulty code in addBot:
// this.log(`${name} (bot) masaya oturdu.`);
// this.emitUpdate();
// if (!isBot && db.startGameSession) {
//    db.startGameSession(userId, 'turkpoker', this.roomId || 'default', stack).then(id => {
//       const s = this.seats.find(x => x && x.userId === userId);
//       if (s) s.sessionId = id;
//    });
// }
// this.maybeScheduleStart();
// return { ok: true };

// Let's replace the if (!isBot && db.startGameSession) block with nothing, 
// because bots don't need a game session.

content = content.replace(/if \(!isBot && db\.startGameSession\) \{[\s\S]*?\}\s*this\.maybeScheduleStart\(\);/m, 'this.maybeScheduleStart();');

fs.writeFileSync(file, content);
console.log("Fixed addBot reference error");
