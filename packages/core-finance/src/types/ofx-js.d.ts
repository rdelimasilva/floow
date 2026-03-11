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
