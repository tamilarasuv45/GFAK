require('dotenv').config();

function isValidUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.dlmmurmwztehdkxbmxvh:Tamilrasu%26Akshaya%212026@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dlmmurmwztehdkxbmxvh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

let pool = null;
let isConnected = false;
let supabase = null;

try {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err.message);
  });
} catch (e) {
  console.warn('Failed to initialize PostgreSQL pool:', e.message);
}

// Optional Supabase JS client for direct Storage API if Service Key is provided
if (SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
    console.log('✓ Supabase Client initialized with Service Role');
  } catch (e) {
    console.warn('Supabase Client init warning:', e.message);
  }
}

// Initialize tables
async function initDatabase() {
  if (!pool) return false;
  try {
    const client = await pool.connect();
    
    // Create wishes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wishes (
        id SERIAL PRIMARY KEY,
        author VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        timestamp VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create photos table
    await client.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id VARCHAR(255) PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255),
        mime_type VARCHAR(100),
        size BIGINT,
        caption TEXT DEFAULT '',
        uploaded_at VARCHAR(255),
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure birthday_recordings table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS birthday_recordings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        session_id TEXT,
        file_name TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        mime_type TEXT,
        duration_seconds INTEGER DEFAULT 0,
        status TEXT DEFAULT 'completed',
        total_chunks INTEGER DEFAULT 1,
        uploaded_chunks INTEGER DEFAULT 1,
        file_size BIGINT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure birthday_recording_chunks table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS birthday_recording_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recording_id UUID REFERENCES birthday_recordings(id) ON DELETE CASCADE,
        chunk_number INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        file_size BIGINT,
        mime_type TEXT,
        uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_recording_chunk UNIQUE (recording_id, chunk_number)
      );
    `);

    // Ensure birthday-recordings bucket exists in storage.buckets
    try {
      await client.query(`
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('birthday-recordings', 'birthday-recordings', false)
        ON CONFLICT (id) DO NOTHING;
      `);
    } catch (bErr) {
      // Storage schema might be managed by Supabase internal service
    }

    client.release();
    isConnected = true;
    console.log('✓ PostgreSQL connected & tables verified on Supabase');
    return true;
  } catch (err) {
    console.warn('PostgreSQL connection check failed, will use local storage fallback:', err.message);
    isConnected = false;
    return false;
  }
}

// Wishes database methods
async function getWishesFromDb() {
  if (!pool || !isConnected) return null;
  try {
    const res = await pool.query('SELECT author, message, timestamp FROM wishes ORDER BY id DESC');
    return res.rows;
  } catch (err) {
    console.error('Error querying wishes from PostgreSQL:', err.message);
    return null;
  }
}

async function insertWishToDb(author, message, timestamp) {
  if (!pool || !isConnected) return false;
  try {
    await pool.query(
      'INSERT INTO wishes (author, message, timestamp) VALUES ($1, $2, $3)',
      [author, message, timestamp]
    );
    return true;
  } catch (err) {
    console.error('Error inserting wish into PostgreSQL:', err.message);
    return false;
  }
}

// Photos database methods
async function getPhotosFromDb() {
  if (!pool || !isConnected) return null;
  try {
    const res = await pool.query('SELECT id, filename, original_name as "originalName", mime_type as "mimeType", size, caption, uploaded_at as "uploadedAt", sort_order as "order" FROM photos ORDER BY sort_order ASC, id ASC');
    return res.rows;
  } catch (err) {
    console.error('Error querying photos from PostgreSQL:', err.message);
    return null;
  }
}

async function insertPhotoToDb(photo) {
  if (!pool || !isConnected) return false;
  try {
    await pool.query(
      `INSERT INTO photos (id, filename, original_name, mime_type, size, caption, uploaded_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         caption = EXCLUDED.caption,
         sort_order = EXCLUDED.sort_order;`,
      [
        photo.id,
        photo.filename,
        photo.originalName || '',
        photo.mimeType || '',
        photo.size || 0,
        photo.caption || '',
        photo.uploadedAt || new Date().toISOString(),
        photo.order || 0
      ]
    );
    return true;
  } catch (err) {
    console.error('Error inserting photo into PostgreSQL:', err.message);
    return false;
  }
}

async function deletePhotoFromDb(id) {
  if (!pool || !isConnected) return false;
  try {
    await pool.query('DELETE FROM photos WHERE id = $1', [id]);
    return true;
  } catch (err) {
    console.error('Error deleting photo from PostgreSQL:', err.message);
    return false;
  }
}

// --------------------------------------------------------------------------
// RECORDINGS DATABASE & STORAGE METHODS
// --------------------------------------------------------------------------
async function getRecordingsFromDb() {
  if (!pool || !isConnected) return null;
  try {
    const res = await pool.query(`
      SELECT 
        id, 
        user_id as "userId", 
        session_id as "sessionId",
        file_name as "fileName", 
        storage_path as "storagePath", 
        mime_type as "mimeType", 
        file_size as "fileSize", 
        duration_seconds as "durationSeconds", 
        status,
        total_chunks as "totalChunks",
        uploaded_chunks as "uploadedChunks",
        is_interrupted as "isInterrupted",
        email_sent as "emailSent",
        email_status as "emailStatus",
        email_sent_at as "emailSentAt",
        created_at as "createdAt",
        completed_at as "completedAt"
      FROM birthday_recordings 
      ORDER BY created_at DESC
    `);
    return res.rows;
  } catch (err) {
    console.error('Error querying recordings from PostgreSQL:', err.message);
    return null;
  }
}

async function getRecordingById(id) {
  if (!pool || !isConnected) return null;
  if (!isValidUuid(id)) return null;
  try {
    const res = await pool.query(`
      SELECT 
        id, 
        user_id as "userId", 
        session_id as "sessionId",
        file_name as "fileName", 
        storage_path as "storagePath", 
        mime_type as "mimeType", 
        file_size as "fileSize", 
        duration_seconds as "durationSeconds", 
        status,
        total_chunks as "totalChunks",
        uploaded_chunks as "uploadedChunks",
        is_interrupted as "isInterrupted",
        email_sent as "emailSent",
        email_status as "emailStatus",
        email_sent_at as "emailSentAt",
        created_at as "createdAt",
        completed_at as "completedAt"
      FROM birthday_recordings 
      WHERE id = $1
    `, [id]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('Error fetching recording by id:', err.message);
    return null;
  }
}

async function startRecordingSession(data) {
  if (!pool || !isConnected) return null;
  try {
    const res = await pool.query(`
      INSERT INTO birthday_recordings (
        id, 
        user_id, 
        session_id, 
        file_name, 
        storage_path, 
        mime_type, 
        duration_seconds, 
        status, 
        total_chunks, 
        uploaded_chunks, 
        file_size
      )
      VALUES (
        COALESCE($1, gen_random_uuid()), 
        $2, 
        $3, 
        $4, 
        $5, 
        $6, 
        0, 
        'recording', 
        0, 
        0, 
        0
      )
      RETURNING 
        id, 
        user_id as "userId", 
        session_id as "sessionId",
        file_name as "fileName", 
        storage_path as "storagePath", 
        mime_type as "mimeType", 
        status, 
        created_at as "createdAt"
    `, [
      isValidUuid(data.id) ? data.id : null,
      data.userId || null,
      data.sessionId || data.id,
      data.fileName,
      data.storagePath,
      data.mimeType || 'video/webm'
    ]);
    return res.rows[0];
  } catch (err) {
    console.error('Error starting recording session in PostgreSQL:', err.message);
    return null;
  }
}

async function insertRecordingChunk(chunkData) {
  if (!pool || !isConnected) return null;
  try {
    // 1. Insert or update chunk record
    const chunkRes = await pool.query(`
      INSERT INTO birthday_recording_chunks (
        id, 
        recording_id, 
        chunk_number, 
        storage_path, 
        file_size, 
        mime_type
      )
      VALUES (
        COALESCE($1, gen_random_uuid()), 
        $2, 
        $3, 
        $4, 
        $5, 
        $6
      )
      ON CONFLICT (recording_id, chunk_number) DO UPDATE SET
        file_size = EXCLUDED.file_size,
        storage_path = EXCLUDED.storage_path,
        uploaded_at = CURRENT_TIMESTAMP
      RETURNING *;
    `, [
      chunkData.id || null,
      isValidUuid(chunkData.recordingId) ? chunkData.recordingId : null,
      chunkData.chunkNumber,
      chunkData.storagePath,
      chunkData.fileSize || 0,
      chunkData.mimeType || 'video/webm'
    ]);

    // 2. Update uploaded_chunks and total_chunks in birthday_recordings
    await pool.query(`
      UPDATE birthday_recordings
      SET 
        uploaded_chunks = (SELECT COUNT(*) FROM birthday_recording_chunks WHERE recording_id = $1),
        total_chunks = GREATEST(total_chunks, $2),
        file_size = (SELECT COALESCE(SUM(file_size), 0) FROM birthday_recording_chunks WHERE recording_id = $1)
      WHERE id = $1;
    `, [chunkData.recordingId, chunkData.chunkNumber]);

    return chunkRes.rows[0];
  } catch (err) {
    console.error('Error inserting chunk into PostgreSQL:', err.message);
    return null;
  }
}

async function getChunksForRecording(recordingId) {
  if (!pool || !isConnected) return [];
  try {
    const res = await pool.query(`
      SELECT 
        id, 
        recording_id as "recordingId", 
        chunk_number as "chunkNumber", 
        storage_path as "storagePath", 
        file_size as "fileSize", 
        mime_type as "mimeType", 
        uploaded_at as "uploadedAt"
      FROM birthday_recording_chunks 
      WHERE recording_id = $1 
      ORDER BY chunk_number ASC
    `, [recordingId]);
    return res.rows;
  } catch (err) {
    console.error('Error querying chunks from PostgreSQL:', err.message);
    return [];
  }
}

async function finalizeRecordingSession(recordingId, finalData) {
  if (!pool || !isConnected) return null;
  if (!isValidUuid(recordingId)) return null;
  try {
    const res = await pool.query(`
      UPDATE birthday_recordings
      SET 
        status = 'completed',
        duration_seconds = COALESCE($2, duration_seconds),
        file_size = COALESCE($3, file_size),
        storage_path = COALESCE($4, storage_path),
        completed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id, 
        user_id as "userId", 
        session_id as "sessionId",
        file_name as "fileName", 
        storage_path as "storagePath", 
        mime_type as "mimeType", 
        file_size as "fileSize", 
        duration_seconds as "durationSeconds", 
        status,
        total_chunks as "totalChunks",
        uploaded_chunks as "uploadedChunks",
        created_at as "createdAt",
        completed_at as "completedAt"
    `, [
      recordingId,
      finalData.durationSeconds,
      finalData.fileSize,
      finalData.storagePath
    ]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('Error finalizing recording session in PostgreSQL:', err.message);
    return null;
  }
}

async function updateRecordingStatus(recordingId, status) {
  if (!pool || !isConnected) return false;
  try {
    await pool.query('UPDATE birthday_recordings SET status = $2 WHERE id = $1;', [recordingId, status]);
    return true;
  } catch (err) {
    console.error('Error updating recording status:', err.message);
    return false;
  }
}

async function insertRecordingToDb(rec) {
  if (!pool || !isConnected) return null;
  try {
    const res = await pool.query(`
      INSERT INTO birthday_recordings (
        id, 
        user_id, 
        session_id,
        file_name, 
        storage_path, 
        mime_type, 
        file_size, 
        duration_seconds,
        status,
        total_chunks,
        uploaded_chunks
      )
      VALUES (
        COALESCE($1, gen_random_uuid()), 
        $2, 
        $3, 
        $4, 
        $5, 
        $6, 
        $7, 
        $8,
        COALESCE($9, 'completed'),
        COALESCE($10, 1),
        COALESCE($11, 1)
      )
      RETURNING 
        id, 
        user_id as "userId", 
        session_id as "sessionId",
        file_name as "fileName", 
        storage_path as "storagePath", 
        mime_type as "mimeType", 
        file_size as "fileSize", 
        duration_seconds as "durationSeconds", 
        status,
        created_at as "createdAt",
        completed_at as "completedAt"
    `, [
      rec.id || null,
      rec.userId || null,
      rec.sessionId || rec.id,
      rec.fileName,
      rec.storagePath,
      rec.mimeType || 'video/webm',
      rec.fileSize || 0,
      rec.durationSeconds || 0,
      rec.status || 'completed',
      rec.totalChunks || 1,
      rec.uploadedChunks || 1
    ]);
    return res.rows[0];
  } catch (err) {
    console.error('Error inserting recording into PostgreSQL:', err.message);
    return null;
  }
}

async function deleteRecordingFromDb(id) {
  if (!pool || !isConnected) return null;
  try {
    const res = await pool.query(
      'DELETE FROM birthday_recordings WHERE id = $1 RETURNING *;',
      [id]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.error('Error deleting recording from PostgreSQL:', err.message);
    return null;
  }
}

// Supabase Storage Operations
async function uploadToSupabaseStorage(bucketName, storagePath, fileBuffer, mimeType) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage.from(bucketName).upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: true
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase Storage upload warning:', err.message);
    return null;
  }
}

async function createSupabaseSignedUrl(bucketName, storagePath, expiresIn = 3600) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(storagePath, expiresIn);
    if (error) throw error;
    return data?.signedUrl || null;
  } catch (err) {
    console.warn('Supabase createSignedUrl warning:', err.message);
    return null;
  }
}

async function deleteFromSupabaseStorage(bucketName, storagePath) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.storage.from(bucketName).remove([storagePath]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Supabase Storage remove warning:', err.message);
    return false;
  }
}

// --------------------------------------------------------------------------
// EMAIL DELIVERY & INTERRUPTED RECORDING HELPERS
// --------------------------------------------------------------------------
async function claimRecordingForEmail(recordingId) {
  if (!pool || !isConnected) return true;
  if (!isValidUuid(recordingId)) return true;
  try {
    const res = await pool.query(`
      UPDATE birthday_recordings
      SET email_status = 'processing'
      WHERE id = $1 
        AND email_sent = FALSE 
        AND (email_status IS NULL OR email_status != 'processing')
      RETURNING id;
    `, [recordingId]);
    return res.rowCount > 0;
  } catch (err) {
    console.error('Error claiming recording for email:', err.message);
    return true;
  }
}

async function markRecordingEmailSent(recordingId, status = 'sent', notes = '') {
  if (!pool || !isConnected) return false;
  if (!isValidUuid(recordingId)) return false;
  try {
    const isSent = status === 'sent';
    await pool.query(`
      UPDATE birthday_recordings
      SET 
        email_sent = $2,
        email_sent_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE email_sent_at END,
        email_status = $3,
        notes = COALESCE($4, notes)
      WHERE id = $1;
    `, [recordingId, isSent, status, notes]);
    return true;
  } catch (err) {
    console.error('Error marking recording email status:', err.message);
    return false;
  }
}

async function markRecordingInterrupted(recordingId, partialData = {}) {
  if (!pool || !isConnected) return null;
  if (!isValidUuid(recordingId)) return null;
  try {
    const res = await pool.query(`
      UPDATE birthday_recordings
      SET 
        status = 'interrupted',
        is_interrupted = TRUE,
        duration_seconds = COALESCE($2, duration_seconds),
        file_size = COALESCE($3, file_size),
        storage_path = COALESCE($4, storage_path),
        completed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id, 
        user_id as "userId", 
        session_id as "sessionId",
        file_name as "fileName", 
        storage_path as "storagePath", 
        mime_type as "mimeType", 
        file_size as "fileSize", 
        duration_seconds as "durationSeconds", 
        status,
        total_chunks as "totalChunks",
        uploaded_chunks as "uploadedChunks",
        is_interrupted as "isInterrupted",
        email_sent as "emailSent",
        created_at as "createdAt",
        completed_at as "completedAt";
    `, [
      recordingId,
      partialData.durationSeconds,
      partialData.fileSize,
      partialData.storagePath
    ]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('Error marking recording interrupted:', err.message);
    return null;
  }
}

async function getAbandonedRecordings(thresholdSeconds = 35) {
  if (!pool || !isConnected) return [];
  try {
    const res = await pool.query(`
      SELECT 
        id, 
        user_id as "userId", 
        session_id as "sessionId",
        file_name as "fileName", 
        storage_path as "storagePath", 
        mime_type as "mimeType", 
        file_size as "fileSize", 
        duration_seconds as "durationSeconds", 
        status,
        total_chunks as "totalChunks",
        uploaded_chunks as "uploadedChunks",
        is_interrupted as "isInterrupted",
        email_sent as "emailSent",
        created_at as "createdAt",
        last_heartbeat_at as "lastHeartbeatAt"
      FROM birthday_recordings
      WHERE status = 'recording'
        AND last_heartbeat_at < (CURRENT_TIMESTAMP - ($1 || ' seconds')::INTERVAL)
        AND email_sent = FALSE
      ORDER BY created_at ASC;
    `, [thresholdSeconds]);
    return res.rows;
  } catch (err) {
    console.error('Error querying abandoned recordings:', err.message);
    return [];
  }
}

async function updateRecordingHeartbeat(recordingId) {
  if (!pool || !isConnected) return false;
  try {
    await pool.query(`
      UPDATE birthday_recordings
      SET last_heartbeat_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `, [recordingId]);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  pool,
  supabase,
  initDatabase,
  getWishesFromDb,
  insertWishToDb,
  getPhotosFromDb,
  insertPhotoToDb,
  deletePhotoFromDb,
  getRecordingsFromDb,
  getRecordingById,
  startRecordingSession,
  insertRecordingChunk,
  getChunksForRecording,
  finalizeRecordingSession,
  updateRecordingStatus,
  insertRecordingToDb,
  deleteRecordingFromDb,
  uploadToSupabaseStorage,
  createSupabaseSignedUrl,
  deleteFromSupabaseStorage,
  claimRecordingForEmail,
  markRecordingEmailSent,
  markRecordingInterrupted,
  getAbandonedRecordings,
  updateRecordingHeartbeat,
  isDbConnected: () => isConnected
};
