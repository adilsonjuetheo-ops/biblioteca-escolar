const fs = require('fs/promises');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'db.json');

const initialData = {
  usuarios: [],
  livros: [],
  emprestimos: [],
  recuperacoes: [],
};

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(dbPath, 'utf-8');
  const parsed = JSON.parse(raw);
  return {
    ...initialData,
    ...parsed,
    usuarios: Array.isArray(parsed.usuarios) ? parsed.usuarios : [],
    livros: Array.isArray(parsed.livros) ? parsed.livros : [],
    emprestimos: Array.isArray(parsed.emprestimos) ? parsed.emprestimos : [],
    recuperacoes: Array.isArray(parsed.recuperacoes) ? parsed.recuperacoes : [],
  };
}

async function writeDb(data) {
  await ensureDb();
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = {
  readDb,
  writeDb,
};
