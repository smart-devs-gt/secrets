/**
 * Opciones para cargar secretos.
 * La librería construye los paths completos internamente usando APP_ENV.
 */
export interface SecretsOptions {
  /**
   * Nombres cortos de los secretos a cargar, sin prefijo de entorno.
   * Ejemplos: ['common', 'mysql', 'redis', 'kafka', 'auth']
   *
   * La lib construye automáticamente los paths usando APP_ENV:
   *   APP_ENV=dev  → 'dev/common', 'dev/mysql', ...
   *   APP_ENV=prod → 'prod/common', 'prod/mysql', ...
   */
  secretNames: string[]

  /**
   * Subconjunto de secretNames que son críticos para el arranque del servicio.
   * Si alguno falla, getSecrets() lanza un error y el proceso no arranca.
   * Ejemplos: ['common', 'mysql']
   */
  criticalNames?: string[]

  /**
   * Logger opcional. Si no se provee, usa console.error / console.warn.
   * Pasar el logger de @smdv/logwise para integración con CloudWatch.
   */
  logger?: {
    error: (msg: string, meta?: Record<string, unknown>) => void
    warn: (msg: string, meta?: Record<string, unknown>) => void
  }
}

/** Firma de cualquier proveedor de secretos */
export type SecretsProvider = (opts: SecretsOptions) => Promise<Record<string, string>>
