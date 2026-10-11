# Fedexpress

Marketplace multicomercio con delivery: cada comercio publica su catálogo, administra su propio stock, cobra con **su propia cuenta de Mercado Pago** y gestiona sus repartidores. Los clientes ingresan con Google, arman un carrito por comercio y siguen su pedido.

> Estado: **MVP funcional**. Ver [Qué está terminado y qué falta](#qué-está-terminado-y-qué-falta) antes de usarlo con dinero real.

---

## Índice

1. [Arquitectura y decisiones](#arquitectura-y-decisiones)
2. [Requisitos previos](#1-requisitos-previos)
3. [Instalación](#2-instalación-de-dependencias)
4. [Configuración del entorno](#3-configuración-del-entorno)
5. [Base de datos, migraciones y seed](#4-base-de-datos)
6. [Superadministrador](#7-creación-del-superadministrador)
7. [Google OAuth](#8-google-oauth)
8. [Mercado Pago](#9-mercado-pago-modo-de-prueba)
9. [Ejecución](#10-ejecución)
10. [Pruebas](#11-pruebas)
11. [Producción (Vercel + Supabase)](#12-despliegue-en-producción-vercel--supabase)
12. [Dominios y HTTPS](#13-dominios-y-https)
13. [Backups y recuperación](#14-backups-y-recuperación)
14. [Reglas de negocio](#reglas-de-negocio)
15. [Seguridad](#seguridad)

---

## Arquitectura y decisiones

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend + backend | **Next.js 15** (App Router, Server Components, Server Actions), React 19, TypeScript estricto | Un solo proyecto desplegable en Vercel; la lógica sensible corre en el servidor. |
| Estilos | Tailwind CSS v4 | Componentes consistentes, mobile-first, sin dependencias de UI extra. |
| Base de datos | **PostgreSQL** (Supabase en producción) | Transacciones, bloqueos de fila (`FOR UPDATE`) y restricciones `CHECK` para el stock. |
| ORM | Prisma 6 + migraciones versionadas | Consultas parametrizadas (sin SQL injection) y migraciones reproducibles. |
| Autenticación | NextAuth 4 + Google OAuth | Sesión en cookie httpOnly/secure; rol y estado se leen de la base en cada request. |
| Validación | Zod (esquemas compartidos en `src/lib/validation.ts`) | El servidor revalida todo. |
| Pagos | API REST oficial de Mercado Pago (OAuth por vendedor) | Cada comercio cobra en su cuenta; sin SDK para controlar timeouts, idempotencia y logs. |
| Pruebas | Vitest (integración contra PostgreSQL real) + Playwright (E2E) | |

```
src/
  app/                 páginas (portal, carrito, checkout, pedidos, /panel, /admin, /repartidor) y rutas API
    actions/           Server Actions (delgadas: autentican y llaman a servicios)
    api/               auth, webhooks/mercadopago, mercadopago/oauth, cron, panel/export, health
  server/
    services/          lógica de negocio (TODA la autorización por comercio vive acá)
    domain/            máquina de estados de pedidos
    payments/          cliente HTTP de Mercado Pago y validación de webhooks
    actor.ts / authz.ts  identidad y permisos
  lib/                 dinero (Decimal), cifrado, fechas, validación
prisma/                schema, migraciones, seed
tests/                 pruebas de integración (Vitest)
e2e/                   pruebas end-to-end (Playwright)
scripts/               promote-superadmin
```

**Decisiones tomadas (no especificadas en el pedido):**

- **Carritos:** un carrito por comercio y por usuario (`Cart @@unique([userId, merchantId])`). Al agregar un producto de otro comercio teniendo un carrito activo, la UI pide confirmación explícita y lo agrega a un carrito **separado**. Nunca se mezclan comercios en un pedido.
- **Agregar al carrito requiere sesión.** Sin sesión se puede explorar todo el catálogo, pero no agregar ni comprar.
- **Variantes:** todo producto tiene al menos una variante ("Única"). Precio, SKU y stock viven en la variante.
- **Zonas de entrega por código postal** (sin geocodificación en el MVP). Se aceptan CPA (`C1414ABC`) y numéricos (`1414`). Lat/long ya existen en el esquema para la futura geolocalización.
- **Comercio sin horarios cargados = abierto siempre.** Fuera de horario no se aceptan pedidos.
- **Login de desarrollo** por email (sin Google) solo con `NODE_ENV != production` y `DEV_LOGIN_ENABLED=true`. En Vercel (incluso previews) está siempre deshabilitado.
- **Pagos simulados** (`DEMO_PAYMENTS_ENABLED=true`): solo para comercios **sin** Mercado Pago conectado; quedan marcados `PAGO SIMULADO` y se reportan aparte del dinero real.
- **Imágenes:** por URL https o subida a Supabase Storage si está configurado. Los datos de demo usan SVG locales en `public/demo`.

---

## 1. Requisitos previos

- Node.js 22 y npm 10
- PostgreSQL 16 (o Docker para levantarlo con `docker compose`)
- Para producción: cuenta de Vercel, proyecto de Supabase, proyecto en Google Cloud (OAuth) y aplicación en Mercado Pago Developers.

## 2. Instalación de dependencias

```bash
npm install
```

## 3. Configuración del entorno

```bash
cp .env.example .env
# Generá los secretos:
openssl rand -base64 32   # → NEXTAUTH_SECRET
openssl rand -base64 32   # → ENCRYPTION_KEY
```

Para desarrollo local sin Google ni Mercado Pago, alcanza con: `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `DEV_LOGIN_ENABLED=true` y `DEMO_PAYMENTS_ENABLED=true`. Cada variable está explicada en `.env.example`.

## 4. Base de datos

```bash
docker compose up -d db          # PostgreSQL local (crea también fedexpress_test)
```

## 5. Migraciones

```bash
npm run db:deploy                # aplica prisma/migrations (no destructivo)
# en desarrollo, al cambiar el schema: npm run db:migrate
```

Las migraciones incluyen restricciones `CHECK` (stock nunca negativo, reservado ≤ cantidad, importes ≥ 0).

## 6. Datos de ejemplo

```bash
npm run db:seed
```

Carga: 7 categorías globales; **Almacén Don Pedro**, **Supermercado Central** (24 h) y **Minimercado La Esquina** con los 8 productos pedidos, precios y stocks distintos por comercio (por ejemplo, arroz: 20 / 8 / 0 unidades); zonas de entrega, horarios, un repartidor por comercio, 3 clientes con direcciones de prueba y 8 pedidos en distintos estados (entregado, en camino, en preparación, pagado, pendiente de pago, pago rechazado, cancelado y reembolsado). **Todos los pagos del seed son simulados.**

Para recargar la demo desde cero en **desarrollo**: `npm run db:reset` (borra la base local) y luego `npm run db:seed`.

Usuarios de demo (dominio ficticio `demo.fedexpress.local`, usables con el login de desarrollo):

| Rol | Email |
|---|---|
| Admin Almacén Don Pedro | `admin.don-pedro@demo.fedexpress.local` |
| Admin Supermercado Central | `admin.central@demo.fedexpress.local` |
| Admin Minimercado La Esquina | `admin.la-esquina@demo.fedexpress.local` |
| Repartidor Don Pedro | `repartidor.don-pedro@demo.fedexpress.local` |
| Clientes | `lucia.gomez@…`, `martin.fernandez@…`, `sofia.rodriguez@…` |

## 7. Creación del superadministrador

No hay contraseña por defecto ni forma de ser superadmin desde la web. El procedimiento requiere acceso a la base (infraestructura):

```bash
npm run superadmin:promote -- persona@tuempresa.com
# revertir: npm run superadmin:promote -- persona@tuempresa.com --demote
```

Después, esa persona ingresa con Google usando ese email (la cuenta se vincula sola). Para producción, ejecutalo desde tu máquina con `DATABASE_URL` apuntando a Supabase. La acción queda registrada en la auditoría.

**Probar los demás roles:** el superadmin crea comercios en `/admin/comercios` indicando el email del administrador; el administrador da de alta repartidores por email en `/panel/<comercio>/repartidores`. Cada persona ingresa con Google con ese email y ve solo lo suyo. Todo usuario nuevo es **cliente**.

## 8. Google OAuth

1. Google Cloud Console → *APIs y servicios* → *Pantalla de consentimiento OAuth* (tipo Externo, scopes `email`, `profile`, `openid`).
2. *Credenciales* → *Crear ID de cliente OAuth* → *Aplicación web*.
3. Orígenes autorizados: `http://localhost:3000` y `https://tu-dominio`.
4. URI de redirección: `http://localhost:3000/api/auth/callback/google` y `https://tu-dominio/api/auth/callback/google`.
5. Copiá `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` al `.env` / Vercel.

Se rechazan cuentas de Google con email no verificado y usuarios suspendidos.

## 9. Mercado Pago (modo de prueba)

**Modalidad:** marketplace con **OAuth por vendedor**. La plataforma tiene una aplicación en Mercado Pago; cada comercio autoriza a esa aplicación a operar en su nombre y las preferencias de pago se crean **con el access token del comercio**, por lo que el dinero se acredita en la cuenta del comercio. Opcionalmente la plataforma puede cobrar una comisión (`MP_PLATFORM_FEE_PERCENT` → `marketplace_fee`).

> ⚠️ **Verificá antes de producción** en la documentación oficial vigente (mercadopago.com.ar/developers): condiciones del modelo marketplace para tu cuenta, comisiones y plazos de liquidación de cada vendedor, el alcance `offline_access` (necesario para renovar tokens, que duran 180 días), y la URL de autorización y el formato de firma de webhooks. Este repositorio implementa los endpoints documentados (`/oauth/token`, `/checkout/preferences`, `/v1/payments/{id}`, `/v1/payments/{id}/refunds`, `/users/me`), pero **no pudo probarse contra la API real** desde el entorno donde se desarrolló (sin acceso de red a Mercado Pago). Las pruebas automatizadas usan respuestas simuladas de la API.

Pasos en sandbox:

1. Creá una aplicación en *Tus integraciones* (producto Checkout Pro, modelo Marketplace). Configurá la **Redirect URL** `https://tu-dominio/api/mercadopago/oauth/callback`.
2. Copiá `MP_CLIENT_ID` (App ID) y `MP_CLIENT_SECRET`.
3. En *Webhooks*, configurá la URL `https://tu-dominio/api/webhooks/mercadopago` con el evento **Pagos** y copiá la clave secreta en `MP_WEBHOOK_SECRET`. Además cada preferencia envía `notification_url` con el comercio (`?m=`).
4. Creá **usuarios de prueba** (vendedor y comprador). Con `MP_OAUTH_TEST_TOKEN=true`, el comercio entra a `/panel/<comercio>/pagos` → *Conectar Mercado Pago* y autoriza con el usuario vendedor de prueba.
   - Alternativa sandbox: con `MP_ALLOW_MANUAL_CREDENTIALS=true` el comercio puede pegar el *Access Token* de prueba del usuario vendedor.
5. Comprá como cliente; pagá con el usuario comprador de prueba y las tarjetas de prueba de la documentación.
6. Mercado Pago necesita alcanzar tu webhook por HTTPS: en local usá un túnel (por ejemplo `cloudflared tunnel --url http://localhost:3000`) y poné esa URL en `APP_URL`.

**Cómo se confirma un pago:** nunca por el navegador. El webhook (o la URL de retorno, usada solo como pista) dispara una consulta a `GET /v1/payments/{id}` con el token del comercio; se verifica `external_reference` (pedido de ese comercio), `collector_id` (cuenta del comercio), importe y moneda. Recién ahí el pedido pasa a *Pago aprobado*.

**Pasar a producción:** desactivá `MP_OAUTH_TEST_TOKEN`, `MP_ALLOW_MANUAL_CREDENTIALS` y `DEMO_PAYMENTS_ENABLED`; usá credenciales productivas de la aplicación; cada comercio reconecta su cuenta real; activá `MP_WEBHOOK_REQUIRE_SIGNATURE=true` cuando confirmes que las notificaciones llegan firmadas.

## 10. Ejecución

```bash
npm run dev          # http://localhost:3000 (frontend y backend en el mismo proceso)
npm run build && npm start   # modo producción local
```

## 11. Pruebas

```bash
npm test             # integración + unitarias (requiere TEST_DATABASE_URL; aplica migraciones a esa base)
npm run test:e2e     # end-to-end con Playwright (requiere la base de desarrollo con seed)
npm run typecheck && npm run lint
```

Cobertura de las pruebas de integración (base PostgreSQL real): aislamiento entre comercios (21 operaciones manipulando IDs), permisos de superadmin y admin de comercio, alta/edición/publicación de productos, stock independiente por comercio, ventas concurrentes sobre el último stock, carritos separados, cálculo de importes con promos y envío gratis, snapshot histórico de pedidos, idempotencia del checkout, máquina de estados, notificaciones de pago repetidas/concurrentes, pago tardío con y sin stock, importes que no coinciden, firma de webhooks, cifrado de tokens, repartidores y entregas.

## 12. Despliegue en producción (Vercel + Supabase)

1. **Supabase:** creá el proyecto (región São Paulo recomendada). En *Project Settings → Database* copiá:
   - `DATABASE_URL` = *Transaction pooler* (puerto 6543) + `?pgbouncer=true&connection_limit=1`
   - `DIRECT_URL` = conexión directa o *Session pooler* (puerto 5432)
   - Opcional: creá un bucket público `product-images` en *Storage* y copiá `SUPABASE_URL` y la `service_role` key (solo en el servidor).
2. **Vercel:** importá el repositorio, framework Next.js. Cargá todas las variables de `.env.example` en *Settings → Environment Variables* (Production y Preview por separado). `APP_URL` y `NEXTAUTH_URL` = tu dominio https.
3. El `buildCommand` de `vercel.json` corre `prisma migrate deploy` antes del build.
4. `vercel.json` programa el cron `/api/cron/expire-orders` cada 10 minutos (definí `CRON_SECRET`). *Nota:* en el plan Hobby de Vercel los cron jobs tienen frecuencia limitada; si no está disponible, las reservas igual se controlan al pagar, pero conviene un cron externo que llame al endpoint con el header `Authorization: Bearer <CRON_SECRET>`.
5. Creá el superadmin (`npm run superadmin:promote` con la `DIRECT_URL` de producción).
6. **No** ejecutes el seed de demo en producción (está bloqueado salvo `SEED_ALLOW_PRODUCTION=true`).

## 13. Dominios y HTTPS

Vercel emite y renueva certificados TLS automáticamente. Agregá el dominio en *Settings → Domains* y configurá el DNS (registro `A`/`CNAME` indicado por Vercel). Luego actualizá `APP_URL`, `NEXTAUTH_URL`, los orígenes y redirect URIs de Google y la Redirect URL y Webhook de Mercado Pago. La app envía HSTS, `X-Frame-Options: DENY`, `nosniff` y `Referrer-Policy`.

## 14. Backups y recuperación

- **Supabase** hace backups diarios automáticos (los planes pagos suman Point-in-Time Recovery). Verificá la retención de tu plan.
- Backup lógico propio (recomendado diario, guardado fuera de Supabase y cifrado):
  ```bash
  pg_dump "$DIRECT_URL" --format=custom --no-owner --file=fedexpress-$(date +%F).dump
  ```
- Restauración en una base vacía:
  ```bash
  pg_restore --no-owner --dbname="$DIRECT_URL_NUEVA" fedexpress-AAAA-MM-DD.dump
  npx prisma migrate deploy   # verifica que el esquema esté al día
  ```
- **Guardá `ENCRYPTION_KEY` en un gestor de secretos**: sin ella, los tokens de Mercado Pago respaldados no se pueden descifrar (los comercios tendrían que reconectar).
- Probá la restauración periódicamente en un entorno aparte.

---

## Reglas de negocio

**Stock (por variante y por comercio):** `Inventory.quantity` (unidades físicas) y `Inventory.reserved` (reservadas por pedidos sin pagar). Disponible = quantity − reserved.

1. Al crear el pedido se **reserva** con un `UPDATE … WHERE quantity - reserved >= q` atómico, dentro de la misma transacción que crea el pedido. Dos compras simultáneas nunca venden más de lo disponible.
2. Pago aprobado → **descuento definitivo** (quantity −= q, reserved −= q), una sola vez (flag `Order.stockCommitted` y bloqueo `FOR UPDATE` del pedido).
3. Pago rechazado → la reserva se mantiene hasta su vencimiento para permitir reintentar.
4. Reserva vencida (30 min por defecto, configurable por comercio) → el cron cancela el pedido y **libera** la reserva.
5. Pago aprobado después del vencimiento → si hay stock se descuenta; si no, el pedido pasa a *Reembolso pendiente* y se solicita el reembolso.
6. Cancelación de un pedido pagado → se devuelve el stock y se solicita el reembolso en Mercado Pago (si el pedido ya fue entregado, el stock no se devuelve automáticamente).
7. Todo movimiento queda en `InventoryMovement`.

**Estados del pedido:** Pendiente de pago → Pago aprobado → En preparación → Listo → Repartidor asignado → En camino → Entregado; además Cancelado, Pago rechazado, Reembolso pendiente y Reembolsado. Las transiciones válidas y quién puede hacerlas están en `src/server/domain/orderStatus.ts`; cada cambio guarda quién lo hizo en `OrderStatusHistory`.

**Importes:** `Decimal(12,2)` en la base y `Prisma.Decimal` en el código (nunca `float`). El servidor recalcula precios, promociones, envío (por zona, con envío gratis opcional) y total; el pedido guarda una copia histórica de nombres, precios, cantidades, dirección y envío.

**Reportes:** *Ventas brutas* = total de pedidos con pago confirmado (cobrado por los comercios; **no** es ingreso de la plataforma). *Cobrado real* = pagos de Mercado Pago aprobados. *Simulado* = pagos de demo. *Reembolsos* y *envíos* se informan por separado.

## Seguridad

- Autorización en el servidor en **cada** servicio (`assertMerchantAccess`, `assertSuperadmin`, propiedad del recurso); las consultas filtran siempre por `merchantId`/`userId`. Un ID ajeno devuelve "no encontrado".
- Roles: `User.platformRole` (CUSTOMER/SUPERADMIN) + `MerchantUser` (administradores) + `Courier.userId` (repartidores). El registro siempre crea clientes.
- Tokens de Mercado Pago cifrados con AES-256-GCM; nunca se envían al navegador ni se registran. La auditoría redacta claves sensibles.
- Webhooks: firma HMAC verificada + consulta del pago real + idempotencia.
- OAuth de Mercado Pago con `state` firmado y nonce en cookie httpOnly.
- CSRF: Server Actions validan origen (Next.js); NextAuth usa token CSRF; las rutas API mutantes usan firma (webhook) o secreto (cron).
- Rate limiting en PostgreSQL (checkout).
- Cookies de sesión httpOnly, `secure` y `SameSite=Lax` en HTTPS. Cabeceras de seguridad en `next.config.ts`.
- Errores: mensajes genéricos al usuario; el detalle va a `SystemEvent` sin secretos.
- Eliminación lógica (`deletedAt`) de comercios, productos, variantes y direcciones; los pedidos y pagos nunca se borran (historial contable).
- Exportación CSV protegida contra inyección de fórmulas.

## Qué está terminado y qué falta

Ver la sección final del informe de entrega (en el PR/commit). En resumen, depende de configuración externa:

- **Credenciales de Google OAuth** (sin ellas, solo funciona el login de desarrollo local).
- **Aplicación de Mercado Pago** (OAuth marketplace + clave de webhooks) y prueba end-to-end en sandbox contra la API real.
- **Despliegue** en Vercel + Supabase (variables de entorno y dominio).
- Seguimiento GPS en tiempo real, notificaciones por email/push y facturación electrónica: **no implementados** (preparada la estructura de datos).
