import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableCurrencies, formatAmount, formatMoney, formatPrice, makeConverter } from './currency.ts'
import type { ExchangeRate } from './types.ts'

const RATES: ExchangeRate[] = [
  { currency: 'USD', sek_per_unit: 10, rate_date: '2026-10-21' },
  { currency: 'EUR', sek_per_unit: 12.5, rate_date: '2026-10-20' },
  { currency: 'SEK', sek_per_unit: 1, rate_date: '2026-10-21' },
]

test('USD needs no rate', () => {
  const c = makeConverter('USD', [])
  assert.deepEqual(c, { requested: 'USD', display: 'USD', factor: 1, fallback: false, rateDate: null })
  assert.equal(formatMoney(3, c), '$3.00')
})

test('converts through SEK per unit and reports the rate date', () => {
  const sek = makeConverter('SEK', RATES)
  assert.equal(sek.factor, 10)
  assert.equal(sek.fallback, false)
  assert.equal(sek.rateDate, '2026-10-21')
  assert.equal(formatMoney(3, sek), '30.00 kr')

  const eur = makeConverter('EUR', RATES)
  assert.equal(eur.factor, 0.8)
  // The older of the two dates involved.
  assert.equal(eur.rateDate, '2026-10-20')
  assert.equal(formatMoney(2.5, eur), '€2.00')
})

test('a missing rate falls back to USD visibly', () => {
  const nok = makeConverter('NOK', RATES)
  assert.equal(nok.display, 'USD')
  assert.equal(nok.fallback, true)
  assert.equal(nok.factor, 1)
  assert.equal(formatMoney(3, nok), '$3.00', 'never a USD number with a kr label')

  const noUsdBase = makeConverter('EUR', RATES.filter((r) => r.currency !== 'USD'))
  assert.equal(noUsdBase.fallback, true)
  assert.equal(makeConverter('SEK', []).fallback, true)
})

test('rate dates may be missing', () => {
  const c = makeConverter('SEK', [
    { currency: 'USD', sek_per_unit: 10, rate_date: null },
    { currency: 'SEK', sek_per_unit: 1, rate_date: null },
  ])
  assert.equal(c.fallback, false)
  assert.equal(c.rateDate, null)
})

test('the selector only offers currencies it can convert to', () => {
  assert.deepEqual(availableCurrencies(RATES), ['USD', 'SEK', 'EUR'])
  assert.deepEqual(availableCurrencies([]), ['USD'])
  assert.deepEqual(availableCurrencies(RATES.filter((r) => r.currency !== 'USD')), ['USD'])
})

test('amounts below one cent stay readable', () => {
  assert.equal(formatAmount(0), '0.00')
  assert.equal(formatAmount(0.005), '0.0050')
  assert.equal(formatAmount(0.00042), '0.00042')
  assert.equal(formatAmount(0.0000123), '0.000012')
  assert.equal(formatAmount(1e-10), '< 0.00000001')
  assert.equal(formatAmount(1234.5), '1,234.50')
  assert.equal(formatMoney(1e-10, makeConverter('USD', [])), '< $0.00000001')
})

test('rates keep their published precision', () => {
  const usd = makeConverter('USD', [])
  assert.equal(formatPrice(0.025, usd), '$0.025')
  assert.equal(formatPrice(2.5, usd), '$2.50')
  assert.equal(formatPrice(0.005, usd), '$0.0050')
  assert.equal(formatPrice(1.23456, usd), '$1.2346')
  assert.equal(formatMoney(0.025, usd), '$0.03', 'totals use two decimals')
})

test('null prices render as unknown, never $0.00', () => {
  assert.equal(formatPrice(null, makeConverter('USD', [])), '—')
  assert.equal(formatPrice(0, makeConverter('USD', [])), '$0.00')
})
