# Conciliar em modo foco: um lançamento por vez — design

Data: 2026-10-01
Substitui a organização em seções de `2026-09-29-conciliar-fluxo-unico-design.md`
(a rota `/transactions/conciliar` e os pontos de entrada continuam os mesmos).

## 1. O problema

A tela Conciliar é organizada por **tipo de problema** ("Remover repetidos",
"Classificar lançamentos", "Confirmar previsões"), não por lançamento:

- "Confirmar previsões" só mostra o par que o motor gravou no sync
  (`forecast_match_proposals`): **um** candidato por previsão, pegar ou largar.
  Não dá para ver outros parecidos nem escolher outro.
- Lançamento do banco sem proposta nunca aparece para vincular. Se o motor não
  achou a previsão certa, o usuário não tem como apontá-la.
- O mesmo lançamento pode aparecer em duas seções, e cada aparição é uma decisão
  isolada.

O usuário quer: veio lançamento do Open Finance → entra na fila → a tela já
mostra os lançamentos/previsões parecidos → vincula ou não. Tudo na mesma tela.

## 2. A experiência

### 2.1 Modo foco

Um card por vez, com progresso no topo ("3 de 27" + barra). Decidiu, entra o
próximo. Cada card resolve **tudo** sobre aquele lançamento: vínculo, repetido e
classificação. As três seções deixam de existir.

O card chega **já classificado**: o botão principal (verde) é o palpite do
floow, e na maioria dos casos um Enter resolve.

### 2.2 Cabeçalho: a conta em destaque

A primeira linha do card é a conta, num bloco próprio:

- logo/inicial do banco, nome da instituição e tipo ("Itaú · Conta corrente");
- identificação curta (agência e final da conta; no cartão, "Cartão ••••8812 ·
  fatura de out");
- "veio do Open Finance em DD/MM".

Abaixo: descrição, valor com sinal e data do lançamento.

### 2.3 Três estados do card

**A. Tem previsão parecida.** "É um destes que você já lançou?" e até 3
candidatas, cada uma com: descrição, categoria, conta, data prevista, valor e o
porquê ("valor igual · 2 dias", "R$ 20 a menos · 3 dias"). A melhor fica
destacada com o botão verde **Vincular**. Ao vincular, a categoria vem da
previsão: não há classificação a fazer. Ações secundárias: **Não é nenhum**
(passa o card para o estado B), **É repetido** (só se houver duplicata
proposta), **Pular**.

**B. Sem parecido (ou "Não é nenhum").** "Lançar como" com natureza
(Despesa/Receita/Transferência) e categoria já preenchidas pela sugestão
existente (histórico ou Claude — `suggestedCategoryId`/`suggestionSource`), com
o porquê ("igual às últimas 5 vezes"). Transferência pede a outra conta, com a
sugestão de CPF próprio (`sugestaoContaId`) quando houver. Checkbox marcado
"Fazer igual com <contraparte> daqui pra frente", com "+N na fila" quando outros
lançamentos da mesma contraparte esperam. Ações: **Confirmar** (verde),
**Procurar previsão**, **É repetido** (se houver), **Pular**.

**C. Repetido detectado.** "O banco parece ter mandado isto duas vezes" com o
outro lado do par e "emitido 3h antes". Ações: **Descartar este repetido**
(verde), **Não é repetido** (segue para o estado A ou B do mesmo lançamento),
**Pular**.

### 2.4 Procurar previsão

Botão no estado B (e link discreto no A). Abre uma busca dentro do card por
descrição ou valor nas previsões em aberto de **todas** as contas da org. O
resultado de outra conta mostra a etiqueta "outra conta". Escolher um resultado
equivale a **Vincular**.

### 2.5 Teclado

Enter = botão verde · 1/2/3 = vincular a candidata · N = não é nenhum ·
→ = pular. Os atalhos ficam visíveis no topo do card. Desligados enquanto o
foco está num campo (busca, seletor de categoria).

### 2.6 Fim e vazio

Fila zerada: "Tudo conciliado" (componente atual `TudoConciliado`). Pulados
voltam no fim da fila; quando só restam pulados, o progresso diz
"N pulados — revisar agora?".

### 2.7 Regras

A lista de regras confirmadas (editar/corrigir regra, `?regra=`) sai da fila e
vira um link **Regras** no cabeçalho da página, abrindo a lista atual de
`CounterpartyQueueClient` (parte "confirmadas") na rota
`/transactions/conciliar/regras`. O deep-link `/transactions/conciliar?regra=<id>`
redireciona para `/transactions/conciliar/regras?regra=<id>`.

## 3. A fila

### 3.1 Quem entra

Lançamento do banco (`external_id` não nulo, sem `recurring_template_id`, não
ignorado, sem previsão já vinculada a ele) que tenha **pelo menos uma** decisão
aberta:

1. duplicata proposta aberta (`condicaoDeDuplicataAberta`);
2. classificação pendente (`review_state = 'pending'` com contraparte —
   a condição de `contarLancamentosAClassificar`);
3. pelo menos uma previsão candidata (§4) **e** `vinculo_revisado_em` nulo.

Lançamento resolvido por regra e sem previsão parecida não entra.

### 3.2 Ordem

Repetidos primeiro (classificar ou vincular o que vai ser descartado é trabalho
jogado fora); depois por valor absoluto, decrescente — o mesmo princípio da
fila de contrapartes ("R$ 92 mil move, 12 itens não").

### 3.3 Contador

`contarItensParaConciliar` passa a contar **lançamentos na fila** pela mesma
condição de §3.1 (contador que anuncia o que a tela não mostra manda procurar
decisão que não existe). A faixa e o botão de Transações e o assistente de
conexão continuam lendo dele. O formato `{ repetidos, classificar, confirmar,
total }` é mantido para não mexer nos consumidores; `total` passa a ser
lançamentos distintos, não a soma das três.

### 3.4 Paginação

A página carrega os primeiros 50 itens da fila com candidatos; ao chegar no fim
do lote, busca o próximo pelo servidor. 50 é o teto do lote, não da fila.

## 4. Candidatos

Calculados na hora, numa consulta em lote para os lançamentos do lote (não uma
por card). Módulo novo `lib/finance/conciliacao/candidatos.ts` (função pura de
pontuação) + `candidatos-db.ts` (consulta).

**Previsão elegível:** mesma org, **mesma conta** do lançamento,
`balance_applied = false`, `matched_transaction_id` nulo, não ignorada, não é o
próprio lançamento, sem recusa gravada para o par (§5.2), e que não esteja
reivindicada por outro realizado (`condicaoDeRealizadoSemVinculo` invertida para
o lado da previsão). Diferente do motor atual, entram previsões **avulsas** além
das de recorrência — com a perna prevista de transferência seguindo a mesma
regra do motor (`incluirPernaPrevista` só onde R1 não roda).

**Janela:** data da previsão em ±10 dias da data do lançamento
(`JANELA_BUSCA_DIAS`, reaproveitada). Mesmo sinal de valor.

**Pontuação:** primeiro diferença absoluta de valor, depois de dias. Teto de
diferença de valor: 20% do valor do lançamento (acima disso não é "parecido").
Até 3 por lançamento. Se houver proposta pendente em `forecast_match_proposals`
para o lançamento, ela é a candidata 1 independentemente da pontuação.

**Porquê:** cada candidata leva `diferencaCents` e `diasDeDiferenca` para a tela
compor o texto.

Uma previsão pode aparecer como candidata de dois lançamentos; vincular um tira
ela do outro (a tela remove a candidata localmente e o servidor reconfere).

## 5. Ações

Todas são server actions que **reconferem a elegibilidade** antes de gravar —
a fila é uma página renderizada e o clique chega depois dela — e devolvem
`{ error }` com mensagem específica em vez de lançar (o Next oculta a mensagem
de erro de server action em produção; ver `mensagemDeErro()`).

### 5.1 Vincular — `vincularPrevisao(realizadoId, previsaoId)`

Generaliza `aprovarProposta`: mesma gravação (`matched_transaction_id`,
efeitos de saldo) e mesmas checagens de `condicaoDePropostaAprovavel`, mas sem
exigir uma proposta prévia. Se existir proposta pendente para o par, ela é
marcada como aprovada; outras propostas pendentes envolvendo qualquer das duas
pontas são recusadas. Previsão de outra conta é aceita (vem do "Procurar
previsão"). A classificação do realizado passa a ser a da previsão, e o
`review_state` dele sai de `pending`. `aprovarProposta` passa a delegar para
`vincularPrevisao`.

### 5.2 Não é nenhum — `marcarSemVinculo(realizadoId)`

Grava `transactions.vinculo_revisado_em = now()` e recusa as propostas
pendentes do realizado. O lançamento só sai da fila se não tiver outra decisão
aberta; com classificação pendente, o card vai para o estado B.

### 5.3 Repetido — `aprovarDuplicata` / `recusarDuplicata`

Sem mudança.

### 5.4 Classificar

- Checkbox marcado: `confirmCounterparty` como hoje (vale para trás e para
  frente). Os demais lançamentos da mesma contraparte que estavam na fila só
  por classificação saem dela; os que também têm candidata continuam, já
  classificados.
- Checkbox desmarcado: `classificarSoEste(transactionId, nature, categoryId,
  transferAccountId)` — grava só neste lançamento, `review_state` sai de
  `pending`, contraparte continua sem regra (o próximo lançamento dela entra na
  fila de novo). Reaproveita o caminho de `exceptions` de `aplicar-regra`.

### 5.5 Pular

Só no cliente: o item vai para o fim da lista local. Nada é gravado.

## 6. Banco

Migration `00072_vinculo_revisado.sql`:

```sql
alter table public.transactions
  add column vinculo_revisado_em timestamptz;
```

Sem índice novo: a fila já filtra por `org_id`/`external_id`, e a coluna é
condição residual. Reversível (`drop column`). Rollback da Vercel para antes
deste deploy não quebra: a versão antiga ignora a coluna.

`forecast_match_proposals` continua sendo preenchida no sync como palpite
principal. Nada é removido do banco.

## 7. Componentes

Novos (cada arquivo < 500 linhas):

- `components/finance/conciliar/fila-foco.tsx` — cliente; estado da fila,
  progresso, pular, atalhos, troca de estado do card.
- `components/finance/conciliar/card-conta.tsx` — bloco de conta (§2.2).
- `components/finance/conciliar/card-candidatos.tsx` — estado A.
- `components/finance/conciliar/card-classificar.tsx` — estado B (reusa o
  seletor de categoria/natureza/conta extraído de `CounterpartyQueueClient`).
- `components/finance/conciliar/card-repetido.tsx` — estado C.
- `components/finance/conciliar/procurar-previsao.tsx` — busca do §2.4.
- `lib/finance/conciliacao/fila.ts` + `fila-db.ts` — composição e ordem da
  fila (§3), contagem.
- `lib/finance/conciliacao/candidatos.ts` + `candidatos-db.ts` (§4).
- `lib/finance/conciliacao/vincular-actions.ts` (§5.1, §5.2, §5.4 só-este).

Saem: `secoes-de-conciliar.tsx`, `secao-de-conciliar.tsx` (exceto
`TudoConciliado`, que muda de arquivo), `MatchProposalQueue`,
`DuplicateProposalQueue`, e a parte de pendentes de `CounterpartyQueueClient`
(a de confirmadas vai para a tela de Regras).

## 8. Testes

- `candidatos`: janela de dias, teto de valor, mesmo sinal, mesma conta;
  previsão vinculada, ignorada, já somada ao saldo ou recusada fica fora;
  proposta pendente vira candidata 1; ordenação e limite de 3.
- `fila`: entra/não entra por cada uma das três condições; `vinculo_revisado_em`
  tira da fila só quando não há outra decisão; ordem (repetidos primeiro, depois
  valor); contador igual ao tamanho da fila.
- `vincularPrevisao`: elegibilidade reconferida (ignorado, já vinculado,
  `balance_applied`), saldo projetado e da conta corretos, propostas
  concorrentes recusadas, outra conta aceita, `{ error }` em caso de recusa.
- `marcarSemVinculo` e `classificarSoEste`.
- Componente `fila-foco`: três estados, "Não é nenhum" leva de A para B,
  "Não é repetido" leva de C para A/B, pular manda para o fim, atalhos não
  disparam com foco em campo, "Tudo conciliado" no fim.
- Migration e `vincularPrevisao` reproduzidos no banco real com rollback
  (os testes mockam o banco; CHECK/único só estoura em prod).
- Atualizar `pagina-conciliar.test.tsx` e `fila-de-conciliacao.test.tsx`.

## 9. Fora do escopo

- Vincular um lançamento do banco a **várias** previsões (ou o contrário).
- Desfazer pelo próprio card (desconciliar continua no lançamento, como hoje).
- Mudar o motor que grava propostas no sync.
