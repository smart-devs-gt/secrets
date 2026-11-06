import { openBaoProvider } from '../openbao.provider'

// ─── Mock de fetch global ────────────────────────────────────────────────────
const mockFetch = jest.fn()
global.fetch = mockFetch as typeof fetch

// ─── Helpers ────────────────────────────────────────────────────────────────
const vaultResponse = (data: Record<string, string>) => ({
  ok: true,
  status: 200,
  json: async () => ({ data: { data } }),
})

const httpError = (status: number) => ({
  ok: false,
  status,
  json: async () => ({}),
})

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('openBaoProvider', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      APP_ENV: 'dev',
      OPENBAO_ADDR: 'http://openbao:8200',
      OPENBAO_TOKEN: 'test-token',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('carga un secreto y extrae data.data correctamente', async () => {
    mockFetch.mockResolvedValueOnce(
      vaultResponse({ DB_HOST: 'localhost', DB_PORT: '3306' })
    )

    const result = await openBaoProvider({ secretNames: ['mysql'] })

    expect(result).toEqual({ DB_HOST: 'localhost', DB_PORT: '3306' })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://openbao:8200/v1/dev/mysql',
      expect.objectContaining({ headers: { 'X-Vault-Token': 'test-token' } })
    )
  })

  it('carga múltiples secretos y hace merge correcto', async () => {
    mockFetch
      .mockResolvedValueOnce(vaultResponse({ APP_KEY: 'key1' }))
      .mockResolvedValueOnce(vaultResponse({ MYSQL_USER: 'root' }))

    const result = await openBaoProvider({ secretNames: ['common', 'mysql'] })

    expect(result).toEqual({ APP_KEY: 'key1', MYSQL_USER: 'root' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('usa APP_ENV para construir el path', async () => {
    process.env.APP_ENV = 'prod'
    mockFetch.mockResolvedValueOnce(vaultResponse({ KEY: 'val' }))

    await openBaoProvider({ secretNames: ['common'] })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://openbao:8200/v1/prod/common',
      expect.any(Object)
    )
  })

  it('APP_ENV no definido → usa dev como fallback', async () => {
    delete process.env.APP_ENV
    mockFetch.mockResolvedValueOnce(vaultResponse({ KEY: 'val' }))

    await openBaoProvider({ secretNames: ['common'] })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://openbao:8200/v1/dev/common',
      expect.any(Object)
    )
  })

  it('403 → error con mensaje de token inválido', async () => {
    const errorMock = jest.fn()
    mockFetch.mockResolvedValueOnce(httpError(403))

    await expect(
      openBaoProvider({
        secretNames:   ['mysql'],
        criticalNames: ['mysql'],
        logger: { error: errorMock, warn: jest.fn() },
      })
    ).rejects.toThrow('dev/mysql')

    expect(errorMock).toHaveBeenCalledWith(
      expect.stringContaining('dev/mysql'),
      expect.objectContaining({ error: expect.stringContaining('Token inválido') })
    )
  })

  it('secreto crítico 404 → lanza error', async () => {
    mockFetch.mockResolvedValueOnce(httpError(404))

    await expect(
      openBaoProvider({ secretNames: ['common'], criticalNames: ['common'] })
    ).rejects.toThrow('dev/common')
  })

  it('secreto no crítico falla → warn y continúa con los demás', async () => {
    const warnMock = jest.fn()
    mockFetch
      .mockResolvedValueOnce(vaultResponse({ APP_KEY: 'key1' }))
      .mockResolvedValueOnce(httpError(404))

    const result = await openBaoProvider({
      secretNames:   ['common', 'kafka'],
      criticalNames: ['common'],
      logger: { error: jest.fn(), warn: warnMock },
    })

    expect(result).toEqual({ APP_KEY: 'key1' })
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('no críticos'),
      expect.objectContaining({ failed: ['dev/kafka'] })
    )
  })

  it('OPENBAO_ADDR no definido → lanza error antes de hacer fetch', async () => {
    delete process.env.OPENBAO_ADDR

    await expect(openBaoProvider({ secretNames: ['common'] })).rejects.toThrow('OPENBAO_ADDR')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('OPENBAO_TOKEN no definido → lanza error antes de hacer fetch', async () => {
    delete process.env.OPENBAO_TOKEN

    await expect(openBaoProvider({ secretNames: ['common'] })).rejects.toThrow('OPENBAO_TOKEN')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('HTTP 500 inesperado → error con status en mensaje', async () => {
    mockFetch.mockResolvedValueOnce(httpError(500))

    await expect(
      openBaoProvider({ secretNames: ['common'], criticalNames: ['common'] })
    ).rejects.toThrow('dev/common')
  })

  it('usa console.error / console.warn cuando no se provee logger', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockFetch.mockResolvedValueOnce(httpError(500))

    await openBaoProvider({ secretNames: ['redis'] })

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
