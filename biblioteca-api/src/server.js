require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Anthropic = require('@anthropic-ai/sdk');

const { readDb, writeDb } = require('./db');
const { sendRecoveryCode } = require('./mailer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DOMINIO_ALUNO = '@aluno.mg.gov.br';
const DOMINIO_PROFESSOR = '@educacao.mg.gov.br';
const RECOVERY_EXP_MINUTES = 15;
const MIN_SECONDS_BETWEEN_CODES = 60;
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (String(process.env.NODE_ENV).toLowerCase() === 'production') {
    throw new Error('JWT_SECRET nao configurado. Defina a variavel de ambiente JWT_SECRET em producao.');
  }
  console.warn('[AVISO] JWT_SECRET nao definido. Usando segredo temporario — nao use em producao!');
  return 'dev-secret-inseguro-trocar-em-producao';
})();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// ── Rate limiting simples em memória para login ───────────────────────────────
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_BLOCK_MINUTES = 15;

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  if (record.blockedUntil > now) {
    const restanteMin = Math.ceil((record.blockedUntil - now) / 60000);
    return { bloqueado: true, restanteMin };
  }
  return { bloqueado: false, record };
}

function registrarFalhaLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.blockedUntil = now + LOGIN_BLOCK_MINUTES * 60 * 1000;
    record.count = 0;
  }
  loginAttempts.set(ip, record);
}

function limparFalhasLogin(ip) {
  loginAttempts.delete(ip);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmailEscolar(email) {
  return email.endsWith(DOMINIO_ALUNO) || email.endsWith(DOMINIO_PROFESSOR);
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function createCode() {
  // crypto.randomInt é criptograficamente seguro (substitui Math.random)
  return String(crypto.randomInt(100000, 1000000));
}

function createPickupQrCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function toPublicUser(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    matricula: usuario.matricula,
    turma: usuario.turma,
    criadoEm: usuario.criadoEm,
    atualizadoEm: usuario.atualizadoEm,
  };
}

function normalizeLivroPayload(payload = {}) {
  const totalExemplares = Math.max(0, Number(payload.totalExemplares ?? 1) || 0);
  const disponiveisRaw = payload.disponiveis == null
    ? totalExemplares
    : Number(payload.disponiveis);
  const disponiveis = Math.min(totalExemplares, Math.max(0, Number(disponiveisRaw) || 0));

  return {
    titulo: String(payload.titulo || '').trim().slice(0, 200),
    autor: String(payload.autor || '').trim().slice(0, 200),
    genero: String(payload.genero || '').trim().slice(0, 100),
    capa: String(payload.capa || '').trim().slice(0, 500),
    sinopse: String(payload.sinopse || '').trim().slice(0, 2000),
    totalExemplares,
    disponiveis,
  };
}

function invalidatePickupQr(emprestimo, motivo) {
  if (!emprestimo.retiradaQrCodigo) return;
  if (emprestimo.retiradaQrUsadoEm) return;

  emprestimo.retiradaQrInvalidadoEm = new Date().toISOString();
  emprestimo.retiradaQrInvalidadoMotivo = motivo;
  emprestimo.retiradaQrCodigo = null;
  emprestimo.retiradaQrPayload = null;
  emprestimo.retiradaQrGeradoEm = null;
  emprestimo.retiradaQrExpiraEm = null;
}

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '*';
  if (raw.trim() === '*') {
    return '*';
  }
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

// ── Middlewares de autenticação e autorização ─────────────────────────────────

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ erro: 'Token de autenticacao ausente.' });
    return;
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload;
    next();
  } catch {
    res.status(401).json({ erro: 'Token invalido ou expirado. Faca login novamente.' });
  }
}

function requirePerfil(...perfis) {
  return (req, res, next) => {
    if (!perfis.includes(req.usuario?.perfil)) {
      res.status(403).json({ erro: 'Acesso nao autorizado para este perfil.' });
      return;
    }
    next();
  };
}

// ── CORS e body parser ────────────────────────────────────────────────────────

const allowedOrigins = parseAllowedOrigins();
app.use(
  cors({
    origin(origin, callback) {
      if (allowedOrigins === '*') {
        callback(null, true);
        return;
      }
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origem nao permitida pelo CORS.'));
    },
  })
);

app.use(express.json({ limit: '256kb' }));

// ── Rotas públicas ────────────────────────────────────────────────────────────

app.get('/health', (_, res) => {
  res.json({ ok: true, service: 'biblioteca-api' });
});

// Cadastro — perfil restrito a 'aluno' e 'professor' (nunca 'bibliotecario')
app.post('/usuarios', async (req, res) => {
  const { nome, email, senha, matricula = '', turma = '' } = req.body || {};
  // O perfil é determinado pelo domínio do e-mail, não pelo cliente
  const emailNormalizado = normalizeEmail(email);

  if (!nome || !emailNormalizado || !senha) {
    res.status(400).json({ erro: 'Nome, e-mail e senha sao obrigatorios.' });
    return;
  }

  if (!isEmailEscolar(emailNormalizado)) {
    res.status(400).json({ erro: 'Use um e-mail escolar institucional valido.' });
    return;
  }

  // Perfil é derivado do domínio — cliente não controla
  const perfil = emailNormalizado.endsWith(DOMINIO_ALUNO) ? 'aluno' : 'professor';

  const nomeStr = String(nome).trim().slice(0, 150);
  if (!nomeStr) {
    res.status(400).json({ erro: 'Nome invalido.' });
    return;
  }

  if (String(senha).length < 6) {
    res.status(400).json({ erro: 'A senha deve ter no minimo 6 caracteres.' });
    return;
  }

  const db = await readDb();
  const existente = db.usuarios.find((u) => u.email === emailNormalizado);
  if (existente) {
    res.status(409).json({ erro: 'Este e-mail ja esta cadastrado.' });
    return;
  }

  const senhaHash = await bcrypt.hash(String(senha), 10);
  const novoUsuario = {
    id: createId(),
    nome: nomeStr,
    email: emailNormalizado,
    senhaHash,
    perfil,
    matricula: String(matricula || '').slice(0, 50),
    turma: String(turma || '').slice(0, 50),
    criadoEm: new Date().toISOString(),
  };

  db.usuarios.push(novoUsuario);
  await writeDb(db);

  res.status(201).json(toPublicUser(novoUsuario));
});

app.post('/usuarios/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  const { email, senha } = req.body || {};
  const emailNormalizado = normalizeEmail(email);

  if (!emailNormalizado || !senha) {
    res.status(400).json({ erro: 'E-mail e senha sao obrigatorios.' });
    return;
  }

  // Verificação de rate limit por IP
  const rateCheck = checkLoginRateLimit(ip);
  if (rateCheck.bloqueado) {
    res.status(429).json({
      erro: `Muitas tentativas de login. Tente novamente em ${rateCheck.restanteMin} minuto(s).`,
    });
    return;
  }

  const db = await readDb();
  const usuario = db.usuarios.find((u) => u.email === emailNormalizado);
  if (!usuario) {
    registrarFalhaLogin(ip);
    res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    return;
  }

  const ok = await bcrypt.compare(String(senha), usuario.senhaHash);
  if (!ok) {
    registrarFalhaLogin(ip);
    res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    return;
  }

  limparFalhasLogin(ip);

  const token = jwt.sign(
    { id: usuario.id, email: usuario.email, perfil: usuario.perfil },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.json({ ...toPublicUser(usuario), token });
});

app.post('/usuarios/recuperar-senha', async (req, res) => {
  const { email } = req.body || {};
  const emailNormalizado = normalizeEmail(email);

  if (!emailNormalizado || !isEmailEscolar(emailNormalizado)) {
    res.status(400).json({ erro: 'Informe um e-mail escolar valido.' });
    return;
  }

  const db = await readDb();
  const usuario = db.usuarios.find((u) => u.email === emailNormalizado);

  // Evita enumeracao de usuarios: sempre retorna sucesso.
  if (!usuario) {
    res.json({ mensagem: 'Se o e-mail existir, voce recebera um codigo de recuperacao.' });
    return;
  }

  const agora = Date.now();
  const ultimoPedido = db.recuperacoes
    .filter((r) => r.email === emailNormalizado)
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0];

  if (ultimoPedido) {
    const segundosDesdeUltimo = (agora - new Date(ultimoPedido.criadoEm).getTime()) / 1000;
    if (segundosDesdeUltimo < MIN_SECONDS_BETWEEN_CODES) {
      res.status(429).json({ erro: 'Aguarde um minuto para solicitar novo codigo.' });
      return;
    }
  }

  const codigo = createCode();
  const registro = {
    id: createId(),
    email: emailNormalizado,
    codigoHash: hashCode(codigo),
    criadoEm: new Date(agora).toISOString(),
    expiraEm: new Date(agora + RECOVERY_EXP_MINUTES * 60 * 1000).toISOString(),
    usadoEm: null,
  };

  db.recuperacoes.push(registro);
  await writeDb(db);

  const mailResult = await sendRecoveryCode({
    to: emailNormalizado,
    code: codigo,
    expiresInMinutes: RECOVERY_EXP_MINUTES,
  });

  const base = {
    mensagem: 'Codigo enviado. Verifique seu e-mail institucional.',
  };

  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (!mailResult.sent && !isProd) {
    res.json({
      ...base,
      codigo,
      aviso: 'SMTP nao configurado. Codigo retornado apenas em ambiente de desenvolvimento.',
    });
    return;
  }

  res.json(base);
});

app.post('/usuarios/redefinir-senha', async (req, res) => {
  const { email, codigo, novaSenha } = req.body || {};
  const emailNormalizado = normalizeEmail(email);

  if (!emailNormalizado || !codigo || !novaSenha) {
    res.status(400).json({ erro: 'E-mail, codigo e nova senha sao obrigatorios.' });
    return;
  }

  if (String(novaSenha).length < 6) {
    res.status(400).json({ erro: 'A nova senha deve ter no minimo 6 caracteres.' });
    return;
  }

  const db = await readDb();
  const usuario = db.usuarios.find((u) => u.email === emailNormalizado);
  if (!usuario) {
    res.status(400).json({ erro: 'Codigo invalido ou expirado.' });
    return;
  }

  const agora = Date.now();
  const recuperacaoValida = db.recuperacoes
    .filter((r) => r.email === emailNormalizado && !r.usadoEm)
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .find((r) => {
      const aindaValido = new Date(r.expiraEm).getTime() >= agora;
      const mesmoCodigo = r.codigoHash === hashCode(String(codigo).trim());
      return aindaValido && mesmoCodigo;
    });

  if (!recuperacaoValida) {
    res.status(400).json({ erro: 'Codigo invalido ou expirado.' });
    return;
  }

  usuario.senhaHash = await bcrypt.hash(String(novaSenha), 10);
  usuario.atualizadoEm = new Date().toISOString();
  recuperacaoValida.usadoEm = new Date().toISOString();

  await writeDb(db);
  res.json({ mensagem: 'Senha redefinida com sucesso.' });
});

// ── Rotas de livros ───────────────────────────────────────────────────────────

// Catálogo: qualquer usuário autenticado pode visualizar
app.get('/livros', verifyToken, async (_, res) => {
  const db = await readDb();
  res.json(db.livros);
});

// Adicionar livro: somente bibliotecario
app.post('/livros', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const livro = normalizeLivroPayload(req.body || {});

  if (!livro.titulo) {
    res.status(400).json({ erro: 'titulo e obrigatorio.' });
    return;
  }

  const db = await readDb();
  const existente = db.livros.find((l) =>
    String(l.titulo || '').trim().toLowerCase() === livro.titulo.toLowerCase() &&
    String(l.autor || '').trim().toLowerCase() === livro.autor.toLowerCase()
  );

  if (existente) {
    const emprestados = Math.max(0, Number(existente.totalExemplares || 0) - Number(existente.disponiveis || 0));
    const novoTotal = Math.max(0, Number(livro.totalExemplares || 0));

    existente.titulo = livro.titulo || existente.titulo;
    existente.autor = livro.autor || existente.autor;
    existente.genero = livro.genero || existente.genero;
    existente.capa = livro.capa || existente.capa;
    existente.sinopse = livro.sinopse || existente.sinopse;
    existente.totalExemplares = novoTotal;
    existente.disponiveis = Math.max(0, novoTotal - emprestados);
    existente.atualizadoEm = new Date().toISOString();

    await writeDb(db);
    res.status(200).json(existente);
    return;
  }

  const novoLivro = {
    id: createId(),
    ...livro,
    criadoEm: new Date().toISOString(),
  };

  db.livros.push(novoLivro);
  await writeDb(db);
  res.status(201).json(novoLivro);
});

// Editar livro: somente bibliotecario
app.patch('/livros/:id', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  const livro = db.livros.find((l) => l.id === id);

  if (!livro) {
    res.status(404).json({ erro: 'Livro nao encontrado.' });
    return;
  }

  const updates = normalizeLivroPayload({
    ...livro,
    ...req.body,
  });

  if (!updates.titulo) {
    res.status(400).json({ erro: 'titulo e obrigatorio.' });
    return;
  }

  Object.assign(livro, updates, { atualizadoEm: new Date().toISOString() });
  await writeDb(db);
  res.json(livro);
});

// Remover livro: somente bibliotecario
app.delete('/livros/:id', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const { id } = req.params;
  const db = await readDb();

  const ativo = db.emprestimos.some(
    (e) => e.livroId === id && (e.status === 'reservado' || e.status === 'retirado')
  );
  if (ativo) {
    res.status(409).json({ erro: 'Nao e possivel remover livro com emprestimo ativo.' });
    return;
  }

  const idx = db.livros.findIndex((l) => l.id === id);
  if (idx === -1) {
    res.status(404).json({ erro: 'Livro nao encontrado.' });
    return;
  }

  db.livros.splice(idx, 1);
  db.desejos = (db.desejos || []).filter((d) => d.livroId !== id);
  await writeDb(db);
  res.status(204).end();
});

// ── Rotas de usuários (admin) ─────────────────────────────────────────────────

// Listar usuários: somente bibliotecario e professor
app.get('/usuarios', verifyToken, requirePerfil('bibliotecario', 'professor'), async (req, res) => {
  const perfilFiltro = String(req.query.perfil || '').trim();
  const db = await readDb();
  const usuarios = db.usuarios
    .filter((u) => !perfilFiltro || u.perfil === perfilFiltro)
    .map(toPublicUser);
  res.json(usuarios);
});

// ── Rotas de empréstimos ──────────────────────────────────────────────────────

// Listar: bibliotecario/professor veem todos; aluno vê só os seus
app.get('/emprestimos', verifyToken, async (req, res) => {
  const db = await readDb();
  const { perfil, id } = req.usuario;
  if (perfil === 'bibliotecario' || perfil === 'professor') {
    res.json(db.emprestimos);
  } else {
    res.json(db.emprestimos.filter((e) => e.usuarioId === id));
  }
});

// Criar reserva: aluno/professor podem reservar apenas para si mesmos
app.post('/emprestimos', verifyToken, async (req, res) => {
  const { livroId } = req.body || {};
  // usuarioId sempre vem do token — cliente não controla
  const usuarioId = req.usuario.id;

  if (!livroId) {
    res.status(400).json({ erro: 'livroId e obrigatorio.' });
    return;
  }

  const db = await readDb();
  const usuario = db.usuarios.find((u) => u.id === usuarioId);
  const livro = db.livros.find((l) => l.id === livroId);

  if (!usuario) {
    res.status(404).json({ erro: 'Usuario nao encontrado.' });
    return;
  }
  if (!livro) {
    res.status(404).json({ erro: 'Livro nao encontrado.' });
    return;
  }
  if (Number(livro.disponiveis || 0) <= 0) {
    res.status(409).json({ erro: 'Sem exemplares disponiveis.' });
    return;
  }

  const jaTemAtivo = db.emprestimos.some(
    (e) => e.usuarioId === usuarioId && e.livroId === livroId && (e.status === 'reservado' || e.status === 'retirado')
  );
  if (jaTemAtivo) {
    res.status(409).json({ erro: 'Usuario ja possui emprestimo ativo deste livro.' });
    return;
  }

  livro.disponiveis = Math.max(0, Number(livro.disponiveis || 0) - 1);
  livro.atualizadoEm = new Date().toISOString();

  const novoEmprestimo = {
    id: createId(),
    usuarioId,
    livroId,
    usuarioNome: usuario.nome,
    usuarioTurma: usuario.turma || '',
    livroTitulo: livro.titulo,
    livroAutor: livro.autor || '',
    capa: livro.capa || '',
    status: 'reservado',
    renovado: false,
    dataReserva: new Date().toISOString(),
  };

  db.emprestimos.push(novoEmprestimo);
  await writeDb(db);
  res.status(201).json(novoEmprestimo);
});

// Gerar QR de retirada: dono do empréstimo ou bibliotecario
app.post('/emprestimos/:id/qr-retirada', verifyToken, async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  const emprestimo = db.emprestimos.find((e) => e.id === id);

  if (!emprestimo) {
    res.status(404).json({ erro: 'Emprestimo nao encontrado.' });
    return;
  }

  if (emprestimo.status !== 'reservado') {
    res.status(409).json({ erro: 'QR disponivel apenas para emprestimos reservados.' });
    return;
  }

  // Apenas o dono do empréstimo ou bibliotecario pode gerar o QR
  const { id: reqId, perfil } = req.usuario;
  if (perfil !== 'bibliotecario' && emprestimo.usuarioId !== reqId) {
    res.status(403).json({ erro: 'Voce nao pode gerar QR para este emprestimo.' });
    return;
  }

  const agora = Date.now();
  const expiraEm = new Date(agora + 15 * 60 * 1000).toISOString();
  const codigo = createPickupQrCode();
  const payload = `BIBLIO:${emprestimo.id}:${codigo}`;

  emprestimo.retiradaQrCodigo = codigo;
  emprestimo.retiradaQrPayload = payload;
  emprestimo.retiradaQrGeradoEm = new Date(agora).toISOString();
  emprestimo.retiradaQrExpiraEm = expiraEm;
  emprestimo.retiradaQrUsadoEm = null;
  emprestimo.atualizadoEm = new Date().toISOString();

  await writeDb(db);

  res.json({
    emprestimoId: emprestimo.id,
    codigo,
    payload,
    expiraEm,
  });
});

// Confirmar retirada por QR: somente bibliotecario
app.patch('/emprestimos/retirada-qr', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const codigoOuPayload = String(req.body?.codigo || '').trim();

  if (!codigoOuPayload) {
    res.status(400).json({ erro: 'codigo e obrigatorio.' });
    return;
  }

  const codigo = codigoOuPayload.startsWith('BIBLIO:')
    ? codigoOuPayload.split(':').pop()
    : codigoOuPayload;

  const db = await readDb();
  const agora = Date.now();

  const emprestimo = db.emprestimos.find((e) => {
    if (e.status !== 'reservado') return false;
    if (!e.retiradaQrCodigo) return false;
    if (e.retiradaQrCodigo !== codigo) return false;
    if (!e.retiradaQrExpiraEm) return false;
    return new Date(e.retiradaQrExpiraEm).getTime() >= agora;
  });

  if (!emprestimo) {
    res.status(400).json({ erro: 'QR invalido ou expirado.' });
    return;
  }

  emprestimo.status = 'retirado';
  emprestimo.dataRetirada = new Date().toISOString();
  emprestimo.retiradaQrUsadoEm = new Date().toISOString();
  emprestimo.atualizadoEm = new Date().toISOString();

  await writeDb(db);
  res.json({
    mensagem: 'Retirada confirmada por QR.',
    emprestimo,
  });
});

// Retirada manual: somente bibliotecario
app.patch('/emprestimos/:id/retirar', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  const emprestimo = db.emprestimos.find((e) => e.id === id);

  if (!emprestimo) {
    res.status(404).json({ erro: 'Emprestimo nao encontrado.' });
    return;
  }
  if (emprestimo.status !== 'reservado') {
    res.status(409).json({ erro: 'Apenas emprestimos reservados podem ser retirados.' });
    return;
  }

  invalidatePickupQr(emprestimo, 'retirada-manual');
  emprestimo.status = 'retirado';
  emprestimo.dataRetirada = new Date().toISOString();
  emprestimo.atualizadoEm = new Date().toISOString();
  await writeDb(db);
  res.json(emprestimo);
});

// Renovar: dono do empréstimo ou bibliotecario
app.patch('/emprestimos/:id/renovar', verifyToken, async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  const emprestimo = db.emprestimos.find((e) => e.id === id);

  if (!emprestimo) {
    res.status(404).json({ erro: 'Emprestimo nao encontrado.' });
    return;
  }

  const { id: reqId, perfil } = req.usuario;
  if (perfil !== 'bibliotecario' && emprestimo.usuarioId !== reqId) {
    res.status(403).json({ erro: 'Voce nao pode renovar este emprestimo.' });
    return;
  }

  if (emprestimo.status === 'devolvido') {
    res.status(409).json({ erro: 'Emprestimo ja devolvido.' });
    return;
  }
  if (emprestimo.renovado) {
    res.status(409).json({ erro: 'Emprestimo ja renovado.' });
    return;
  }

  emprestimo.renovado = true;
  emprestimo.atualizadoEm = new Date().toISOString();
  await writeDb(db);
  res.json(emprestimo);
});

// Devolver: somente bibliotecario
app.patch('/emprestimos/:id/devolver', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  const emprestimo = db.emprestimos.find((e) => e.id === id);

  if (!emprestimo) {
    res.status(404).json({ erro: 'Emprestimo nao encontrado.' });
    return;
  }
  if (emprestimo.status === 'devolvido') {
    res.status(409).json({ erro: 'Emprestimo ja devolvido.' });
    return;
  }

  invalidatePickupQr(emprestimo, 'devolucao');
  const livro = db.livros.find((l) => l.id === emprestimo.livroId);
  if (livro) {
    const total = Number(livro.totalExemplares || 0);
    const prox = Number(livro.disponiveis || 0) + 1;
    livro.disponiveis = total > 0 ? Math.min(total, prox) : prox;
    livro.atualizadoEm = new Date().toISOString();
  }

  emprestimo.status = 'devolvido';
  emprestimo.dataDevolucao = new Date().toISOString();
  emprestimo.atualizadoEm = new Date().toISOString();
  await writeDb(db);
  res.json(emprestimo);
});

// ── Rotas de avaliações ───────────────────────────────────────────────────────

app.get('/avaliacoes', verifyToken, async (_, res) => {
  const db = await readDb();
  res.json(db.avaliacoes || []);
});

app.post('/avaliacoes', verifyToken, async (req, res) => {
  const { livroId, nota, resenha = '' } = req.body || {};
  // usuarioId sempre vem do token
  const usuarioId = req.usuario.id;

  if (!livroId || nota == null) {
    res.status(400).json({ erro: 'livroId e nota sao obrigatorios.' });
    return;
  }

  const notaNum = Number(nota);
  if (!Number.isInteger(notaNum) || notaNum < 1 || notaNum > 5) {
    res.status(400).json({ erro: 'Nota deve ser um numero inteiro entre 1 e 5.' });
    return;
  }

  const db = await readDb();
  if (!db.avaliacoes) db.avaliacoes = [];

  const usuario = db.usuarios.find((u) => u.id === usuarioId);
  if (!usuario) {
    res.status(404).json({ erro: 'Usuario nao encontrado.' });
    return;
  }

  const livro = db.livros.find((l) => l.id === livroId);
  if (!livro) {
    res.status(404).json({ erro: 'Livro nao encontrado.' });
    return;
  }

  const temEmprestimoDevolvido = db.emprestimos.some(
    (e) => e.usuarioId === usuarioId && e.livroId === livroId && e.status === 'devolvido'
  );
  if (!temEmprestimoDevolvido) {
    res.status(403).json({ erro: 'Voce so pode avaliar livros que ja devolveu.' });
    return;
  }

  const jaAvaliou = db.avaliacoes.some((a) => a.usuarioId === usuarioId && a.livroId === livroId);
  if (jaAvaliou) {
    res.status(409).json({ erro: 'Voce ja avaliou este livro.' });
    return;
  }

  const novaAvaliacao = {
    id: createId(),
    usuarioId,
    livroId,
    usuarioNome: usuario.nome,
    livroTitulo: livro.titulo,
    nota: notaNum,
    resenha: String(resenha || '').trim().slice(0, 1000),
    criadoEm: new Date().toISOString(),
  };

  db.avaliacoes.push(novaAvaliacao);
  await writeDb(db);

  res.status(201).json(novaAvaliacao);
});

// ── Rotas de lista de desejos ─────────────────────────────────────────────────

// Listar: aluno vê só os seus; bibliotecario/professor podem filtrar por usuário
app.get('/desejos', verifyToken, async (req, res) => {
  const { id: reqId, perfil } = req.usuario;
  const db = await readDb();
  const lista = (db.desejos || []).filter((d) => {
    if (perfil === 'bibliotecario' || perfil === 'professor') {
      return !req.query.usuarioId || d.usuarioId === req.query.usuarioId;
    }
    return d.usuarioId === reqId;
  });
  res.json(lista);
});

// Adicionar: usuário só pode adicionar na própria lista
app.post('/desejos', verifyToken, async (req, res) => {
  const { livroId } = req.body || {};
  // usuarioId sempre vem do token
  const usuarioId = req.usuario.id;

  if (!livroId) {
    res.status(400).json({ erro: 'livroId e obrigatorio.' });
    return;
  }

  const db = await readDb();
  if (!db.desejos) db.desejos = [];

  const usuario = db.usuarios.find((u) => u.id === usuarioId);
  if (!usuario) { res.status(404).json({ erro: 'Usuario nao encontrado.' }); return; }

  const livro = db.livros.find((l) => l.id === livroId);
  if (!livro) { res.status(404).json({ erro: 'Livro nao encontrado.' }); return; }

  const jaExiste = db.desejos.find((d) => d.usuarioId === usuarioId && d.livroId === livroId);
  if (jaExiste) { res.status(409).json({ erro: 'Livro ja esta na lista de desejos.' }); return; }

  const novo = {
    id: createId(),
    usuarioId,
    livroId,
    livroTitulo: livro.titulo,
    livroAutor: livro.autor || '',
    livroGenero: livro.genero || '',
    livroCapa: livro.capa || '',
    criadoEm: new Date().toISOString(),
  };
  db.desejos.push(novo);
  await writeDb(db);
  res.status(201).json(novo);
});

// Remover: somente o dono ou bibliotecario
app.delete('/desejos/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { id: reqId, perfil } = req.usuario;
  const db = await readDb();
  if (!db.desejos) db.desejos = [];

  const idx = db.desejos.findIndex((d) => d.id === id);
  if (idx === -1) { res.status(404).json({ erro: 'Item nao encontrado.' }); return; }

  const desejo = db.desejos[idx];
  if (perfil !== 'bibliotecario' && desejo.usuarioId !== reqId) {
    res.status(403).json({ erro: 'Voce nao pode remover este item.' });
    return;
  }

  db.desejos.splice(idx, 1);
  await writeDb(db);
  res.status(204).end();
});

// ── Marlene — assistente virtual ─────────────────────────────────────────────

const marleneRequests = new Map();
const MARLENE_MAX_RPM = 10;

app.post('/api/marlene', verifyToken, async (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60_000;

  const entry = marleneRequests.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  marleneRequests.set(ip, entry);

  if (entry.count > MARLENE_MAX_RPM) {
    return res.status(429).json({ erro: 'Muitas mensagens. Aguarde um momento.' });
  }

  const { system, messages } = req.body;
  if (!system || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ erro: 'Parâmetros inválidos.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[Marlene] ANTHROPIC_API_KEY não configurada.');
    return res.status(503).json({ erro: 'Serviço indisponível.' });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system,
      messages,
    });
    const resposta = response.content?.[0]?.text ?? 'Não consegui responder agora. Tenta de novo!';
    res.json({ resposta });
  } catch (err) {
    console.error('[Marlene] Erro Anthropic:', err.message);
    res.status(502).json({ erro: 'Erro ao consultar assistente.' });
  }
});

// ── Reparo de dados: remove empréstimos órfãos (usuarioId inválido) ───────────
// Endpoint temporário — apenas bibliotecário pode usar
app.post('/admin/reparar-emprestimos', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const db = await readDb();

  const orfaos = db.emprestimos.filter(
    (e) => e.usuarioId === undefined || e.usuarioId === null || e.usuarioId === ''
  );

  if (orfaos.length === 0) {
    return res.json({ reparados: 0, mensagem: 'Nenhum empréstimo órfão encontrado.' });
  }

  // Devolve os exemplares dos livros afetados antes de remover
  for (const emp of orfaos) {
    if (emp.status === 'reservado' || emp.status === 'retirado') {
      const livro = db.livros.find((l) => l.id === emp.livroId);
      if (livro) {
        livro.disponiveis = Math.min((livro.disponiveis || 0) + 1, livro.totalExemplares || 1);
        livro.atualizadoEm = new Date().toISOString();
      }
    }
  }

  // Remove os empréstimos órfãos
  db.emprestimos = db.emprestimos.filter(
    (e) => e.usuarioId !== undefined && e.usuarioId !== null && e.usuarioId !== ''
  );

  await writeDb(db);

  console.log(`[Reparo] ${orfaos.length} empréstimo(s) órfão(s) removido(s).`);
  res.json({
    reparados: orfaos.length,
    mensagem: `${orfaos.length} empréstimo(s) sem dono removido(s) e exemplares devolvidos ao acervo.`,
    detalhes: orfaos.map((e) => ({ id: e.id, livroId: e.livroId, status: e.status })),
  });
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`Biblioteca API rodando em http://localhost:${PORT}`);
});
