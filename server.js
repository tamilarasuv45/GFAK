require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db.js');
const emailService = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --------------------------------------------------------------------------
// 0. AUTHORITATIVE LAUNCH GATE (26 NOVEMBER 2026, 12:00:00 AM IST)
// --------------------------------------------------------------------------
// Exact UTC launch timestamp: 2026-11-25T18:30:00.000Z
const LAUNCH_TIMESTAMP_UTC = '2026-11-25T18:30:00.000Z';
const LAUNCH_TIMESTAMP_MS = new Date(LAUNCH_TIMESTAMP_UTC).getTime();

function getLaunchStatus() {
  const now = Date.now();
  const isLaunched = now >= LAUNCH_TIMESTAMP_MS;
  const remainingMs = Math.max(0, LAUNCH_TIMESTAMP_MS - now);
  const remainingSeconds = Math.floor(remainingMs / 1000);
  return {
    isLaunched,
    status: isLaunched ? 'LAUNCHED' : 'PRE_LAUNCH_LOCKED',
    code: isLaunched ? 'ACCESS_GRANTED' : 'LAUNCH_PENDING',
    launchTimeUtc: LAUNCH_TIMESTAMP_UTC,
    launchTimeIst: '26 November 2026, 12:00:00 AM IST',
    serverTimeUtc: new Date(now).toISOString(),
    serverTimeIst: new Date(now).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' IST',
    remainingMs,
    remainingSeconds,
    countdown: {
      days: Math.floor(remainingSeconds / 86400),
      hours: Math.floor((remainingSeconds % 86400) / 3600),
      minutes: Math.floor((remainingSeconds % 3600) / 60),
      seconds: remainingSeconds % 60
    }
  };
}

function requireLaunchGate(req, res, next) {
  const status = getLaunchStatus();
  if (!status.isLaunched) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(403).json({
      error: 'Access Restricted: Website scheduled for launch on 26 November 2026 at 12:00 AM IST.',
      ...status,
      code: 'PRE_LAUNCH_LOCKED'
    });
  }
  next();
}

// Public Launch Status endpoint (never cached, server-authoritative)
app.get('/api/launch/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({
    success: true,
    ...getLaunchStatus()
  });
});

// --------------------------------------------------------------------------
// 1. PIN SECURITY CONFIGURATION (SALTED CRYPTOGRAPHIC HASHES)
// --------------------------------------------------------------------------
// Sensitive PINs are NEVER stored in plaintext. Salted hashes only.
const GATE1_SALT = 'skyward_gate1_salt_';
const GATE1_HASH = 'f3410752dc225b2cb16b8bc51f38f92d66764d5a4278970a0ab8a41586f65d98';

const GATE2_SALT = 'skyward_gate2_salt_';
const GATE2_HASH = 'ad49c2d276bf9aab8351c2ca282c5eae6bcdbed0e9c2e6c9275a1b8cb5ea6ee4';

function hashPin(salt, pin) {
  return crypto.createHash('sha256').update(salt + String(pin).trim()).digest('hex');
}

function verifyPinSafe(candidatePin, salt, expectedHash) {
  const candidateHash = hashPin(salt, candidatePin);
  const bufA = Buffer.from(candidateHash, 'hex');
  const bufB = Buffer.from(expectedHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// --------------------------------------------------------------------------
// 2. PUZZLE CRYPTOGRAPHIC VERIFICATION DEFINITIONS
// --------------------------------------------------------------------------
const PUZZLE_SALT = 'skyward_puzzle_salt_';
const PUZZLE_DEFINITIONS = {
  1: {
    hash: '1808e9369b4fcb1d486081bc5d29e233a930d795e063940e0a258f1cb27a8b3c', // RUDRA
    word: 'COURAGE',
    title: 'The Beginning',
    explanation: 'By strict logical deduction: Bhavna = 36,000 ft (Garuda, Vampires), Arjun = 32,000 ft (Rudra, Cobras), Chetan = 28,000 ft (Astra, Tigers), and Diya = 40,000 ft (Trishul, Falcons). The pilot flying at 32,000 ft is Arjun with call-sign Rudra.'
  },
  2: {
    hash: 'feba63da53d39e04bf7a93a0d8e4f9cf8bb5428c4c509ce372175b3f1b1cf5ce', // CHITRA
    word: 'DREAM',
    title: 'Roots of Tirunelveli',
    explanation: 'Farooq (1) sits opposite Aarthi (4). Bala (6) sits to Farooq\'s right, and Dinesh (3) sits opposite Bala. Ezhil (2) sits between Farooq and Dinesh. This leaves Chitra at position 5, directly opposite Ezhil.'
  },
  3: {
    hash: 'aa5ba51a215373e33b627d7463f828fff7fd1d8469c2ae3ad80af795de58e816', // THISSKYISYOURRUNWAY
    word: 'FLIGHT',
    title: 'The Sky Was Never the Limit',
    explanation: 'Using the classical tactical Caesar cipher with a shift of 3 (W→T, K→H, L→I, V→S), the intercepted transmission decodes perfectly to: "THIS SKY IS YOUR RUNWAY".'
  },
  4: {
    hash: '872a02fbf86108392e6f73fa33b174cafdecb5c91fa33ed1327e47b8c9f2dc8b', // 735
    word: 'STRENGTH',
    title: 'A Mind Full of Possibilities',
    explanation: 'The altitude vector formula multiplies each number by 3, then subtracts consecutive odd numbers: (4×3-1=11), (11×3-3=30), (30×3-5=85), (85×3-7=248). The next altitude is 248×3 - 9 = 735.'
  },
  5: {
    hash: 'ce2b130487cf14cc8382ed2ac1776c41a58b8f6ef2af28194635a9984ab5b542', // TRUEDEPTH
    word: 'INSPIRE',
    title: 'A Taste of Her World',
    explanation: 'Subtracting the offset of 3 from each number reveals their alphabet index: 20-18-21-5 spells "TRUE" and 4-5-16-20-8 spells "DEPTH", honoring her defining essence: "TRUE DEPTH".'
  },
  6: {
    hash: 'e00beb8ae61c9feb61cd6cb645bbab578934581370e72d229c7eb81b12dc1ded', // MIG29
    word: 'ADMIRE',
    title: 'Memories',
    explanation: 'Reconstructing the schedule: Rao flew Tejas (Mon, 10:00), Kulkarni flew Mirage (Tue, 07:00), Sharma flew Rafale (Wed, 06:00), Varma flew MiG-29 (Thu, 08:00), and Menon flew Sukhoi (Fri, 09:00). Captain Varma flew the MiG-29.'
  }
};

function normalizePuzzleAnswer(answer) {
  return String(answer || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function verifyPuzzleAnswer(chapterNum, candidateAnswer) {
  const def = PUZZLE_DEFINITIONS[chapterNum];
  if (!def) return false;
  const normalized = normalizePuzzleAnswer(candidateAnswer);
  const candidateHash = crypto.createHash('sha256').update(PUZZLE_SALT + normalized).digest('hex');
  const bufA = Buffer.from(candidateHash, 'hex');
  const bufB = Buffer.from(def.hash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// --------------------------------------------------------------------------
// 3. SESSION TOKEN MANAGEMENT & STORYBOOK PROGRESS
// --------------------------------------------------------------------------
const sessions = {
  gate1: new Map(), // token -> { createdAt, expiresAt, unlockedChapter: 1, discoveredWords: [] }
  gate2: new Map()  // token -> { createdAt, expiresAt, gate1Token }
};

function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [token, data] of sessions.gate1.entries()) {
    if (data.expiresAt < now) sessions.gate1.delete(token);
  }
  for (const [token, data] of sessions.gate2.entries()) {
    if (data.expiresAt < now) sessions.gate2.delete(token);
  }
}
setInterval(cleanExpiredSessions, 15 * 60 * 1000);

function authenticateGate1(req, res, next) {
  const token = req.headers['x-gate1-token'] || req.query.gate1Token;
  if (!token || !sessions.gate1.has(token)) {
    return res.status(401).json({ error: 'Unauthorized: Gate 1 clearance required.' });
  }
  const session = sessions.gate1.get(token);
  if (session.expiresAt < Date.now()) {
    sessions.gate1.delete(token);
    return res.status(401).json({ error: 'Session expired. Please re-enter Gate 1 PIN.' });
  }
  req.sessionGate1 = session;
  req.gate1Token = token;
  next();
}

function authenticateGate2(req, res, next) {
  const token = req.headers['x-gate2-token'] || req.query.token;
  if (!token || !sessions.gate2.has(token)) {
    return res.status(401).json({ error: 'Unauthorized: Gate 2 Memory Vault clearance required.' });
  }
  const session = sessions.gate2.get(token);
  if (session.expiresAt < Date.now()) {
    sessions.gate2.delete(token);
    return res.status(401).json({ error: 'Gallery session expired. Please re-enter Gate 2 PIN.' });
  }
  req.gate2Token = token;
  next();
}

// --------------------------------------------------------------------------
// 4. PRIVATE PHOTO STORAGE & METADATA
// --------------------------------------------------------------------------
const PRIVATE_STORAGE_DIR = path.join(__dirname, 'private_uploads');
const METADATA_FILE = path.join(PRIVATE_STORAGE_DIR, 'metadata.json');

if (!fs.existsSync(PRIVATE_STORAGE_DIR)) {
  fs.mkdirSync(PRIVATE_STORAGE_DIR, { recursive: true });
}

function loadPhotoMetadata() {
  try {
    if (fs.existsSync(METADATA_FILE)) {
      return JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading photo metadata:', err);
  }
  return [];
}

function savePhotoMetadata(data) {
  fs.writeFileSync(METADATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PRIVATE_STORAGE_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = 'mem_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and WEBP images are supported.'));
    }
  }
});

// --------------------------------------------------------------------------
// 5. AUTHENTICATION & STORYBOOK ENDPOINTS
// --------------------------------------------------------------------------

// Gate 1: Air Defense Clearance
app.post('/api/auth/gate1', requireLaunchGate, (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN is required' });

  const isValid = verifyPinSafe(pin, GATE1_SALT, GATE1_HASH);
  if (!isValid) return res.status(401).json({ error: 'Incorrect PIN. Please try again.' });

  const token = generateSecureToken();
  const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
  sessions.gate1.set(token, {
    createdAt: Date.now(),
    expiresAt,
    unlockedChapter: 1,
    discoveredWords: []
  });

  res.json({
    success: true,
    message: 'Gate 1 clearance granted. Welcome Ma\'am.',
    token,
    expiresAt,
    unlockedChapter: 1,
    discoveredWords: []
  });
});

// Gate 2: Classified Memories Vault
app.post('/api/auth/gate2', requireLaunchGate, (req, res) => {
  const { pin, gate1Token } = req.body;
  if (!gate1Token || !sessions.gate1.has(gate1Token)) {
    return res.status(401).json({ error: 'Gate 1 clearance required before accessing Memory Vault.' });
  }
  if (!pin) return res.status(400).json({ error: 'Secondary PIN is required.' });

  const isValid = verifyPinSafe(pin, GATE2_SALT, GATE2_HASH);
  if (!isValid) return res.status(401).json({ error: 'Incorrect PIN. Access restricted.' });

  const token = generateSecureToken();
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  sessions.gate2.set(token, { createdAt: Date.now(), expiresAt, gate1Token });

  res.json({
    success: true,
    message: 'Gate 2 clearance granted. Private Memories unlocked.',
    token,
    expiresAt
  });
});

// Verify Session Status
app.get('/api/auth/verify', requireLaunchGate, (req, res) => {
  const gate1Token = req.headers['x-gate1-token'];
  const gate2Token = req.headers['x-gate2-token'];

  const gate1Valid = Boolean(gate1Token && sessions.gate1.has(gate1Token) && sessions.gate1.get(gate1Token).expiresAt > Date.now());
  const gate2Valid = Boolean(gate2Token && sessions.gate2.has(gate2Token) && sessions.gate2.get(gate2Token).expiresAt > Date.now());

  let progress = { unlockedChapter: 1, discoveredWords: [] };
  if (gate1Valid) {
    const s = sessions.gate1.get(gate1Token);
    progress = { unlockedChapter: s.unlockedChapter, discoveredWords: s.discoveredWords };
  }

  res.json({
    gate1: gate1Valid,
    gate2: gate2Valid,
    ...progress
  });
});

// Storybook Progress
app.get('/api/storybook/progress', requireLaunchGate, authenticateGate1, (req, res) => {
  res.json({
    unlockedChapter: req.sessionGate1.unlockedChapter,
    discoveredWords: req.sessionGate1.discoveredWords
  });
});

// Storybook Verify Chapter Puzzle
app.post('/api/storybook/verify-chapter', requireLaunchGate, authenticateGate1, (req, res) => {
  const { chapter, answer } = req.body;
  const chapterNum = parseInt(chapter, 10);

  if (!chapterNum || chapterNum < 1 || chapterNum > 6) {
    return res.status(400).json({ error: 'Invalid chapter number.' });
  }

  // Ensure user cannot skip chapters
  if (chapterNum > req.sessionGate1.unlockedChapter) {
    return res.status(403).json({ error: 'This chapter is currently locked. Solve previous chapters first.' });
  }

  const isCorrect = verifyPuzzleAnswer(chapterNum, answer);
  if (!isCorrect) {
    return res.status(400).json({
      success: false,
      error: 'Incorrect answer. Analyze the clues carefully and try again.'
    });
  }

  const def = PUZZLE_DEFINITIONS[chapterNum];
  const nextChapter = Math.max(req.sessionGate1.unlockedChapter, chapterNum + 1);
  req.sessionGate1.unlockedChapter = nextChapter;

  if (!req.sessionGate1.discoveredWords.includes(def.word)) {
    req.sessionGate1.discoveredWords.push(def.word);
  }

  res.json({
    success: true,
    secretWord: def.word,
    explanation: def.explanation,
    unlockedChapter: nextChapter,
    discoveredWords: req.sessionGate1.discoveredWords
  });
});

// Storybook Reset Progress to Chapter 1
app.post('/api/storybook/reset', requireLaunchGate, authenticateGate1, (req, res) => {
  req.sessionGate1.unlockedChapter = 1;
  req.sessionGate1.discoveredWords = [];
  res.json({
    success: true,
    message: 'Storybook progress reset to Chapter 1. All subsequent chapters locked.',
    unlockedChapter: 1,
    discoveredWords: []
  });
});

// --------------------------------------------------------------------------
// 6. PRIVATE PHOTO GALLERY ENDPOINTS (AUTHENTICATED)
// --------------------------------------------------------------------------
app.get('/api/gallery/photos', requireLaunchGate, authenticateGate2, async (req, res) => {
  let photos = await db.getPhotosFromDb();
  if (!photos || photos.length === 0) {
    photos = loadPhotoMetadata();
  }
  res.json({ success: true, photos });
});

app.post('/api/gallery/upload', requireLaunchGate, authenticateGate2, upload.array('photos', 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'No image files provided.' });

    const currentPhotos = loadPhotoMetadata();
    const newItems = files.map((file, idx) => ({
      id: 'photo_' + Date.now() + '_' + idx,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      caption: '',
      uploadedAt: new Date().toISOString(),
      order: currentPhotos.length + idx
    }));

    const updated = [...currentPhotos, ...newItems];
    savePhotoMetadata(updated);

    // Persist new photos to PostgreSQL Database
    for (const item of newItems) {
      await db.insertPhotoToDb(item);
    }

    res.json({
      success: true,
      message: `${files.length} photo(s) added to the private memory vault.`,
      photos: updated
    });
  } catch (err) {
    console.error('Upload processing error:', err);
    res.status(500).json({ error: 'Failed to process photo upload.' });
  }
});

// Admin Pre-Launch Photo Upload Endpoint (Requires Gate 1 or Gate 2 PIN verification)
app.post('/api/admin/upload-photos', upload.array('photos', 50), async (req, res) => {
  try {
    const adminPin = req.headers['x-admin-pin'] || req.body.adminPin;
    const isGate1 = adminPin && verifyPinSafe(adminPin, GATE1_SALT, GATE1_HASH);
    const isGate2 = adminPin && verifyPinSafe(adminPin, GATE2_SALT, GATE2_HASH);

    if (!isGate1 && !isGate2) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Admin Clearance PIN.' });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No photo files provided.' });
    }

    const currentPhotos = loadPhotoMetadata();
    const newItems = files.map((file, idx) => ({
      id: 'photo_' + Date.now() + '_' + idx,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      caption: '',
      uploadedAt: new Date().toISOString(),
      order: currentPhotos.length + idx
    }));

    const updated = [...currentPhotos, ...newItems];
    savePhotoMetadata(updated);

    for (const item of newItems) {
      await db.insertPhotoToDb(item);
    }

    res.json({
      success: true,
      message: `${files.length} photograph(s) successfully pre-loaded into the Memory Vault.`,
      uploadedCount: files.length,
      totalPhotos: updated.length,
      photos: newItems
    });
  } catch (err) {
    console.error('Admin photo upload error:', err);
    res.status(500).json({ error: 'Failed to process admin photo upload.' });
  }
});

app.get('/api/admin/photos-count', (req, res) => {
  const photos = loadPhotoMetadata();
  res.json({ count: photos.length });
});

app.get('/api/gallery/photo/:id', requireLaunchGate, authenticateGate2, (req, res) => {
  const photos = loadPhotoMetadata();
  const photo = photos.find(p => p.id === req.params.id);
  if (!photo) return res.status(404).send('Photo not found.');

  const filePath = path.join(PRIVATE_STORAGE_DIR, photo.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Photo file is missing.');

  res.setHeader('Content-Type', photo.mimeType);
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  fs.createReadStream(filePath).pipe(res);
});

// --------------------------------------------------------------------------
// 6.3 SQUADRON AUDIO/VIDEO RECORDING STUDIO (SUPABASE STORAGE + DB)
// --------------------------------------------------------------------------
const RECORDINGS_DIR = path.join(PRIVATE_STORAGE_DIR, 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

const RECORDINGS_META_FILE = path.join(PRIVATE_STORAGE_DIR, 'recordings_metadata.json');

function loadLocalRecordings() {
  try {
    if (fs.existsSync(RECORDINGS_META_FILE)) {
      return JSON.parse(fs.readFileSync(RECORDINGS_META_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading recordings metadata:', e);
  }
  return [];
}

function saveLocalRecording(item) {
  try {
    const list = loadLocalRecordings().filter(r => r.id !== item.id);
    list.unshift(item);
    fs.writeFileSync(RECORDINGS_META_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving local recording:', e);
  }
}

function removeLocalRecording(id) {
  try {
    const list = loadLocalRecordings().filter(r => r.id !== id);
    fs.writeFileSync(RECORDINGS_META_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error deleting local recording:', e);
  }
}

const recUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }
});

// 1. Start a new recording session
app.post('/api/recordings/start-session', requireLaunchGate, async (req, res) => {
  try {
    const { recordingId, userId, fileName, mimeType, cameraLabel, micLabel } = req.body || {};
    const id = recordingId || crypto.randomUUID();
    const folderName = (userId && typeof userId === 'string' && userId.length === 36) ? userId : 'guest_salutes';
    const storagePath = `${folderName}/${id}/final.webm`;

    // Ensure session directory exists locally
    const sessionDir = path.join(RECORDINGS_DIR, folderName, id);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const sessionData = {
      id,
      userId: folderName === 'guest_salutes' ? null : userId,
      sessionId: id,
      fileName: fileName || `salute_${Date.now()}.webm`,
      storagePath,
      mimeType: mimeType || 'video/webm',
      cameraLabel: cameraLabel || '',
      micLabel: micLabel || ''
    };

    let session = await db.startRecordingSession(sessionData);
    if (!session) {
      session = {
        ...sessionData,
        status: 'recording',
        totalChunks: 0,
        uploadedChunks: 0,
        createdAt: new Date().toISOString()
      };
    }

    saveLocalRecording(session);
    res.json({ success: true, session });
  } catch (err) {
    console.error('start-session error:', err);
    res.status(500).json({ error: 'Failed to initialize recording session.' });
  }
});

// 2. Automatic periodic chunk upload (~5000ms timeslice)
app.post('/api/recordings/chunk', requireLaunchGate, recUpload.single('chunk'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No video chunk data provided.' });
    }

    const { recordingId, chunkNumber, userId } = req.body;
    if (!recordingId || !chunkNumber) {
      return res.status(400).json({ error: 'recordingId and chunkNumber are required.' });
    }

    const seq = parseInt(chunkNumber, 10);
    const chunkFileName = `chunk-${String(seq).padStart(4, '0')}.webm`;
    const folderName = (userId && typeof userId === 'string' && userId.length === 36) ? userId : 'guest_salutes';
    const storagePath = `${folderName}/${recordingId}/${chunkFileName}`;
    const mimeType = req.file.mimetype || 'video/webm';

    // A. Save chunk locally
    const sessionDir = path.join(RECORDINGS_DIR, folderName, recordingId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const localChunkPath = path.join(sessionDir, chunkFileName);
    fs.writeFileSync(localChunkPath, req.file.buffer);

    // B. Upload chunk to Supabase Storage
    await db.uploadToSupabaseStorage('birthday-recordings', storagePath, req.file.buffer, mimeType);

    // C. Insert chunk into PostgreSQL database table birthday_recording_chunks
    const chunkRow = await db.insertRecordingChunk({
      recordingId,
      chunkNumber: seq,
      storagePath,
      fileSize: req.file.size,
      mimeType
    });
    await db.updateRecordingHeartbeat(recordingId).catch(() => {});

    res.json({
      success: true,
      chunkNumber: seq,
      storagePath,
      fileSize: req.file.size,
      chunkId: chunkRow?.id || null
    });
  } catch (err) {
    console.error('chunk upload error:', err);
    res.status(500).json({ error: 'Failed to store video chunk.' });
  }
});

// 3. Finalize recording and reconstruct unified video
app.post('/api/recordings/finalize', requireLaunchGate, recUpload.single('fullVideo'), async (req, res) => {
  try {
    const { recordingId, durationSeconds, userId, totalChunks } = req.body;
    if (!recordingId) {
      return res.status(400).json({ error: 'recordingId is required to finalize.' });
    }

    const duration = Math.round(Number(durationSeconds) || 0);
    const folderName = (userId && typeof userId === 'string' && userId.length === 36) ? userId : 'guest_salutes';
    const sessionDir = path.join(RECORDINGS_DIR, folderName, recordingId);
    const finalLocalPath = path.join(sessionDir, 'final.webm');
    const finalStoragePath = `${folderName}/${recordingId}/final.webm`;
    const mimeType = 'video/webm';

    let finalBuffer = null;

    // A. If client provided the unified video buffer directly, use it
    if (req.file && req.file.buffer && req.file.buffer.length > 0) {
      finalBuffer = req.file.buffer;
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      fs.writeFileSync(finalLocalPath, finalBuffer);
    } else if (fs.existsSync(sessionDir)) {
      // B. Reconstruct from sequentially ordered local chunks
      const files = fs.readdirSync(sessionDir)
        .filter(f => f.startsWith('chunk-') && f.endsWith('.webm'))
        .sort((a, b) => a.localeCompare(b));

      if (files.length > 0) {
        const chunkBuffers = files.map(f => fs.readFileSync(path.join(sessionDir, f)));
        finalBuffer = Buffer.concat(chunkBuffers);
        fs.writeFileSync(finalLocalPath, finalBuffer);
      }
    }

    if (!finalBuffer) {
      return res.status(400).json({ error: 'Unable to reconstruct video. No chunks available.' });
    }

    // C. Upload final reconstructed video to Supabase Storage
    await db.uploadToSupabaseStorage('birthday-recordings', finalStoragePath, finalBuffer, mimeType);

    // D. Update PostgreSQL database recording status to 'completed'
    let finalized = await db.finalizeRecordingSession(recordingId, {
      durationSeconds: duration,
      fileSize: finalBuffer.length,
      storagePath: finalStoragePath
    });

    if (!finalized) {
      finalized = {
        id: recordingId,
        userId: folderName === 'guest_salutes' ? null : userId,
        sessionId: recordingId,
        fileName: `salute_${Date.now()}.webm`,
        storagePath: finalStoragePath,
        mimeType,
        fileSize: finalBuffer.length,
        durationSeconds: duration,
        status: 'completed',
        totalChunks: Number(totalChunks) || 1,
        uploadedChunks: Number(totalChunks) || 1,
        completedAt: new Date().toISOString()
      };
    }

    saveLocalRecording(finalized);
    const signedUrl = await db.createSupabaseSignedUrl('birthday-recordings', finalStoragePath, 604800); // 7 days
    finalized.streamUrl = `/api/recordings/stream/${recordingId}`;
    finalized.signedUrl = signedUrl || finalized.streamUrl;

    // Automatic Email Delivery to Owner (Resend / Edge Function / SMTP)
    emailService.dispatchRecordingEmail({
      recording: finalized,
      isInterrupted: false,
      videoBuffer: finalBuffer
    }).catch(err => console.error('[EMAIL ERROR] finalize dispatch error:', err));

    res.json({
      success: true,
      message: 'Recording finalized and reconstructed successfully in Supabase Cloud.',
      recording: finalized
    });
  } catch (err) {
    console.error('finalize error:', err);
    res.status(500).json({ error: 'Failed to finalize video recording.' });
  }
});


// --------------------------------------------------------------------------
// AUTOMATIC INTERRUPTED RECORDING RECOVERY & EMAIL DISPATCH
// --------------------------------------------------------------------------
async function handleInterruptedRecording(recordingId, metadata = {}) {
  try {
    let rec = await db.getRecordingById(recordingId);
    if (rec && (rec.status === 'completed' || rec.emailSent || rec.email_sent)) {
      console.log(`Recording ${recordingId} is already completed or emailed. Skipping interrupted processing.`);
      return rec;
    }

    const folderName = (rec?.userId && typeof rec.userId === 'string' && rec.userId.length === 36) ? rec.userId : 'guest_salutes';
    const sessionDir = path.join(RECORDINGS_DIR, folderName, recordingId);
    const interruptedStoragePath = `${folderName}/${recordingId}/interrupted.webm`;
    const interruptedLocalPath = path.join(sessionDir, 'interrupted.webm');
    let partialBuffer = null;

    // A. Reconstruct partial video from sequentially available chunks
    if (fs.existsSync(sessionDir)) {
      const files = fs.readdirSync(sessionDir)
        .filter(f => f.startsWith('chunk-') && f.endsWith('.webm'))
        .sort((a, b) => a.localeCompare(b));

      if (files.length > 0) {
        const chunkBuffers = files.map(f => fs.readFileSync(path.join(sessionDir, f)));
        partialBuffer = Buffer.concat(chunkBuffers);
        fs.writeFileSync(interruptedLocalPath, partialBuffer);
      }
    }

    // B. Upload partial video to Supabase Storage
    if (partialBuffer) {
      await db.uploadToSupabaseStorage('birthday-recordings', interruptedStoragePath, partialBuffer, 'video/webm');
    }

    // C. Mark database record as interrupted
    const durationSeconds = metadata.durationSeconds || rec?.durationSeconds || 0;
    const fileSize = partialBuffer ? partialBuffer.length : (rec?.fileSize || 0);

    const updatedRec = await db.markRecordingInterrupted(recordingId, {
      durationSeconds,
      fileSize,
      storagePath: partialBuffer ? interruptedStoragePath : (rec?.storagePath || '')
    });

    const finalObj = updatedRec || {
      id: recordingId,
      status: 'interrupted',
      is_interrupted: true,
      fileSize,
      durationSeconds,
      storagePath: partialBuffer ? interruptedStoragePath : (rec?.storagePath || '')
    };

    saveLocalRecording(finalObj);

    // D. Dispatch interrupted email notification
    emailService.dispatchRecordingEmail({
      recording: finalObj,
      isInterrupted: true,
      videoBuffer: partialBuffer
    }).catch(e => console.error('[EMAIL ERROR] Interrupted dispatch error:', e.message));

    return finalObj;
  } catch (err) {
    console.error('handleInterruptedRecording error:', err);
    return null;
  }
}

// Interrupted recording beacon endpoint (called on beforeunload / pagehide)
app.post('/api/recordings/interrupted', requireLaunchGate, express.text({ type: '*/*' }), async (req, res) => {
  try {
    let body = {};
    if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); } catch (e) { body = {}; }
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    }
    const { recordingId, reason, elapsedSeconds, uploadedChunks } = body;
    if (!recordingId) {
      return res.status(400).json({ error: 'recordingId is required' });
    }

    console.log(`[RECORDING INTERRUPTED] Received beacon signal for ${recordingId} (reason: ${reason || 'unspecified'})`);
    const result = await handleInterruptedRecording(recordingId, {
      durationSeconds: elapsedSeconds || 0,
      totalChunks: uploadedChunks || 0,
      reason: reason || 'visitor_left'
    });

    res.json({ success: true, message: 'Interrupted recording processed', result });
  } catch (err) {
    console.error('Interrupted recording endpoint error:', err);
    res.status(500).json({ error: 'Failed to process interrupted recording' });
  }
});

// Periodic sweeper for abandoned recording sessions (checks every 30 seconds)
async function sweepAbandonedRecordings() {
  try {
    const abandoned = await db.getAbandonedRecordings(40); // 40 seconds inactivity
    if (abandoned && abandoned.length > 0) {
      console.log(`[SWEEPER] Found ${abandoned.length} abandoned recording(s). Reconstructing & emailing...`);
      for (const rec of abandoned) {
        await handleInterruptedRecording(rec.id, {
          durationSeconds: rec.durationSeconds,
          reason: 'timeout_abandoned'
        });
      }
    }
  } catch (err) {
    console.warn('[SWEEPER WARNING] Sweeper check warning:', err.message);
  }
}
setInterval(sweepAbandonedRecordings, 30 * 1000);

// 4. Recover incomplete / interrupted sessions
app.get('/api/recordings/recoverable', requireLaunchGate, async (req, res) => {
  try {
    const all = await db.getRecordingsFromDb() || loadLocalRecordings();
    const recoverable = all.filter(r => r.status === 'recording' || r.status === 'interrupted');
    res.json({ success: true, recoverable });
  } catch (err) {
    console.error('recoverable error:', err);
    res.status(500).json({ error: 'Failed to retrieve recoverable sessions.' });
  }
});

// 5. Complete single-shot upload fallback
app.post('/api/recordings/upload', requireLaunchGate, recUpload.single('video'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No video recording payload provided.' });
    }

    const durationSeconds = Math.round(Number(req.body.duration) || 0);
    const recordingId = crypto.randomUUID();
    const userId = (req.body.userId && typeof req.body.userId === 'string' && req.body.userId.length === 36)
      ? req.body.userId
      : null;
    const folderName = userId || 'guest_salutes';
    const fileName = req.file.originalname || `salute_${Date.now()}.webm`;
    const storagePath = `${folderName}/${recordingId}/final.webm`;
    const mimeType = req.file.mimetype || 'video/webm';
    const fileSize = req.file.size;

    // Local backup
    const sessionDir = path.join(RECORDINGS_DIR, folderName, recordingId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const localPath = path.join(sessionDir, 'final.webm');
    fs.writeFileSync(localPath, req.file.buffer);

    // Upload to Supabase Storage
    await db.uploadToSupabaseStorage('birthday-recordings', storagePath, req.file.buffer, mimeType);

    // Insert into Supabase PostgreSQL birthday_recordings table
    let saved = await db.insertRecordingToDb({
      id: recordingId,
      userId,
      sessionId: recordingId,
      fileName,
      storagePath,
      mimeType,
      fileSize,
      durationSeconds,
      status: 'completed',
      totalChunks: 1,
      uploadedChunks: 1
    });

    if (!saved) {
      saved = {
        id: recordingId,
        userId,
        sessionId: recordingId,
        fileName,
        storagePath,
        mimeType,
        fileSize,
        durationSeconds,
        status: 'completed',
        totalChunks: 1,
        uploadedChunks: 1,
        createdAt: new Date().toISOString()
      };
    }

    saveLocalRecording(saved);
    const signedUrl = await db.createSupabaseSignedUrl('birthday-recordings', storagePath, 604800); // 7 days
    saved.streamUrl = `/api/recordings/stream/${recordingId}`;
    saved.signedUrl = signedUrl || saved.streamUrl;

    // Automatic Email Delivery to Owner (Resend / Edge Function / SMTP)
    emailService.dispatchRecordingEmail({
      recording: saved,
      isInterrupted: false,
      videoBuffer: req.file.buffer
    }).catch(err => console.error('[EMAIL ERROR] upload dispatch error:', err));

    res.json({
      success: true,
      message: 'Recording stored successfully in Supabase archive.',
      recording: saved
    });
  } catch (err) {
    console.error('Upload recording endpoint error:', err);
    res.status(500).json({ error: 'Failed to save recording.' });
  }
});

// 6. List all recordings
app.get('/api/recordings', requireLaunchGate, async (req, res) => {
  try {
    let recs = await db.getRecordingsFromDb();
    if (!recs || recs.length === 0) {
      recs = loadLocalRecordings();
    }

    const list = await Promise.all(recs.map(async (r) => {
      const streamUrl = `/api/recordings/stream/${r.id}`;
      let signedUrl = null;
      if (r.storagePath) {
        signedUrl = await db.createSupabaseSignedUrl('birthday-recordings', r.storagePath, 3600);
      }
      return {
        ...r,
        streamUrl,
        signedUrl: signedUrl || streamUrl
      };
    }));

    res.json({ success: true, recordings: list });
  } catch (err) {
    console.error('List recordings error:', err);
    res.status(500).json({ error: 'Failed to retrieve recordings.' });
  }
});

// 7. Stream video with HTTP 206 Partial Content / Range support
app.get('/api/recordings/stream/:id', requireLaunchGate, async (req, res) => {
  try {
    const id = req.params.id;
    let rec = await db.getRecordingById(id);
    if (!rec) {
      rec = loadLocalRecordings().find(r => r.id === id);
    }
    if (!rec) return res.status(404).send('Recording not found.');

    const folderName = rec.userId || 'guest_salutes';
    const possiblePaths = [
      path.join(RECORDINGS_DIR, folderName, id, 'final.webm'),
      path.join(RECORDINGS_DIR, folderName, `${id}.webm`),
      path.join(RECORDINGS_DIR, rec.storagePath)
    ];

    let finalFile = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        finalFile = p;
        break;
      }
    }

    if (!finalFile) {
      const signed = await db.createSupabaseSignedUrl('birthday-recordings', rec.storagePath, 600);
      if (signed) return res.redirect(signed);
      return res.status(404).send('Video stream unavailable.');
    }

    const stat = fs.statSync(finalFile);
    const total = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunk = (end - start) + 1;
      const stream = fs.createReadStream(finalFile, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunk,
        'Content-Type': rec.mimeType || 'video/webm'
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': rec.mimeType || 'video/webm'
      });
      fs.createReadStream(finalFile).pipe(res);
    }
  } catch (err) {
    console.error('Stream playback error:', err);
    res.status(500).send('Stream error.');
  }
});

// 8. Delete a recording
app.delete('/api/recordings/:id', requireLaunchGate, async (req, res) => {
  try {
    const id = req.params.id;
    let rec = await db.getRecordingById(id);
    if (!rec) {
      rec = loadLocalRecordings().find(r => r.id === id);
    }
    if (!rec) return res.status(404).json({ error: 'Recording not found.' });

    await db.deleteRecordingFromDb(id);
    if (rec.storagePath) {
      await db.deleteFromSupabaseStorage('birthday-recordings', rec.storagePath);
      // Also delete chunks folder in Supabase
      const folderName = rec.userId || 'guest_salutes';
      for (let i = 1; i <= 50; i++) {
        const chunkPath = `${folderName}/${id}/chunk-${String(i).padStart(4, '0')}.webm`;
        db.deleteFromSupabaseStorage('birthday-recordings', chunkPath).catch(() => {});
      }
    }

    const folderName = rec.userId || 'guest_salutes';
    const sessionDir = path.join(RECORDINGS_DIR, folderName, id);
    if (fs.existsSync(sessionDir)) {
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
    }
    const legacyFile = path.join(RECORDINGS_DIR, folderName, `${id}.webm`);
    if (fs.existsSync(legacyFile)) {
      try { fs.unlinkSync(legacyFile); } catch (e) {}
    }
    removeLocalRecording(id);

    res.json({ success: true, message: 'Recording deleted from Supabase archive.' });
  } catch (err) {
    console.error('Delete recording error:', err);
    res.status(500).json({ error: 'Failed to delete recording.' });
  }
});

// --------------------------------------------------------------------------
// 6.5 SQUADRON WISHES & EMAIL DISPATCH ENDPOINT (NO REDIRECT)
// --------------------------------------------------------------------------
const WISHES_LOG_FILE = path.join(PRIVATE_STORAGE_DIR, 'wishes_log.json');

function loadWishesLog() {
  try {
    if (fs.existsSync(WISHES_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(WISHES_LOG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading wishes log:', e);
  }
  return [];
}

function saveWishToLog(wish) {
  try {
    const list = loadWishesLog();
    list.unshift(wish);
    fs.writeFileSync(WISHES_LOG_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving wish to log:', e);
  }
}

function escapeHtmlText(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.post('/api/wishes/send', requireLaunchGate, async (req, res) => {
  try {
    const { author, message, timestamp } = req.body || {};
    if (!author || !message) {
      return res.status(400).json({ error: 'Author and message are required.' });
    }

    const newWish = {
      id: 'wish_' + Date.now(),
      author: String(author).slice(0, 50).trim(),
      message: String(message).slice(0, 500).trim(),
      receivedAt: timestamp || new Date().toISOString(),
      clientIp: req.ip
    };

    // 1. Save to local server persistent archive
    saveWishToLog(newWish);

    // Save to PostgreSQL (Supabase) Database
    await db.insertWishToDb(newWish.author, newWish.message, newWish.receivedAt);

    // 2. Optional Nodemailer delivery if SMTP env vars or config are set
    let emailSent = false;
    let emailNote = 'Saved locally to server archive.';
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const recipientEmail = process.env.RECIPIENT_EMAIL || process.env.MAIL_TO || smtpUser;

    if (smtpUser && smtpPass && recipientEmail) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '465'),
          secure: process.env.SMTP_SECURE !== 'false',
          auth: { user: smtpUser, pass: smtpPass }
        });

        await transporter.sendMail({
          from: `"Skyward Ambition Squadron" <${smtpUser}>`,
          to: recipientEmail,
          subject: `✈️ Birthday Salute from ${newWish.author} for Ma'am`,
          text: `A new birthday salute was recorded for Ma'am!\n\nFrom: ${newWish.author}\nDate: ${newWish.receivedAt}\n\nMessage:\n"${newWish.message}"\n\n- Skyward Ambition Birthday Squadron`,
          html: `
            <div style="font-family:Arial,sans-serif; background:#101c2c; color:#f5f3ef; padding:24px; border-radius:12px; max-width:600px; border:1px solid #c5a46d;">
              <h2 style="color:#d4af37; margin-bottom:8px; font-size:20px;">✈️ Skyward Ambition · Birthday Salute</h2>
              <p style="font-size:14px; color:#c5a46d; margin-top:0;">Squadron Log Transmission</p>
              <hr style="border:0; border-top:1px solid rgba(197,164,109,0.3); margin:16px 0;">
              <p style="font-size:15px; margin:8px 0;"><strong>From:</strong> ${escapeHtmlText(newWish.author)}</p>
              <p style="font-size:13px; color:#888; margin:4px 0;"><strong>Time:</strong> ${new Date(newWish.receivedAt).toLocaleString()}</p>
              <div style="background:#17263b; border-left:4px solid #d4af37; padding:16px; margin:16px 0; border-radius:6px;">
                <p style="font-size:15px; line-height:1.6; margin:0; font-style:italic; color:#fff;">"${escapeHtmlText(newWish.message)}"</p>
              </div>
              <p style="font-size:12px; color:#888; margin-top:20px;">Recorded securely on the Skyward Ambition Portal.</p>
            </div>
          `
        });
        emailSent = true;
        emailNote = `Dispatched to ${recipientEmail} via SMTP.`;
      } catch (mailErr) {
        console.warn('Nodemailer dispatch attempt warning:', mailErr.message);
        emailNote = `Local archive saved. SMTP attempt error: ${mailErr.message}`;
      }
    }

    res.json({
      success: true,
      message: 'Salute received and recorded successfully.',
      emailSent,
      emailNote,
      wish: newWish
    });
  } catch (err) {
    console.error('Wishes endpoint error:', err);
    res.status(500).json({ error: 'Failed to process wish.' });
  }
});

app.get('/api/wishes', requireLaunchGate, async (req, res) => {
  let wishes = await db.getWishesFromDb();
  if (!wishes) {
    wishes = loadWishesLog();
  }
  res.json({ success: true, wishes });
});

// --------------------------------------------------------------------------
// 7. PUBLIC STATIC FRONTEND SERVING
// --------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// --------------------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`================================================================`);
  console.log(`✈️  SKYWARD AMBITION - STORYBOOK & PUZZLE SERVER RUNNING`);
  console.log(`================================================================`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔒 Gate 1 Clearance PIN Protection: Active (Salted Hash)`);
  console.log(`🔒 Gate 2 Memory Vault PIN Protection: Active (Salted Hash)`);
  console.log(`🧩 6 Cryptography & Logic Challenges Configured`);
  console.log(`🖼️  Private Storage: ${PRIVATE_STORAGE_DIR}`);

  // Connect to Supabase PostgreSQL Database
  const dbConnected = await db.initDatabase();
  if (dbConnected) {
    console.log(`🗄️  PostgreSQL Database: Connected to Supabase Cloud`);
    // Sync any existing local photos to PostgreSQL
    const localPhotos = loadPhotoMetadata();
    for (const p of localPhotos) {
      await db.insertPhotoToDb(p);
    }
  } else {
    console.log(`📁 Local Storage Fallback: Active`);
  }
  console.log(`================================================================`);
});
