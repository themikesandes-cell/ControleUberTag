const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Em produção, defina JWT_SECRET nas variáveis de ambiente do Railway.
// Sem isso, geramos um segredo aleatório ao iniciar — funciona, mas todo
// mundo é deslogado sempre que o servidor reiniciar/reimplantar.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('AVISO: JWT_SECRET não definido. Defina essa variável de ambiente no Railway para sessões estáveis entre reinícios.');
}

function hashSenha(senha) {
  return bcrypt.hashSync(senha, 10);
}
function checarSenha(senha, hash) {
  return bcrypt.compareSync(senha, hash);
}
function emitirToken(usuario) {
  return jwt.sign({ id: usuario.id, perfil: usuario.perfil }, JWT_SECRET, { expiresIn: '30d' });
}
function verificarToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
function gerarSenhaTemporaria() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function authMiddleware(pool) {
  return async function (req, res, next) {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Não autenticado.' });
      const payload = verificarToken(token);
      const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [payload.id]);
      const user = rows[0];
      if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
      if (!user.ativo) return res.status(403).json({ error: 'Seu acesso foi desativado. Fale com um administrador.' });
      req.user = user;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
  };
}
function requireAdmin(req, res, next) {
  if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Ação restrita a administradores.' });
  next();
}

module.exports = { hashSenha, checarSenha, emitirToken, verificarToken, gerarSenhaTemporaria, authMiddleware, requireAdmin };
