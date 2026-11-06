import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import type { SecretsOptions } from '../types'

/**
 * Proveedor AWS Secrets Manager.
 * Activo cuando NODE_ENV !== 'local'.
 *
 * Lee APP_ENV (fallback: 'dev') para construir los paths:
 *   secretName 'common' + APP_ENV 'prod' → SecretId 'prod/common'
 *
 * Lee AWS_REGION (fallback: 'us-east-1').
 */
export const awsProvider = async (opts: SecretsOptions): Promise<Record<string, string>> => {
  const { secretNames, criticalNames = [], logger } = opts

  const log = {
    error: (msg: string, meta?: Record<string, unknown>) =>
      logger ? logger.error(msg, meta) : console.error(msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      logger ? logger.warn(msg, meta) : console.warn(msg, meta),
  }

  const env = process.env.APP_ENV ?? 'dev'
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const client = new SecretsManagerClient({ region })

  const secretsIds = secretNames.map((name) => `${env}/${name}`)
  const criticalIds = criticalNames.map((name) => `${env}/${name}`)

  let secrets: Record<string, string> = {}
  const failed: string[] = []

  // try/catch POR secreto: un secreto roto no debe descartar a los demás.
  for (const secretId of secretsIds) {
    try {
      const response = await client.send(
        new GetSecretValueCommand({ SecretId: secretId, VersionStage: 'AWSCURRENT' })
      )
      const loaded = JSON.parse(response.SecretString ?? '{}') as Record<string, string>
      secrets = { ...secrets, ...loaded }
    } catch (error) {
      failed.push(secretId)
      log.error(`[secrets:aws] No se pudo cargar ${secretId}`, {
        error: (error as Error).message,
      })
    }
  }

  // Fail-fast: si falló un secreto crítico, no arrancar a medias.
  const criticalFailed = criticalIds.filter((id) => failed.includes(id))
  if (criticalFailed.length) {
    throw new Error(
      `[secrets:aws] Secretos críticos no disponibles: ${criticalFailed.join(', ')}`
    )
  }

  if (failed.length) {
    log.warn('[secrets:aws] Algunos secretos no críticos no se cargaron', { failed })
  }

  return secrets
}
