# Migração do banco Supabase para sa-east-1 — Plano de Execução

> **Para quem executa:** cada passo tem checkbox. Não pule a verificação entre tarefas — a falha mais provável desta migração é silenciosa (ver Tarefa 6).

**Goal:** mover o banco de produção de `us-east-1` (Virgínia) para `sa-east-1` (São Paulo), onde a aplicação já roda, eliminando ~126 ms de latência por consulta.

**Architecture:** projeto Supabase novo em São Paulo, restaurado a partir de dump lógico do atual (roles → schema → dados), seguido de reconfiguração do que não viaja no dump (hook de JWT, senha de role, publication) e troca das variáveis de ambiente.

**Tech Stack:** PostgreSQL 17.6, `pg_dump`/`psql` 17.x nativos (sem Docker), Supabase, Vercel.

**Medição que motiva:** `SELECT 1` custa 126 ms, dos quais ~5 ms são banco. Seis consultas em `Promise.all` custam 783 ms — não paralelizam. A tela de Transações gasta ~1,7 s só esperando o banco.

## Global Constraints

- **Banco de produção real.** Único ambiente, 3 usuários, dados financeiros reais.
- **O dump exige conexão direta ou Session Pooler (porta 5432).** A `DATABASE_URL` atual aponta para o Transaction Pooler (`:6543`, pgbouncer), onde `pg_dump` falha ou produz dump incompleto.
- **`pg_dump` deve ser 17.x** — igual ou maior que o servidor (17.6).
- **Não apagar o projeto antigo** até a verificação da Tarefa 8 passar inteira. Ele é o rollback.
- **Nenhuma escrita durante a janela** entre o dump e o cutover (~15 min).
- Projeto atual: `tkmdogzsvjoomwphxusr` (us-east-1).

---

### Tarefa 0: Baseline de verificação

O que provará que a migração deu certo. Sem isto, "parece que funcionou" é a única validação disponível.

**Files:**
- Create: `scripts/migracao/baseline.mjs`

- [ ] **Passo 1: Criar o script de baseline**

```javascript
// scripts/migracao/baseline.mjs
// Uso: node scripts/migracao/baseline.mjs <DATABASE_URL> > baseline-antes.json
import postgres from 'postgres'

const url = process.argv[2]
if (!url) throw new Error('uso: node baseline.mjs <DATABASE_URL>')
const sql = postgres(url, { prepare: false })

const um = async (q) => (await q)[0]

const relatorio = {
  geradoEm: new Date().toISOString(),
  tabelas: (await um(sql`SELECT count(*) n FROM information_schema.tables
                          WHERE table_schema='public' AND table_type='BASE TABLE'`)).n,
  policies: (await um(sql`SELECT count(*) n FROM pg_policies WHERE schemaname='public'`)).n,
  funcoes: (await um(sql`SELECT count(*) n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                          WHERE ns.nspname='public'`)).n,
  triggers: (await um(sql`SELECT count(*) n FROM pg_trigger WHERE NOT tgisinternal`)).n,
  usuarios: (await um(sql`SELECT count(*) n FROM auth.users`)).n,
  transacoes: (await um(sql`SELECT count(*) n FROM transactions`)).n,
  orgs: (await um(sql`SELECT count(*) n FROM orgs`)).n,
  extensoes: (await sql`SELECT extname FROM pg_extension ORDER BY 1`).map((e) => e.extname),
  publications: (await sql`SELECT pubname FROM pg_publication ORDER BY 1`).map((p) => p.pubname),
  hookExiste: (await sql`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='custom_access_token_hook'`).length === 1,
  saldos: (await sql`SELECT name, type, balance_cents FROM accounts ORDER BY name, id`)
    .map((a) => `${a.name}|${a.type}|${a.balance_cents}`),
  somaPorConta: (await sql`
    SELECT a.name, COALESCE(SUM(t.amount_cents) FILTER (WHERE t.balance_applied AND NOT t.is_ignored), 0) AS soma
    FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
    GROUP BY a.id, a.name ORDER BY a.name, a.id`).map((r) => `${r.name}|${r.soma}`),
}

console.log(JSON.stringify(relatorio, null, 2))
await sql.end()
```

- [ ] **Passo 2: Gerar o baseline do banco ATUAL**

```bash
cd /c/DEV/floow
node scripts/migracao/baseline.mjs "$(grep -oE '^DATABASE_URL=.*' .env | sed 's/^DATABASE_URL=//')" > baseline-antes.json
cat baseline-antes.json
```

Esperado: 41 tabelas, 140 policies, 34 funções, 9 triggers, 3 usuários, `hookExiste: true`, 12 contas em `saldos`.

- [ ] **Passo 3: Criar o comparador**

```javascript
// scripts/migracao/comparar.mjs
// Uso: node scripts/migracao/comparar.mjs baseline-antes.json baseline-depois.json
import fs from 'node:fs'

const [, , caminhoA, caminhoB] = process.argv
const antes = JSON.parse(fs.readFileSync(caminhoA, 'utf8'))
const depois = JSON.parse(fs.readFileSync(caminhoB, 'utf8'))

// `geradoEm` sempre difere e não diz nada sobre a migração.
delete antes.geradoEm
delete depois.geradoEm

const normalizar = (v) => (Array.isArray(v) ? [...v].sort().join('\n') : String(v))

let divergencias = 0
for (const chave of Object.keys(antes)) {
  const a = normalizar(antes[chave])
  const b = normalizar(depois[chave])
  if (a === b) {
    console.log(`OK       ${chave}`)
    continue
  }
  divergencias++
  console.log(`DIFERE   ${chave}`)
  console.log(`  antes : ${a.slice(0, 300)}`)
  console.log(`  depois: ${b.slice(0, 300)}`)
}

console.log(divergencias === 0 ? '\nIDENTICOS — pode seguir' : `\n${divergencias} divergencia(s) — NAO siga`)
process.exit(divergencias === 0 ? 0 : 1)
```

- [ ] **Passo 4: Commit**

```bash
git add scripts/migracao/baseline.mjs scripts/migracao/comparar.mjs
git commit -m "chore(migracao): baseline e comparador para a mudanca de regiao"
```

> `baseline-antes.json` NÃO é commitado — contém nomes de contas. Mantenha-o local durante a migração.

---

### Tarefa 1: Instalar pg_dump e psql 17.x (sem Docker)

A CLI do Supabase exige Docker Desktop, que não está instalado. Os binários nativos fazem o mesmo trabalho sem essa dependência.

- [ ] **Passo 1: Baixar os binários**

Baixe o ZIP "PostgreSQL 17.x Windows x86-64 binaries" em:
https://www.enterprisedb.com/download-postgresql-binaries

- [ ] **Passo 2: Extrair**

Extraia para `C:\pgsql` (o ZIP contém uma pasta `pgsql/`).

- [ ] **Passo 3: Verificar a versão**

```bash
/c/pgsql/bin/pg_dump --version
/c/pgsql/bin/psql --version
```

Esperado: `pg_dump (PostgreSQL) 17.x` — se vier 16 ou menor, o dump do servidor 17.6 falha.

---

### Tarefa 2: Criar o projeto em São Paulo

- [ ] **Passo 1: Criar**

https://supabase.com/dashboard → New project
- Region: **South America (São Paulo)** — `sa-east-1`
- Postgres: **17.x** (mesma major do atual)
- Guardar a senha do banco em lugar seguro

- [ ] **Passo 2: Anotar as credenciais novas**

Settings → API e Settings → Database. Anote, sem colar em chat:
- Project URL
- `anon` / publishable key
- `service_role` key
- Connection string **direta** (porta 5432)
- Connection string do **Transaction Pooler** (porta 6543) — esta vira a `DATABASE_URL` da aplicação

- [ ] **Passo 3: Habilitar as extensões**

Database → Extensions. Habilite, se não vierem por padrão: `pg_trgm`, `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`.

---

### Tarefa 3: Congelar escritas

- [ ] **Passo 1: Avisar os 3 usuários** que o app ficará indisponível por ~15 min.

- [ ] **Passo 2: Garantir que o cron não dispare no meio**

O cron roda às 8h (Brasília). Se a janela for perto desse horário, adie a migração — um sync no meio do dump grava no banco antigo e a escrita se perde.

- [ ] **Passo 3: Confirmar que ninguém está escrevendo**

```bash
cd /c/DEV/floow
node -e "
const fs=require('fs');
const url=fs.readFileSync('.env','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim();
import('file:///C:/DEV/floow/node_modules/postgres/src/index.js').then(async m=>{
  const sql=m.default(url,{prepare:false});
  const r=await sql\`SELECT max(created_at) ultimo FROM transactions\`;
  console.log('ultima escrita em transactions:', r[0].ultimo);
  await sql.end();
});
"
```

Confirme que não é de segundos atrás.

---

### Tarefa 4: Dump

**Atenção:** use a conexão **direta** (5432) do projeto ANTIGO. Com o Transaction Pooler (6543) o dump falha ou sai incompleto.

- [ ] **Passo 1: Preparar o diretório**

```bash
mkdir -p /c/DEV/floow/.migracao && cd /c/DEV/floow/.migracao
```

- [ ] **Passo 2: Exportar a conexão direta antiga**

```bash
export ANTIGO="postgresql://postgres:[SENHA]@db.tkmdogzsvjoomwphxusr.supabase.co:5432/postgres"
```

- [ ] **Passo 3: Dump das roles**

```bash
/c/pgsql/bin/pg_dumpall --dbname "$ANTIGO" --roles-only --no-role-passwords -f roles.sql
```

- [ ] **Passo 4: Dump do schema**

```bash
/c/pgsql/bin/pg_dump --dbname "$ANTIGO" --schema-only --no-owner --no-privileges \
  --schema public -f schema.sql
```

Só `public`. O schema `auth` tem 27 tabelas que o Supabase cria e gerencia — elas
já existem no projeto novo, e restaurar a definição delas produz uma enxurrada de
"already exists". De `auth` só os DADOS interessam, no passo seguinte.

- [ ] **Passo 5: Dump dos dados**

```bash
/c/pgsql/bin/pg_dump --dbname "$ANTIGO" --data-only --no-owner --no-privileges \
  --schema public --table auth.users --table auth.identities -f data.sql
```

`auth.users` e `auth.identities` bastam para os 3 logins por e-mail/senha.
`sessions` e `refresh_tokens` ficam de fora de propósito: as sessões morrem de
qualquer forma quando o JWT secret muda, e carregá-las só traria lixo.

- [ ] **Passo 6: Conferir que os arquivos têm conteúdo**

```bash
ls -la roles.sql schema.sql data.sql
grep -c "CREATE POLICY" schema.sql
grep -c "custom_access_token_hook" schema.sql
```

Esperado: `CREATE POLICY` ≈ 140, e `custom_access_token_hook` ≥ 1. Se o hook não aparecer, **pare** — o dump saiu incompleto.

---

### Tarefa 5: Restore

- [ ] **Passo 1: Exportar a conexão direta NOVA**

```bash
export NOVO="postgresql://postgres:[SENHA_NOVA]@db.[REF_NOVO].supabase.co:5432/postgres"
```

- [ ] **Passo 2: Restaurar**

```bash
cd /c/DEV/floow/.migracao
/c/pgsql/bin/psql --dbname "$NOVO" --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql 2>&1 | tee restore.log
```

`session_replication_role = replica` desliga os triggers durante a carga — sem isso, triggers de auditoria e criptografia reprocessam dados já processados.

- [ ] **Passo 3: Conferir erros**

```bash
grep -iE "^ERROR|^FATAL" restore.log | head -20
```

Erros sobre `supabase_admin`, `cli_login_postgres` ou role já existente são esperados e inofensivos. Erro em `CREATE TABLE`, `CREATE POLICY` ou `COPY` **não é** — pare e investigue.

---

### Tarefa 6: Reconfigurar o hook de JWT

**Esta é a falha silenciosa.** As 140 policies chamam `public.get_user_org_ids()`, que lê `org_ids` das claims do JWT. A função viaja no dump; o **registro dela como hook é configuração do projeto** e não viaja. Sem este passo o app sobe, o login funciona, e toda consulta com RLS volta vazia — sem erro nenhum.

- [ ] **Passo 1: Registrar o hook**

No projeto NOVO: Authentication → Hooks → **Customize Access Token (JWT) Claims**
- Habilitar
- Selecionar `public.custom_access_token_hook`
- Salvar

- [ ] **Passo 2: Conferir que a função existe e tem permissão**

```bash
/c/pgsql/bin/psql --dbname "$NOVO" -c "\df public.custom_access_token_hook"
/c/pgsql/bin/psql --dbname "$NOVO" -c "SELECT proname, proacl FROM pg_proc WHERE proname='custom_access_token_hook'"
```

Esperado: a função existe e `supabase_auth_admin` consegue executá-la. Se faltar a permissão:

```sql
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
```

---

### Tarefa 7: Role, publication e comparação estrutural

- [ ] **Passo 1: Resetar a senha da role `floow_app`**

O dump usou `--no-role-passwords`, então ela veio sem senha.

```bash
/c/pgsql/bin/psql --dbname "$NOVO" -c "ALTER ROLE floow_app WITH LOGIN PASSWORD '[SENHA]'"
```

- [ ] **Passo 2: Reativar a publication do Realtime**

```bash
/c/pgsql/bin/psql --dbname "$NOVO" -c "SELECT pubname FROM pg_publication"
```

Se `supabase_realtime` não existir:

```sql
CREATE PUBLICATION supabase_realtime;
```

- [ ] **Passo 3: Gerar o baseline do banco NOVO e comparar**

```bash
cd /c/DEV/floow
node scripts/migracao/baseline.mjs "$NOVO" > baseline-depois.json
node scripts/migracao/comparar.mjs baseline-antes.json baseline-depois.json
```

(`jq` não está instalado nesta máquina — quem compara é o script criado na
Tarefa 0, Passo 3.)

Esperado: **IDENTICOS**. Qualquer diferença em `saldos`, `somaPorConta`, `transacoes` ou `policies` é bloqueante — não siga.

---

### Tarefa 8: Cutover

- [ ] **Passo 1: Atualizar o `.env` local**

Trocar os quatro valores em `/c/DEV/floow/.env` e `/c/DEV/floow/apps/web/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` → **Transaction Pooler novo (6543)**, mantendo `?pgbouncer=true`

- [ ] **Passo 2: Medir o ganho**

```bash
node "/c/Users/rdeli/AppData/Local/Temp/claude/C--DEV-floow/079ec9b4-b45b-4e54-814d-33f14923dbcb/scratchpad/latencia.mjs"
```

Esperado: de ~126 ms para algo entre 5 e 20 ms. **Se continuar acima de 100 ms, a `DATABASE_URL` não foi trocada** — pare e confira.

- [ ] **Passo 3: Atualizar as variáveis na Vercel**

https://vercel.com/rdelimasilvas-projects/floow-web/settings/environment-variables — as mesmas quatro, em Production.

- [ ] **Passo 4: Redeploy**

Deployments → `...` → Redeploy.

---

### Tarefa 9: Verificação funcional

Estrutura igual não prova que o app funciona. O hook só se prova entrando.

- [ ] **Passo 1: Login**

Abra https://floow-web.vercel.app e faça login. A sessão antiga caiu (o JWT secret mudou), então é esperado precisar autenticar de novo.

- [ ] **Passo 2: O teste do hook — o mais importante**

Abra `/transactions`. **Se a lista aparecer com dados, o hook está funcionando.** Lista vazia com login bem-sucedido = hook não registrado → volte à Tarefa 6.

- [ ] **Passo 3: Conferir os saldos na tela**

`/accounts` deve mostrar Itaú **R$ 6.151,18** e Master **R$ 18.074,70**. Nenhum aviso de divergência deve aparecer.

- [ ] **Passo 4: Testar a importação**

```bash
curl -s -X POST https://floow-web.vercel.app/api/openfinance/import-transactions \
  -H "Authorization: Bearer [CRON_SECRET]" --max-time 120
```

Esperado: `{"ok":true,"conexoes":1,...}` sem `falhas`.

- [ ] **Passo 5: Sentir a diferença**

Navegue por Transações e Contas. A melhora de ~1,6 s por página deve ser perceptível.

---

### Tarefa 10: Encerramento

- [ ] **Passo 1: Limpar os artefatos da migração**

```bash
cd /c/DEV/floow && rm -rf .migracao baseline-antes.json baseline-depois.json
```

Os dumps contêm todos os dados financeiros em texto puro. Não deixe no disco.

- [ ] **Passo 2: Pausar (não apagar) o projeto antigo**

Deixe pausado por pelo menos uma semana. É o rollback.

- [ ] **Passo 3: Commit**

```bash
git add -A && git commit -m "chore(infra): banco migrado para sa-east-1"
```

---

## Rollback

Se algo falhar em qualquer ponto **antes** da Tarefa 8, não há o que desfazer: o banco antigo continua servindo a aplicação, intocado.

Depois da Tarefa 8: reverta as quatro variáveis para os valores antigos (local e Vercel) e redeploy. O único dado perdido é o que tiver sido escrito no banco novo após o cutover — com 3 usuários e minutos de janela, tende a ser nada.

Por isso o projeto antigo só é apagado depois de uma semana estável.
