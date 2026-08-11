# 101 Okey (Yüzbir) - Technical Implementation Checklist

This checklist breaks down the granular technical tasks required to transition the game engine from a standard Okey format to a true "101 Okey" (Yüzbir) variant.

## 1. Game Logic (`lib/okey101Logic.js`)

- [x] **Meld Validation:** Implement a function to verify if a given group of tiles is a valid set (Seri: same color, consecutive numbers; Per: different colors, same number).
- [x] **Point Calculation:** Create a function to calculate the numeric sum of a valid meld.
- [x] **Opening (Açma) Validation:** Implement logic to sum all submitted melds and verify they meet or exceed the 101 point threshold.
- [x] **Pair Opening (Çift Açma):** Implement logic to verify if a user is trying to open with pairs, and ensure they have the minimum required pairs (usually 5 pairs).
- [x] **Adding Tiles (İşleme):** Write a function to check if a single tile can be legally appended/prepended to an existing meld on the board.
- [x] **Okey (Joker) Behavior:** Ensure Okey logic allows it to substitute any tile in a board meld, and define its point value correctly during calculation.
- [x] **Okey Swap (Okey Değiştirme):** Implement logic allowing a player to replace an Okey on the board with the actual tile it represents.
- [x] **Penalty (Ceza) Rules:** Implement penalty calculations (e.g., +101 for discarding a playable tile, +101 for remaining unopened when someone finishes, finishing with an Okey).
- [x] **End Game Scoring:** Calculate the final balance based on tiles remaining in hand, applied penalties, and the winner's finish type (normal, pair, okey throw).

## 2. Backend & Socket State (`lib/okey101Table.js`, `server.js`)

- [x] **Shared Board State:** Add a `tableMelds` property to the game state to store all sets opened by players.
- [x] **Socket Event: `okey:open_hand`:**
  - Receive an array of sets from the client.
  - Validate them using `okeyLogic`.
  - Deduct the tiles from the player's hand.
  - Add the sets to `tableMelds`.
  - Broadcast the updated board to all clients.
- [x] **Socket Event: `okey:add_tile` (İşleme):**
  - Receive a tile, target meld ID, and placement position.
  - Validate the move.
  - Update `tableMelds` and the player's hand.
  - Broadcast the update.
- [x] **Socket Event: `okey:swap_okey`:**
  - Receive the tile to swap and the target meld.
  - Validate, perform the swap in memory, and broadcast.
- [x] **State Synchronization:** Ensure the `game_state` payload sent to reconnecting players includes the full `tableMelds` array.
- [x] **Turn Timeout Handling:** Update AFK/Timeout logic to penalize players appropriately if they timeout without discarding.
- [x] **Pair Constraint Enforcement:** If a player opens with pairs, enforce the rule that restricts how they can draw or add to the board going forward.

## 3. UI & Frontend (`views/okey101.ejs`, `public/js/okey101.js`)

- [x] **Table Board Component:** Design and build a new UI area in the center of the table to visually render `tableMelds` for all players to see.
- [x] **Selection & Open Action:** Allow players to select multiple groups of tiles on their rack and add a prominent "Aç" (Open) button to submit them to the server.
- [x] **Drag & Drop for İşleme:** Extend existing drag-and-drop to allow dragging a tile from the rack directly onto a meld in the Table Board area.
- [ ] **Valid Drop Highlights:** Visually highlight valid melds on the board when a player is dragging a tile that can legally be added.
- [x] **Okey Swap Interaction:** Build the drag interaction for swapping an Okey on the board.
- [ ] **Penalty Indicators:** Add a small UI badge near each player's avatar showing their accumulated penalty points in the current round.
- [ ] **Error Notifications (Toast):** Show clear visual feedback if an opening attempt is rejected by the server (e.g., "Puanınız 101'e ulaşmıyor"). (Basic alerts exist, but no nice toast UI).
- [ ] **Advanced End Game Modal:** Overhaul the game-over screen to show a detailed breakdown: Points left in hand, Penalties applied, Total Score, and Final LT balance changes.
