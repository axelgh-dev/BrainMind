# Mapa mental

App de mapas mentales sin login, sin backend y sin persistencia.
Stack: TanStack Start + React + TypeScript + Tailwind CSS v4.

## Requisitos

- Node.js 20 o superior
- pnpm 9 o superior

## Instalación

```bash
pnpm install
```

## Desarrollo

```bash
pnpm dev
```

Abre http://localhost:3000

## Producción

```bash
pnpm build
pnpm start
```

## Notas

- El archivo `src/routeTree.gen.ts` se genera automáticamente al ejecutar
  `pnpm dev` o `pnpm build` (no se sube al repositorio).
- Toda la lógica de la app vive en `src/routes/index.tsx`.
- No hay guardado en servidor: al recargar la página el mapa vuelve al estado inicial.
