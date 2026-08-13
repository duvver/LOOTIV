import re

with open('lib/pokerTable.js', 'r') as f:
    content = f.read()

# Remove const SEATS = 6;
content = re.sub(r'const SEATS = 6;\n?', '', content)

# Change constructor
content = content.replace('constructor() {', 'constructor(config) {')
content = content.replace('this.seats = new Array(SEATS).fill(null);', 'this.seatsCount = (config && config.seatsCount) || 4;\n    this.seats = new Array(this.seatsCount).fill(null);')

# Replace all SEATS
content = re.sub(r'\bSEATS\b', 'this.seatsCount', content)

# Fix module.exports
content = content.replace('module.exports = { PokerTable, this.seatsCount, BUY_IN, SMALL_BLIND, BIG_BLIND };', 'module.exports = { PokerTable, BUY_IN, SMALL_BLIND, BIG_BLIND };')

with open('lib/pokerTable.js', 'w') as f:
    f.write(content)
