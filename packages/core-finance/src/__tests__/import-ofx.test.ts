import { describe, it, expect } from 'vitest'
import { parseOFXDate, parseOFXFile } from '../import/ofx'

// Sample OFX SGML content for testing
const VALID_OFX_CONTENT = `OFXHEADER:100
DATA:OFXSGML
VERSION:151
SECURITY:NONE
ENCODING:UTF-8
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001</TRNUID>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<STMTRS>
<CURDEF>BRL</CURDEF>
<BANKACCTFROM>
<BANKID>341</BANKID>
<ACCTID>12345-6</ACCTID>
<ACCTTYPE>CHECKING</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20240101120000.000[-3:BRT]</DTSTART>
<DTEND>20240131120000.000[-3:BRT]</DTEND>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20240115120000.000[-3:BRT]</DTPOSTED>
<TRNAMT>5000.00</TRNAMT>
<FITID>2024011500001</FITID>
<MEMO>SALARIO JANEIRO</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20240120120000.000[-3:BRT]</DTPOSTED>
<TRNAMT>-150.75</TRNAMT>
<FITID>2024012000002</FITID>
<MEMO>SUPERMERCADO PAGUE MENOS</MEMO>
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>4849.25</BALAMT>
<DTASOF>20240131120000.000[-3:BRT]</DTASOF>
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`

const INVALID_OFX_CONTENT = `not valid ofx content at all`

describe('parseOFXDate', () => {
  it('parses long OFX date with timezone (YYYYMMDDHHMMSS.SSS[TZ])', () => {
    const result = parseOFXDate('20240115120000.000[-3:BRT]')
    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(0) // January = 0
    expect(result.getDate()).toBe(15)
  })

  it('parses short OFX date (YYYYMMDD)', () => {
    const result = parseOFXDate('20240115')
    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(0) // January = 0
    expect(result.getDate()).toBe(15)
  })
})

describe('parseOFXFile', () => {
  it('returns array of NormalizedTransaction from valid OFX content', async () => {
    const result = await parseOFXFile(VALID_OFX_CONTENT)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
  })

  it('extracts FITID as externalId', async () => {
    const result = await parseOFXFile(VALID_OFX_CONTENT)
    expect(result[0].externalId).toBe('2024011500001')
    expect(result[1].externalId).toBe('2024012000002')
  })

  it('parses OFX date correctly (not as ISO 8601)', async () => {
    const result = await parseOFXFile(VALID_OFX_CONTENT)
    expect(result[0].date).toBeInstanceOf(Date)
    expect(result[0].date.getFullYear()).toBe(2024)
    expect(result[0].date.getMonth()).toBe(0) // January
    expect(result[0].date.getDate()).toBe(15)
  })

  it('converts credit transaction (positive TRNAMT) to income type with positive amountCents', async () => {
    const result = await parseOFXFile(VALID_OFX_CONTENT)
    const credit = result[0]
    expect(credit.type).toBe('income')
    expect(credit.amountCents).toBe(500000) // R$5000.00 = 500000 cents
    expect(credit.description).toBe('SALARIO JANEIRO')
  })

  it('converts debit transaction (negative TRNAMT) to expense type with negative amountCents', async () => {
    const result = await parseOFXFile(VALID_OFX_CONTENT)
    const debit = result[1]
    expect(debit.type).toBe('expense')
    expect(debit.amountCents).toBe(-15075) // R$-150.75 = -15075 cents
    expect(debit.description).toBe('SUPERMERCADO PAGUE MENOS')
  })

  it('throws descriptive error for invalid OFX content', async () => {
    await expect(parseOFXFile(INVALID_OFX_CONTENT)).rejects.toThrow()
  })
})
