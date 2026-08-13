const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const startMarker = "    const currentTable101 = currentRoom ? currentRoom.table : okey101Table;";
const endMarker = "    socket.on('chat:message', async (payload) => {";

const startIdx = code.indexOf(startMarker);
const endIdx = code.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error("Markers not found!");
  process.exit(1);
}

const blockToExtract = code.substring(startIdx, endIdx);

const eventsToRemove = [
  'okey101:addbot', 'okey101:chat_message', 'okey101:discard', 'okey101:draw',
  'okey101:emote', 'okey101:fillbots', 'okey101:gift', 'okey101:join_random',
  'okey101:leave_table', 'okey101:open', 'okey101:process', 'okey101:removebots',
  'okey101:request_freeze', 'okey101:request_sync', 'okey101:send_like',
  'okey101:showIndicator', 'okey101:sit', 'okey101:stand', 'okey101:swapJoker',
  'okey101:undoDraw', 'okey:addbot', 'okey:discard', 'okey:draw', 'okey:emote',
  'okey:fillbots', 'okey:finish', 'okey:gift', 'okey:removebots', 'okey:sit',
  'okey:stand', 'table:action', 'table:emote', 'table:gift', 'table:sit', 'table:stand',
  'turkpoker:sit', 'turkpoker:stand', 'turkpoker:action', 'turkpoker:draw', 'turkpoker:addbot',
  'turkpoker:removebots', 'turkpoker:gift', 'turkpoker:emote'
];

let removeStr = eventsToRemove.map(e => `  socket.removeAllListeners('${e}');`).join('\n');

const newFunction = `
function setupGameHandlers(socket, user, game, reqRoomId) {
${removeStr}

  const currentRoom = reqRoomId ? activeUserRooms.get(reqRoomId) : null;
${blockToExtract}
}
`;

const replaceWith = `
    // Call it initially
    setupGameHandlers(socket, user, game, reqRoomId);
    
    // Allow dynamic joining
    socket.on('game:join', (payload) => {
        if (!payload || !payload.game) return;
        const newGame = payload.game;
        const newRoomId = payload.roomId || null;
        
        socket.join(newGame);
        if (newRoomId) socket.join(newRoomId);
        
        // Setup handlers for the new game context
        setupGameHandlers(socket, user, newGame, newRoomId);
    });

`;

let before = code.substring(0, startIdx);
let after = code.substring(endIdx);

fs.writeFileSync('server.js', before + replaceWith + newFunction + after);
console.log("Refactored successfully");
