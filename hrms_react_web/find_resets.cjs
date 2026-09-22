const fs = require('fs');
const content = fs.readFileSync('src/pages/Attendance.tsx', 'utf8');
const lines = content.split('\n');

// Find all setManualEntry({ blocks that span multiple lines
let inBlock = false;
let blockStart = -1;
let braceCount = 0;
const blocks = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('setManualEntry({') && !line.includes('setManualEntry({ ...manualEntry')) {
    inBlock = true;
    blockStart = i;
    braceCount = 0;
    // Count braces in this line
    for (const ch of line) {
      if (ch === '{') braceCount++;
      if (ch === '}') braceCount--;
    }
    if (braceCount === 0) {
      blocks.push({ start: blockStart + 1, end: i + 1, length: 1 });
      inBlock = false;
    }
  } else if (inBlock) {
    for (const ch of line) {
      if (ch === '{') braceCount++;
      if (ch === '}') braceCount--;
    }
    if (braceCount <= 0) {
      blocks.push({ start: blockStart + 1, end: i + 1, length: i - blockStart + 1 });
      inBlock = false;
    }
  }
}

console.log(`Found ${blocks.length} inline reset blocks:`);
blocks.forEach(b => console.log(`  Lines ${b.start}-${b.end} (${b.length} lines)`));
