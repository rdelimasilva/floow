# Diagnóstico da carteira: regras e aba

2026-11-10 · Ricardo Lima

Base: a spec do agente de análise patrimonial (`spec-agente-analise-patrimonial.md`, seção "Regras determinísticas") e as integrações de mercado que estão em produção desde 93b28db.

## Para que serve

Hoje a tela de Investimentos mostra as posições, mas não diz o que está errado na carteira. Esta entrega calcula as regras da spec que já funcionam com os dados do floow e mostra o resultado numa aba nova, Diagnóstico, dentro de Investimentos. É também a base das próximas fases: o texto gerado por IA e o chat do agente novo vão ler os mesmos achados.

Para o Ricardo, a entrega deu certo quando ele abre a aba e vê:

- quanto dinheiro está rendendo menos do que poderia;
- onde a carteira está concentrada;
- o que vence logo;
- quais dados faltam.

Tudo isso com valores que ele consegue conferir à mão.

## Escopo

**Entra**

- As regras R02, R03, R04, R05, R06, R07, R11 e R12, cada uma como função pura em `packages/core-finance`.
- A aba Diagnóstico em `/investments/diagnostico`, com uma lista única ordenada por impacto (layout A aprovado no esboço).
- A pergunta de perfil de risco, que fica na própria aba até ser respondida.
- O consultor (CFO) para de gerar o aviso `investment_concentration`, porque o Diagnóstico assume esse papel.

**Não entra**

- Texto escrito por IA, chat do agente e tools de simulação. São as próximas fases.
- As regras R01, R08 e R09. Elas dependem de fundos e previdência, que hoje nenhuma carteira tem. A R10 depende de objetivos com valor e data, que também ficam para depois.
- Guardar achados no banco, histórico de diagnósticos e notificações.
- Cadastro de objetivos.

**Não pode acontecer**

- Recomendar ativo específico. O texto pode dizer o tipo de alternativa que existe ("CDB com 100% do CDI existe na maioria das corretoras"), nunca "venda X, compre Y".
- Inventar número. Dado que falta faz a regra não disparar, ou vira achado R12. Nunca vira zero.
- Mostrar um achado sem o valor que permite conferir a conta.

## Como funciona

O cálculo é feito na hora em que a página abre, num server component. Não há tabela nova de achados. A carteira tem no máximo algumas centenas de posições, e as regras são somas e comparações.

### Entrada das regras

- **Posições:** as mesmas de `getPositions(orgId)`, sem as encerradas. Valor de mercado, classe, subtipo, emissor (`cnpj`, `issuerName`), indexador, taxa (`indexerPercentage`, `preFixedRate`), vencimento (`dueDate`) e data da primeira compra (do primeiro `portfolio_event`).
- **Titular:** vem da conta de cada ativo (`getContasDosAtivos`), campo `accounts.titular`. Se o ativo estiver em mais de uma conta, vale a de maior saldo (decisão minha). Titular vazio vira o grupo "sem titular".
- **Caixa:** soma dos saldos das contas `checking` (corrente), `savings` (poupança), `cash` (dinheiro) e `brokerage` (o dinheiro parado na corretora, fora das posições). Cartão de crédito fica de fora. Todo o caixa conta como liquidez D+0 na R04. Na R03, cada tipo entra com uma taxa: a poupança rende 6,17% a.a. (0,5% a.m. com Selic acima de 8,5%), que é dividido pelo CDI 12m para virar taxa relativa ao CDI; os outros tipos entram com taxa 0. Decisão minha.
- **Gasto mensal:** média das despesas dos últimos 6 meses fechados do fluxo de caixa, sem transferências entre contas, aplicações e pagamento de fatura. Usar o mesmo filtro que o fluxo de caixa já aplica. Com menos de 3 meses de histórico, o gasto fica `null`, R03 e R04 não disparam e a R12 registra "sem histórico de gastos suficiente".
- **CDI 12 meses:** `cdiAcumulado(db, hoje − 12 meses, hoje)` de `lib/mercado/leitura.ts`. Se vier `null`, as regras que dependem dele (R02 e o valor da R03) não disparam.
- **Perfil:** coluna nova `orgs.perfil_investidor` (`conservador` | `moderado` | `arrojado`, nula até ser respondida). Fica na org porque a org é a família (decisão minha).

### Total da carteira

Total = investimentos + caixa. O peso de cada posição é calculado sobre esse total.

### Regras

Os limites ficam num objeto de config em `core-finance`, nunca soltos no código.

| ID | Dispara quando | Valor mostrado | Severidade |
| --- | --- | --- | --- |
| R02 | RF pós-fixada em CDI com retorno estimado (`taxa × CDI12m`) abaixo do CDI em mais de 2 p.p. A posição fica de fora se já entrou na R03. | `(CDI12m − retorno) × valor`, em R$/ano | alta se > R$ 2.000, senão média |
| R03 | Caixa + RF pós-CDI com taxa < 90% do CDI somam mais que 6 × gasto mensal | `excedente × CDI12m × (1 − taxa média ponderada do grupo)`, em R$/ano. Caixa conta como taxa 0. | alta |
| R04 | O que dá para resgatar em até D+1 é menor que 3 × gasto mensal | sem valor; mostra quanto falta | alta |
| R05 | Um ativo não diversificado passa de 20% do total. Conta ação, FII e a soma da RF de um mesmo emissor, juntando a bancária (`fixed_income`) e o crédito privado (`credit_fixed_income`: debênture, CRI, CRA). ETF, Tesouro e fundo não contam. | sem valor; mostra o peso | alta se > 30%, senão média |
| R06 | RF coberta pelo FGC (CDB, LCI, LCA, LC, RDB) de um titular num mesmo conglomerado passa de R$ 250 mil | o excedente, como exposição (não é R$/ano) | média |
| R07 | Perfil diferente de conservador e uma classe passa de 80% do total | sem valor; mostra o peso da classe | média |
| R11 | Vencimento em 0 a 29 dias | valor da posição | info |
| R12 | RF sem taxa, ação, FII ou ETF sem ticker, ou gasto mensal sem histórico. Vira um achado só, com a contagem e a lista. | sem valor | info |

Detalhes:

- **R04, o que conta como líquido:** conta corrente, Tesouro Selic e RF que vence em até 1 dia. A Polp não informa a liquidez diária de CDB, então CDB não conta. O texto do achado diz isso ("considerando só conta corrente e Tesouro Selic"). Assim um falso alarme fica explicado, em vez de parecer erro. Decisão minha.
- **R02, sem exigência de idade:** a spec pede posição com mais de 12 meses porque mede o retorno pela variação de preço. Para RF pós-CDI, o retorno sai da taxa contratada, então a idade não muda o resultado. Além disso, o Open Finance só traz 12 meses de movimentação, e a data da primeira compra não seria confiável. Decisão minha.
- **R06, conglomerado:** é o nome do banco que `bancoEmissor(cnpj)` devolve. Quando o CNPJ não está mapeado, usa a raiz do CNPJ (8 dígitos).
- **R07, classes:** caixa, renda fixa (`fixed_income` + `credit_fixed_income` + `treasury`), ações, FII, ETF e fundos. Sem perfil respondido, a R07 não roda.
- **R02 fica de fora para:**
  - Tesouro: a variação do preço reflete a marcação a mercado, não o que o título paga até o vencimento, e o achado enganaria.
  - Ações e FIIs: só existem 3 meses de cotação. A regra entra quando houver 12 meses de histórico ou o plano Pro.

### Formato do achado

O mesmo da spec, em TypeScript:

```
{ ruleId, severity: 'alta'|'media'|'info', titulo, posicoes: string[], metricas: Record<string, number>, impactoAnual: number|null, exposicao: number|null, dica: string }
```

`impactoAnual` só aparece em R02 e R03. `exposicao` aparece em R06 (excedente) e R11 (valor que vence). Ordem: severidade (alta, média, info) e depois `impactoAnual ?? exposicao ?? 0`, do maior para o menor.

## A tela

A aba nova "Diagnóstico" entra em `AbasDeInvestimentos`, depois de "Renda Passiva". Nada muda no menu lateral.

De cima para baixo:

1. **Pergunta do perfil**, só enquanto `perfil_investidor` estiver nulo: "Como você se descreve ao investir?" com três botões. Responder grava pela server action e esconde o cartão. Para trocar depois, um link pequeno no rodapé: "Perfil: moderado · alterar".
2. **Cartão de impacto:** "~R$ X/ano em N pontos", soma só de `impactoAnual`, com "patrimônio R$ Y" embaixo. Sem nenhum `impactoAnual`, mostra só o patrimônio e a quantidade de pontos.
3. **Lista de achados**, uma linha por achado, com borda colorida pela severidade (vermelho alta, laranja média, cinza info). Título no padrão **valor + problema** ("R$ 48 mil parados abaixo de 90% do CDI"). Corpo na ordem referência, impacto e alternativa genérica. Os valores aparecem arredondados como no esboço ("R$ 48 mil", "~R$ 1.600/ano").
4. **Rodapé:** "Dados de mercado até dd/mm" (de `frescor()`), a linha do perfil e o aviso "Análise educacional. Não constitui recomendação de investimento (Res. CVM 19/2021)."

Estados:

- Sem nenhum investimento: mesmo vazio da aba Posições.
- Sem achados: "Nenhum ponto de atenção na carteira hoje."

Visual: os componentes e cores que o app já usa. Só tema claro.

## Testes

- Cada regra tem uma carteira que dispara e outra que não dispara, nos limites exatos: 20% e 20,01%, R$ 250 mil e R$ 250.000,01, 29 e 30 dias.
- Dado faltante (CDI `null`, gasto `null`, taxa `null`) não dispara a regra nem gera zero.
- A ordenação final segue severidade e depois valor.
- R06 soma por titular: dois titulares com R$ 200 mil cada no mesmo banco não disparam.
- Remover o `investment_concentration` do consultor ajusta os testes dele.

## O que fica com quem constrói

- Nomes de arquivos e a divisão em módulos, respeitando o limite de 500 linhas por arquivo.
- A query exata do gasto mensal, desde que reuse o filtro do fluxo de caixa.
- Os textos de cada achado. Passam pela skill `humanizer` antes de entrar.
- A migration do `perfil_investidor` (próximo número livre, 00085). O Ricardo aplica no SQL Editor copiando do arquivo.
