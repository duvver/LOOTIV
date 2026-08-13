const fs = require('fs');
let code = fs.readFileSync('views/salon.ejs', 'utf8');

// Insert showGame and showLobby before </script>
const endScript = '    })();\n  </script>';

const functions = `
      // SPA Navigation functions
      window.showGame = function(roomId, gameSlug) {
         document.getElementById('tables-view').classList.add('hidden');
         document.getElementById('game-container').classList.remove('hidden');
         
         // Hide active players section to expand
         const activePlayers = document.getElementById('active-players-section');
         if (activePlayers) activePlayers.classList.add('hidden');

         // Update tabs UI
         document.getElementById('tab-lobi').classList.remove('text-white', 'border-white', 'bg-white/10');
         document.getElementById('tab-lobi').classList.add('text-white/60', 'border-transparent', 'hover:text-white', 'hover:bg-white/5');
         
         const tabMasa = document.getElementById('tab-masa');
         tabMasa.classList.remove('hidden', 'text-white/60', 'border-transparent', 'hover:text-white', 'hover:bg-white/5');
         tabMasa.classList.add('text-white', 'border-white', 'bg-white/10', 'flex');
         
         const masaTitle = document.getElementById('tab-masa-title');
         if (masaTitle) masaTitle.textContent = 'Masa ' + roomId.slice(0,6);

         // Show Masa Sohbeti tab
         const chatTabMasa = document.getElementById('chat-tab-masa');
         if (chatTabMasa) {
           chatTabMasa.classList.remove('hidden');
           window.switchChatTab('masa'); // Assuming this function exists or we write it
         }

         // Emit dynamic join
         if (window.lobbySocket) {
             window.lobbySocket.emit('game:join', { game: gameSlug || '<%= meta.slug %>', roomId: roomId });
             // Emitting join random if needed, but game:join handles backend state.
             // We also need to emit sit if the user just created the room.
         }
      };

      window.showLobby = function() {
         document.getElementById('tables-view').classList.remove('hidden');
         document.getElementById('game-container').classList.add('hidden');
         
         const activePlayers = document.getElementById('active-players-section');
         if (activePlayers) activePlayers.classList.remove('hidden');

         // Update tabs UI
         document.getElementById('tab-lobi').classList.remove('text-white/60', 'border-transparent', 'hover:text-white', 'hover:bg-white/5');
         document.getElementById('tab-lobi').classList.add('text-white', 'border-white', 'bg-white/10');
         
         const tabMasa = document.getElementById('tab-masa');
         tabMasa.classList.remove('text-white', 'border-white', 'bg-white/10');
         tabMasa.classList.add('hidden');
         
         const chatTabMasa = document.getElementById('chat-tab-masa');
         if (chatTabMasa) chatTabMasa.classList.add('hidden');
         window.switchChatTab('genel');
         
         if (window.lobbySocket) {
             // Leave room logic on backend if necessary, or just rejoin lobby context
             window.lobbySocket.emit('game:join', { game: 'salon_<%= meta.slug %>' });
         }
      };
`;

code = code.replace(endScript, functions + '\n' + endScript);

// Update create-confirm-btn to call showGame instead of redirect
code = code.replace(
  'window.location.href = data.playUrl;',
  `window.showGame(data.roomId || data.playUrl.split('roomId=')[1].split('&')[0], '<%= meta.slug %>');`
);

// Update "Otur" button in renderRoomsList
code = code.replace(
  `'<button type="button" onclick="showGame(\\'' + escapeHtml(room.id) + '\\')" class="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm">' +`,
  `'<button type="button" onclick="showGame(\\'' + escapeHtml(room.id) + '\\', \\'<%= meta.slug %>\\')" class="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm">' +`
);

fs.writeFileSync('views/salon.ejs', code);
console.log("Patched salon.ejs");
