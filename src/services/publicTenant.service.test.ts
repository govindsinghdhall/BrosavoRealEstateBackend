import test from 'node:test'
import assert from 'node:assert/strict'
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors'
import { reconcilePublicTenant } from './publicTenant.service'

const orgA = { id: 1, isActive: true }
const orgB = { id: 2, isActive: true }

test('key + matching organizationId is allowed', () => {
  const id = reconcilePublicTenant({
    mode: 'read',
    hasApiKeyHeader: true,
    organizationId: 1,
    orgFromKey: orgA,
    orgFromId: orgA,
  })
  assert.equal(id, 1)
})

test('key + conflicting organizationId returns 403', () => {
  assert.throws(
    () =>
      reconcilePublicTenant({
        mode: 'read',
        hasApiKeyHeader: true,
        organizationId: 2,
        orgFromKey: orgA,
        orgFromId: orgB,
      }),
    (error: unknown) => error instanceof ForbiddenError && error.statusCode === 403,
  )
})

test('key only is allowed for GET', () => {
  const id = reconcilePublicTenant({
    mode: 'read',
    hasApiKeyHeader: true,
    orgFromKey: orgA,
    orgFromId: null,
  })
  assert.equal(id, 1)
})

test('key only is allowed for inquiry', () => {
  const id = reconcilePublicTenant({
    mode: 'inquiry',
    hasApiKeyHeader: true,
    orgFromKey: orgB,
    orgFromId: null,
  })
  assert.equal(id, 2)
})

test('organizationId only is allowed for GET', () => {
  const id = reconcilePublicTenant({
    mode: 'read',
    hasApiKeyHeader: false,
    organizationId: 2,
    orgFromKey: null,
    orgFromId: orgB,
  })
  assert.equal(id, 2)
})

test('organizationId only is rejected for inquiry', () => {
  assert.throws(
    () =>
      reconcilePublicTenant({
        mode: 'inquiry',
        hasApiKeyHeader: false,
        organizationId: 1,
        orgFromKey: null,
        orgFromId: orgA,
      }),
    (error: unknown) => error instanceof UnauthorizedError && error.statusCode === 401,
  )
})

test('neither identifier is 400 for GET', () => {
  assert.throws(
    () =>
      reconcilePublicTenant({
        mode: 'read',
        hasApiKeyHeader: false,
        orgFromKey: null,
        orgFromId: null,
      }),
    (error: unknown) => error instanceof AppError && error.statusCode === 400,
  )
})

test('neither identifier is 401 for inquiry', () => {
  assert.throws(
    () =>
      reconcilePublicTenant({
        mode: 'inquiry',
        hasApiKeyHeader: false,
        orgFromKey: null,
        orgFromId: null,
      }),
    (error: unknown) => error instanceof UnauthorizedError && error.statusCode === 401,
  )
})

test('invalid API key is 401', () => {
  assert.throws(
    () =>
      reconcilePublicTenant({
        mode: 'read',
        hasApiKeyHeader: true,
        organizationId: 1,
        orgFromKey: null,
        orgFromId: orgA,
      }),
    (error: unknown) => error instanceof UnauthorizedError && error.statusCode === 401,
  )
})

test('unknown organizationId-only is 404', () => {
  assert.throws(
    () =>
      reconcilePublicTenant({
        mode: 'read',
        hasApiKeyHeader: false,
        organizationId: 99,
        orgFromKey: null,
        orgFromId: null,
      }),
    (error: unknown) => error instanceof NotFoundError && error.statusCode === 404,
  )
})
