/**
 * Declaração ambiente para `ofx-js`, que não publica tipos.
 *
 * Este arquivo fica na RAIZ do pacote de propósito: é o único ponto que tanto o
 * tsconfig do próprio core-finance quanto o do @floow/web enxergam ao compilar
 * `src/import/ofx.ts`. Uma cópia em `src/types/` cobre apenas o primeiro, e o
 * typecheck do app quebra com TS7016.
 *
 * `TRNAMT` e os demais campos são `string | number` porque o parser SGML do
 * ofx-js devolve o que encontrou, sem coerção — daí os `String(...)` em ofx.ts.
 */
declare module 'ofx-js' {
  interface OFXData {
    OFX?: {
      BANKMSGSRSV1?: {
        STMTTRNRS?: {
          STMTRS?: {
            BANKTRANLIST?: {
              STMTTRN?: OFXTransaction | OFXTransaction[]
            }
          }
        }
      }
    }
  }

  interface OFXTransaction {
    FITID: string | number
    DTPOSTED: string | number
    TRNAMT: string | number
    MEMO?: string | number
    NAME?: string | number
    TRNTYPE?: string
  }

  export function parse(content: string): Promise<OFXData>
}
