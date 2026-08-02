import re

with open(r'lib\okey101Table.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. startHand reset
content = content.replace("this.lastDiscard = null;", "this.lastDiscard = null;\n      this.lastDrawnDiscard = null;")

# 2. handleDraw save lastDrawnDiscard
draw_old = """      tile = this.lastDiscard.tile;
      const fromPile = this.discardPiles[this.lastDiscard.fromSeat];
      if (fromPile.length && fromPile[fromPile.length - 1].id === tile.id) fromPile.pop();
      this.lastDiscard = null;"""
draw_new = """      tile = this.lastDiscard.tile;
      const fromPile = this.discardPiles[this.lastDiscard.fromSeat];
      if (fromPile.length && fromPile[fromPile.length - 1].id === tile.id) fromPile.pop();
      this.lastDrawnDiscard = { tile: tile, fromSeat: this.lastDiscard.fromSeat, availableToSeat: this.lastDiscard.availableToSeat };
      this.lastDiscard = null;"""
content = content.replace(draw_old, draw_new)

# 3. getPublicState expose mustOpenThisTurn
state_old = """              leavingAfterHand: s.leavingAfterHand,
              extraPenalty: s.extraPenalty,"""
state_new = """              leavingAfterHand: s.leavingAfterHand,
              extraPenalty: s.extraPenalty,
              mustOpenThisTurn: s.mustOpenThisTurn,"""
content = content.replace(state_old, state_new)

# 4. handleUndoDraw insertion
undo_draw_func = """
  handleUndoDraw(userId) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.stage !== 'playing') return { error: 'El oynamiyor.' };
    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    if (!this.hasDrawn) return { error: 'Henuz tas cekmediniz.' };
    
    const seat = this.seats[idx];
    if (!seat.mustOpenThisTurn || !this.lastDrawnDiscard) {
        return { error: 'Sadece yerden cektiginiz tasi geri birakabilirsiniz.' };
    }
    
    const tileId = this.lastDrawnDiscard.tile.id;
    const tileIdx = seat.tiles.findIndex(t => t.id === tileId);
    if (tileIdx === -1) return { error: 'Cektiginiz tas ıstakanizda degil.' };
    
    const [tile] = seat.tiles.splice(tileIdx, 1);
    this.discardPiles[this.lastDrawnDiscard.fromSeat].push(tile);
    
    this.lastDiscard = this.lastDrawnDiscard;
    this.lastDrawnDiscard = null;
    
    seat.mustOpenThisTurn = false;
    this.hasDrawn = false;
    
    this.log(${seat.name} yerden aldigi tasi geri birakti.);
    this.emitUpdate();
    this.emitPrivateTiles();
    return { ok: true };
  }
"""
content = content.replace("  handleDiscard(userId, tileId) {", undo_draw_func + "\n  handleDiscard(userId, tileId) {")

with open(r'lib\okey101Table.js', 'w', encoding='utf-8') as out:
    out.write(content)

print("Backend patched for undoDraw.")
