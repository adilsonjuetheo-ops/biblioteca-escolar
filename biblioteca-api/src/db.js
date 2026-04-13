const { Pool } = require('pg');
const fs = require('fs/promises');
const path = require('path');

// ── Dados iniciais padrão ─────────────────────────────────────────────────────

const INITIAL_DATA = {
  usuarios: [],
  livros: [],
  emprestimos: [],
  recuperacoes: [],
  avaliacoes: [],
  desejos: [],
  comunicados: [],
  suspensoes: [],
};

// ── PostgreSQL (Supabase) ─────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;
let pgReady = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

  async function ensureTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_data (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT single_row CHECK (id = 1)
      );
    `);
    await pool.query(
      `INSERT INTO app_data (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING;`,
      [JSON.stringify(INITIAL_DATA)]
    );
    console.log('[DB] Conectado ao PostgreSQL/Supabase.');
  }

  pgReady = ensureTable().catch((err) => {
    console.error('[DB] Falha ao conectar ao PostgreSQL:', err.message);
    // Reinicia a promessa para que a próxima requisição tente novamente
    pgReady = null;
  });
}

// ── JSON local (fallback para desenvolvimento sem DATABASE_URL) ───────────────

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'db.json');

async function ensureJsonDb() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

function normalizeData(data) {
  return {
    ...INITIAL_DATA,
    ...data,
    usuarios: Array.isArray(data.usuarios) ? data.usuarios : [],
    livros: Array.isArray(data.livros) ? data.livros : [],
    emprestimos: Array.isArray(data.emprestimos) ? data.emprestimos : [],
    recuperacoes: Array.isArray(data.recuperacoes) ? data.recuperacoes : [],
    avaliacoes: Array.isArray(data.avaliacoes) ? data.avaliacoes : [],
    desejos: Array.isArray(data.desejos) ? data.desejos : [],
    comunicados: Array.isArray(data.comunicados) ? data.comunicados : [],
    suspensoes: Array.isArray(data.suspensoes) ? data.suspensoes : [],
  };
}

async function readDb() {
  if (pool) {
    await pgReady;
    const result = await pool.query('SELECT data FROM app_data WHERE id = 1');
    return normalizeData(result.rows[0]?.data || {});
  }
  // Fallback JSON
  await ensureJsonDb();
  const raw = await fs.readFile(dbPath, 'utf-8');
  return normalizeData(JSON.parse(raw));
}

async function writeDb(data) {
  if (pool) {
    await pgReady;
    await pool.query(
      'UPDATE app_data SET data = $1::jsonb WHERE id = 1',
      [JSON.stringify(data)]
    );
    return;
  }
  // Fallback JSON
  await ensureJsonDb();
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = { readDb, writeDb };
