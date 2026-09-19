const express = require('express');

module.exports = function (pool, requireAuth, requireAdmin) {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM clientes ORDER BY nome ASC');
    res.json(rows);
  });

  router.post('/', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { nome, codigo, observacao } = req.body || {};
      if (!nome || !nome.trim()) return res.status(400).json({ error: 'Informe o nome do cliente.' });
      const { rows } = await pool.query(
        'INSERT INTO clientes (nome, codigo, observacao) VALUES ($1,$2,$3) RETURNING *',
        [nome.trim(), (codigo || '').trim(), (observacao || '').trim()]
      );
      res.json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao criar cliente.' });
    }
  });

  router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const fields = ['nome', 'codigo', 'observacao', 'ativo'];
      const sets = [];
      const values = [];
      fields.forEach((f) => {
        if (req.body[f] !== undefined) { values.push(req.body[f]); sets.push(`${f} = $${values.length}`); }
      });
      if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
      values.push(req.params.id);
      const { rows } = await pool.query(`UPDATE clientes SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
      if (!rows.length) return res.status(404).json({ error: 'Cliente não encontrado.' });
      res.json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao atualizar cliente.' });
    }
  });

  router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = req.params.id;
      const { rows: visitaCount } = await pool.query('SELECT COUNT(*)::int AS c FROM visitas WHERE cliente_id = $1', [id]);
      const { rows: projetoCount } = await pool.query('SELECT COUNT(*)::int AS c FROM projetos WHERE cliente_id = $1', [id]);
      if (visitaCount[0].c > 0 || projetoCount[0].c > 0) {
        return res.status(400).json({
          error: `Este cliente tem ${projetoCount[0].c} projeto(s) e ${visitaCount[0].c} visita(s) vinculados e não pode ser excluído (isso apagaria o histórico). Desative-o em vez de excluir.`
        });
      }
      const { rows } = await pool.query('DELETE FROM clientes WHERE id = $1 RETURNING id', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Cliente não encontrado.' });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao excluir cliente.' });
    }
  });

  return router;
};
