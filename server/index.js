const express = require('express');
const path = require('path');
const { pool, ensureSchema } = require('./db');
const authLib = require('./auth');

const app = express();
app.use(express.json({ limit: '15mb' }));

async function start() {
  try {
    await ensureSchema();
  } catch (e) {
    console.error('Falha ao preparar o banco de dados. Verifique DATABASE_URL.', e);
    process.exit(1);
  }

  const authRoutesModule = require('./routes/auth')(pool, authLib);
  const requireAuth = authRoutesModule.requireAuth;
  const requireAdmin = authLib.requireAdmin;

  app.use('/api/auth', authRoutesModule.router);
  app.use('/api/clientes', require('./routes/clientes')(pool, requireAuth, requireAdmin));
  app.use('/api/projetos', require('./routes/projetos')(pool, requireAuth, requireAdmin));
  app.use('/api/usuarios', require('./routes/usuarios')(pool, requireAuth, requireAdmin, authLib));
  const visitasRoutes = require('./routes/visitas');
  app.use('/api/visitas', visitasRoutes(pool, requireAuth, requireAdmin));
  app.use('/api/despesas', visitasRoutes.comprovanteRouter(pool, requireAuth));

  // Frontend estático
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log('Controle de Visitas & Uber rodando na porta ' + PORT);
  });
}

start();
