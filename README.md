# Controle de Visitas & Uber

Sistema interno para substituir planilhas no controle de despesas de
deslocamento (Uber, ida/volta) de colaboradores em visitas a clientes, com
fluxo de aprovação por um administrador.

- **Backend:** Node.js + Express
- **Banco de dados:** PostgreSQL (dados relacionais de verdade: usuários,
  clientes, projetos, visitas, despesas)
- **Login:** e-mail e senha reais (senha com hash bcrypt, sessão por token JWT)
- **Comprovantes:** fotos/PDF guardados no próprio banco (compactados no
  navegador antes do envio)
- **Feito para rodar no [Railway](https://railway.app)**, mas roda em
  qualquer lugar que rode Node + Postgres

## Funcionalidades

- Dois perfis: **Administrador** (aprova despesas, cadastra clientes,
  projetos e usuários, vê relatórios) e **Colaborador** (registra e
  acompanha só as próprias visitas).
- Fluxo de nova visita em etapas: cliente → data → projeto → Uber ida →
  Uber volta → resumo → envio.
- Prestações reprovadas podem ser corrigidas e reenviadas.
- Painel administrativo com pendentes, aprovadas e reprovadas do mês.
- Lista completa de visitas com filtros, ordenação, paginação e
  exportação em CSV.
- Relatórios com total por cliente, colaborador, projeto **e por mês**
  (controle mensal).
- Permissões aplicadas no backend (não só escondidas na tela): um
  colaborador não consegue ler/editar dados de outro nem virar
  administrador sozinho.

## 1. Subindo no GitHub

Dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "Controle de Visitas & Uber"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/controle-visitas-uber.git
git push -u origin main
```

(Crie o repositório vazio no GitHub antes, em github.com/new — sem README,
sem .gitignore, para não dar conflito com o que já está aqui.)

## 2. Publicando no Railway

1. Acesse [railway.app](https://railway.app) e crie um projeto novo:
   **New Project > Deploy from GitHub repo** → selecione o repositório que
   você acabou de subir.
2. Ainda na tela do projeto, clique em **New > Database > Add PostgreSQL**.
   Isso cria um banco Postgres dentro do mesmo projeto e já conecta a
   variável `DATABASE_URL` automaticamente ao seu serviço Node — você não
   precisa copiar nem colar nada.
3. Clique no serviço do app (não no banco) > aba **Variables** > adicione:
   - `JWT_SECRET` → gere um valor aleatório longo (por exemplo, rode
     `openssl rand -hex 32` no terminal e cole o resultado). Sem isso o
     app ainda funciona, mas todo mundo é deslogado sempre que o serviço
     reiniciar.
4. O Railway detecta que é um projeto Node (pelo `package.json`) e faz o
   deploy sozinho, rodando `npm install` e depois `npm start`. Acompanhe
   em **Deployments**.
5. Quando o deploy terminar, vá em **Settings > Networking > Generate
   Domain** para gerar uma URL pública (algo como
   `controle-visitas-uber-production.up.railway.app`). É esse o link que
   você compartilha com o time.

O esquema do banco (tabelas) é criado automaticamente na primeira vez que
o servidor sobe — não precisa rodar nenhuma migração manual.

## 3. Primeiro uso

Abra a URL pública gerada pelo Railway. Como ainda não existe nenhum
usuário, a tela vai pedir para você criar a conta do primeiro
administrador (nome, e-mail e senha). Depois disso:

1. Vá em **Clientes** e cadastre os clientes da empresa (dá pra colar uma
   lista em lote também, se pedir).
2. Vá em **Projetos** e associe cada projeto a um cliente.
3. Vá em **Usuários** e adicione cada colaborador(a) pelo nome e e-mail —
   isso gera uma **senha temporária** que você copia e envia para a
   pessoa (WhatsApp, e-mail etc.). Cada um pode trocar a própria senha
   depois, no menu lateral.

A partir daí, qualquer colaborador(a) entra pela mesma URL com o e-mail e
a senha que você configurou para ele(a).

## Rodando localmente (opcional, para testar antes de publicar)

Pré-requisitos: Node.js 18+ e um PostgreSQL rodando na sua máquina.

```bash
npm install
cp .env.example .env
# edite o .env com os dados do seu Postgres local
npm start
```

Acesse `http://localhost:3000`.

## Estrutura do projeto

```
server/
  index.js          → ponto de entrada, junta todas as rotas
  db.js             → conexão com o Postgres e criação automática do esquema
  auth.js           → hash de senha, emissão/checagem de token JWT
  schema.sql        → definição das tabelas
  routes/
    auth.js         → login, criação do 1º admin, troca de senha
    clientes.js      → CRUD de clientes
    projetos.js      → CRUD de projetos
    usuarios.js      → CRUD de usuários e reset de senha
    visitas.js       → visitas, despesas, aprovação e arquivo do comprovante
public/
  index.html         → toda a interface (HTML + CSS + JavaScript em um arquivo)
```

## Limites e observações

- Comprovantes em foto são comprimidos no navegador antes do envio
  (mirando ~450 KB); PDFs são aceitos até 6 MB. Isso evita que o banco
  fique pesado rapidamente.
- Não há envio de e-mail automático (recuperação de senha por e-mail).
  Quem esqueceu a senha pede para um administrador resetar em
  "Usuários" — isso gera uma nova senha temporária na hora.
- O plano gratuito do Railway tem limite de horas/uso por mês; para uso
  contínuo com vários colaboradores, considere um plano pago do Railway
  quando o gratuito não for mais suficiente.
