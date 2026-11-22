require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.dlmmurmwztehdkxbmxvh:Tamilrasu%26Akshaya%212026@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

let pool = null;
let isConnected = false;

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

module.exports = {
  pool,
  initDatabase,
  getWishesFromDb,
  insertWishToDb,
  getPhotosFromDb,
  insertPhotoToDb,
  deletePhotoFromDb,
  isDbConnected: () => isConnected
};
