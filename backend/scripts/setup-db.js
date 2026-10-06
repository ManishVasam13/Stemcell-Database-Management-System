/**
 * Builds the StemVault database from ../database/*.sql without needing
 * the mysql command-line client (handy on Windows).
 *
 *   npm run db:setup            -> scripts 01..07 (schema ... seed ... security)
 *   npm run db:setup -- --no-seed
 *
 * Understands the DELIMITER lines used by the trigger/procedure scripts.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB_DIR = path.join(__dirname, '..', '..', 'database');
const noSeed = process.argv.includes('--no-seed');
const FILES = ['01_schema.sql', '02_functions.sql', '03_views.sql', '04_triggers.sql', '05_procedures.sql',
  ...(noSeed ? [] : ['06_seed.sql']), '07_security.sql'];

function stripTrailingComment(line) {
  // remove a trailing "-- ..." comment, ignoring -- inside string literals
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '-' && line[i + 1] === '-') {
      return line.slice(0, i).replace(/\s+$/, '');
    }
  }
  return line;
}

function isBlank(stmt) {
  return stmt.split(/\r?\n/).every((l) => l.trim() === '' || l.trim().startsWith('--'));
}

function splitStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let buffer = [];
  for (const raw of sql.split(/\r?\n/)) {
    const line = stripTrailingComment(raw.replace(/\s+$/, ''));
    const d = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (d) { delimiter = d[1]; continue; }
    if (buffer.length === 0 && line.trim() === '') continue;
    buffer.push(line);
    if (line.endsWith(delimiter)) {
      const text = buffer.join('\n');
      const stmt = text.slice(0, text.length - delimiter.length).trim();
      if (stmt && !isBlank(stmt)) statements.push(stmt);
      buffer = [];
    }
  }
  const rest = buffer.join('\n').trim();
  if (rest && !isBlank(rest)) statements.push(rest);
  return statements;
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_ADMIN_USER || process.env.DB_USER || 'root',
    password: process.env.DB_ADMIN_PASSWORD ?? process.env.DB_PASSWORD ?? '',
  charset: 'utf8mb4_0900_ai_ci',  // match the database collation used in 01_schema.sql
  });
  console.log('Connected to MySQL', (await conn.query('SELECT VERSION() AS v'))[0][0].v);

  for (const file of FILES) {
    const statements = splitStatements(fs.readFileSync(path.join(DB_DIR, file), 'utf8'));
    process.stdout.write(`  ${file.padEnd(22)} ${String(statements.length).padStart(4)} statements ... `);
    try {
      for (const stmt of statements) await conn.query(stmt);
      console.log('done');
    } catch (err) {
      console.log('FAILED');
      if (file === '07_security.sql') {
        console.warn(`    Security script skipped: ${err.message}\n    (the app still works with DB_USER=root)`);
        continue;
      }
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
  }
  const [[counts]] = await conn.query(`SELECT
      (SELECT COUNT(*) FROM information_schema.tables   WHERE table_schema='stemvault' AND table_type='BASE TABLE') AS tables_,
      (SELECT COUNT(*) FROM information_schema.views    WHERE table_schema='stemvault') AS views_,
      (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='stemvault') AS triggers_,
      (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='stemvault') AS routines_`);
  console.log(`\nStemVault ready: ${counts.tables_} tables, ${counts.views_} views, ${counts.triggers_} triggers, ${counts.routines_} functions/procedures.`);
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
