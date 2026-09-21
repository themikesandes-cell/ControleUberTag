-- Controle de Visitas & Uber — esquema do banco (PostgreSQL)
-- Executado automaticamente no boot do servidor (ver server/db.js), então
-- você não precisa rodar isso manualmente no Railway.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  cargo TEXT NOT NULL DEFAULT '',
  perfil TEXT NOT NULL DEFAULT 'colaborador' CHECK (perfil IN ('admin','colaborador')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL DEFAULT '',
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  projeto_id UUID REFERENCES projetos(id) ON DELETE SET NULL,
  data_visita DATE NOT NULL,
  observacao TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','aprovado','reprovado')),
  motivo_reprovacao TEXT NOT NULL DEFAULT '',
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_em TIMESTAMPTZ,
  aprovado_em TIMESTAMPTZ,
  aprovado_por UUID REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id UUID NOT NULL REFERENCES visitas(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL DEFAULT 'Uber',
  tipo TEXT NOT NULL CHECK (tipo IN ('ida','volta','outro')),
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  comprovante_base64 TEXT,
  comprovante_mime TEXT,
  comprovante_nome TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitas_colaborador ON visitas(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_visitas_status ON visitas(status);
CREATE INDEX IF NOT EXISTS idx_visitas_data ON visitas(data_visita);
CREATE INDEX IF NOT EXISTS idx_despesas_visita ON despesas(visita_id);
CREATE INDEX IF NOT EXISTS idx_projetos_cliente ON projetos(cliente_id);

-- Controle de pagamento (adicionado depois — ALTER idempotente, seguro rodar em banco já existente)
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS pago BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS pago_por UUID REFERENCES usuarios(id);
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS pagamento_comprovante_base64 TEXT;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS pagamento_comprovante_mime TEXT;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS pagamento_comprovante_nome TEXT;
CREATE INDEX IF NOT EXISTS idx_visitas_pago ON visitas(pago);

-- Foto de perfil (colaborador e admin podem alterar a própria)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_base64 TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_mime TEXT;

-- Notificações (sino no topo: nova visita avisa admins; aprovação/reprovação avisa o colaborador)
CREATE TABLE IF NOT EXISTS notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  visita_id UUID REFERENCES visitas(id) ON DELETE CASCADE,
  mensagem TEXT NOT NULL,
  lida BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON notificacoes(usuario_id, lida, criado_em DESC);

-- Foto de perfil (adicionado depois — ALTER idempotente)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_base64 TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_mime TEXT;
