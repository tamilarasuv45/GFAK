require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db.js');

const PRIVATE_STORAGE_DIR = path.join(__dirname, 'private_uploads');
const METADATA_FILE = path.join(PRIVATE_STORAGE_DIR, 'metadata.json');
const DROP_FOLDER = path.join(__dirname, 'photos_to_upload');

if (!fs.existsSync(PRIVATE_STORAGE_DIR)) {
  fs.mkdirSync(PRIVATE_STORAGE_DIR, { recursive: true });
}
if (!fs.existsSync(DROP_FOLDER)) {
  fs.mkdirSync(DROP_FOLDER, { recursive: true });
}

function loadPhotoMetadata() {
  try {
    if (fs.existsSync(METADATA_FILE)) {
      return JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading metadata:', err);
  }
  return [];
}

function savePhotoMetadata(data) {
  fs.writeFileSync(METADATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function uploadPhotos() {
  console.log('================================================================');
  console.log('✈️  SKYWARD AMBITION - ADMIN PHOTO PRE-LOADER');
  console.log('================================================================\n');

  // Connect to Supabase DB
  await db.initDatabase();

  const args = process.argv.slice(2);
  let filesToProcess = [];

  if (args.length > 0) {
    // Process paths passed as CLI arguments
    for (const arg of args) {
      const fullPath = path.resolve(arg);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const innerFiles = fs.readdirSync(fullPath)
            .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
            .map(f => path.join(fullPath, f));
          filesToProcess.push(...innerFiles);
        } else if (/\.(jpe?g|png|webp)$/i.test(fullPath)) {
          filesToProcess.push(fullPath);
        }
      } else {
        console.warn(`[WARN] File not found: ${arg}`);
      }
    }
  } else {
    // Scan photos_to_upload directory
    const dropFiles = fs.readdirSync(DROP_FOLDER)
      .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
      .map(f => path.join(DROP_FOLDER, f));
    filesToProcess.push(...dropFiles);
  }

  if (filesToProcess.length === 0) {
    console.log(`ℹ️  No photos found to upload.`);
    console.log(`\n👉 HOW TO USE THIS SCRIPT:`);
    console.log(`   1. Drop your photo files (.jpg, .jpeg, .png, .webp) into:`);
    console.log(`      ${DROP_FOLDER}`);
    console.log(`   2. Run: node upload_photos.js`);
    console.log(`\n   OR specify paths directly:`);
    console.log(`      node upload_photos.js "C:\\path\\to\\my_photo.jpg"`);
    console.log(`      node upload_photos.js "C:\\Users\\ADMIN\\Pictures\\Birthday"`);
    console.log('================================================================');
    return;
  }

  console.log(`Found ${filesToProcess.length} photograph(s) to pre-load into Memory Vault.\n`);

  const currentPhotos = loadPhotoMetadata();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  };

  const newItems = [];

  for (let idx = 0; idx < filesToProcess.length; idx++) {
    const srcPath = filesToProcess[idx];
    const originalName = path.basename(srcPath);
    const ext = path.extname(srcPath).toLowerCase();
    const mimeType = mimeMap[ext] || 'image/jpeg';
    const stat = fs.statSync(srcPath);
    const uniqueName = 'mem_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext;
    const destPath = path.join(PRIVATE_STORAGE_DIR, uniqueName);

    // Copy to private_uploads
    fs.copyFileSync(srcPath, destPath);

    const photoItem = {
      id: 'photo_' + Date.now() + '_' + idx,
      filename: uniqueName,
      originalName,
      mimeType,
      size: stat.size,
      caption: '',
      uploadedAt: new Date().toISOString(),
      order: currentPhotos.length + idx
    };

    newItems.push(photoItem);

    // Insert into PostgreSQL database
    const dbSuccess = await db.insertPhotoToDb(photoItem);
    const dbTag = dbSuccess ? '✓ DB Synced' : '⚠ DB Fallback';
    console.log(`   + [${idx + 1}/${filesToProcess.length}] ${originalName} -> ${uniqueName} (${(stat.size / 1024).toFixed(1)} KB) [${dbTag}]`);
  }

  const updatedMetadata = [...currentPhotos, ...newItems];
  savePhotoMetadata(updatedMetadata);

  console.log(`\n✓ Successfully pre-loaded ${newItems.length} photograph(s).`);
  console.log(`📸 Total photos in Memory Vault: ${updatedMetadata.length}`);
  console.log(`🔒 Photos are stored in: ${PRIVATE_STORAGE_DIR}`);
  console.log(`🚀 These photos will be revealed in the Memory Vault immediately when the website launches at midnight on 26 November 2026.`);
  console.log('================================================================');
}

uploadPhotos().then(() => process.exit(0)).catch(err => {
  console.error('Upload script error:', err);
  process.exit(1);
});
