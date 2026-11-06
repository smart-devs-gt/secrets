// Tests del selector de proveedor en src/index.ts
// Usa jest.resetModules() para re-importar el módulo con distintos NODE_ENV

const mockAwsProvider = jest.fn()
const mockOpenBaoProvider = jest.fn()

jest.mock('../../providers/aws.provider', () => ({
  awsProvider: (...args: unknown[]) => mockAwsProvider(...args),
}))

jest.mock('../../providers/openbao.provider', () => ({
  openBaoProvider: (...args: unknown[]) => mockOpenBaoProvider(...args),
}))

describe('getSecrets — selector de proveedor por NODE_ENV', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    mockAwsProvider.mockResolvedValue({ FROM: 'aws' })
    mockOpenBaoProvider.mockResolvedValue({ FROM: 'openbao' })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('NODE_ENV=local → usa openBaoProvider y retorna sus secretos', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'local' }
    const { getSecrets } = await import('../../index')

    const result = await getSecrets({ secretNames: ['common'] })

    expect(mockOpenBaoProvider).toHaveBeenCalledTimes(1)
    expect(mockAwsProvider).not.toHaveBeenCalled()
    expect(result).toEqual({ FROM: 'openbao' })
  })

  it('NODE_ENV=development → usa awsProvider', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' }
    const { getSecrets } = await import('../../index')

    const result = await getSecrets({ secretNames: ['common'] })

    expect(mockAwsProvider).toHaveBeenCalledTimes(1)
    expect(mockOpenBaoProvider).not.toHaveBeenCalled()
    expect(result).toEqual({ FROM: 'aws' })
  })

  it('NODE_ENV=production → usa awsProvider', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' }
    const { getSecrets } = await import('../../index')

    const result = await getSecrets({ secretNames: ['common'] })

    expect(mockAwsProvider).toHaveBeenCalledTimes(1)
    expect(mockOpenBaoProvider).not.toHaveBeenCalled()
  })

  it('NODE_ENV no definido → usa awsProvider (fallback seguro)', async () => {
    const envWithoutNodeEnv = { ...originalEnv }
    delete envWithoutNodeEnv.NODE_ENV
    process.env = envWithoutNodeEnv
    const { getSecrets } = await import('../../index')

    await getSecrets({ secretNames: ['common'] })

    expect(mockAwsProvider).toHaveBeenCalledTimes(1)
    expect(mockOpenBaoProvider).not.toHaveBeenCalled()
  })

  it('reenvía las opciones completas al proveedor seleccionado', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'local' }
    const { getSecrets } = await import('../../index')

    const opts = {
      secretNames:   ['common', 'mysql'],
      criticalNames: ['common'],
      logger: { error: jest.fn(), warn: jest.fn() },
    }
    await getSecrets(opts)

    expect(mockOpenBaoProvider).toHaveBeenCalledWith(opts)
  })
})
