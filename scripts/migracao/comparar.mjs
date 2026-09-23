// Compara dois retratos de `baseline.mjs` e diz se a migração preservou tudo.
//
// Uso: node scripts/migracao/comparar.mjs baseline-antes.json baseline-depois.json
//
// Sai com código 1 quando há divergência, para que um `&&` na sequência de
// comandos não siga adiante por engano.
import fs from 'node:fs'

const [, , caminhoA, caminhoB] = process.argv
if (!caminhoA || !caminhoB) throw new Error('uso: node comparar.mjs <antes.json> <depois.json>')

const antes = JSON.parse(fs.readFileSync(caminhoA, 'utf8'))
const depois = JSON.parse(fs.readFileSync(caminhoB, 'utf8'))

// `geradoEm` sempre difere e não diz nada sobre a migração.
delete antes.geradoEm
delete depois.geradoEm

const normalizar = (v) => (Array.isArray(v) ? [...v].sort().join('\n') : String(v))

let divergencias = 0
for (const chave of Object.keys(antes)) {
  const a = normalizar(antes[chave])
  const b = normalizar(depois[chave])
  if (a === b) {
    console.log(`OK       ${chave}`)
    continue
  }
  divergencias++
  console.log(`DIFERE   ${chave}`)
  console.log(`  antes : ${a.slice(0, 300)}`)
  console.log(`  depois: ${b.slice(0, 300)}`)
}

console.log(
  divergencias === 0
    ? '\nIDENTICOS — pode seguir'
    : `\n${divergencias} divergencia(s) — NAO siga`,
)
process.exit(divergencias === 0 ? 0 : 1)
