import { awsProvider } from '../aws.provider'

// ─── Mock del SDK de AWS ────────────────────────────────────────────────────
const mockSend = jest.fn()

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => input),
}))

// ─── Helpers ────────────────────────────────────────────────────────────────
const secretResponse = (data: Record<string, string>) => ({
  SecretString: JSON.stringify(data),
})

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('awsProvider', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, APP_ENV: 'dev' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('carga todos los secretos y hace merge correcto', async () => {
    mockSend
      .mockResolvedValueOnce(secretResponse({ DB_HOST: 'localhost' }))
      .mockResolvedValueOnce(secretResponse({ MYSQL_USER: 'root', MYSQL_PASSWORD: 'pass' }))

    const result = await awsProvider({ secretNames: ['common', 'mysql'] })

    expect(result).toEqual({
      DB_HOST: 'localhost',
      MYSQL_USER: 'root',
      MYSQL_PASSWORD: 'pass',
    })
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('usa APP_ENV para construir el path del SecretId', async () => {
    process.env.APP_ENV = 'prod'
    mockSend.mockResolvedValueOnce(secretResponse({ KEY: 'val' }))

    await awsProvider({ secretNames: ['common'] })

    const callArg = mockSend.mock.calls[0][0] as { SecretId: string }
    expect(callArg.SecretId).toBe('prod/common')
  })

  it('APP_ENV no definido → usa dev como fallback', async () => {
    delete process.env.APP_ENV
    mockSend.mockResolvedValueOnce(secretResponse({ KEY: 'val' }))

    await awsProvider({ secretNames: ['common'] })

    const callArg = mockSend.mock.calls[0][0] as { SecretId: string }
    expect(callArg.SecretId).toBe('dev/common')
  })

  it('secreto no crítico falla → warn y continúa retornando los demás', async () => {
    const warnMock = jest.fn()
    const errorMock = jest.fn()

    mockSend
      .mockResolvedValueOnce(secretResponse({ DB_HOST: 'localhost' }))
      .mockRejectedValueOnce(new Error('timeout'))

    const result = await awsProvider({
      secretNames:   ['common', 'kafka'],
      criticalNames: ['common'],
      logger: { error: errorMock, warn: warnMock },
    })

    expect(result).toEqual({ DB_HOST: 'localhost' })
    expect(errorMock).toHaveBeenCalledWith(
      expect.stringContaining('dev/kafka'),
      expect.objectContaining({ error: 'timeout' })
    )
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('no críticos'),
      expect.objectContaining({ failed: ['dev/kafka'] })
    )
  })

  it('secreto crítico falla → lanza error con el path en el mensaje', async () => {
    mockSend.mockRejectedValueOnce(new Error('AccessDenied'))

    await expect(
      awsProvider({
        secretNames:   ['common', 'mysql'],
        criticalNames: ['common'],
      })
    ).rejects.toThrow('dev/common')
  })

  it('varios secretos críticos fallan → el error los lista todos', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('error1'))
      .mockRejectedValueOnce(new Error('error2'))

    await expect(
      awsProvider({
        secretNames:   ['common', 'mysql'],
        criticalNames: ['common', 'mysql'],
      })
    ).rejects.toThrow(/dev\/common.*dev\/mysql|dev\/mysql.*dev\/common/)
  })

  it('sin criticalNames → un fallo solo genera warn, no throw', async () => {
    const warnMock = jest.fn()
    mockSend.mockRejectedValueOnce(new Error('not found'))

    const result = await awsProvider({
      secretNames: ['kafka'],
      logger: { error: jest.fn(), warn: warnMock },
    })

    expect(result).toEqual({})
    expect(warnMock).toHaveBeenCalled()
  })

  it('usa console.error / console.warn cuando no se provee logger', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockSend.mockRejectedValueOnce(new Error('fail'))

    await awsProvider({ secretNames: ['redis'] })

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
