const express = require('express');

module.exports = function (pool, requireAuth, requireAdmin) {
  const router = express.Router();

  function visitaRowToJson(v) {
    return {
      id: v.id, colaboradorId: v.colaborador_id, colaboradorNome: v.colaborador_nome,
      clienteId: v.cliente_id, clienteNome: v.cliente_nome,
      projetoId: v.projeto_id, projetoNome: v.projeto_nome,
      dataVisita: v.data_visita instanceof Date ? v.data_visita.toISOString().slice(0, 10) : v.data_visita,
      observacao: v.observacao, status: v.status, motivoReprovacao: v.motivo_reprovacao,
      total: Number(v.total) || 0,
      criadoEm: v.criado_em, enviadoEm: v.enviado_em, aprovadoEm: v.aprovado_em,
      aprovadoPor: v.aprovado_por, aprovadoPorNome: v.aprovado_por_nome
    };
  }

  const LIST_SELECT = `
    SELECT v.*, u.nome AS colaborador_nome, c.nome AS cliente_nome, p.nome AS projeto_nome,
           a.nome AS aprovado_por_nome
    FROM visitas v
    LEFT JOIN usuarios u ON u.id = v.colaborador_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN projetos p ON p.id = v.projeto_id
    LEFT JOIN usuarios a ON a.id = v.aprovado_por
  `;

  router.get('/minhas', requireAuth, async (req, res) => {
    const { rows } = await pool.query(LIST_SELECT + ' WHERE v.colaborador_id = $1 ORDER BY v.data_visita DESC', [req.user.id]);
    res.json(rows.map(visitaRowToJson));
  });

  router.get('/todas', requireAuth, requireAdmin, async (req, res) => {
    const { rows } = await pool.query(LIST_SELECT + ' ORDER BY v.data_visita DESC');
    res.json(rows.map(visitaRowToJson));
  });

  router.get('/:id', requireAuth, async (req, res) => {
    const { rows } = await pool.query(LIST_SELECT + ' WHERE v.id = $1', [req.params.id]);
    const v = rows[0];
    if (!v) return res.status(404).json({ error: 'Prestação não encontrada.' });
    if (req.user.perfil !== 'admin' && v.colaborador_id !== req.user.id) {
      return res.status(403).json({ error: 'Você não tem acesso a esta prestação.' });
    }
    const { rows: despesas } = await pool.query(
      'SELECT id, categoria, tipo, valor, comprovante_nome, comprovante_mime FROM despesas WHERE visita_id = $1 ORDER BY tipo ASC',
      [v.id]
    );
    const json = visitaRowToJson(v);
    json.despesas = despesas.map((d) => ({
      id: d.id, categoria: d.categoria, tipo: d.tipo, valor: Number(d.valor) || 0,
      comprovanteNome: d.comprovante_nome,
      comprovanteUrl: d.comprovante_mime ? `/api/despesas/${d.id}/comprovante` : null,
      comprovanteTipo: d.comprovante_mime
    }));
    res.json(json);
  });

  async function salvarDespesas(client, visitaId, despesas, existingByTipo) {
    await client.query('DELETE FROM despesas WHERE visita_id = $1', [visitaId]);
    for (const d of despesas || []) {
      let base64 = d.comprovanteBase64, mime = d.comprovanteMime, nome = d.comprovanteNome;
      if (!base64 && existingByTipo && existingByTipo[d.tipo]) {
        base64 = existingByTipo[d.tipo].comprovante_base64;
        mime = existingByTipo[d.tipo].comprovante_mime;
        nome = existingByTipo[d.tipo].comprovante_nome;
      }
      await client.query(
        `INSERT INTO despesas (visita_id, categoria, tipo, valor, comprovante_base64, comprovante_mime, comprovante_nome)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [visitaId, d.categoria || 'Uber', d.tipo, d.valor || 0, base64 || null, mime || null, nome || null]
      );
    }
  }
  function calcTotal(despesas) {
    return (despesas || []).reduce((s, d) => s + (Number(d.valor) || 0), 0);
  }

  router.post('/', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      const p = req.body || {};
      if (!p.clienteId || !p.dataVisita) return res.status(400).json({ error: 'Informe cliente e data.' });
      const total = calcTotal(p.despesas);
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO visitas (colaborador_id, cliente_id, projeto_id, data_visita, observacao, status, total, enviado_em)
         VALUES ($1,$2,$3,$4,$5,'aguardando',$6, now()) RETURNING id`,
        [req.user.id, p.clienteId, p.projetoId || null, p.dataVisita, p.observacao || '', total]
      );
      const id = rows[0].id;
      await salvarDespesas(client, id, p.despesas);
      await client.query('COMMIT');
      res.json({ id });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
      res.status(500).json({ error: 'Erro ao criar visita.' });
    } finally {
      client.release();
    }
  });

  router.put('/:id', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      const existing = await client.query('SELECT * FROM visitas WHERE id = $1', [req.params.id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Prestação não encontrada.' });
      const v = existing.rows[0];
      if (req.user.perfil !== 'admin' && v.colaborador_id !== req.user.id) {
        return res.status(403).json({ error: 'Você não tem acesso a esta prestação.' });
      }
      const p = req.body || {};
      const total = calcTotal(p.despesas);
      const { rows: existingDespesas } = await client.query(
        'SELECT tipo, comprovante_base64, comprovante_mime, comprovante_nome FROM despesas WHERE visita_id = $1',
        [req.params.id]
      );
      const existingByTipo = {};
      existingDespesas.forEach((d) => { existingByTipo[d.tipo] = d; });
      await client.query('BEGIN');
      await client.query(
        `UPDATE visitas SET cliente_id=$1, projeto_id=$2, data_visita=$3, observacao=$4,
         status='aguardando', motivo_reprovacao='', total=$5, enviado_em=now()
         WHERE id=$6`,
        [p.clienteId, p.projetoId || null, p.dataVisita, p.observacao || '', total, req.params.id]
      );
      await salvarDespesas(client, req.params.id, p.despesas, existingByTipo);
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
      res.status(500).json({ error: 'Erro ao atualizar visita.' });
    } finally {
      client.release();
    }
  });

  router.post('/:id/aprovar', requireAuth, requireAdmin, async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE visitas SET status='aprovado', aprovado_em=now(), aprovado_por=$1, motivo_reprovacao=''
       WHERE id=$2 RETURNING id`,
      [req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Prestação não encontrada.' });
    res.json({ ok: true });
  });

  router.post('/:id/reprovar', requireAuth, requireAdmin, async (req, res) => {
    const motivo = (req.body && req.body.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Informe o motivo da reprovação.' });
    const { rows } = await pool.query(
      `UPDATE visitas SET status='reprovado', aprovado_em=now(), aprovado_por=$1, motivo_reprovacao=$2
       WHERE id=$3 RETURNING id`,
      [req.user.id, motivo, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Prestação não encontrada.' });
    res.json({ ok: true });
  });

  return router;
};

// Rota separada (montada em /api/despesas) para servir o arquivo do comprovante.
module.exports.comprovanteRouter = function (pool, requireAuth) {
  const router = express.Router();
  router.get('/:id/comprovante', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT d.*, v.colaborador_id FROM despesas d JOIN visitas v ON v.id = d.visita_id WHERE d.id = $1`,
      [req.params.id]
    );
    const d = rows[0];
    if (!d || !d.comprovante_base64) return res.status(404).send('Não encontrado.');
    if (req.user.perfil !== 'admin' && d.colaborador_id !== req.user.id) {
      return res.status(403).send('Sem acesso.');
    }
    const buf = Buffer.from(d.comprovante_base64, 'base64');
    res.setHeader('Content-Type', d.comprovante_mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buf);
  });
  return router;
};
