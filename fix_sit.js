const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/lib/turkPokerTable.js';
let content = fs.readFileSync(file, 'utf8');

// The faulty code in sit:
// if (!isBot && db.startGameSession) {
//    db.startGameSession(userId, 'turkpoker', this.roomId || 'default', stack).then(id => {
//       const s = this.seats.find(x => x && x.userId === userId);
//       if (s) s.sessionId = id;
//    });
// }

content = content.replace(
  /if \(!isBot && db\.startGameSession\) \{\s*db\.startGameSession\(userId, 'turkpoker', this\.roomId \|\| 'default', stack\)\.then\(id => \{\s*const s = this\.seats\.find\(x => x && x\.userId === userId\);\s*if \(s\) s\.sessionId = id;\s*\}\);\s*\}/g,
  `if (db.startGameSession) {
      db.startGameSession(user.id, 'turkpoker', this.roomId || 'default', this.buyIn).then(id => {
          const s = this.seats.find(x => x && x.userId === user.id);
          if (s) s.sessionId = id;
      }).catch(err => console.error("Game session error:", err));
  }`
);

fs.writeFileSync(file, content);
console.log("Fixed sit reference error");
