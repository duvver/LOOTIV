const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let content = fs.readFileSync(file, 'utf8');

// The auto-sit logic should go inside socket.on('turkpoker:state', (state) => { ... })
// After lastState = state;
content = content.replace(
  /socket\.on\('turkpoker:state', \(state\) => \{\s*lastState = state;/,
  `socket.on('turkpoker:state', (state) => {
    lastState = state;
    
    // Auto-sit if not watching and not already seated
    if (!window.isWatchMode) {
      const isSeated = state.seats.some(s => s && s.userId === CURRENT_USER_ID);
      if (!isSeated) {
        const firstEmptyIndex = state.seats.findIndex(s => s === null);
        if (firstEmptyIndex !== -1) {
          socket.emit('turkpoker:sit', { seatIndex: firstEmptyIndex });
        }
      }
    }`
);

fs.writeFileSync(file, content);
console.log("Added auto-sit logic to turkpoker.js");
