import { awsProvider } from './providers/aws.provider'
import { openBaoProvider } from './providers/openbao.provider'
import type { SecretsOptions } from './types'

export type { SecretsOptions, SecretsProvider } from './types'

/**
 * Carga secretos desde el proveedor configurado según NODE_ENV.
 *
 * Selector de proveedor:
 *   NODE_ENV === 'local'  → OpenBao  (requiere OPENBAO_ADDR + OPENBAO_TOKEN)
 *   cualquier otro valor  → AWS Secrets Manager
 *
 * El prefijo de entorno del path se construye internamente desde APP_ENV
 * (fallback: 'dev'). El MS solo declara los nombres cortos.
 *
 * @example
 * // En server.ts de cualquier MS (Express, AdonisJS, NestJS):
 * import { getSecrets } from '@smdv/secrets'
 *
 * const secrets = await getSecrets({
 *   secretNames:   ['common', 'mysql', 'redis'],
 *   criticalNames: ['common', 'mysql'],
 *   logger,                              // opcional — instancia de @smdv/logwise
 * })
 * process.env = { ...process.env, ...secrets }
 */
export async function getSecrets(opts: SecretsOptions): Promise<Record<string, string>> {
  const provider = process.env.NODE_ENV === 'local' ? openBaoProvider : awsProvider
  return provider(opts)
}
