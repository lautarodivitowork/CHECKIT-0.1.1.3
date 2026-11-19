# Tareas — lista para subir a GitHub Pages

Esta edición de **Tareas** está preparada para publicarse directamente. **No usa Node.js, npm, Vite, React, GitHub Actions ni compilación**. Todos los archivos que necesita están incluidos. Funciona como PWA de iPhone, con datos locales, categorías, recurrencias, edición, historial y copias de seguridad.

## Instalación rápida — desde la página de GitHub

1. Descomprimí el archivo ZIP de esta versión en tu computadora.
2. Abrí [github.com/new](https://github.com/new). Elegí un nombre (por ejemplo, `tareas`), seleccioná **Public** y pulsá **Create repository**. Podés dejar desmarcado **Add a README file**.
3. En el repositorio vacío seleccioná **uploading an existing file** (o **Add file → Upload files**). **Arrastrá todos los archivos que están DENTRO de la carpeta descomprimida**, juntos. `index.html` debe quedar directamente en la raíz del repositorio, no dentro de otra carpeta. No subas el archivo `.zip` sin descomprimir.
4. Confirmá con **Commit changes** en la rama `main`.
5. **Una única activación de GitHub Pages:** entrá a **Settings → Pages**. En **Build and deployment** seleccioná **Deploy from a branch**, elegí **main** y **/(root)**, y pulsá **Save**.
6. Tu aplicación estará disponible en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPOSITORIO/`. La página de **Settings → Pages** te mostrará la URL de publicación cuando esté lista.

**Por qué hay que realizar el paso 5:** GitHub exige activar Pages en los repositorios nuevos. Ningún archivo HTML o ZIP puede saltarse ese permiso de tu cuenta. Todo lo demás está configurado.

## Instalar en el iPhone

1. Abrí la URL de GitHub Pages desde **Safari** en el iPhone.
2. Usá el botón **Compartir** y elegí **Añadir a pantalla de inicio**.
3. Abrí la aplicación desde el icono de **Tareas**. Después de la primera carga con conexión, puede funcionar sin Internet.

## Qué incluye

- Navegación entre días, regreso instantáneo a hoy y **botón de calendario** junto al de ordenamiento para elegir cualquier día desde un calendario mensual.
- Tareas de una vez, todos los días, días de semana determinados o fechas puntuales.
- Categorías con color y emoji, sin necesidad de nombre. Mantené presionado un círculo para abrir un menú compacto de edición/eliminación; eliminar una categoría **no elimina las tareas**, solo les quita la asociación. No se muestra un círculo gris para “Sin categoría”: si no creaste ninguna, aparece únicamente el botón **+**. Si querés quitarle la categoría a una tarea, tocá nuevamente la categoría seleccionada.
- Completar/descompletar y ordenar desde el botón superior: más antiguas primero, más recientes primero o por categoría.
- Pulsación prolongada para editar o eliminar. **No hay arrastre ni reordenamiento manual**: el orden se determina exclusivamente desde el botón circular superior. Al abrir el menú contextual, la tarea seleccionada queda nítida y el resto se desenfoca.
- Edición y eliminación que preservan el historial anterior.
- Copias de seguridad JSON exportables e importables.
- IndexedDB como almacenamiento principal (reserva local cuando es posible).
- Fecha perfectamente centrada, botones de calendario y ordenamiento en una línea inferior a la derecha, gestos sin zoom de doble toque ni selección azul, diseño adaptable, modo claro/oscuro y PWA offline.

## Actualizaciones y datos

Para publicar futuras versiones, abrí el repositorio existente → **Add file → Upload files** y subí los archivos descomprimidos de la nueva versión a la **raíz**, sobrescribiendo los anteriores. Confirmá con **Commit changes**. No cambies el nombre ni la URL del repositorio. El HTML, CSS y JavaScript se reemplazan, pero los datos se guardan en el navegador/dispositivo; no dentro del código publicado. Antes de cambios importantes hacé una **copia JSON desde la propia app**. **No existe sincronización** con otros dispositivos ni una cuenta de usuario. Si al actualizar seguís viendo la versión anterior, abrí la URL con conexión y cerrá/reabrí la app; el service worker actualizará los recursos al activarse.

## Si ves 404

Revisá que el archivo sea `index.html` (con minúsculas) en la raíz; que **Settings → Pages** esté configurado con **main / (root)**; y que el repositorio sea público si usás GitHub Free. La publicación puede demorar unos minutos. No hace falta modificar rutas aunque el repositorio tenga otro nombre.

## Archivos

- `index.html`: página principal.
- `app.js`: interfaz y gestos.
- `domain.js`: tareas, recurrencias e historial.
- `storage.js`: persistencia de datos.
- `styles.css`: estilos, animaciones y modo oscuro.
- `manifest.webmanifest`, `sw.js`: instalación y funcionamiento offline.
- `favicon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`: iconografía.

**Estado de verificación:** se ejecutaron pruebas de interacción en navegador móvil simulado (calendario, categorías, menú contextual, ausencia de arrastre y ordenamiento), además de pruebas de reglas y chequeo sintáctico de los archivos JavaScript. No fue posible probar Safari en un iPhone físico desde este entorno; conviene validar allí los gestos después de publicar.
