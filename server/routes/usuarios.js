const express = require('express');

module.exports = function (pool, requireAuth, requireAdmin, authLib) {
  const router = express.Router();
  const { hashSenha, gerarSenhaTemporaria } = authLib;

  function publicUser(u) {
    return { id: u.id, nome: u.nome, email: u.email, cargo: u.cargo, perfil: u.perfil, ativo: u.ativo, criadoEm: u.criado_em, temFoto: !!u.foto_mime };
  }

  router.get('/', requireAuth, requireAdmin, async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM usuarios ORDER BY nome ASC');
    res.json(rows.map(publicUser));
  });

  router.post('/', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { nome, email, cargo, perfil } = req.body || {};
      if (!nome || !nome.trim() || !email || !email.trim()) return res.status(400).json({ error: 'Informe nome e e-mail.' });
      const senhaTemp = gerarSenhaTemporaria();
      const { rows } = await pool.query(
        `INSERT INTO usuarios (nome, email, senha_hash, cargo, perfil, ativo)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING *`,
        [nome.trim(), email.trim().toLowerCase(), hashSenha(senhaTemp), (cargo || '').trim(), perfil === 'admin' ? 'admin' : 'colaborador']
      );
      const user = rows[0];
      res.json(Object.assign(publicUser(user), { senhaTemporaria: senhaTemp }));
    } catch (e) {
      if (e.code === '23505') return res.status(400).json({ error: 'Já existe uma conta com esse e-mail.' });
      console.error(e);
      res.status(500).json({ error: 'Erro ao adicionar usuário.' });
    }
  });

  router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const map = { nome: 'nome', cargo: 'cargo', perfil: 'perfil', ativo: 'ativo' };
      const sets = [];
      const values = [];
      Object.keys(map).forEach((k) => {
        if (req.body[k] !== undefined) { values.push(req.body[k]); sets.push(`${map[k]} = $${values.length}`); }
      });
      if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
      values.push(req.params.id);
      const { rows } = await pool.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
      if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
      res.json(publicUser(rows[0]));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
  });

  router.post('/:id/resetar-senha', requireAuth, requireAdmin, async (req, res) => {
    try {
      const senhaTemp = gerarSenhaTemporaria();
      const { rows } = await pool.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2 RETURNING id', [hashSenha(senhaTemp), req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
      res.json({ senhaTemporaria: senhaTemp });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao resetar senha.' });
    }
  });

  router.get('/:id/foto', requireAuth, async (req, res) => {
    const { rows } = await pool.query('SELECT foto_base64, foto_mime FROM usuarios WHERE id = $1', [req.params.id]);
    const u = rows[0];
    if (!u || !u.foto_base64) return res.status(404).send('Sem foto.');
    const buf = Buffer.from(u.foto_base64, 'base64');
    res.setHeader('Content-Type', u.foto_mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buf);
  });

  return router;
};
