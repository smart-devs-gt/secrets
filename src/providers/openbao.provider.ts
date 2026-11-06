import type { SecretsOptions } from '../types'

/**
 * Respuesta KV v2 de OpenBao / HashiCorp Vault.
 * GET /v1/{mount}/{path} devuelve { data: { data: { KEY: "value", ... } } }
 */
interface VaultKvV2Response {
  data: {
    data: Record<string, string>
  }
}

/**
 * Proveedor OpenBao (compatible con Vault KV v2).
 * Activo cuando NODE_ENV === 'local'.
 *
 * Variables de entorno requeridas:
 *   OPENBAO_ADDR  — URL base, ej. http://openbao:8200
 *   OPENBAO_TOKEN — token de acceso
 *
 * Path mapping:
 *   secretName 'common' + APP_ENV 'dev' → GET {OPENBAO_ADDR}/v1/dev/common
 */
export const openBaoProvider = async (opts: SecretsOptions): Promise<Record<string, string>> => {
  const { secretNames, criticalNames = [], logger } = opts

  const log = {
    error: (msg: string, meta?: Record<string, unknown>) =>
      logger ? logger.error(msg, meta) : console.error(msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      logger ? logger.warn(msg, meta) : console.warn(msg, meta),
  }

  const addr = process.env.OPENBAO_ADDR
  const token = process.env.OPENBAO_TOKEN

  // Fail-fast en startup si faltan las variables de conexión.
  if (!addr) {
    throw new Error(
      '[secrets:openbao] OPENBAO_ADDR no está definido. ' +
        'Configúralo en tu entorno local (ej. http://openbao:8200).'
    )
  }
  if (!token) {
    throw new Error(
      '[secrets:openbao] OPENBAO_TOKEN no está definido. ' +
        'Configúralo en tu entorno local.'
    )
  }

  const env = process.env.APP_ENV ?? 'dev'
  const secretsIds = secretNames.map((name) => `${env}/${name}`)
  const criticalIds = criticalNames.map((name) => `${env}/${name}`)

  let secrets: Record<string, string> = {}
  const failed: string[] = []

  // try/catch POR secreto: un secreto roto no debe descartar a los demás.
  for (const secretId of secretsIds) {
    try {
      const url = `${addr}/v1/${secretId}`
      const response = await fetch(url, {
        headers: { 'X-Vault-Token': token },
      })

      if (response.status === 403) {
        throw new Error(`Token inválido o sin permiso para acceder a '${secretId}'`)
      }
      if (response.status === 404) {
        throw new Error(`Secreto '${secretId}' no encontrado en OpenBao`)
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} al leer '${secretId}'`)
      }

      // KV v2: { data: { data: { KEY: "value", ... } } }
      const body = (await response.json()) as VaultKvV2Response
      const loaded = body?.data?.data ?? {}
      secrets = { ...secrets, ...loaded }
    } catch (error) {
      failed.push(secretId)
      log.error(`[secrets:openbao] No se pudo cargar ${secretId}`, {
        error: (error as Error).message,
      })
    }
  }

  // Fail-fast: si falló un secreto crítico, no arrancar a medias.
  const criticalFailed = criticalIds.filter((id) => failed.includes(id))
  if (criticalFailed.length) {
    throw new Error(
      `[secrets:openbao] Secretos críticos no disponibles: ${criticalFailed.join(', ')}`
    )
  }

  if (failed.length) {
    log.warn('[secrets:openbao] Algunos secretos no críticos no se cargaron', { failed })
  }

  return secrets
}
