# Scripts

- `e2e-supabase.mjs`: E2E manual con Edge headless (crea datos, no borra).
- `limpiar-e2e.mjs`: unico camino admitido para limpiar datos de prueba.
- `generar-iconos.mjs`, `generar-agentes-bigdata.mjs`, `medir-header.mjs`: utilidades.

## Reglas de limpieza

1. Simula siempre primero: `npm run limpiar:e2e`; solo borra con `--aplicar`.
2. Nunca borres por `id` que no venga de la simulacion de esa misma corrida.
3. Ninguna prueba automatica puede borrar datos que no lleven prefijo `e2e-`.
