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
release/Palworld Server Manager 0.1.0.exe
```

Ese `.exe` es el artefacto portable. Al ejecutarse empaquetado, la aplicacion debe resolver su raiz portable desde la ubicacion real del ejecutable con `app.getPath('exe')` y `path.dirname(...)`; no se debe hardcodear la ruta de desarrollo `D:\MyAPIS\PalCM`.

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
- `sandbox` debe permanecer en `true`.
- El renderer solo puede usar metodos concretos expuestos por preload.
- No se exponen comandos, PowerShell, filesystem ni procesos al renderer.
- Las pruebas normales deben usar mocks/fixtures; no deben descargar SteamCMD ni Palworld ni tocar Firewall real.
