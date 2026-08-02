with open(r'lib\okey101Table.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove duplicate constructor properties if any
content = content.replace("    this.currentMinScore = OPEN_MIN;\n    this.currentMinCift = CIFT_MIN;\n    this.isKatlamali = true;\n    this.currentMinScore = OPEN_MIN;\n    this.currentMinCift = CIFT_MIN;", "    this.isKatlamali = true;\n    this.currentMinScore = OPEN_MIN;\n    this.currentMinCift = CIFT_MIN;")

content = content.replace("    this.currentMinScore = OPEN_MIN;\n    this.currentMinCift = CIFT_MIN;\n    this.isKatlamali = true;", "    this.isKatlamali = true;\n    this.currentMinScore = OPEN_MIN;\n    this.currentMinCift = CIFT_MIN;")

with open(r'lib\okey101Table.js', 'w', encoding='utf-8') as out:
    out.write(content)
print("Cleaned up duplicated lines.")
