import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Privacidade — Floow',
  description: 'Como o Floow coleta, usa e protege seus dados pessoais.',
}

const ATUALIZADA_EM = '23 de setembro de 2026'
const EMAIL_CONTATO = 'rdelimasilva@gmail.com'

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
      <div className="space-y-3 text-gray-700 leading-relaxed">{children}</div>
    </section>
  )
}

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <Link href="/" className="text-2xl font-semibold tracking-tight text-gray-900">
            Floow
          </Link>
          <h1 className="text-3xl font-semibold text-gray-900">Política de Privacidade</h1>
          <p className="text-sm text-gray-500">Última atualização: {ATUALIZADA_EM}</p>
        </header>

        <p className="text-gray-700 leading-relaxed">
          Esta política explica quais dados pessoais o Floow coleta, para que os usa, com quem
          compartilha e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados
          (Lei nº 13.709/2018 — LGPD).
        </p>

        <Secao titulo="1. Dados que coletamos">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Cadastro:</strong> nome, e-mail e foto de perfil. Se você entrar com o
              Google, recebemos apenas nome, e-mail e foto da sua conta Google.
            </li>
            <li>
              <strong>Dados financeiros:</strong> contas, transações, categorias, orçamentos e
              metas que você cadastra ou importa.
            </li>
            <li>
              <strong>Open Finance:</strong> quando você autoriza a conexão com seu banco,
              recebemos saldos e transações das contas que você escolheu compartilhar, e o CPF
              necessário para a conexão.
            </li>
            <li>
              <strong>Pagamento:</strong> dados da assinatura. Os dados do cartão são tratados
              diretamente pelo processador de pagamento e não ficam armazenados no Floow.
            </li>
            <li>
              <strong>Uso técnico:</strong> registros de erro e informações do dispositivo e
              navegador, usados para manter o serviço funcionando.
            </li>
          </ul>
        </Secao>

        <Secao titulo="2. Para que usamos">
          <ul className="list-disc space-y-2 pl-5">
            <li>Criar e manter sua conta e autenticar seu acesso.</li>
            <li>Organizar suas finanças, gerar relatórios, projeções e alertas.</li>
            <li>Enviar e-mails do serviço, como alertas de gastos e avisos da conta.</li>
            <li>Responder às perguntas feitas ao assistente financeiro com inteligência artificial.</li>
            <li>Cobrar a assinatura, prevenir fraudes e corrigir falhas.</li>
          </ul>
          <p>
            As bases legais são a execução do contrato com você, o seu consentimento (por exemplo,
            para o Open Finance) e o legítimo interesse em manter o serviço seguro.
          </p>
          <p>Não vendemos seus dados e não os usamos para publicidade.</p>
        </Secao>

        <Secao titulo="3. Com quem compartilhamos">
          <p>
            Compartilhamos dados apenas com fornecedores que operam o serviço em nosso nome:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Supabase:</strong> banco de dados e autenticação.</li>
            <li><strong>Polp:</strong> conexão com bancos via Open Finance.</li>
            <li><strong>Stripe:</strong> processamento de pagamentos.</li>
            <li><strong>Resend:</strong> envio de e-mails.</li>
            <li>
              <strong>Anthropic:</strong> processamento das perguntas feitas ao assistente de IA.
              Os dados enviados não são usados para treinar modelos.
            </li>
            <li><strong>Sentry:</strong> monitoramento de erros.</li>
          </ul>
          <p>
            Alguns desses fornecedores armazenam dados fora do Brasil. Nesses casos a
            transferência segue as garantias previstas na LGPD. Também podemos fornecer dados
            quando exigido por lei ou ordem judicial.
          </p>
        </Secao>

        <Secao titulo="4. Dados do Google">
          <p>
            O uso de informações recebidas das APIs do Google segue a{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-gray-900 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Política de Dados do Usuário dos Serviços de API do Google
            </a>
            , incluindo os requisitos de uso limitado. Usamos nome, e-mail e foto apenas para
            identificar você no Floow.
          </p>
        </Secao>

        <Secao titulo="5. Segurança">
          <p>
            Os dados trafegam criptografados e o acesso é restrito por conta: cada usuário só
            enxerga os dados da própria organização.
          </p>
        </Secao>

        <Secao titulo="6. Seus direitos">
          <p>
            Você pode, a qualquer momento, pedir acesso, correção, portabilidade ou exclusão dos
            seus dados, revogar consentimentos (inclusive desconectar bancos do Open Finance) e
            cancelar os e-mails pelo link no rodapé de cada mensagem.
          </p>
          <p>
            Para exercer esses direitos, escreva para{' '}
            <a href={`mailto:${EMAIL_CONTATO}`} className="text-gray-900 underline">
              {EMAIL_CONTATO}
            </a>
            .
          </p>
        </Secao>

        <Secao titulo="7. Alterações">
          <p>
            Podemos atualizar esta política. Mudanças relevantes serão avisadas por e-mail ou no
            aplicativo, e a data no topo desta página indica a última revisão.
          </p>
        </Secao>
      </article>
    </main>
  )
}
