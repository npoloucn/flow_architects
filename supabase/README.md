# Backend Supabase — FlowArquitecture

Proyecto Supabase: `fzlocerxiyneblglpoat`.

Todo lo que sigue son pasos de **panel** (Dashboard) más la migración incluida en
este repositorio. No hace falta el CLI de Supabase.

---

## 1. Aplicar la migración

1. Dashboard → **SQL Editor** → *New query*.
2. Pega el contenido completo de [`migrations/0001_init.sql`](migrations/0001_init.sql).
3. **Run**.

El archivo es **idempotente**: usa `create table if not exists`, `create index if
not exists`, `create or replace function`, `drop policy if exists` y `drop trigger
if exists`, así que puedes ejecutarlo otra vez sin duplicar nada. Todo corre en una
transacción (`begin; … commit;`).

> Requiere los roles `anon` y `authenticated`, que existen por defecto en Supabase.

## 2. Verificar que quedó aplicada

Ejecuta en el SQL Editor:

```sql
-- Tablas creadas
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'projects', 'project_members', 'project_revisions')
order by table_name;

-- RLS activo en las cuatro
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'projects', 'project_members', 'project_revisions')
order by tablename;

-- Funciones y RPC
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'is_project_owner', 'can_read_project', 'can_edit_project',
    'save_project', 'add_project_member', 'handle_new_user', 'touch_updated_at'
  )
order by proname;

-- Políticas
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Esperado: 4 tablas, las 4 con `rowsecurity = true`, 7 funciones y 9 políticas.

Prueba rápida de aislamiento (con la **anon key**, no la `service_role`):

```bash
curl "https://fzlocerxiyneblglpoat.supabase.co/rest/v1/projects?select=id,name,visibility" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
```

Un proyecto `privado` no debe aparecer (`[]` si no hay públicos). Si aparece, RLS
no está aplicado.

## 3. Habilitar el proveedor Email

Dashboard → **Authentication → Providers → Email**:

- Activa **Email**.
- Para **contraseña**: deja habilitado el login con email + password.
- Para **enlace mágico** (passwordless): el mismo proveedor Email lo cubre; activa
  la opción de enlaces mágicos/OTP si tu panel la muestra y desactiva "Confirm
  email" solo si no quieres verificación por correo en desarrollo.

## 4. URLs de autenticación

Dashboard → **Authentication → URL Configuration**:

| Campo | Valor |
| --- | --- |
| **Site URL** | `https://npoloucn.github.io/flow_architects/` |
| **Redirect URLs** | `http://localhost:5173/**` |
| | `https://npoloucn.github.io/flow_architects/**` |

`Site URL` es el destino por defecto de los enlaces mágicos en producción; las
`Redirect URLs` permiten el retorno a local y a GitHub Pages. Si falta una, el
enlace mágico redirige a la Site URL o falla por *redirect not allowed*.

## 5. Credenciales del cliente

Dashboard → **Project Settings → API** (en el panel nuevo: **Project Settings →
API Keys**):

- **Project URL** → `VITE_SUPABASE_URL`
- **anon / public key** → `VITE_SUPABASE_ANON_KEY`

Luego, en la raíz del repo:

```bash
cp .env.example .env
# edita .env con esos dos valores
```

`.env` ya está ignorado por git (`.gitignore`); `.env.example` sí se versiona.

> ⚠️ **La `service_role` key bypassa RLS por completo.** Nunca va al cliente, nunca
> usa el prefijo `VITE_` (todo `VITE_*` termina en el bundle del navegador) y nunca
> se commitea. El cliente solo usa la `anon public key`.

## 6. Notas de diseño

- La escritura de contenido pasa por `save_project(...)`, que valida
  `can_edit_project`, bloquea la fila (`for update`) y devuelve `40001` si la
  revisión esperada no coincide (control optimista).
- `project_revisions` no tiene política de escritura: los snapshots solo los crea
  el RPC `security definer`.
- Los helpers (`is_project_owner`, `can_read_project`, `can_edit_project`) son
  `security definer` con `set search_path = public`, por eso pueden leer
  `projects`/`project_members` sin disparar RLS y sin recursión.

## 7. Solución de problemas

- **`relation "public.projects" does not exist`**: la migración no se aplicó; repite el paso 1.
- **`permission denied for table projects` / respuesta vacía con datos privados**: RLS está activo y la `anon key` solo ve `enlace`/`publico`; es el comportamiento esperado.
- **`must be owner of relation users`** al crear el trigger de `auth.users`: ejecuta el archivo con el rol `postgres` desde el SQL Editor (es el rol por defecto). Casi siempre basta; si no, aplica la sección 3 con un rol administrador de la base.
- **Enlace mágico cae en una URL equivocada o “redirect not allowed”**: revisa `Site URL` y `Redirect URLs` (paso 4).
