# Requirements: Floow

**Defined:** 2026-03-18
**Core Value:** O investidor experiente consegue ver seu patrimônio consolidado — finanças, investimentos e projeções futuras — tudo num único lugar.

## v1.1 Requirements (Complete)

### Categorização Automática

- [x] **CAT-01**: User can create a categorization rule with match type (contains/exact), match value, target category, and priority
- [x] **CAT-02**: User can edit, reorder, enable/disable, and delete categorization rules
- [x] **CAT-03**: Rules are automatically applied to transactions during OFX/CSV import (only when no category is set)
- [x] **CAT-04**: Rules are automatically applied when creating a transaction manually (only when no category is explicitly chosen)
- [x] **CAT-05**: User can create a rule directly from an existing transaction ("categorizar todas como esta") with pre-populated fields
- [x] **CAT-06**: User can apply a rule retroactively to past transactions with an impact preview showing how many will be affected before confirming

### Transações Recorrentes

- [x] **REC-01**: User can create a recurring template with account, category, type, amount, description, frequency (daily/weekly/biweekly/monthly/quarterly/yearly), and start date
- [x] **REC-02**: User can edit and delete recurring templates
- [x] **REC-03**: User can manually trigger "Gerar agora" to create the transaction from a template and advance nextDueDate
- [x] **REC-04**: User can view a list of upcoming recurring transactions due in the next 30 days
- [x] **REC-05**: User can pause and reactivate a recurring template without losing generated transaction history

## v2.0 Requirements

Requirements for milestone v2.0 Open Finance & Automação de Dados.

### Preços de Ativos

- [ ] **PRICE-01**: Sistema atualiza automaticamente preços EOD de ações, FIIs, ETFs e BDRs da B3 diariamente via cron
- [ ] **PRICE-02**: Sistema atualiza automaticamente preços de criptomoedas diariamente via CoinGecko
- [ ] **PRICE-03**: Sistema busca indicadores econômicos (CDI, SELIC, IPCA) do BCB diariamente para cálculo de renda fixa
- [ ] **PRICE-04**: Portfolio de investimentos mostra valores atualizados com preços do dia sem ação do usuário

### Open Finance

- [ ] **OF-01**: Usuário pode conectar sua conta bancária via widget Open Finance (Polp) com consentimento OAuth
- [ ] **OF-02**: Sistema importa extratos bancários automaticamente via sync diário das contas conectadas
- [ ] **OF-03**: Usuário pode definir data de corte ao conectar conta para evitar duplicatas com imports manuais anteriores
- [ ] **OF-04**: Usuário pode ver status, reconectar e desconectar contas bancárias na tela de gestão de conexões

### Reconciliação

- [ ] **RECON-01**: Transações importadas com mesmo ID externo não criam duplicatas (dedup exato)
- [ ] **RECON-02**: Sistema identifica transações manuais que correspondem às importadas via fuzzy matching (valor + data + descrição)
- [ ] **RECON-03**: Usuário pode revisar e aprovar/rejeitar matches sugeridos antes de confirmar na tela de preview

### Categorização de Imports

- [ ] **ICAT-01**: Regras de categorização existentes são aplicadas automaticamente nos extratos importados via Open Finance

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Categorização Enhancements

- **CAT-07**: Amount range condition on rules (e.g., "expenses > R$500") to avoid false matches on generic descriptions
- **CAT-08**: AI-assisted rule suggestions based on transaction description patterns

### Recorrentes Enhancements

- **REC-06**: Automatic generation via cron job (server-side scheduling)
- **REC-07**: Projected recurring transactions displayed on cash flow dashboard in a distinct visual state

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI/ML-based categorization | Requires training data, model serving infra, opaque results — rule-based achieves 80-90% accuracy |
| Automatic subscription detection from history | Statistical analysis prone to false positives, undermines trust in financial tool |
| Full RRULE/iCalendar recurrence | Extreme complexity for <1% of use cases — 6 fixed frequencies cover 99% |
| Split transactions during auto-categorization | Requires new data model (transaction splits) that doesn't exist yet |
| Retroactive application without preview | Silent bulk mutation is dangerous for financial data |
| Direct BCB Open Finance certification | Regulatory complexity — usar agregador (Polp) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAT-01 | Phase 6 | Complete |
| CAT-02 | Phase 6 | Complete |
| CAT-03 | Phase 6 | Complete |
| CAT-04 | Phase 6 | Complete |
| CAT-05 | Phase 6 | Complete |
| CAT-06 | Phase 6 | Complete |
| REC-01 | Phase 7 | Complete |
| REC-02 | Phase 7 | Complete |
| REC-03 | Phase 7 | Complete |
| REC-04 | Phase 7 | Complete |
| REC-05 | Phase 7 | Complete |
| PRICE-01 | — | Pending |
| PRICE-02 | — | Pending |
| PRICE-03 | — | Pending |
| PRICE-04 | — | Pending |
| OF-01 | — | Pending |
| OF-02 | — | Pending |
| OF-03 | — | Pending |
| OF-04 | — | Pending |
| RECON-01 | — | Pending |
| RECON-02 | — | Pending |
| RECON-03 | — | Pending |
| ICAT-01 | — | Pending |

**Coverage:**
- v1.1 requirements: 11 total, 11 complete ✓
- v2.0 requirements: 12 total, 0 mapped (pending roadmap)

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-31 after v2.0 requirements definition*
