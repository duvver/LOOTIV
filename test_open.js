const Okey101Table = require('./lib/okey101Table');
const table = new Okey101Table('test', { id: 1, rumuz: 'p1' }, () => {}, () => {});
table.addBot(); table.addBot(); table.addBot();
table.startGame();

// Find p1's seat
const seat = table.seats[0];

// Give them a valid hand > 101
seat.tiles = [
  { id: 100, color: 'black', number: 10, joker: false },
  { id: 101, color: 'black', number: 11, joker: false },
  { id: 102, color: 'black', number: 12, joker: false },
  { id: 103, color: 'red', number: 13, joker: false },
  { id: 104, color: 'yellow', number: 13, joker: false },
  { id: 105, color: 'black', number: 13, joker: false },
  { id: 106, color: 'black', number: 7, joker: false },
  { id: 107, color: 'red', number: 7, joker: false },
  { id: 108, color: 'yellow', number: 7, joker: false },
  { id: 109, color: 'blue', number: 7, joker: false },
  { id: 110, color: 'black', number: 1, joker: false } // leftover to discard
];
// total sum: (10+11+12=33) + (13*3=39) + (7*4=28) = 100
// Wait, 100 < 101! So this would fail. Let's add more:
seat.tiles.push({ id: 111, color: 'red', number: 8, joker: false });
seat.tiles.push({ id: 112, color: 'red', number: 9, joker: false });
seat.tiles.push({ id: 113, color: 'red', number: 10, joker: false });
// + 27 = 127 total.

// Make sure it's their turn
table.turnSeat = 0;
table.hasDrawn = true;

const groups = [
  [100, 101, 102],
  [103, 104, 105],
  [106, 107, 108, 109],
  [111, 112, 113]
];

console.log('Testing open...');
const result = table.handleOpen(1, 'seri', groups);
console.log(result);
