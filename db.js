require('dotenv').config();
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
        file_name TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        mime_type TEXT,
        file_size BIGINT,
        duration_seconds INTEGER,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
        file_name as "fileName", 
        storage_path as "storagePath", 
        mime_type as "mimeType", 
        file_size as "fileSize", 
        duration_seconds as "durationSeconds", 
        created_at as "createdAt"
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
  try {
    const res = await pool.query(`
      SELECT 
        id, 
        user_id as "userId", 
        file_name as "fileName", 
        storage_path as "storagePath", 
        mime_type as "mimeType", 
        file_size as "fileSize", 
        duration_seconds as "durationSeconds", 
        created_at as "createdAt"
      FROM birthday_recordings 
      WHERE id = $1
    `, [id]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('Error fetching recording by id:', err.message);
    return null;
  }
}

async function insertRecordingToDb(rec) {
  if (!pool || !isConnected) return null;
  try {
    const res = await pool.query(`
      INSERT INTO birthday_recordings (
        id, 
        user_id, 
        file_name, 
        storage_path, 
        mime_type, 
        file_size, 
        duration_seconds
      )
      VALUES (
        COALESCE($1, gen_random_uuid()), 
        $2, 
        $3, 
        $4, 
        $5, 
        $6, 
        $7
      )
      RETURNING 
        id, 
        user_id as "userId", 
        file_name as "fileName", 
        storage_path as "storagePath", 
        mime_type as "mimeType", 
        file_size as "fileSize", 
        duration_seconds as "durationSeconds", 
        created_at as "createdAt"
    `, [
      rec.id || null,
      rec.userId || null,
      rec.fileName,
      rec.storagePath,
      rec.mimeType || 'video/webm',
      rec.fileSize || 0,
      rec.durationSeconds || 0
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
  insertRecordingToDb,
  deleteRecordingFromDb,
  uploadToSupabaseStorage,
  createSupabaseSignedUrl,
  deleteFromSupabaseStorage,
  isDbConnected: () => isConnected
};
