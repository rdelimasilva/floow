# Triagem diária do Sentry

`sentry-daily.ps1` roda a skill `sentry-autofix` uma vez por dia pelo Agendador
de Tarefas do Windows.

## Por que local e não rotina na nuvem

Rotina na nuvem clona o repo do GitHub e **não tem acesso a arquivo local nem a
variável de ambiente da máquina**. Os cortes da triagem dependem de duas coisas
que só existem aqui:

- `apps/web/.env.local` (gitignored) — carrega `SENTRY_AUTH_TOKEN` e `DATABASE_URL`
- histórico git completo — os cortes 1 e 3 são `git log`

Rodar local evita duplicar o segredo do banco num segundo lugar.

## Pré-requisito

`SENTRY_AUTH_TOKEN` com escopo `event:read` e `project:read`, criado em
<https://sentry.io/settings/account/api/auth-tokens/>. O token que já estava no
`.env.local` é de upload de sourcemap e devolve **403** na leitura de issues.

Conferir antes de agendar:

```bash
node scripts/sentry-triage.mjs fetch
```

JSON com a fila = pronto. `403` = escopo não pegou.

## Registrar

```powershell
schtasks /create /tn "floow-sentry-triagem" `
  /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\DEV\floow\scripts\sentry-daily.ps1" `
  /sc daily /st 08:00
```

Horário é local (America/Sao_Paulo) — sem conversão para UTC, diferente de cron
na nuvem.

## Operar

```powershell
schtasks /query /tn "floow-sentry-triagem" /v /fo list   # status e próxima execução
schtasks /run   /tn "floow-sentry-triagem"               # rodar agora
schtasks /change /tn "floow-sentry-triagem" /st 07:30    # mudar horário
schtasks /change /tn "floow-sentry-triagem" /disable     # pausar
schtasks /delete /tn "floow-sentry-triagem" /f           # remover
```

## Códigos de saída

| Código | Significado |
|---|---|
| 0 | Triagem rodou |
| 2 | Portão de git: working tree sujo, HEAD fora da master, ou fast-forward impossível |
| 3 | Portão de API: o Sentry não respondeu — o agente nem chegou a ser chamado |
| outro | Falha do próprio `claude -p` |

Os portões de git existem porque a skill cria uma branch por issue: rodar sobre
trabalho não commitado misturaria suas mudanças com as dela.

O portão de API existe por um motivo menos óbvio. Sem ele o wrapper sai **0**
com o token quebrado: o agente roda, relata o 403 corretamente e termina
bem-sucedido — então a tarefa agendada apareceria como "OK" todo dia enquanto a
automação está morta. Exit 3 é o sinal de que ela parou de funcionar.

## Logs

`.claude/sentry-logs/triagem-AAAA-MM-DD.log`, um por dia. O diretório é
gitignored.
