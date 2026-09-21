const express = require('express');

module.exports = function (pool, requireAuth) {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT n.*, v.colaborador_id AS visita_colaborador_id
       FROM notificacoes n
       LEFT JOIN visitas v ON v.id = n.visita_id
       WHERE n.usuario_id = $1
       ORDER BY n.criado_em DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows.map((r) => ({
      id: r.id, tipo: r.tipo, visitaId: r.visita_id, visitaColaboradorId: r.visita_colaborador_id,
      mensagem: r.mensagem, lida: r.lida, criadoEm: r.criado_em
    })));
  });

  router.get('/contagem', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS c FROM notificacoes WHERE usuario_id = $1 AND lida = false',
      [req.user.id]
    );
    res.json({ naoLidas: rows[0].c });
  });

  router.post('/:id/marcar-lida', requireAuth, async (req, res) => {
    await pool.query('UPDATE notificacoes SET lida = true WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  });

  router.post('/marcar-todas-lidas', requireAuth, async (req, res) => {
    await pool.query('UPDATE notificacoes SET lida = true WHERE usuario_id = $1 AND lida = false', [req.user.id]);
    res.json({ ok: true });
  });

  return router;
};
