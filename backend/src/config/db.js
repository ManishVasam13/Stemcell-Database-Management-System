const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stemvault',
  charset: 'utf8mb4_0900_ai_ci',  // match the database collation used in 01_schema.sql
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,      // DATE/DATETIME come back as plain strings (no timezone shifts)
  decimalNumbers: true,   // DECIMAL/SUM() come back as numbers
});

/** Run one statement on any pooled connection (read-only helpers). */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Borrow one connection, tag it with the acting user so database
 * triggers can write AuditLog rows (@app_user_id), run fn, then clean up.
 */
async function withUser(userId, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @app_user_id = ?', [userId ?? null]);
    return await fn(conn);
  } finally {
    try { await conn.query('SET @app_user_id = NULL'); } catch (_) { /* ignore */ }
    conn.release();
  }
}

/**
 * Application-level transaction (used where no stored procedure exists):
 * BEGIN -> fn(conn) -> COMMIT, or ROLLBACK on any error.
 */
async function transaction(userId, fn) {
  return withUser(userId, async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  });
}

/** CALL returns [resultSet1, resultSet2, ..., OkPacket]; keep only row arrays. */
function resultSets(callResult) {
  return Array.isArray(callResult) ? callResult.filter(Array.isArray) : [];
}

module.exports = { pool, query, withUser, transaction, resultSets };
