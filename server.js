require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --------------------------------------------------------------------------
// 1. PIN SECURITY CONFIGURATION (SALTED CRYPTOGRAPHIC HASHES)
// --------------------------------------------------------------------------
// Sensitive PINs are NEVER stored in plaintext. Salted hashes only.
const GATE1_SALT = 'skyward_gate1_salt_';
const GATE1_HASH = '13c5bc005df9f6e82cdf3e6296ec8f96c5012475a19e29bc7a002218b85bc7ba';

const GATE2_SALT = 'skyward_gate2_salt_';
const GATE2_HASH = '98c3cd446213b06ad87323fd61fde14356d24960bc3cf3d17aa991c92c0ff435';

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
app.post('/api/auth/gate1', (req, res) => {
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
app.post('/api/auth/gate2', (req, res) => {
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
app.get('/api/auth/verify', (req, res) => {
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
app.get('/api/storybook/progress', authenticateGate1, (req, res) => {
  res.json({
    unlockedChapter: req.sessionGate1.unlockedChapter,
    discoveredWords: req.sessionGate1.discoveredWords
  });
});

// Storybook Verify Chapter Puzzle
app.post('/api/storybook/verify-chapter', authenticateGate1, (req, res) => {
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

// --------------------------------------------------------------------------
// 6. PRIVATE PHOTO GALLERY ENDPOINTS (AUTHENTICATED)
// --------------------------------------------------------------------------
app.get('/api/gallery/photos', authenticateGate2, (req, res) => {
  const photos = loadPhotoMetadata();
  res.json({ success: true, photos });
});

app.post('/api/gallery/upload', authenticateGate2, upload.array('photos', 20), (req, res) => {
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

app.get('/api/gallery/photo/:id', authenticateGate2, (req, res) => {
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

app.post('/api/wishes/send', async (req, res) => {
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

app.get('/api/wishes', (req, res) => {
  const wishes = loadWishesLog();
  res.json({ success: true, wishes });
});

// --------------------------------------------------------------------------
// 7. PUBLIC STATIC FRONTEND SERVING
// --------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

app.use(express.static(PUBLIC_DIR));

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// --------------------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`✈️  SKYWARD AMBITION - STORYBOOK & PUZZLE SERVER RUNNING`);
  console.log(`================================================================`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔒 Gate 1 Clearance PIN Protection: Active (Salted Hash)`);
  console.log(`🔒 Gate 2 Memory Vault PIN Protection: Active (Salted Hash)`);
  console.log(`🧩 6 Cryptography & Logic Challenges Configured`);
  console.log(`🖼️  Private Storage: ${PRIVATE_STORAGE_DIR}`);
  console.log(`================================================================`);
});
