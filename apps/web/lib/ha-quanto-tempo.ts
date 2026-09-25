const RELATIVO = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'always' })

/** "há 15 minutos", "há 3 horas", "há 2 dias" — para "última importação". */
export function haQuantoTempo(quando: Date | string, agora: Date = new Date()): string {
  const segundos = Math.round((agora.getTime() - new Date(quando).getTime()) / 1000)
  if (segundos < 60) return 'agora há pouco'
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return RELATIVO.format(-minutos, 'minute')
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return RELATIVO.format(-horas, 'hour')
  return RELATIVO.format(-Math.floor(horas / 24), 'day')
}
