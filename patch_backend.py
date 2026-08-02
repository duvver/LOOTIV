import re

with open(r'lib\okey101Table.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Constructor
constructor_addition = """    this.isKatlamali = true;
    this.currentMinScore = OPEN_MIN;
    this.currentMinCift = CIFT_MIN;"""
content = re.sub(r'(this\.lastHandSummary = null;)', r'\1\n' + constructor_addition, content)

# 2. Sit
content = re.sub(
    r'(openKind: null,.*?\n\s*)(leavingAfterHand: false,)',
    r'\1\2\n      extraPenalty: 0,\n      mustOpenThisTurn: false,',
    content,
    flags=re.DOTALL
)

# 3. AddBot
content = re.sub(
    r'(openKind: null,.*?\n\s*)(leavingAfterHand: false,)',
    r'\1\2\n      extraPenalty: 0,\n      mustOpenThisTurn: false,',
    content,
    count=2, # make sure we hit addbot too
    flags=re.DOTALL
)

# 4. startHand
starthand_addition = """      seat.extraPenalty = 0;
      seat.mustOpenThisTurn = false;"""
content = re.sub(r'(seat\.openKind = null;)', r'\1\n' + starthand_addition, content)

starthand_globals = """    this.currentMinScore = OPEN_MIN;
    this.currentMinCift = CIFT_MIN;"""
content = re.sub(r'(this\.lastHandSummary = null;)', r'\1\n' + starthand_globals, content)


# 5. handleDraw
draw_old = """    if (source === 'discard') {
      if (!seat.hasOpened) {
        return { error: 'Atilan tasi alabilmek icin once elinizi acmis olmaniz gerekir.' };
      }
      if (!this.lastDiscard || this.lastDiscard.availableToSeat !== idx) {"""
draw_new = """    if (source === 'discard') {
      if (!this.lastDiscard || this.lastDiscard.availableToSeat !== idx) {
        return { error: 'Alabileceginiz atilmis tas yok.' };
      }
      if (!seat.hasOpened) {
        seat.mustOpenThisTurn = true;
      }"""
content = content.replace(draw_old, draw_new)


# 6. handleOpen (Katlamali logic)
open_seri_old = """      if (total < OPEN_MIN) {
        return { error: Acilis icin en az  gerekli. Gruplarinizin toplami: . };
      }
      seat.openKind = 'seri';"""
open_seri_new = """      if (total < this.currentMinScore) {
        return { error: Acilis icin en az  gerekli. Gruplarinizin toplami: . };
      }
      if (this.isKatlamali) this.currentMinScore = total + 1;
      seat.openKind = 'seri';"""
content = content.replace(open_seri_old, open_seri_new)

open_cift_old = """      if (validated.length < CIFT_MIN) {
        return { error: Cift acilisi icin en az  cift gerekli. Gonderilen: . };
      }
      seat.openKind = 'cift';"""
open_cift_new = """      if (validated.length < this.currentMinCift) {
        return { error: Cift acilisi icin en az  cift gerekli. Gonderilen: . };
      }
      if (this.isKatlamali) this.currentMinCift = validated.length + 1;
      seat.openKind = 'cift';"""
content = content.replace(open_cift_old, open_cift_new)


# 7. handleDiscard (Isler tas / okey atma cezasi)
discard_old = """    const [tile] = seat.tiles.splice(tileIdx, 1);
    const nextSeat = this.nextOccupiedSeat(idx);
    this.lastDiscard = { tile, fromSeat: idx, availableToSeat: nextSeat };
    this.discardPiles[idx].push(tile);
    this.log(${seat.name}  atti.);"""

discard_new = """    const [tile] = seat.tiles.splice(tileIdx, 1);
    const nextSeat = this.nextOccupiedSeat(idx);
    this.lastDiscard = { tile, fromSeat: idx, availableToSeat: nextSeat };
    this.discardPiles[idx].push(tile);
    this.log(${seat.name}  atti.);

    let isPenalty = false;
    let penaltyReason = '';
    if (logic.isWild(tile, this.okeySpec)) {
        isPenalty = true;
        penaltyReason = 'Okey attigi icin';
    } else {
        for (const m of this.boardMelds) {
            if (m.kind === 'seri' && logic.canProcessSeri(m, tile, this.okeySpec)) {
                isPenalty = true;
                penaltyReason = 'Isler tas attigi icin';
                break;
            } else if (m.kind === 'per' && logic.canProcessPer(m, tile, this.okeySpec)) {
                isPenalty = true;
                penaltyReason = 'Isler tas attigi icin';
                break;
            }
        }
    }
    
    if (seat.mustOpenThisTurn && !seat.hasOpened) {
        isPenalty = true;
        penaltyReason = (penaltyReason ? penaltyReason + ' ve ' : '') + 'Yerden tas alip acamadigi icin';
    }
    
    if (isPenalty) {
        seat.extraPenalty = (seat.extraPenalty || 0) + 101;
        this.log(${seat.name}  101 ceza yedi.);
    }
    seat.mustOpenThisTurn = false;
"""
content = content.replace(discard_old, discard_new)

# 8. computePenalties
penalty_old = """        penalty: logic.penaltyOf(s.tiles, this.okeySpec),"""
penalty_new = """        penalty: logic.penaltyOf(s.tiles, this.okeySpec) + (s.extraPenalty || 0),"""
content = content.replace(penalty_old, penalty_new)

# 9. Public state
state_old = """      openMin: OPEN_MIN,
      ciftMin: CIFT_MIN,"""
state_new = """      openMin: this.currentMinScore,
      ciftMin: this.currentMinCift,
      isKatlamali: this.isKatlamali,"""
content = content.replace(state_old, state_new)

seat_state_old = """              leavingAfterHand: s.leavingAfterHand,"""
seat_state_new = """              leavingAfterHand: s.leavingAfterHand,
              extraPenalty: s.extraPenalty,"""
content = content.replace(seat_state_old, seat_state_new)

with open(r'lib\okey101Table.js', 'w', encoding='utf-8') as out:
    out.write(content)

print("okey101Table.js patched successfully.")
