const Item = require('./Item');

class Weapon extends Item {
  get currentAttributes() {
    const attrs = { ...this.baseAttributes };

    // Each upgrade level increases attack power
    if (attrs.attack !== undefined) {
      attrs.attack = Number(attrs.attack) + (this.upgradeLevel * 5);
    }

    // Maybe critical chance increases slightly per 3 levels
    if (attrs.crit_chance !== undefined) {
      attrs.crit_chance = Number(attrs.crit_chance) + Math.floor(this.upgradeLevel / 3);
    }

    return attrs;
  }
}

module.exports = Weapon;
