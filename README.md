# PalCM

PalCM es una aplicacion portable para Windows destinada a administrar un servidor dedicado de Palworld desde una unica ventana.

Stack actual:

- Electron.
- NestJS como `ApplicationContext` dentro del proceso principal.
- TypeScript estricto.
- Renderer con Vite.
- IPC seguro mediante preload y `contextBridge`.

## Requisitos

- Windows.
- Node.js 22.x.
- npm 10.x.

> En PowerShell puede fallar `npm` por politica de ejecucion de scripts. Usar `npm.cmd` evita ese problema.

## Instalar dependencias

```powershell
npm.cmd install
```

## Ejecutar en desarrollo

```powershell
npm.cmd run start:dev
```

Este comando:

1. Compila main/preload/backend y renderer.
2. Abre Electron usando los archivos generados en `dist/`.
3. Define `PALCM_RUNTIME_ENV=development`.
4. Usa `ejecucionPruebas/` como raiz portable aislada para descargas e instalaciones de prueba.

Alias disponibles, siguiendo el formato usado en otras apps Electron locales:

```powershell
npm.cmd run electron:dev
npm.cmd run dev
```

`electron:dev` abre Electron con el ultimo build disponible. `dev` ejecuta el mismo flujo que `start:dev`.

Nota sobre identidad visual en desarrollo:

- `start:dev` usa el binario `electron.exe` de desarrollo, por eso el Administrador de tareas puede agrupar procesos hijos como `Electron`.
- La app define nombre, AppUserModelID e icono de ventana propios, pero el nombre/descripcion del ejecutable de desarrollo sigue dependiendo de Electron.
- El portable generado con `npm.cmd run dist:portable` usa los metadatos e icono propios de PSM Console.

## Ejecutar en modo test local

```powershell
npm.cmd run start:test
```

Este comando tambien compila y abre Electron, pero define `PALCM_RUNTIME_ENV=test`. Ese modo queda reservado para flujos con mocks/adaptadores de prueba. No descarga SteamCMD, no descarga Palworld Dedicated Server y no modifica Firewall.

## Validar el proyecto

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

## Build normal

```powershell
npm.cmd run build
```

Genera:

```text
dist/
├── main/
└── renderer/
```

Tambien existe el alias:

```powershell
npm.cmd run build:backend
```

En PalCM ese alias compila el proceso principal, preload y backend NestJS embebido.

## Crear el portable

```powershell
npm.cmd run dist:portable
```

El portable queda en:

```text
release/
```

El nombre final lo define `electron-builder` usando `productName` y `version`, por ejemplo:

```text
release/PalCM-Portable-0.1.0.exe
```

La marca visible de la app es `PSM Console by >GR477<`. Para evitar caracteres invalidos en rutas de Windows, el `productName` de empaquetado usa `PSM Console by GR477`.

Otros comandos de empaquetado:

```powershell
npm.cmd run pack
npm.cmd run dist
```

- `pack` genera una carpeta desempaquetada para inspeccion.
- `dist` genera un instalador NSIS en `release/`, por ejemplo `PalCM-Setup-0.1.0.exe`.

Ese `.exe` es el artefacto portable. Al ejecutarse empaquetado, la aplicacion debe resolver su raiz portable desde la ubicacion real del ejecutable con `app.getPath('exe')` y `path.dirname(...)`; no se debe hardcodear la ruta de desarrollo `D:\MyAPIS\PalCM`.

## Versionado

PalCM usa versionado `x.y.z`:

- `x`: version final productiva. Se mantiene en `0` hasta que el creador indique que corresponde publicar estable.
- `y`: ciclo de prueba con funcionalidades nuevas.
- `z`: fixes, ajustes chicos, refactors internos o mejoras de UX/UI dentro del ciclo actual.

La version visible de la app se centraliza en `src/shared/constants/app-info.ts` y la version del artefacto se define en `package.json`. Al cambiar una, cambiar ambas. Mas detalle en `docs/decisions/versioning.md`.

## SteamCMD en desarrollo

En `start:dev`, SteamCMD se instala dentro de:

```text
ejecucionPruebas/tools/steamcmd/
```

La aplicacion descarga SteamCMD desde la URL oficial indicada por Valve:

```text
https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip
```

Antes de descargar se pide confirmacion explicita. Durante la descarga y extraccion se muestra porcentaje de progreso.

## Palworld Dedicated Server en desarrollo

Cuando SteamCMD ya existe, la aplicacion pasa a `SERVER_MISSING` y habilita la instalacion del servidor.

En `start:dev`, Palworld Dedicated Server se instala dentro de:

```text
ejecucionPruebas/server/palworld/
```

La instalacion usa SteamCMD con el AppID oficial del servidor dedicado:

```text
2394010
```

Antes de ejecutar SteamCMD se pide confirmacion explicita. Durante la ejecucion se muestra porcentaje y el ultimo mensaje recibido desde SteamCMD.

## Estructura editable esperada junto al portable

En fases posteriores, la aplicacion creara o usara estas carpetas junto al ejecutable:

```text
tools/steamcmd/
server/palworld/
config/
backups/configuration/
backups/world/
logs/
```

## Notas de seguridad

- El renderer no tiene acceso directo a Node.js.
- `nodeIntegration` debe permanecer en `false`.
- `contextIsolation` debe permanecer en `true`.
- `sandbox` permanece en `true`.
- El renderer aplica una Content Security Policy local que bloquea scripts remotos, evaluacion dinamica y objetos embebidos.
- El renderer solo puede usar metodos concretos expuestos por preload.
- No se exponen comandos, PowerShell, filesystem ni procesos al renderer.
- Las pruebas normales deben usar mocks/fixtures; no deben descargar SteamCMD ni Palworld ni tocar Firewall real.
