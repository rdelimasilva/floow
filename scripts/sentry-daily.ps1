<#
.SYNOPSIS
  Roda a triagem diária do Sentry (skill `sentry-autofix`) no repo floow.

.DESCRIPTION
  Wrapper para o Agendador de Tarefas do Windows. Escolhemos execução local e
  não rotina na nuvem porque os cortes da triagem dependem de coisas que só
  existem nesta máquina: `apps/web/.env.local` (gitignored, carrega
  SENTRY_AUTH_TOKEN e DATABASE_URL) e o histórico git completo.

  Antes de chamar o agente ele faz duas checagens que evitam estrago:

  1. Working tree sujo -> ABORTA. A skill cria branch por issue; fazer isso
     em cima de trabalho não commitado mistura as suas mudanças com as dela.
  2. Repo desatualizado -> faz fast-forward da master. Sem isso a triagem
     julga código velho e "corrige" o que já foi corrigido.

  Registro (ver scripts/sentry-daily.README.md):
    schtasks /create /tn "floow-sentry-triagem" /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\DEV\floow\scripts\sentry-daily.ps1" /sc daily /st 08:00
#>

# 'Continue', nao 'Stop': este script dirige programas nativos (git, node,
# claude), e no PowerShell 5.1 capturar a stderr deles com 2>&1 embrulha cada
# linha num ErrorRecord. Com 'Stop' isso vira erro terminante e o script morre
# ANTES de logar o motivo -- o oposto do que um wrapper agendado precisa fazer.
# A seguranca aqui vem dos checks explicitos de $LASTEXITCODE, nao do preference.
$ErrorActionPreference = 'Continue'

# PowerShell 5.1 decodifica a saida de programa nativo usando a codepage do
# console (OEM), entao o UTF-8 do agente chega como "n├úo". Sem isto o log da
# triagem fica ilegivel exatamente nas mensagens que importam.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Repo    = 'C:\DEV\floow'
$LogDir  = Join-Path $Repo '.claude\sentry-logs'
$LogFile = Join-Path $LogDir ("triagem-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

Set-Location $Repo
Write-Log '=== inicio ==='

# --- Portao 1: working tree limpo -------------------------------------------
$dirty = git status --porcelain
if ($dirty) {
    Write-Log 'ABORTADO: working tree sujo. A triagem cria branches e nao deve'
    Write-Log 'rodar sobre trabalho nao commitado. Arquivos:'
    $dirty -split "`n" | ForEach-Object { Write-Log "  $_" }
    exit 2
}

# --- Portao 2: master atualizada --------------------------------------------
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'master') {
    Write-Log "ABORTADO: HEAD esta em '$branch', nao em master."
    exit 2
}

git fetch origin master --quiet
# --ff-only: se divergiu, alguem mexeu; melhor parar do que tentar reconciliar.
git merge --ff-only origin/master --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Log 'ABORTADO: master local divergiu de origin/master (fast-forward falhou).'
    exit 2
}
Write-Log ("master em {0}" -f (git rev-parse --short HEAD))

# --- Portao 3: a API do Sentry responde? ------------------------------------
# Sem isto o wrapper sai 0 quando o token esta quebrado: o agente roda, relata
# o 403 corretamente e termina bem-sucedido -- entao a tarefa agendada aparece
# como "OK" todo dia enquanto a automacao esta morta. Checar antes tambem evita
# gastar uma execucao de agente para descobrir que a API esta fora.
$probe = node scripts/sentry-triage.mjs fetch 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Log 'ABORTADO: a API do Sentry nao respondeu. Agente nao foi chamado.'
    $probe -split "`n" | ForEach-Object { Write-Log "  $_" }
    exit 3
}

# --- Triagem ----------------------------------------------------------------
Write-Log 'chamando claude -p "/sentry-autofix"'
$saida = claude -p '/sentry-autofix' 2>&1
$rc = $LASTEXITCODE

$saida | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding utf8 }
Write-Log ("=== fim (exit {0}) ===" -f $rc)

exit $rc
