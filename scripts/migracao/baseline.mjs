// Retrato do banco, para comparar antes e depois da mudança de região.
//
// Uso: node scripts/migracao/baseline.mjs <DATABASE_URL> > baseline-antes.json
//
// Sem isto, "parece que funcionou" é a única validação disponível para uma
// migração que tem uma falha silenciosa conhecida (o hook de JWT não viaja no
// dump — ver a Tarefa 6 do plano).
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
  // A função viaja no dump; o REGISTRO dela como hook é configuração do
  // projeto e não viaja. Aqui só conferimos que a função chegou.
  hookExiste:
    (await sql`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='custom_access_token_hook'`).length === 1,
  // Tabela a tabela, e nao a contagem: o banco tem 40 com RLS e UMA sem
  // (`category_rules`). Uma opcao do projeto novo que ligue RLS sozinha
  // criaria divergencia que a contagem de policies nao pegaria.
  rlsPorTabela: (await sql`
    SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind='r' ORDER BY c.relname`)
    .map((t) => `${t.relname}|${t.relrowsecurity ? 'on' : 'off'}`),
  saldos: (await sql`SELECT name, type, balance_cents FROM accounts ORDER BY name, id`)
    .map((a) => `${a.name}|${a.type}|${a.balance_cents}`),
  // Soma dos lançamentos por conta: se ela bater dos dois lados, nenhum
  // lançamento se perdeu nem se duplicou no restore.
  somaPorConta: (await sql`
    SELECT a.name, COALESCE(SUM(t.amount_cents) FILTER (WHERE t.balance_applied AND NOT t.is_ignored), 0) AS soma
    FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
    GROUP BY a.id, a.name ORDER BY a.name, a.id`).map((r) => `${r.name}|${r.soma}`),
}

console.log(JSON.stringify(relatorio, null, 2))
await sql.end()
