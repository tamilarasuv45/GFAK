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

// Copy memories directory if it exists
const srcMemories = path.join(srcDir, 'memories');
const destMemories = path.join(destDir, 'memories');
if (fs.existsSync(srcMemories)) {
  if (!fs.existsSync(destMemories)) {
    fs.mkdirSync(destMemories, { recursive: true });
  }
  const files = fs.readdirSync(srcMemories);
  for (const file of files) {
    fs.copyFileSync(path.join(srcMemories, file), path.join(destMemories, file));
  }
}

console.log('Build completed successfully: public/ -> build/');
