const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'public');
const destDir = path.join(__dirname, 'build');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(
  path.join(srcDir, 'index.html'),
  path.join(destDir, 'index.html')
);

console.log('Build completed successfully: public/index.html -> build/index.html');
