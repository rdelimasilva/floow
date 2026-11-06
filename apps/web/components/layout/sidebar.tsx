'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import { X, Pin, PinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from './sidebar-context'
import { urlDeTransacoes } from '@/lib/finance/filtros-lembrados'
import { NAV_SECTIONS, itemDoMenu, type NavItem } from './nav-config'
import { SidebarItem, someFechado, type DicaHandlers } from './sidebar-item'
import { SidebarRodape } from './sidebar-rodape'
import { useFavoritos } from './use-favoritos'

function lerCookies(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const par of document.cookie.split('; ')) {
    const i = par.indexOf('=')
    if (i > 0) out[par.slice(0, i)] = par.slice(i + 1)
  }
  return out
}

const DICA_DOS_FAVORITOS = 'floow-dica-favoritos-vista'

function lerStorage(chave: string) {
  try { return localStorage.getItem(chave) } catch { return null }
}

function gravarStorage(chave: string) {
  try { localStorage.setItem(chave, '1') } catch { /* aba anônima: a dica volta, sem prejuízo */ }
}

// shortcut: a arte da logo vem com muita margem em volta; o recorte é feito por
// posição em pixels. Trocar quando houver o arquivo da logo sem margem.
const LOGO = 'https://ak8t3l6j6j.ufs.sh/f/CwfRtcqQB4vVZAAoyfCr1bHQ52TfliXL8pR9wgYu7dBDt3nk'
const SIMBOLO = 'https://ak8t3l6j6j.ufs.sh/f/CwfRtcqQB4vVBQBMqgGTkLbIyjwphG5CfF2KE4ru9eNaDWMP'

const SEM_FAVORITOS: string[] = []

interface SidebarProps {
  cfoBadgeCount?: number
  favoritosIniciais?: string[]
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ cfoBadgeCount, favoritosIniciais = SEM_FAVORITOS, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { pinned, togglePin } = useSidebar()
  const { favoritos, alternar } = useFavoritos(favoritosIniciais)

  // Compacto, o menu só abre parando o mouse na faixa da logo (300 ms). Passar
  // pelos ícones a caminho do conteúdo não abre nada; cada ícone mostra o nome.
  const [abertoPeloMouse, setAbertoPeloMouse] = useState(false)
  const aberto = pinned || abertoPeloMouse
  const timerAbrir = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pedirAbertura = () => {
    clearTimeout(timerAbrir.current)
    timerAbrir.current = setTimeout(() => setAbertoPeloMouse(true), 300)
  }
  const fecharMenu = () => {
    clearTimeout(timerAbrir.current)
    setAbertoPeloMouse(false)
  }

  // Dica do modo compacto: fica fora do <aside>, que corta o que passa da borda.
  const [dicaAtual, setDicaAtual] = useState<{ texto: string; top: number } | null>(null)
  const timerDica = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dica: DicaHandlers = {
    mostrar: useCallback((texto: string, el: HTMLElement) => {
      clearTimeout(timerDica.current)
      const r = el.getBoundingClientRect()
      timerDica.current = setTimeout(() => setDicaAtual({ texto, top: r.top + r.height / 2 }), 150)
    }, []),
    esconder: useCallback(() => {
      clearTimeout(timerDica.current)
      setDicaAtual(null)
    }, []),
  }
  useEffect(() => { if (aberto) dica.esconder() }, [aberto, dica.esconder])

  // Descoberta dos favoritos: uma vez só, some no primeiro clique. Só conta
  // como vista com o menu aberto, que é quando a estrela aparece.
  const [mostrarDicaFavoritos, setMostrarDicaFavoritos] = useState(false)
  useEffect(() => {
    if (!aberto || lerStorage(DICA_DOS_FAVORITOS) || favoritosIniciais.length > 0) return
    setMostrarDicaFavoritos(true)
    const dispensar = () => {
      gravarStorage(DICA_DOS_FAVORITOS)
      setMostrarDicaFavoritos(false)
    }
    document.addEventListener('pointerdown', dispensar, { once: true })
    return () => document.removeEventListener('pointerdown', dispensar)
  }, [aberto, favoritosIniciais.length])

  // As três telas de orçamento navegam por `?month=`: trocar de uma para outra
  // pelo menu mantém o mês que o usuário estava vendo.
  const mesDoOrcamento = pathname.startsWith('/budgets/') ? searchParams.get('month') : null
  // Transações abre já no recorte lembrado (ver `urlDeTransacoes`). Lido
  // depois da montagem porque o cookie só existe no navegador; relido a cada
  // troca de URL, que é quando os filtros mudam.
  const [hrefDeTransacoes, setHrefDeTransacoes] = useState('/transactions')
  useEffect(() => {
    setHrefDeTransacoes(urlDeTransacoes(lerCookies()))
  }, [pathname, searchParams])

  function hrefDoItem(href: string) {
    if (href === '/transactions') return hrefDeTransacoes
    return mesDoOrcamento && href.startsWith('/budgets/') ? `${href}?month=${mesDoOrcamento}` : href
  }

  useEffect(() => { onMobileClose() }, [pathname, onMobileClose])

  // Gaveta aberta no celular: o foco entra pelo botão de fechar, Esc fecha, e ao
  // fechar o foco volta para quem abriu (o botão de menu da barra do topo).
  const fecharRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!mobileOpen) return
    const quemAbriu = document.activeElement as HTMLElement | null
    fecharRef.current?.focus()
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onMobileClose() }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      quemAbriu?.focus()
    }
  }, [mobileOpen, onMobileClose])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [mobileOpen])

  function isActive(href: string) {
    if (pathname === href) return true
    // 'Transações' é o pai de tudo em /transactions/, exceto as sub-rotas que
    // ganharam item próprio no menu — cada uma entra aqui como exceção, ou
    // fica destacada junto com o item que a representa de verdade.
    if (href === '/transactions') {
      return (
        pathname.startsWith('/transactions/') &&
        !pathname.startsWith('/transactions/recurring')
      )
    }
    return pathname.startsWith(href + '/')
  }

  const itensFavoritos = favoritos.map(itemDoMenu).filter((i): i is NavItem => !!i)
  const secoes = itensFavoritos.length > 0
    ? [{ title: 'Favoritos', items: itensFavoritos }, ...NAV_SECTIONS]
    : NAV_SECTIONS

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onMobileClose}
        aria-hidden="true"
      />

      <aside
        onMouseLeave={fecharMenu}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-gray-100 bg-white',
          'lg:overflow-hidden',
          // Fechada, a gaveta some também para o teclado e o leitor de tela
          // (`invisible`); a transição de visibility espera o slide terminar.
          'transition-[transform,visibility] duration-200 ease-in-out',
          mobileOpen ? 'translate-x-0' : 'invisible -translate-x-full lg:visible',
          'lg:translate-x-0 lg:transition-[width,box-shadow] lg:duration-200 lg:ease-out',
          pinned
            ? 'lg:w-56'
            : aberto
              ? 'lg:w-56 lg:shadow-[4px_0_16px_rgba(0,0,0,0.08)]'
              : 'lg:w-[68px]',
        )}
      >
        {/* Faixa da logo: 56 px, a mesma altura da barra do topo */}
        <div
          className="group/logo flex h-14 shrink-0 items-center gap-2 px-4 pt-[env(safe-area-inset-top)] box-content"
          onMouseEnter={() => { if (!pinned) pedirAbertura() }}
        >
          <Link href="/dashboard" onClick={onMobileClose} aria-label="Floow, ir para o Dashboard" className="flex items-center">
            {/* Aberto: a palavra floow com 24 px de altura */}
            <span className={cn('relative block h-7 w-[84px] overflow-hidden', !aberto && 'lg:hidden')}>
              <Image src={LOGO} alt="" width={107} height={60} unoptimized className="absolute -left-3 -top-3 h-[60px] w-[107px] max-w-none" />
            </span>
            {/* Compacto: só o símbolo, 28 px, centrado nos 68 px do menu */}
            <span className={cn('relative hidden h-5 w-8 overflow-hidden', !aberto && 'lg:ml-[2px] lg:block')}>
              <Image src={SIMBOLO} alt="" width={68} height={68} unoptimized className="absolute -left-[18px] -top-6 h-[68px] w-[68px] max-w-none" />
            </span>
          </Link>

          <button
            type="button"
            ref={fecharRef}
            onClick={onMobileClose}
            aria-label="Fechar menu"
            className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={togglePin}
            aria-label={pinned ? 'Desafixar menu' : 'Fixar menu aberto'}
            className={cn(
              'ml-auto hidden rounded-md p-1.5 text-muted-foreground transition-opacity hover:bg-accent hover:text-accent-foreground',
              'lg:block lg:opacity-0 lg:group-hover/logo:opacity-100 lg:focus-visible:opacity-100',
              !aberto && 'lg:!hidden',
            )}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
        </div>

        <nav aria-label="Menu principal" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-3 scrollbar-none">
          {secoes.map((section, idx) => {
            const ehFavoritos = section.title === 'Favoritos'
            return (
              <section
                key={section.title}
                aria-label={section.title}
                className={cn(idx > 0 && 'mt-5')}
              >
                <p aria-hidden className={cn(
                  'mb-1 px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap',
                  someFechado(aberto),
                )}>
                  {section.title}
                </p>

                {/* Compacto: o nome da seção vira um traço */}
                {!aberto && idx > 0 && <div className="mx-auto mb-2 hidden h-px w-6 bg-border lg:block" />}

                {idx === 0 && mostrarDicaFavoritos && aberto && (
                  <p role="status" className="mx-2 mb-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground">
                    Fixe suas telas mais usadas aqui: clique na estrela ao lado do nome.
                  </p>
                )}

                <div className="space-y-0.5">
                  {section.items.map((item, i) => (
                    <SidebarItem
                      key={item.href}
                      item={item}
                      href={hrefDoItem(item.href)}
                      isActive={isActive(item.href)}
                      aberto={aberto}
                      favorito={favoritos.includes(item.href)}
                      onFavoritar={() => alternar(item.href)}
                      estrelaVisivel={mostrarDicaFavoritos && idx === 0 && i === 0 && !ehFavoritos}
                      onClick={onMobileClose}
                      badge={item.href === '/cfo' ? cfoBadgeCount : undefined}
                      dica={dica}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </nav>

        <SidebarRodape aberto={aberto} ajudaAtiva={isActive('/help')} onClick={onMobileClose} dica={dica} />
      </aside>

      {dicaAtual && !aberto && (
        <div
          role="tooltip"
          style={{ top: dicaAtual.top }}
          className="pointer-events-none fixed left-[76px] z-[60] hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-md lg:block"
        >
          {dicaAtual.texto}
        </div>
      )}
    </>
  )
}
