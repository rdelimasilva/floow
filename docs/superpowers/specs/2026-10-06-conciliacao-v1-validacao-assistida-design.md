# Conciliação v1 — validação assistida (revisada)

06/10/2026 · revisão da spec original "Conciliação v1 (validação assistida)" contra o que já está em produção (modo foco, e4dbc7f).

## Princípio

O sistema sugere, o usuário decide, cada decisão vira dado. Automação nova só nasce de medição por entidade. Esta spec trata só da **categoria** (natureza + categoria, ou conta de destino na transferência). Vínculo com previsão, duplicata e troca seguem com o motor atual e o card do modo foco, sem mudança.

## Decisões sobre a spec original

| Original | Revisada | Por quê |
|---|---|---|
| Nada entra sem o usuário | A regra que o usuário criou ("Fazer igual daqui pra frente") continua aplicando; cada aplicação grava evento `regra` | A regra é decisão explícita dele; desligá-la devolveria ao usuário o grosso do volume |
| Escopo por usuário | Por org; `user_id` só no evento | Todo o floow (RLS, regras, contrapartes) é por org |
| Base vazia no início | Semeada com 24 meses de lançamentos já confirmados (`legado`) | Sem isso o algoritmo leva semanas para sugerir algo |
| Entidade por nome normalizado novo | Entidade = `counterparty_id` | A contraparte já é a chave unificada (CNPJ/CPF ou descrição normalizada por conta), gravada na ingestão |
| Agente revisa toda transação | Só com confiança < 0,85 ou sem sugestão; Haiku 4.5; teto atual de US$ 0,50/org/mês | Custo e atrito na tela sem evidência de ganho |
| CNAE e tabela global | Adiados; `category_ref` da Polp e MCC entram antes | Uma org com dados: a global não gera sinal; os dois sinais já estão no banco |
| Confiança = proporção | Limite inferior de Wilson (95%) | Uma amostra não pode valer 1,0 |
| 4 estados | `review_state` (`pending`/`confirmed`) + campos de sugestão | `sugerida`/`revisada` são etapas internas, o usuário não as vê |
| Sem casamento automático de transferência/recorrência | Mantido como está | O motor R1/R3 e a 00073 acabaram de estabilizar; tirar seria regressão |
| Dedupe por `endToEndId` | `external_id` + R2 atuais; `endToEndId` só se a Polp entregar | Hoje não existe o campo |
| Estorno como ação | Estorno é uma categoria; sem ligação à compra original nesta fase | Não há entidade de estorno |

## Evento de validação

Tabela `validacoes`, um registro por lançamento decidido:

| Campo | Conteúdo |
|---|---|
| `org_id`, `transaction_id`, `counterparty_id` | quem e o quê |
| `user_id` | quem decidiu no card ou na regra; nulo em `regra`, `vinculo`, `edicao` e `legado` |
| `acao` | `confirmar` (aceitou a sugestão), `corrigir` (escolheu outra ou não havia sugestão), `regra` (sync aplicou regra confirmada), `vinculo` (categoria herdada da previsão), `edicao` (mudou a categoria depois, fora da fila), `legado` (semeadura) |
| `sugestao_categoria_id`, `sugestao_origem` | o palpite no momento da decisão (`historico` ou `claude`) |
| `natureza`, `categoria_id` | a decisão final |
| `created_at` | quando |

"Pular" no card é só do cliente e não gera evento nesta fase.

## Métricas

- **Acerto da sugestão**: entre `confirmar` + `corrigir` com sugestão, a fração `confirmar`. Por origem e por contraparte.
- **Critério de sucesso da fase**: % de cards confirmados sem correção; secundário, tempo por sessão.

## Automação por entidade (Entrega 4)

Liga quando a contraparte tem ≥ 20 validações em 30 dias e o limite inferior de Wilson do acerto combinado ≥ 90%. Desliga abaixo de 92%. Aparece com o selo "automático" no extrato; desfazer devolve ao card.

## Entregas

1. **Medição** (este plano): tabela `validacoes`, gravação em todas as decisões, semeadura de 24 meses, script de acerto. Sem mudança de tela. Depois, 2 a 3 semanas medindo.
2. **Algoritmo** (histórico com Wilson → `category_ref` → MCC), só se a medição mostrar erro relevante.
3. **Agente revisor** com cache invalidado por validação nova.
4. **Painel e automação por entidade.**
