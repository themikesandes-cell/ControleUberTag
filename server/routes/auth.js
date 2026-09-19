const express = require('express');

module.exports = function (pool, authLib) {
  const router = express.Router();
  const { hashSenha, checarSenha, emitirToken, authMiddleware } = authLib;
  const requireAuth = authMiddleware(pool);

  function publicUser(u) {
    return { id: u.id, nome: u.nome, email: u.email, cargo: u.cargo, perfil: u.perfil, ativo: u.ativo };
  }

  // Existe pelo menos um usuário cadastrado?
  router.get('/hasUsers', async (req, res) => {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM usuarios');
    res.json({ hasUsers: rows[0].c > 0 });
  });

  // Cria o primeiro administrador (só funciona se não existir ninguém ainda)
  router.post('/bootstrap', async (req, res) => {
    try {
      const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS c FROM usuarios');
      if (countRows[0].c > 0) return res.status(400).json({ error: 'Já existe um administrador configurado.' });
      const { nome, email, senha } = req.body || {};
      if (!nome || !email || !senha) return res.status(400).json({ error: 'Informe nome, e-mail e senha.' });
      if (senha.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
      const hash = hashSenha(senha);
      const { rows } = await pool.query(
        `INSERT INTO usuarios (nome, email, senha_hash, cargo, perfil, ativo)
         VALUES ($1, $2, $3, 'Administrador(a)', 'admin', true) RETURNING *`,
        [nome.trim(), email.trim().toLowerCase(), hash]
      );
      const user = rows[0];
      res.json({ token: emitirToken(user), user: publicUser(user) });
    } catch (e) {
      if (e.code === '23505') return res.status(400).json({ error: 'Já existe uma conta com esse e-mail.' });
      console.error(e);
      res.status(500).json({ error: 'Erro ao criar administrador.' });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { email, senha } = req.body || {};
      if (!email || !senha) return res.status(400).json({ error: 'Informe e-mail e senha.' });
      const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email.trim().toLowerCase()]);
      const user = rows[0];
      if (!user || !checarSenha(senha, user.senha_hash)) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }
      if (!user.ativo) return res.status(403).json({ error: 'Seu acesso foi desativado. Fale com um administrador.' });
      res.json({ token: emitirToken(user), user: publicUser(user) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao entrar.' });
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(publicUser(req.user));
  });

  router.post('/trocar-senha', requireAuth, async (req, res) => {
    try {
      const { senhaAtual, novaSenha } = req.body || {};
      if (!novaSenha || novaSenha.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      if (!checarSenha(senhaAtual || '', req.user.senha_hash)) return res.status(401).json({ error: 'Senha atual incorreta.' });
      await pool.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hashSenha(novaSenha), req.user.id]);
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao trocar senha.' });
    }
  });

  return { router, requireAuth };
};
