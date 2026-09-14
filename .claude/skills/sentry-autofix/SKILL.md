---
name: sentry-autofix
description: Triagem das issues do Sentry do floow — aplica cinco cortes para separar o que ainda importa, corrige em branch com TDD e abre PR. Use quando a rotina agendada disparar ou quando o usuário pedir para varrer o Sentry.
---

# Sentry triage

Varre as issues do Sentry, separa o que ainda importa do que já morreu, corrige
o que for corrigível em código de aplicação e **abre PR**. Merge é do humano.

## Por que os cortes vêm antes de qualquer correção

Numa varredura manual de 7 erros deste projeto (2026-09-14), **1 era acionável**.
Os outros seis: já corrigido em produção, de outro repositório, não reproduzível,
inexistente no código atual, nunca commitado, e guard intencional funcionando.

Pular direto para a correção produz seis mudanças erradas. Os cortes existem
para isso. Não pule nenhum, e **não corrija nada que não tenha passado pelos
cinco**.

## Passo 0 — buscar

```bash
node scripts/sentry-triage.mjs fetch
```

Devolve JSON só com as issues que mudaram desde a última triagem. Se vier
`paraTriar: 0`, encerre e relate "nada novo" — não invente trabalho.

Falhou com 403? **Pare.** O token não tem escopo de leitura. Relate e não tente
contornar.

## Os cinco cortes

Em ordem; pare no primeiro que decidir. Registre o veredito (Passo 7) antes de
passar para a próxima issue.

### Corte 1 — data
Compare `lastSeen` com o último commit que tocou os arquivos de `appFrames`:

```bash
git log -1 --format='%h %ad %s' --date=iso -- <arquivo>
```

`lastSeen` anterior a um commit que mexeu naquele código → **morto**. Sozinho,
este corte resolve a maioria.

### Corte 2 — é deste repositório?
`appFrames` vazio, ou apontando para caminhos que não existem em `apps/web` nem
`apps/mobile` → **nao-e-nosso**. Sinal útil: `floow` só tem Next (`apps/web`,
gera `_next/…`) e Expo (`apps/mobile`). Bundle com `/assets/index-<hash>.js` e
chunk `vendor-<hash>` é Vite — outro projeto.

### Corte 3 — o código ainda existe?
Leia o arquivo e a linha citados. Se o trecho não está mais lá:

```bash
git log -S'<trecho literal da linha>' -- <arquivo>
```

Nenhum commit → a versão quebrada nunca foi commitada, era working tree
intermediário → **morto**.

### Corte 4 — guard intencional ou falha?
Muitos `throw` deste projeto são cercas deliberadas. É guard intencional quando
**as duas** valem:

- existe teste assertando a mensagem (`grep -rn "<mensagem>" apps/web/__tests__/`)
- o chamador trata (`.catch(`, `try {`) e mostra toast em vez de estourar

Aparecem no Sentry porque o Next registra toda exceção de server action no
servidor, **mesmo quando o cliente pega**. Ruído de log ≠ falha de usuário.
→ **guard-intencional**.

### Corte 5 — o estado atual ainda permite?
Para erro que depende de dados (violação de FK, registro ausente), confirme
contra o banco **em leitura**. Padrão que funciona aqui: script `.mjs`
temporário dentro de `apps/web/` (onde o pacote `postgres` resolve), lendo
`DATABASE_URL` do `.env.local`, apagado ao fim. Estado atual não produz mais o
erro → **morto**.

## Passo 6 — corrigir o que sobreviveu

Só chega aqui o que passou pelos cinco cortes.

### Fora de escopo — vira `vivo-reportado`, sem tocar em nada

- qualquer coisa que peça **migração ou escrita no banco**
- reparo de dados (backfill, correção de linha)
- mudança de infra, env var, ou configuração do Supabase
- correção que dependa de decisão de produto (o que a UI *deveria* fazer)
- conserto que passe de ~100 linhas ou toque mais de 3 arquivos

Descreva a causa raiz e a correção proposta no relatório, e **pare**. Foi em
reparo de dados que os falsos positivos moraram.

### Dentro de escopo — uma issue por branch, TDD

```bash
git switch -c fix/sentry-<shortId>
```

1. Ache a causa raiz de verdade. Frame minificado não basta; leia o código.
2. **Teste que falha primeiro.** Rode e veja falhar *pelo motivo certo*. Passou
   de primeira? O teste está errado — refaça.
3. Correção mínima. Nada de "já que estou aqui".
4. `cd apps/web && npx vitest run <arquivo do teste>`
5. **Revalide o RED:** `git stash push -- <arquivo de produção>`, rode, confirme
   que falha, `git stash pop`. Sem isso você não provou que o teste pega o bug.

### Portões — falhou, aborta

Os três têm que passar antes do commit:

```bash
cd apps/web && npx vitest run     # suíte inteira, não só o arquivo novo
cd apps/web && npx tsc --noEmit
cd apps/web && pnpm build
```

Qualquer um vermelho: descarte a branch
(`git switch master && git branch -D fix/sentry-<shortId>`), marque a issue como
`vivo-reportado` com a explicação, siga para a próxima.

Respeite o `CLAUDE.md`: nenhum arquivo passa de 500 linhas.

### Commit e PR

```
fix(<escopo>): <o que passou a acontecer>

<causa raiz em prosa: o que quebrava e por quê.>

Sentry: <shortId> — <permalink>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Depois `gh pr create`, com corpo trazendo causa raiz, o que o teste novo cobre,
e a saída dos três portões. Termine o corpo com:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**Nunca faça merge. Nunca empurre na `master`.** O PR é o ponto de parada —
é ali que o humano entra. Nada de `--force`, nada de `--no-verify`.

Volte para `master` antes da próxima issue, para cada uma nascer limpa.

## Passo 7 — registrar o veredito

Para **toda** issue examinada, inclusive as mortas:

```bash
node scripts/sentry-triage.mjs record --id <id> --lastSeen <lastSeen> \
  --verdict <morto|nao-e-nosso|guard-intencional|vivo-corrigido|vivo-reportado|ignorado> \
  --note "<uma linha com a evidência que decidiu>"
```

Sem isso a próxima execução refaz tudo. Commite o ledger na `master` em commit
próprio: `chore(sentry): ledger da triagem de <data>`. Ledger não entra nos PRs
de correção — senão todo PR conflita com o seguinte.

## Limites que não se negociam

- Não fecha, não resolve e não comenta issue no Sentry.
- Não escreve no banco. Nunca. Leitura só.
- Não mexe em `.env*`, em segredo, nem em configuração do Supabase.
- Não faz merge, não empurra na `master` (exceto o commit do ledger), não
  reescreve histórico, não pula hook.
- Não empurra com portão vermelho.
- Em dúvida entre duas causas raiz plausíveis: **não corrige**, reporta.

## Relatório final

Termine com uma tabela: issue, veredito, evidência que decidiu e — para as
corrigidas — o link do PR. Depois o total que segue vivo sem correção: é essa
fila que o humano precisa ver.
