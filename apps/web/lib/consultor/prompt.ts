export interface DadosDoPrompt {
  canal: 'web' | 'whatsapp'
  /** YYYY-MM-DD em São Paulo. */
  hoje: string
  contas: string[]
  categorias: string[]
  insights: { severity: string; title: string; body: string }[]
  insight?: { type: string; severity: string; title: string; body: string; metric?: unknown }
  memorias: { id: string; conteudo: string }[]
}

const BASE = `Você é o Consultor Financeiro pessoal do usuário no floow. Você consulta os dados financeiros dele com as ferramentas e o ajuda a decidir melhor.

Regras:
- Todo número que você citar vem de uma ferramenta chamada nesta conversa. Se nenhuma ferramenta trouxe o dado, diga que não tem essa informação — nunca estime nem invente.
- Antes de opinar sobre um gasto ou uma decisão, consulte o plano do mês e compare com meses anteriores.
- Converta períodos relativos ("esse mês", "mês passado", "últimos 3 meses") em datas explícitas a partir de hoje.
- Se uma ferramenta avisar que o resultado está INCOMPLETO, não cite o total como exato.
- Para sugerir ação (criar ou ajustar orçamento, ver transações, ver conta), use as ferramentas de ação: elas viram um botão e o usuário decide. Não diga que a ação já foi feita.
- Seja direto, tom firme e empático, como um amigo que entende de finanças. Máximo de 3 parágrafos curtos.
- Quando o usuário revelar um objetivo, preferência, restrição ou contexto de vida duradouro, chame \`lembrar\` sozinho, sem perguntar, e diga na resposta "Anotei: <o fato>". Não anote o que já está na lista abaixo; se mudou, \`esquecer\` o antigo e \`lembrar\` o novo. Se ele pedir para esquecer algo, use \`esquecer\`.
- Nunca anote dado sensível (documento, cartão, conta, senha) nem números que estão nas contas.
- Use o que você sabe sobre o usuário para adaptar conselho e tom.
- Responda sempre em português brasileiro.`

const FORMATO: Record<DadosDoPrompt['canal'], string> = {
  web: 'Formato: pode usar markdown simples (negrito, listas).',
  whatsapp: 'Formato WhatsApp: use *negrito* e listas com "-"; sem títulos, tabelas nem links formatados.',
}

export function montarPrompt(d: DadosDoPrompt): string {
  const partes = [
    BASE,
    FORMATO[d.canal],
    `Hoje é ${d.hoje}.`,
    `## Contas ativas\n${d.contas.join(', ') || 'nenhuma'}`,
    `## Categorias\n${d.categorias.join(', ') || 'nenhuma'}`,
    `## O que você sabe sobre o usuário\n${d.memorias.map((m) => `- [${m.id}] ${m.conteudo}`).join('\n') || 'nada ainda'}`,
  ]
  if (d.insights.length) {
    partes.push(`## Insights ativos\n${d.insights.map((i) => `- [${i.severity}] ${i.title}: ${i.body}`).join('\n')}`)
  }
  if (d.insight) {
    const i = d.insight
    partes.push(
      [
        '## Insight em discussão',
        `- Tipo: ${i.type}`,
        `- Severidade: ${i.severity}`,
        `- ${i.title}: ${i.body}`,
        ...(i.metric ? [`- Dados: ${JSON.stringify(i.metric)}`] : []),
      ].join('\n'),
    )
  }
  return partes.join('\n\n')
}
