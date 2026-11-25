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

const MEDIA_REGEX = /\.(jpe?g|png|webp|gif|mp4|webm|mov|quicktime|mkv|avi|m4v)$/i;

async function uploadMemories() {
  console.log('================================================================');
  console.log('✈️  SKYWARD AMBITION - ADMIN PHOTO & VIDEO PRE-LOADER');
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
            .filter(f => MEDIA_REGEX.test(f))
            .map(f => path.join(fullPath, f));
          filesToProcess.push(...innerFiles);
        } else if (MEDIA_REGEX.test(fullPath)) {
          filesToProcess.push(fullPath);
        }
      } else {
        console.warn(`[WARN] File not found: ${arg}`);
      }
    }
  } else {
    // Scan photos_to_upload directory
    const dropFiles = fs.readdirSync(DROP_FOLDER)
      .filter(f => MEDIA_REGEX.test(f))
      .map(f => path.join(DROP_FOLDER, f));
    filesToProcess.push(...dropFiles);
  }

  if (filesToProcess.length === 0) {
    console.log(`ℹ️  No photos or videos found to upload.`);
    console.log(`\n👉 HOW TO USE THIS SCRIPT:`);
    console.log(`   1. Drop your photo OR video files into:`);
    console.log(`      ${DROP_FOLDER}`);
    console.log(`      Supported: .jpg, .jpeg, .png, .webp, .mp4, .webm, .mov, .mkv, .avi`);
    console.log(`   2. Run: node upload_photos.js  (or node upload_memories.js)`);
    console.log(`\n   OR specify paths directly:`);
    console.log(`      node upload_photos.js "C:\\path\\to\\birthday_video.mp4"`);
    console.log(`      node upload_photos.js "C:\\Users\\ADMIN\\Pictures\\BirthdayMemories"`);
    console.log('================================================================');
    return;
  }

  console.log(`Found ${filesToProcess.length} media item(s) to pre-load into Memory Vault.\n`);

  const currentPhotos = loadPhotoMetadata();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/mp4'
  };

  const newItems = [];

  for (let idx = 0; idx < filesToProcess.length; idx++) {
    const srcPath = filesToProcess[idx];
    const originalName = path.basename(srcPath);
    const ext = path.extname(srcPath).toLowerCase();
    const mimeType = mimeMap[ext] || (ext.includes('mp4') || ext.includes('webm') || ext.includes('mov') ? 'video/mp4' : 'image/jpeg');
    const isVideo = mimeType.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(ext);
    const stat = fs.statSync(srcPath);
    const uniqueName = 'mem_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext;
    const destPath = path.join(PRIVATE_STORAGE_DIR, uniqueName);

    // Copy to private_uploads
    fs.copyFileSync(srcPath, destPath);

    const mediaItem = {
      id: (isVideo ? 'video_' : 'photo_') + Date.now() + '_' + idx,
      filename: uniqueName,
      originalName,
      mimeType,
      mediaType: isVideo ? 'video' : 'photo',
      isVideo,
      size: stat.size,
      caption: '',
      uploadedAt: new Date().toISOString(),
      order: currentPhotos.length + idx
    };

    newItems.push(mediaItem);

    // Insert into PostgreSQL database
    const dbSuccess = await db.insertPhotoToDb(mediaItem);
    const dbTag = dbSuccess ? '✓ DB Synced' : '⚠ DB Fallback';
    const typeTag = isVideo ? '📹 VIDEO' : '📷 PHOTO';
    console.log(`   + [${idx + 1}/${filesToProcess.length}] [${typeTag}] ${originalName} -> ${uniqueName} (${(stat.size / 1024 / 1024).toFixed(2)} MB) [${dbTag}]`);
  }

  const updatedMetadata = [...currentPhotos, ...newItems];
  savePhotoMetadata(updatedMetadata);

  console.log(`\n✓ Successfully pre-loaded ${newItems.length} media item(s).`);
  console.log(`📸 Total items in Memory Vault: ${updatedMetadata.length}`);
  console.log(`🔒 Media is stored in: ${PRIVATE_STORAGE_DIR}`);
  console.log(`🚀 These photos & videos will be revealed in the Memory Vault immediately when accessed.`);
  console.log('================================================================');
}

uploadMemories().then(() => process.exit(0)).catch(err => {
  console.error('Upload script error:', err);
  process.exit(1);
});
