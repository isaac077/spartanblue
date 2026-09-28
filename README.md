# Spartanblue

Plataforma interna para coordinar proyectos, personas, áreas y procesos de Spartanblue.

## Despliegue independiente

Este repositorio pertenece exclusivamente al proyecto Vercel `spartanblue`
(`prj_wxrDqa5DxyoXgmH40HWV8NFYpFoT`). No vincular al proyecto original.
El registro admite correos personales y corporativos. Las migraciones crean
la estructura vacía, sin proyectos, personas ni plantillas de muestra.

Google Drive y Gmail deben autorizarse con `malondra1508@gmail.com`, con una
carpeta y credenciales propias. No copiar variables de la instalación anterior.
Tickets y reportes externos requieren servicios nuevos; sus URLs no tienen
un valor predeterminado que apunte a la aplicación original.

Logo, favicon y fotografía de costa: https://spartanblueconsultants.com/.

## Funciones

- Registro e inicio de sesión por correo y contraseña
- Perfiles organizados por área
- Proyectos con tableros Kanban y backlog
- Tareas con responsables, etiquetas, fechas y pasos
- Plantillas de procesos recurrentes
- Centro de notificaciones con estados de lectura
- Notificaciones por correo al mencionar o asignar personas
- Fotos privadas en Google Drive, con un máximo de 50 MB
- Interfaz adaptable a computadora y móvil

## Desarrollo local

Requiere Node.js 22 o posterior.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Variables necesarias:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_MAIL_FROM_ADDRESS=
```

La estructura de la base y sus políticas de seguridad están en `supabase/migrations`.
El correo transaccional se envía con Gmail desde la misma cuenta conectada a
Google Drive. El token debe autorizar conjuntamente los alcances reducidos
`drive.file` y `gmail.send`; `GOOGLE_MAIL_FROM_ADDRESS` debe ser la dirección de
esa cuenta.

Las credenciales de Google Drive son exclusivamente de servidor y deben guardarse
como variables sensibles en Vercel. La aplicación usa el alcance reducido
`drive.file`: solo administra la carpeta y los archivos creados por ella. Gmail
usa `gmail.send`, que permite enviar mensajes pero no leer el buzón.

## Validación

```bash
npm run build
```
