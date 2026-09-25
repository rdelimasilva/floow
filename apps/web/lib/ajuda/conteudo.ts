/**
 * Conteúdo da Ajuda. O `id` vira âncora (/help#id) e é o que as telas usam
 * no link "Como funciona?" — mudar um id quebra esses links.
 */
export interface Pergunta {
  id: string
  pergunta: string
  resposta: string
}

export const EMAIL_CONTATO = 'rdelimasilva@gmail.com'

export const PERGUNTAS: Pergunta[] = [
  {
    id: 'importar-extrato',
    pergunta: 'Como importar meu extrato bancário?',
    resposta:
      'Vá em Transações → Importar e escolha a conta. Aceita OFX (exportado do internet banking) ou CSV, separado por vírgula ou ponto e vírgula. Lançamentos que já existem são reconhecidos como duplicatas e ignorados. Importou o arquivo errado? Use "Desfazer importação" na tela final.',
  },
  {
    id: 'open-finance',
    pergunta: 'Como conectar meu banco pelo Open Finance?',
    resposta:
      'Em Contas → Importar do meu banco, escolha a instituição e autorize no app do banco. Contas, cartões, investimentos e lançamentos passam a entrar sozinhos. "Encerrar" corta a conexão, mas as transações já importadas continuam no floow; para voltar, é preciso autorizar de novo no banco.',
  },
  {
    id: 'filas',
    pergunta: 'O que são "Classificar lançamentos", "Confirmar previsões" e "Remover repetidos"?',
    resposta:
      'São filas que aparecem em Transações quando há algo para você decidir. Classificar: lançamentos do banco que o floow ainda não sabe classificar — você decide uma vez e vale para os próximos. Confirmar previsões: previsões suas que parecem já ter acontecido. Remover repetidos: lançamentos que o banco mandou duas vezes. Nada muda sem você aprovar.',
  },
  {
    id: 'recorrentes',
    pergunta: 'O que são transações recorrentes?',
    resposta:
      'Transações que se repetem com frequência definida (mensal, quinzenal etc.). Ao criar uma, o floow gera as parcelas futuras. Em Recorrentes você pausa, edita, clona ou cancela.',
  },
  {
    id: 'categorizacao-automatica',
    pergunta: 'Como funciona a categorização automática?',
    resposta:
      'Regras dizem que descrições parecidas levam a mesma categoria. Na lista de transações, o raio ⚡ de uma transação já categorizada cria a regra "categorizar todas como esta"; em Categorias você cria e gerencia regras e pode aplicá-las às transações antigas sem categoria.',
  },
  {
    id: 'cartao',
    pergunta: 'Como acompanho a fatura do cartão de crédito?',
    resposta:
      'Na conta do cartão, cadastre os dias de fechamento e de vencimento. O extrato passa a mostrar uma linha com o total da fatura no fechamento. Cada lançamento mostra o final do cartão, e a lista pode ser filtrada por ele.',
  },
  {
    id: 'ritmo-de-gastos',
    pergunta: 'O que é o Ritmo de Gastos?',
    resposta:
      'Mostra quanto você já gastou no mês comparado ao Plano de Gastos, por onde o dinheiro saiu e onde o mês deve fechar. Em Configurações você recebe esse resumo por e-mail ou WhatsApp — ou só alertas, quando uma categoria entra em risco ou estoura o teto.',
  },
  {
    id: 'metas',
    pergunta: 'Como funcionam as metas de gastos e investimentos?',
    resposta:
      'Em Plano de Gastos e Meta de Investimentos você define valores por mês. O floow compara com os gastos e aportes reais e avisa quando você se aproxima do limite.',
  },
  {
    id: 'consultor',
    pergunta: 'O que faz o Consultor Financeiro?',
    resposta:
      'Gera análises diárias a partir dos seus dados — gastos fora do padrão, metas em risco, oportunidades — e responde perguntas no chat. Ações sugeridas por ele só acontecem depois que você confirma.',
  },
  {
    id: 'dividas',
    pergunta: 'Como controlar empréstimos e financiamentos?',
    resposta:
      'Em Controle de Dívidas, cadastre cada dívida com valor total, parcela, taxa de juros e data de início. A tela mostra quanto já foi pago de cada uma.',
  },
  {
    id: 'saldo-acumulado',
    pergunta: 'O que é o saldo acumulado na lista de transações?',
    resposta:
      'A coluna "Saldo" mostra o saldo progressivo, como num extrato bancário. Ao filtrar por conta, o saldo reflete só aquela conta.',
  },
  {
    id: 'desfazer',
    pergunta: 'Posso desfazer uma exclusão?',
    resposta:
      'Ao excluir uma transação, o aviso "Desfazer" fica alguns segundos na tela. Uma importação pode ser desfeita na tela final. Exclusões em lote, de contas e de dívidas são permanentes, por isso pedem confirmação antes.',
  },
]

export const GLOSSARIO = [
  { termo: 'ITCMD', definicao: 'Imposto sobre Transmissão Causa Mortis e Doação. Imposto estadual cobrado sobre heranças e doações; a alíquota varia de 2% a 8% conforme o estado.' },
  { termo: 'Regra dos 4%', definicao: 'Estratégia de retirada que sugere sacar até 4% do patrimônio investido por ano na aposentadoria. Baseada em estudos históricos, permite que o patrimônio dure pelo menos 30 anos.' },
  { termo: 'Retorno Real', definicao: 'Rendimento de um investimento já descontada a inflação. Ex.: se o investimento rende 10% ao ano e a inflação é 4%, o retorno real é aproximadamente 6%.' },
  { termo: 'Patrimônio Líquido', definicao: 'Soma de todos os seus ativos (contas, investimentos, bens) menos todas as suas dívidas.' },
  { termo: 'Independência Financeira (IF)', definicao: 'Ponto em que sua renda passiva cobre suas despesas mensais, tornando o trabalho opcional. O "Número da IF" é o patrimônio necessário para isso.' },
  { termo: 'Preço médio', definicao: 'Custo médio por unidade de um ativo, considerando todas as compras. É a base para calcular o resultado.' },
  { termo: 'Resultado (ganho ou perda)', definicao: 'Diferença entre o valor atual de um ativo e o que você pagou por ele, enquanto você ainda não vendeu.' },
  { termo: 'Fluxo de Caixa', definicao: 'Diferença entre receitas e despesas em um período. Fluxo positivo significa que você ganha mais do que gasta.' },
  { termo: 'Aporte', definicao: 'Valor investido periodicamente na sua carteira. Aportes mensais consistentes são fundamentais para o crescimento patrimonial.' },
  { termo: 'Taxa de Inflação', definicao: 'Percentual anual de perda de poder de compra da moeda. No Brasil, medida pelo IPCA; a média histórica é de 4% a 5% ao ano.' },
  { termo: 'Cenário Conservador / Base / Arrojado', definicao: 'Projeções de retorno: Conservador (~4% real) assume renda fixa pura; Base (~6%) assume carteira diversificada; Arrojado (~9%) assume maior exposição a renda variável.' },
]
