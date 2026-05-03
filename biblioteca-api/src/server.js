require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Anthropic = require('@anthropic-ai/sdk');

const { readDb, readDbSlices, writeDb } = require('./db');
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

// ── Mutex para operações de leitura-modificação-escrita no DB ────────────────
// Evita race condition quando múltiplos cadastros ocorrem simultaneamente

let _dbLock = Promise.resolve();

function withDbLock(fn) {
  const prev = _dbLock;
  let release;
  _dbLock = new Promise(r => { release = r; });
  return prev.then(fn).finally(() => release());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmailEscolar(email) {
  return email.endsWith(DOMINIO_ALUNO) || email.endsWith(DOMINIO_PROFESSOR);
}

function getPerfilFromEmail(email) {
  if (email.endsWith(DOMINIO_ALUNO)) return 'aluno';
  if (email.endsWith(DOMINIO_PROFESSOR)) return 'professor';
  return null;
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
    prateleira: String(payload.prateleira || '').trim().slice(0, 100),
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

// Qualquer perfil que não seja aluno nem professor tem acesso administrativo
function isAdmin(perfil) {
  return perfil && perfil !== 'aluno' && perfil !== 'professor';
}

function requirePerfil(...perfis) {
  return (req, res, next) => {
    const perfil = req.usuario?.perfil;
    // Se a lista inclui 'bibliotecario', qualquer perfil admin também passa
    const adminAllowed = perfis.includes('bibliotecario') && isAdmin(perfil);
    if (!perfis.includes(perfil) && !adminAllowed) {
      res.status(403).json({ erro: 'Acesso nao autorizado para este perfil.' });
      return;
    }
    next();
  };
}

// ── Push Notifications (Expo Push API) ───────────────────────────────────────

async function sendPushNotifications(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) return;
  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
  }));
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.error('[Push] Erro ao enviar notificações:', e.message);
  }
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
app.set('etag', false);
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ── Rotas públicas ────────────────────────────────────────────────────────────

app.get('/health', (_, res) => {
  res.json({ ok: true, service: 'biblioteca-api' });
});

app.get('/dashboard', verifyToken, async (req, res) => {
  const { id, perfil } = req.usuario;
  const canViewUsers = isAdmin(perfil) || perfil === 'professor';
  const canViewSuspensoes = isAdmin(perfil) || perfil === 'professor';

  const fatias = await readDbSlices([
    'livros',
    'emprestimos',
    'avaliacoes',
    'desejos',
    'comunicados',
    ...(canViewUsers ? ['usuarios'] : []),
    ...(canViewSuspensoes ? ['suspensoes'] : []),
  ]);

  const livros = Array.isArray(fatias.livros) ? fatias.livros : [];
  const emprestimosBase = Array.isArray(fatias.emprestimos) ? fatias.emprestimos : [];
  const avaliacoes = Array.isArray(fatias.avaliacoes) ? fatias.avaliacoes : [];
  const desejosBase = Array.isArray(fatias.desejos) ? fatias.desejos : [];
  const comunicados = Array.isArray(fatias.comunicados) ? fatias.comunicados : [];
  const usuariosBase = Array.isArray(fatias.usuarios) ? fatias.usuarios : [];
  const suspensoes = Array.isArray(fatias.suspensoes) ? fatias.suspensoes : [];

  const emprestimos = (isAdmin(perfil) || perfil === 'professor')
    ? emprestimosBase
    : emprestimosBase.filter((e) => e.usuarioId === id);

  const desejos = (isAdmin(perfil) || perfil === 'professor')
    ? desejosBase.filter((d) => !req.query.usuarioId || d.usuarioId === req.query.usuarioId)
    : desejosBase.filter((d) => d.usuarioId === id);

  const usuarios = canViewUsers ? usuariosBase.map(toPublicUser) : [];

  res.json({
    livros,
    emprestimos,
    avaliacoes,
    desejos,
    usuarios,
    comunicados,
    suspensoes,
  });
});

// Cadastro — perfil restrito a 'aluno' e 'professor' (nunca 'bibliotecario')
app.post('/usuarios', async (req, res) => {
  const { nome, email, senha, matricula = '', turma = '' } = req.body || {};
  const emailNormalizado = normalizeEmail(email);

  if (!nome || !emailNormalizado || !senha) {
    res.status(400).json({ erro: 'Nome, e-mail e senha sao obrigatorios.' });
    return;
  }

  const perfilInformado = String(req.body?.perfil || '').trim();
  const perfilPorDominio = getPerfilFromEmail(emailNormalizado);
  if (!perfilPorDominio) {
    res.status(400).json({ erro: 'Use um e-mail institucional válido para cadastro.' });
    return;
  }
  if (perfilInformado && perfilInformado !== perfilPorDominio) {
    res.status(400).json({ erro: 'O perfil informado não corresponde ao domínio do e-mail.' });
    return;
  }
  const perfil = perfilPorDominio;

  const nomeStr = String(nome).trim().slice(0, 150);
  if (!nomeStr) {
    res.status(400).json({ erro: 'Nome invalido.' });
    return;
  }

  const senhaTrimmed = String(senha).trim();
  if (senhaTrimmed.length < 6) {
    res.status(400).json({ erro: 'A senha deve ter no minimo 6 caracteres.' });
    return;
  }

  const senhaHash = await bcrypt.hash(senhaTrimmed, 10);

  const resultado = await withDbLock(async () => {
    const dbAtual = await readDb();
    if (dbAtual.usuarios.find((u) => u.email === emailNormalizado)) {
      return { erro: 'Este e-mail ja esta cadastrado.', status: 409 };
    }
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
    dbAtual.usuarios.push(novoUsuario);
    await writeDb(dbAtual);
    return { usuario: novoUsuario };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }

  res.status(201).json(toPublicUser(resultado.usuario));
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

  const ok = await bcrypt.compare(String(senha).trim(), usuario.senhaHash);
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

app.delete('/usuarios/me', verifyToken, async (req, res) => {
  const { id } = req.usuario;
  await withDbLock(async () => {
    const db = await readDb();
    db.usuarios = db.usuarios.filter((u) => u.id !== id);
    db.emprestimos = (db.emprestimos || []).filter((e) => e.usuarioId !== id);
    db.desejos = (db.desejos || []).filter((d) => d.usuarioId !== id);
    db.avaliacoes = (db.avaliacoes || []).filter((a) => a.usuarioId !== id);
    db.pushTokens = (db.pushTokens || []).filter((pt) => pt.userId !== id);
    await writeDb(db);
  });
  res.json({ ok: true });
});

app.post('/usuarios/push-token', verifyToken, async (req, res) => {
  const { token } = req.body || {};
  if (!token || typeof token !== 'string' || token.length > 500) {
    res.status(400).json({ erro: 'Token inválido.' });
    return;
  }
  await withDbLock(async () => {
    const db = await readDb();
    const idx = db.pushTokens.findIndex((pt) => pt.userId === req.usuario.id);
    const entry = { userId: req.usuario.id, token, atualizadoEm: new Date().toISOString() };
    if (idx >= 0) {
      db.pushTokens[idx] = entry;
    } else {
      db.pushTokens.push(entry);
    }
    await writeDb(db);
  });
  res.json({ ok: true });
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
  await withDbLock(async () => {
    const dbAtual = await readDb();
    const registro = {
      id: createId(),
      email: emailNormalizado,
      codigoHash: hashCode(codigo),
      criadoEm: new Date(agora).toISOString(),
      expiraEm: new Date(agora + RECOVERY_EXP_MINUTES * 60 * 1000).toISOString(),
      usadoEm: null,
    };
    dbAtual.recuperacoes.push(registro);
    await writeDb(dbAtual);
  });

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

  const resultado = await withDbLock(async () => {
    const db = await readDb();
    const usuario = db.usuarios.find((u) => u.email === emailNormalizado);
    if (!usuario) {
      return { status: 400, erro: 'Codigo invalido ou expirado.' };
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
      return { status: 400, erro: 'Codigo invalido ou expirado.' };
    }

    usuario.senhaHash = await bcrypt.hash(String(novaSenha), 10);
    usuario.atualizadoEm = new Date().toISOString();
    recuperacaoValida.usadoEm = new Date().toISOString();

    await writeDb(db);
    return { status: 200 };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
  res.json({ mensagem: 'Senha redefinida com sucesso.' });
});

// ── Rotas de livros ───────────────────────────────────────────────────────────

// Catálogo: qualquer usuário autenticado pode visualizar
app.get('/livros', verifyToken, async (_, res) => {
  const slices = await readDbSlices(['livros']);
  res.json(slices.livros || []);
});

// Adicionar livro: somente bibliotecario
app.post('/livros', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const livro = normalizeLivroPayload(req.body || {});

  if (!livro.titulo) {
    res.status(400).json({ erro: 'titulo e obrigatorio.' });
    return;
  }

  const resultado = await withDbLock(async () => {
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
      return { status: 200, livro: existente };
    }

    const novoLivro = {
      id: createId(),
      ...livro,
      criadoEm: new Date().toISOString(),
    };

    db.livros.push(novoLivro);
    await writeDb(db);
    return { status: 201, livro: novoLivro };
  });

  res.status(resultado.status).json(resultado.livro);
});

// Editar livro: somente bibliotecario
app.patch('/livros/:id', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const { id } = req.params;
  const resultado = await withDbLock(async () => {
    const db = await readDb();
    const livro = db.livros.find((l) => l.id === id);

    if (!livro) {
      return { status: 404, erro: 'Livro nao encontrado.' };
    }

    const updates = normalizeLivroPayload({
      ...livro,
      ...req.body,
    });

    if (!updates.titulo) {
      return { status: 400, erro: 'titulo e obrigatorio.' };
    }

    Object.assign(livro, updates, { atualizadoEm: new Date().toISOString() });
    await writeDb(db);
    return { status: 200, livro };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
  res.json(resultado.livro);
});

// Remover livro: somente bibliotecario
app.delete('/livros/:id', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const { id } = req.params;
  const resultado = await withDbLock(async () => {
    const db = await readDb();

    const ativo = db.emprestimos.some(
      (e) => e.livroId === id && (e.status === 'reservado' || e.status === 'retirado')
    );
    if (ativo) {
      return { status: 409, erro: 'Nao e possivel remover livro com emprestimo ativo.' };
    }

    const idx = db.livros.findIndex((l) => l.id === id);
    if (idx === -1) {
      return { status: 404, erro: 'Livro nao encontrado.' };
    }

    db.livros.splice(idx, 1);
    db.desejos = (db.desejos || []).filter((d) => d.livroId !== id);
    await writeDb(db);
    return { status: 204 };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
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
  const slices = await readDbSlices(['emprestimos']);
  const { perfil, id } = req.usuario;
  if (isAdmin(perfil) || perfil === 'professor') {
    res.json(slices.emprestimos || []);
  } else {
    res.json((slices.emprestimos || []).filter((e) => e.usuarioId === id));
  }
});

app.get('/emprestimos/:id/status', verifyToken, async (req, res) => {
  const slices = await readDbSlices(['emprestimos']);
  const emp = (slices.emprestimos || []).find((e) => e.id === req.params.id);
  if (!emp) { res.status(404).json({ erro: 'Empréstimo não encontrado.' }); return; }
  if (req.usuario.id !== emp.usuarioId && !isAdmin(req.usuario.perfil) && req.usuario.perfil !== 'professor') {
    res.status(403).json({ erro: 'Acesso negado.' }); return;
  }
  res.json({ status: emp.status });
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

  // withDbLock garante atomicidade: sem race condition entre múltiplas reservas simultâneas
  const resultado = await withDbLock(async () => {
    const db = await readDb();
    const usuario = db.usuarios.find((u) => u.id === usuarioId);
    const livro = db.livros.find((l) => l.id === livroId);

    if (!usuario) return { status: 404, erro: 'Usuario nao encontrado.' };
    if (!livro)   return { status: 404, erro: 'Livro nao encontrado.' };
    if (Number(livro.disponiveis || 0) <= 0)
      return { status: 409, erro: 'Sem exemplares disponiveis.' };

    const jaTemAtivo = db.emprestimos.some(
      (e) => e.usuarioId === usuarioId && e.livroId === livroId &&
             (e.status === 'reservado' || e.status === 'retirado')
    );
    if (jaTemAtivo)
      return { status: 409, erro: 'Usuario ja possui emprestimo ativo deste livro.' };

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
    return { status: 201, emprestimo: novoEmprestimo };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
  res.status(201).json(resultado.emprestimo);
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

  // Apenas o dono do empréstimo ou admin pode gerar o QR
  const { id: reqId, perfil } = req.usuario;
  if (!isAdmin(perfil) && emprestimo.usuarioId !== reqId) {
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

  const resultado = await withDbLock(async () => {
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
      return { status: 400, erro: 'QR invalido ou expirado.' };
    }

    const agora8d = new Date();
    emprestimo.status = 'retirado';
    emprestimo.dataRetirada = agora8d.toISOString();
    emprestimo.dataPrevistaDevolucao = new Date(agora8d.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString();
    emprestimo.retiradaQrUsadoEm = agora8d.toISOString();
    emprestimo.atualizadoEm = agora8d.toISOString();

    await writeDb(db);
    return { status: 200, emprestimo };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
  res.json({
    mensagem: 'Retirada confirmada por QR.',
    emprestimo: resultado.emprestimo,
  });
});

// Retirada manual: somente bibliotecario
app.patch('/emprestimos/:id/retirar', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const { id } = req.params;
  const resultado = await withDbLock(async () => {
    const db = await readDb();
    const emprestimo = db.emprestimos.find((e) => e.id === id);

    if (!emprestimo) {
      return { status: 404, erro: 'Emprestimo nao encontrado.' };
    }
    if (emprestimo.status !== 'reservado') {
      return { status: 409, erro: 'Apenas emprestimos reservados podem ser retirados.' };
    }

    const agora8dm = new Date();
    invalidatePickupQr(emprestimo, 'retirada-manual');
    emprestimo.status = 'retirado';
    emprestimo.dataRetirada = agora8dm.toISOString();
    emprestimo.dataPrevistaDevolucao = new Date(agora8dm.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString();
    emprestimo.atualizadoEm = agora8dm.toISOString();
    await writeDb(db);
    return { status: 200, emprestimo };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
  res.json(resultado.emprestimo);
});

// Renovar: dono do empréstimo ou bibliotecario
app.patch('/emprestimos/:id/renovar', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { id: reqId, perfil } = req.usuario;
  const resultado = await withDbLock(async () => {
    const db = await readDb();
    const emprestimo = db.emprestimos.find((e) => e.id === id);

    if (!emprestimo) {
      return { status: 404, erro: 'Emprestimo nao encontrado.' };
    }

    if (!isAdmin(perfil) && emprestimo.usuarioId !== reqId) {
      return { status: 403, erro: 'Voce nao pode renovar este emprestimo.' };
    }

    if (emprestimo.status === 'devolvido') {
      return { status: 409, erro: 'Emprestimo ja devolvido.' };
    }
    if (emprestimo.renovado) {
      return { status: 409, erro: 'Emprestimo ja renovado.' };
    }

    emprestimo.renovado = true;
    const baseRenovacao = emprestimo.dataPrevistaDevolucao
      ? new Date(emprestimo.dataPrevistaDevolucao).getTime()
      : Date.now();
    emprestimo.dataPrevistaDevolucao = new Date(baseRenovacao + 5 * 24 * 60 * 60 * 1000).toISOString();
    emprestimo.atualizadoEm = new Date().toISOString();
    await writeDb(db);
    return { status: 200, emprestimo };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
  res.json(resultado.emprestimo);
});

// Devolver: somente bibliotecario
app.patch('/emprestimos/:id/devolver', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const { id } = req.params;
  const resultado = await withDbLock(async () => {
    const db = await readDb();
    const emprestimo = db.emprestimos.find((e) => e.id === id);

    if (!emprestimo) {
      return { status: 404, erro: 'Emprestimo nao encontrado.' };
    }
    if (emprestimo.status === 'devolvido') {
      return { status: 409, erro: 'Emprestimo ja devolvido.' };
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
    return { status: 200, emprestimo };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
  res.json(resultado.emprestimo);
});

// ── Rotas de avaliações ───────────────────────────────────────────────────────

app.get('/avaliacoes', verifyToken, async (_, res) => {
  const slices = await readDbSlices(['avaliacoes']);
  res.json(slices.avaliacoes || []);
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

  const resultado = await withDbLock(async () => {
    const db = await readDb();
    if (!db.avaliacoes) db.avaliacoes = [];

    const usuario = db.usuarios.find((u) => u.id === usuarioId);
    if (!usuario) {
      return { status: 404, erro: 'Usuario nao encontrado.' };
    }

    const livro = db.livros.find((l) => l.id === livroId);
    if (!livro) {
      return { status: 404, erro: 'Livro nao encontrado.' };
    }

    const temEmprestimoDevolvido = db.emprestimos.some(
      (e) => e.usuarioId === usuarioId && e.livroId === livroId && e.status === 'devolvido'
    );
    if (!temEmprestimoDevolvido) {
      return { status: 403, erro: 'Voce so pode avaliar livros que ja devolveu.' };
    }

    const jaAvaliou = db.avaliacoes.some((a) => a.usuarioId === usuarioId && a.livroId === livroId);
    if (jaAvaliou) {
      return { status: 409, erro: 'Voce ja avaliou este livro.' };
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

    return { status: 201, avaliacao: novaAvaliacao };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
  res.status(201).json(resultado.avaliacao);
});

// ── Rotas de lista de desejos ─────────────────────────────────────────────────

// Listar: aluno vê só os seus; bibliotecario/professor podem filtrar por usuário
app.get('/desejos', verifyToken, async (req, res) => {
  const { id: reqId, perfil } = req.usuario;
  const slices = await readDbSlices(['desejos']);
  const lista = (slices.desejos || []).filter((d) => {
    if (isAdmin(perfil) || perfil === 'professor') {
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

  const resultado = await withDbLock(async () => {
    const db = await readDb();
    if (!db.desejos) db.desejos = [];

    const usuario = db.usuarios.find((u) => u.id === usuarioId);
    if (!usuario) return { status: 404, erro: 'Usuario nao encontrado.' };

    const livro = db.livros.find((l) => l.id === livroId);
    if (!livro) return { status: 404, erro: 'Livro nao encontrado.' };

    const jaExiste = db.desejos.find((d) => d.usuarioId === usuarioId && d.livroId === livroId);
    if (jaExiste) return { status: 409, erro: 'Livro ja esta na lista de desejos.' };

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
    return { status: 201, desejo: novo };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
  res.status(201).json(resultado.desejo);
});

// Remover: somente o dono ou bibliotecario
app.delete('/desejos/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { id: reqId, perfil } = req.usuario;
  const resultado = await withDbLock(async () => {
    const db = await readDb();
    if (!db.desejos) db.desejos = [];

    const idx = db.desejos.findIndex((d) => d.id === id);
    if (idx === -1) return { status: 404, erro: 'Item nao encontrado.' };

    const desejo = db.desejos[idx];
    if (!isAdmin(perfil) && desejo.usuarioId !== reqId) {
      return { status: 403, erro: 'Voce nao pode remover este item.' };
    }

    db.desejos.splice(idx, 1);
    await writeDb(db);
    return { status: 204 };
  });

  if (resultado.erro) {
    res.status(resultado.status).json({ erro: resultado.erro });
    return;
  }
  res.status(204).end();
});

// ── Scan de capa — identifica livro por foto ─────────────────────────────────

app.post('/api/scan-livro/analisar', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const { imagemBase64, mediaType = 'image/jpeg' } = req.body || {};
  if (!imagemBase64) {
    return res.status(400).json({ erro: 'imagemBase64 é obrigatório.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ erro: 'Serviço indisponível.' });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imagemBase64 },
          },
          {
            type: 'text',
            text: 'Identifique este livro. Responda SOMENTE com um JSON válido no formato: {"titulo":"...","autor":"...","genero":"...","sinopse":"..."}\nSe não conseguir identificar algum campo, use string vazia. Não inclua nada fora do JSON.',
          },
        ],
      }],
    });

    const texto = response.content?.[0]?.text ?? '{}';
    const match = texto.match(/\{[\s\S]*\}/);
    const dados = match ? JSON.parse(match[0]) : {};
    res.json({
      titulo: String(dados.titulo || '').trim(),
      autor: String(dados.autor || '').trim(),
      genero: String(dados.genero || '').trim(),
      sinopse: String(dados.sinopse || '').trim(),
    });
  } catch (err) {
    console.error('[ScanLivro]', err.message);
    res.status(502).json({ erro: 'Não foi possível identificar o livro.' });
  }
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

// ── Reparo de dados ───────────────────────────────────────────────────────────
// Remove empréstimos órfãos e corrige disponiveis negativo/inconsistente
app.post('/admin/reparar-emprestimos', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const resultado = await withDbLock(async () => {
    const db = await readDb();

    // 1. Remove empréstimos sem usuário válido
    const orfaos = db.emprestimos.filter(
      (e) => e.usuarioId === undefined || e.usuarioId === null || e.usuarioId === ''
    );
    for (const emp of orfaos) {
      if (emp.status === 'reservado' || emp.status === 'retirado') {
        const livro = db.livros.find((l) => l.id === emp.livroId);
        if (livro) {
          livro.disponiveis = Math.min((livro.disponiveis || 0) + 1, livro.totalExemplares || 1);
          livro.atualizadoEm = new Date().toISOString();
        }
      }
    }
    db.emprestimos = db.emprestimos.filter(
      (e) => e.usuarioId !== undefined && e.usuarioId !== null && e.usuarioId !== ''
    );

    // 2. Recalcula disponiveis de cada livro a partir dos empréstimos ativos reais
    let negativosCorrigidos = 0;
    for (const livro of db.livros) {
      const emprestadosAtivos = db.emprestimos.filter(
        (e) => e.livroId === livro.id && (e.status === 'reservado' || e.status === 'retirado')
      ).length;
      const total = Number(livro.totalExemplares || 0);
      const correto = Math.max(0, total - emprestadosAtivos);
      if ((livro.disponiveis || 0) !== correto) {
        livro.disponiveis = correto;
        livro.atualizadoEm = new Date().toISOString();
        negativosCorrigidos++;
      }
    }

    await writeDb(db);
    return { orfaos: orfaos.length, negativosCorrigidos };
  });

  const msg = [
    resultado.orfaos > 0 ? `${resultado.orfaos} empréstimo(s) órfão(s) removido(s)` : null,
    resultado.negativosCorrigidos > 0 ? `${resultado.negativosCorrigidos} livro(s) com estoque corrigido` : null,
  ].filter(Boolean).join('. ') || 'Dados já consistentes.';

  console.log(`[Reparo] ${msg}`);
  res.json({ reparados: resultado.orfaos, negativosCorrigidos: resultado.negativosCorrigidos, mensagem: msg });
});

// ── Comunicados ───────────────────────────────────────────────────────────────

app.get('/comunicados', verifyToken, async (_, res) => {
  const slices = await readDbSlices(['comunicados']);
  res.json(slices.comunicados || []);
});

app.post('/comunicados', verifyToken, requirePerfil('bibliotecario', 'professor'), async (req, res) => {
  const { titulo, mensagem, tipo = 'info' } = req.body || {};
  if (!titulo || !mensagem) {
    res.status(400).json({ erro: 'titulo e mensagem sao obrigatorios.' });
    return;
  }
  const resultado = await withDbLock(async () => {
    const db = await readDb();
    const novo = {
      id: createId(),
      titulo: String(titulo).trim().slice(0, 200),
      mensagem: String(mensagem).trim().slice(0, 2000),
      tipo: String(tipo).trim().slice(0, 50),
      autorId: req.usuario.id,
      autorNome: db.usuarios.find((u) => u.id === req.usuario.id)?.nome || '',
      criadoEm: new Date().toISOString(),
    };
    db.comunicados.push(novo);
    await writeDb(db);
    return { novo, tokens: (db.pushTokens || []).map((pt) => pt.token) };
  });
  // dispara notificações fora do lock para não bloquear escritas
  sendPushNotifications(resultado.tokens, resultado.novo.titulo, resultado.novo.mensagem);
  res.status(201).json(resultado.novo);
});

app.delete('/comunicados/:id', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const resultado = await withDbLock(async () => {
    const db = await readDb();
    const idx = db.comunicados.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return { status: 404, erro: 'Comunicado nao encontrado.' };
    db.comunicados.splice(idx, 1);
    await writeDb(db);
    return { status: 204 };
  });
  if (resultado.erro) { res.status(resultado.status).json({ erro: resultado.erro }); return; }
  res.status(204).end();
});

// ── Suspensões ────────────────────────────────────────────────────────────────

app.get('/suspensoes', verifyToken, requirePerfil('bibliotecario', 'professor'), async (_, res) => {
  const db = await readDb();
  res.json(db.suspensoes || []);
});

app.get('/suspensoes/verificar/:usuarioId', verifyToken, async (req, res) => {
  const db = await readDb();
  const agora = new Date();
  const suspensaoAtiva = (db.suspensoes || []).find(
    (s) => s.usuarioId === req.params.usuarioId && new Date(s.expiraEm) > agora
  );
  if (suspensaoAtiva) {
    res.json({ bloqueado: true, expiraEm: suspensaoAtiva.expiraEm, motivo: suspensaoAtiva.motivo });
  } else {
    res.json({ bloqueado: false });
  }
});

app.post('/suspensoes', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const { usuarioId, motivo = 'Devolucao em atraso', dias = 7 } = req.body || {};
  if (!usuarioId) { res.status(400).json({ erro: 'usuarioId e obrigatorio.' }); return; }
  const resultado = await withDbLock(async () => {
    const db = await readDb();
    const usuario = db.usuarios.find((u) => u.id === usuarioId);
    if (!usuario) return { status: 404, erro: 'Usuario nao encontrado.' };
    const expiraEm = new Date(Date.now() + Number(dias) * 24 * 60 * 60 * 1000).toISOString();
    const nova = {
      id: createId(),
      usuarioId,
      motivo: String(motivo).trim().slice(0, 300),
      expiraEm,
      criadoEm: new Date().toISOString(),
    };
    db.suspensoes = (db.suspensoes || []).filter((s) => s.usuarioId !== usuarioId);
    db.suspensoes.push(nova);
    await writeDb(db);
    return { status: 201, suspensao: nova };
  });
  if (resultado.erro) { res.status(resultado.status).json({ erro: resultado.erro }); return; }
  res.status(201).json(resultado.suspensao);
});

app.delete('/suspensoes/:id', verifyToken, requirePerfil('bibliotecario'), async (req, res) => {
  const resultado = await withDbLock(async () => {
    const db = await readDb();
    const idx = (db.suspensoes || []).findIndex((s) => s.id === req.params.id);
    if (idx === -1) return { status: 404, erro: 'Suspensao nao encontrada.' };
    db.suspensoes.splice(idx, 1);
    await writeDb(db);
    return { status: 204 };
  });
  if (resultado.erro) { res.status(resultado.status).json({ erro: resultado.erro }); return; }
  res.status(204).end();
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`Biblioteca API rodando em http://localhost:${PORT}`);
});
