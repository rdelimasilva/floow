import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const FAQ_ITEMS = [
  {
    q: 'Como importar meu extrato bancário?',
    a: 'Vá em Transações → Importar. Aceita arquivos OFX (exportados do internet banking) ou CSV. O sistema detecta duplicatas automaticamente.',
  },
  {
    q: 'O que são transações recorrentes?',
    a: 'São transações que se repetem com frequência definida (mensal, quinzenal, etc.). Ao criar uma, o sistema gera automaticamente as parcelas futuras. Você pode cancelar a recorrência a qualquer momento.',
  },
  {
    q: 'Como funciona a categorização automática?',
    a: 'Ao criar regras de categorização (ícone de raio ⚡ na lista de transações), transações futuras com descrição semelhante serão categorizadas automaticamente na importação.',
  },
  {
    q: 'O que é o saldo acumulado na lista de transações?',
    a: 'A coluna "Saldo" mostra o saldo progressivo, como um extrato bancário. Ao filtrar por conta, o saldo reflete apenas aquela conta.',
  },
  {
    q: 'Como funcionam as metas de gastos e investimentos?',
    a: 'Defina metas mensais, trimestrais ou anuais. O sistema compara automaticamente com seus gastos reais e aportes, mostrando alertas quando você se aproxima do limite.',
  },
  {
    q: 'Posso desfazer uma exclusão?',
    a: 'Não. Exclusões de contas, transações e dívidas são permanentes. Por isso, o sistema sempre pede confirmação antes de excluir.',
  },
]

const GLOSSARY_ITEMS = [
  {
    term: 'ITCMD',
    definition: 'Imposto sobre Transmissão Causa Mortis e Doação. Imposto estadual cobrado sobre heranças e doações. A alíquota varia de 2% a 8% conforme o estado.',
  },
  {
    term: 'Regra dos 4%',
    definition: 'Estratégia de retirada que sugere sacar até 4% do patrimônio investido por ano na aposentadoria. Baseada em estudos históricos, permite que o patrimônio dure pelo menos 30 anos.',
  },
  {
    term: 'Retorno Real',
    definition: 'Rendimento de um investimento já descontada a inflação. Ex: se o investimento rende 10% ao ano e a inflação é 4%, o retorno real é aproximadamente 6%.',
  },
  {
    term: 'Patrimônio Líquido',
    definition: 'Soma de todos os seus ativos (contas, investimentos, imóveis) menos todas as suas dívidas. Representa sua riqueza real.',
  },
  {
    term: 'Independência Financeira (IF)',
    definition: 'Ponto em que sua renda passiva (rendimentos dos investimentos) cobre suas despesas mensais, tornando o trabalho opcional.',
  },
  {
    term: 'Fluxo de Caixa',
    definition: 'Diferença entre receitas e despesas em um período. Fluxo positivo significa que você ganha mais do que gasta.',
  },
  {
    term: 'Aporte',
    definition: 'Valor investido periodicamente na sua carteira de investimentos. Aportes mensais consistentes são fundamentais para o crescimento patrimonial.',
  },
  {
    term: 'Taxa de Inflação',
    definition: 'Percentual anual de perda de poder de compra da moeda. No Brasil, medida pelo IPCA. A média histórica é de 4-5% ao ano.',
  },
  {
    term: 'Cenário Conservador / Base / Arrojado',
    definition: 'Projeções de retorno: Conservador (~4% real) assume renda fixa pura. Base (~6%) assume carteira diversificada. Arrojado (~9%) assume maior exposição a renda variável.',
  },
]

export default function HelpPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Ajuda"
        description="Tire suas dúvidas sobre como usar o Floow"
      />

      {/* FAQ */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Perguntas Frequentes</h2>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{item.q}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">{item.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Glossary */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Glossário Financeiro</h2>
        <Card>
          <CardContent className="divide-y divide-gray-100 p-0">
            {GLOSSARY_ITEMS.map((item) => (
              <div key={item.term} className="px-6 py-4">
                <dt className="text-sm font-semibold text-gray-900">{item.term}</dt>
                <dd className="mt-1 text-sm text-gray-600">{item.definition}</dd>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
