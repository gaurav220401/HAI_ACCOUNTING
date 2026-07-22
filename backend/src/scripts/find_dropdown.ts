import fs from 'fs';
import path from 'path';

const filePath = path.join(__dirname, '../../../client/app/sales/invoices/[id]/edit/page.tsx');
const code = fs.readFileSync(filePath, 'utf-8');
const lines = code.split('\n');

console.log("Searching for select in invoices/[id]/edit/page.tsx...");
lines.forEach((line, i) => {
  if (line.includes('select') || line.includes('Select') || line.includes('item') || line.includes('Item')) {
    if (line.includes('item') || line.includes('Item') || line.includes('select') || line.includes('Select')) {
      console.log(`Line ${i + 1}: ${line.trim()}`);
    }
  }
});
