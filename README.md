# @smdv/secrets

Proveedor de secretos multi-backend para los microservicios Smart Sale.
Soporta **AWS Secrets Manager** (entornos dev/staging/prod) y **OpenBao** (entorno local).

## Selección de proveedor

| `NODE_ENV`     | Proveedor              |
|----------------|------------------------|
| `local`        | OpenBao (Vault KV v2)  |
| cualquier otro | AWS Secrets Manager    |

El prefijo del path se construye internamente desde `APP_ENV` (fallback: `'dev'`).
El MS solo declara los **nombres cortos** de los secretos.

## Uso

```typescript
import { getSecrets } from '@smdv/secrets'
import { logger } from '@smdv/logwise'

const secrets = await getSecrets({
  secretNames:   ['common', 'mysql', 'redis'],
  criticalNames: ['common', 'mysql'],  // si fallan → el proceso no arranca
  logger,                              // opcional — integra con CloudWatch vía @smdv/logwise
})
process.env = { ...process.env, ...secrets }
```

Con `APP_ENV=prod` los paths resueltos serán `prod/common`, `prod/mysql`, `prod/redis`.
Con `APP_ENV=dev` (o sin definir) serán `dev/common`, `dev/mysql`, `dev/redis`.

## Variables de entorno

| Variable        | Descripción                                        | Requerida en    |
|-----------------|----------------------------------------------------|-----------------|
| `APP_ENV`       | Prefijo del path: `dev`, `staging`, `prod`         | Todos           |
| `NODE_ENV`      | Selector de proveedor: `local` o cualquier otro    | Todos           |
| `AWS_REGION`    | Región de AWS Secrets Manager (fallback: `us-east-1`) | No-local     |
| `OPENBAO_ADDR`  | URL base de OpenBao (ej. `http://openbao:8200`)    | `local`         |
| `OPENBAO_TOKEN` | Token de acceso a OpenBao                          | `local`         |

## Configuración local (docker-compose / Kind)

```yaml
# docker-compose.yml o manifiesto k8s en namespace desarrollo
environment:
  NODE_ENV: local
  APP_ENV: dev           # los paths en OpenBao deben coincidir: dev/common, dev/mysql, ...
  OPENBAO_ADDR: http://openbao:8200
  OPENBAO_TOKEN: <token-de-dev>
```

## Estructura de secretos en OpenBao

Los paths en OpenBao deben seguir el mismo esquema que AWS Secrets Manager:

```
dev/common   → { APP_KEY, INTERNAL_TOKEN, ... }
dev/mysql    → { MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, ... }
dev/redis    → { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, ... }
dev/auth     → { JWT_SECRET, JWT_REFRESH_SECRET, ... }
```

## Desarrollo

```bash
npm install
npm run build    # compila a dist/
npm test         # ejecuta los specs
npm run test:coverage
```
