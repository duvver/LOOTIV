const fs = require('fs');

function cleanLogs(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const keptKeywords = ['masaya oturdu', 'masadan kalkti', 'kalkacak', 'cikarildi', 'bakiyesi yetersiz'];
  
  let inMultiLineLog = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (inMultiLineLog) {
      lines[i] = '// ' + line;
      if (line.includes(');')) {
        inMultiLineLog = false;
      }
      continue;
    }

    if (line.includes('this.log(')) {
      const isKept = keptKeywords.some(kw => line.includes(kw));
      if (!isKept) {
        lines[i] = '// ' + line;
        if (!line.includes(');')) {
          inMultiLineLog = true;
        }
      }
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

cleanLogs('C:\\Users\\eness\\Desktop\\LOOTIV\\lib\\Okey101Table.js');
cleanLogs('C:\\Users\\eness\\Desktop\\LOOTIV\\lib\\OkeyTable.js');
