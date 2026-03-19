# Requirements: Floow

**Defined:** 2026-03-18
**Core Value:** O investidor experiente consegue ver seu patrimônio consolidado — finanças, investimentos e projeções futuras — tudo num único lugar.

## v1.1 Requirements

Requirements for milestone v1.1 Automação. Each maps to roadmap phases.

### Categorização Automática

- [ ] **CAT-01**: User can create a categorization rule with match type (contains/exact), match value, target category, and priority
- [ ] **CAT-02**: User can edit, reorder, enable/disable, and delete categorization rules
- [ ] **CAT-03**: Rules are automatically applied to transactions during OFX/CSV import (only when no category is set)
- [ ] **CAT-04**: Rules are automatically applied when creating a transaction manually (only when no category is explicitly chosen)
- [ ] **CAT-05**: User can create a rule directly from an existing transaction ("categorizar todas como esta") with pre-populated fields
- [ ] **CAT-06**: User can apply a rule retroactively to past transactions with an impact preview showing how many will be affected before confirming

### Transações Recorrentes

- [ ] **REC-01**: User can create a recurring template with account, category, type, amount, description, frequency (daily/weekly/biweekly/monthly/quarterly/yearly), and start date
- [ ] **REC-02**: User can edit and delete recurring templates
- [ ] **REC-03**: User can manually trigger "Gerar agora" to create the transaction from a template and advance nextDueDate
- [ ] **REC-04**: User can view a list of upcoming recurring transactions due in the next 30 days
- [ ] **REC-05**: User can pause and reactivate a recurring template without losing generated transaction history

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Categorização Enhancements

- **CAT-07**: Amount range condition on rules (e.g., "expenses > R$500") to avoid false matches on generic descriptions
- **CAT-08**: AI-assisted rule suggestions based on transaction description patterns

### Recorrentes Enhancements

- **REC-06**: Automatic generation via Supabase Edge Function cron job (server-side scheduling)
- **REC-07**: Projected recurring transactions displayed on cash flow dashboard in a distinct visual state

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI/ML-based categorization | Requires training data, model serving infra, opaque results — rule-based achieves 80-90% accuracy |
| Automatic subscription detection from history | Statistical analysis prone to false positives, undermines trust in financial tool |
| Full RRULE/iCalendar recurrence | Extreme complexity for <1% of use cases — 6 fixed frequencies cover 99% |
| Split transactions during auto-categorization | Requires new data model (transaction splits) that doesn't exist yet |
| Retroactive application without preview | Silent bulk mutation is dangerous for financial data |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAT-01 | — | Pending |
| CAT-02 | — | Pending |
| CAT-03 | — | Pending |
| CAT-04 | — | Pending |
| CAT-05 | — | Pending |
| CAT-06 | — | Pending |
| REC-01 | — | Pending |
| REC-02 | — | Pending |
| REC-03 | — | Pending |
| REC-04 | — | Pending |
| REC-05 | — | Pending |

**Coverage:**
- v1.1 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11 ⚠️

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after initial definition*
