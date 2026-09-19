const express = require('express');

module.exports = function (pool, requireAuth, requireAdmin) {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM projetos ORDER BY nome ASC');
    res.json(rows);
  });

  router.post('/', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { nome, codigo, clienteId } = req.body || {};
      if (!nome || !nome.trim() || !clienteId) return res.status(400).json({ error: 'Informe nome e cliente.' });
      const { rows } = await pool.query(
        'INSERT INTO projetos (nome, codigo, cliente_id) VALUES ($1,$2,$3) RETURNING *',
        [nome.trim(), (codigo || '').trim(), clienteId]
      );
      res.json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao criar projeto.' });
    }
  });

  router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const map = { nome: 'nome', codigo: 'codigo', clienteId: 'cliente_id', ativo: 'ativo' };
      const sets = [];
      const values = [];
      Object.keys(map).forEach((k) => {
        if (req.body[k] !== undefined) { values.push(req.body[k]); sets.push(`${map[k]} = $${values.length}`); }
      });
      if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
      values.push(req.params.id);
      const { rows } = await pool.query(`UPDATE projetos SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
      if (!rows.length) return res.status(404).json({ error: 'Projeto não encontrado.' });
      res.json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao atualizar projeto.' });
    }
  });

  return router;
};
