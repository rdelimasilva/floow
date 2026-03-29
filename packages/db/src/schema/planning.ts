import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  numeric,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { orgs } from './auth'

// ---------------------------------------------------------------------------
// Tables — Planning Engine (Phase 4)
// One plan per org — all three tables use uniqueIndex(orgId) for upsert pattern
// ---------------------------------------------------------------------------

export const retirementPlans = pgTable(
  'retirement_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    currentAge: integer('current_age').notNull(),
    retirementAge: integer('retirement_age').notNull(),
    lifeExpectancy: integer('life_expectancy').notNull().default(85),
    monthlyContributionCents: integer('monthly_contribution_cents').notNull(),
    desiredMonthlyIncomeCents: integer('desired_monthly_income_cents').notNull(),
    inflationRate: numeric('inflation_rate', { precision: 5, scale: 4 }).notNull().default('0.04'),
    // Scenario overrides — null means use system preset
    conservativeReturnRate: numeric('conservative_return_rate', { precision: 5, scale: 4 }),
    baseReturnRate: numeric('base_return_rate', { precision: 5, scale: 4 }),
    aggressiveReturnRate: numeric('aggressive_return_rate', { precision: 5, scale: 4 }),
    contributionGrowthRate: numeric('contribution_growth_rate', { precision: 5, scale: 4 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqRetirementPlansOrgId: uniqueIndex('uq_retirement_plans_org_id').on(table.orgId),
  })
)

export const withdrawalStrategies = pgTable(
  'withdrawal_strategies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(), // 'fixed' | 'percentage'
    fixedMonthlyAmountCents: integer('fixed_monthly_amount_cents'),
    percentageRate: numeric('percentage_rate', { precision: 5, scale: 4 }),
    liquidationPreset: text('liquidation_preset').notNull().default('income_preserving'),
    customLiquidationOrder: text('custom_liquidation_order'), // JSON array of asset classes
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqWithdrawalStrategiesOrgId: uniqueIndex('uq_withdrawal_strategies_org_id').on(table.orgId),
  })
)

export const successionPlans = pgTable(
  'succession_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    brazilianState: text('brazilian_state'), // e.g. 'SP', 'RJ' — for ITCMD rate lookup
    estimatedFuneralCostsCents: integer('estimated_funeral_costs_cents').notNull().default(1500000),
    estimatedLegalFeesCents: integer('estimated_legal_fees_cents').notNull().default(500000),
    additionalLiabilitiesCents: integer('additional_liabilities_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqSuccessionPlansOrgId: uniqueIndex('uq_succession_plans_org_id').on(table.orgId),
  })
)

export const heirs = pgTable(
  'heirs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    successionPlanId: uuid('succession_plan_id')
      .notNull()
      .references(() => successionPlans.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    relationship: text('relationship').notNull(), // e.g. 'filho', 'cônjuge', 'outro'
    percentageShare: numeric('percentage_share', { precision: 5, scale: 2 }).notNull(), // 0-100
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxHeirsOrgId: index('idx_heirs_org_id').on(table.orgId),
    idxHeirsSuccessionPlanId: index('idx_heirs_succession_plan_id').on(table.successionPlanId),
  })
)

// ---------------------------------------------------------------------------
// Simulation Scenarios (named saved presets)
// ---------------------------------------------------------------------------

export const simulationScenarios = pgTable(
  'simulation_scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mode: text('mode').notNull().$type<'contribution' | 'income'>(),
    portfolioCents: integer('portfolio_cents').notNull().default(0),
    currentAge: integer('current_age').notNull(),
    retirementAge: integer('retirement_age').notNull(),
    lifeExpectancy: integer('life_expectancy').notNull().default(85),
    monthlyContributionCents: integer('monthly_contribution_cents').notNull().default(0),
    desiredMonthlyIncomeCents: integer('desired_monthly_income_cents').notNull().default(0),
    inflationRate: numeric('inflation_rate', { precision: 5, scale: 4 }).notNull().default('0.04'),
    conservativeReturnRate: numeric('conservative_return_rate', { precision: 5, scale: 4 }),
    baseReturnRate: numeric('base_return_rate', { precision: 5, scale: 4 }),
    aggressiveReturnRate: numeric('aggressive_return_rate', { precision: 5, scale: 4 }),
    contributionGrowthRate: numeric('contribution_growth_rate', { precision: 5, scale: 4 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxSimulationScenariosOrg: index('idx_simulation_scenarios_org').on(table.orgId, table.updatedAt),
  })
)

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type RetirementPlan = typeof retirementPlans.$inferSelect
export type NewRetirementPlan = typeof retirementPlans.$inferInsert

export type WithdrawalStrategy = typeof withdrawalStrategies.$inferSelect
export type NewWithdrawalStrategy = typeof withdrawalStrategies.$inferInsert

export type SuccessionPlan = typeof successionPlans.$inferSelect
export type NewSuccessionPlan = typeof successionPlans.$inferInsert

export type Heir = typeof heirs.$inferSelect
export type NewHeir = typeof heirs.$inferInsert

export type SimulationScenario = typeof simulationScenarios.$inferSelect
export type NewSimulationScenario = typeof simulationScenarios.$inferInsert
