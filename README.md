# PolarGrid

PolarGrid es una app web (PWA) para ponerle bordes blancos a tus fotos y armar collages, pensada para usarse desde el celular como si fuera una app nativa — se instala en la pantalla de inicio y funciona **100% sin conexión a internet**, todo el procesado de imágenes ocurre en el propio dispositivo.

## Qué hace

**Bordes blancos**
- Sube una foto y enmárcala con un borde blanco ajustable.
- Elige entre varias relaciones de aspecto (Original, 1:1, 4:5, 5:6, 3:4, 9:16), con toggle de orientación vertical/horizontal.
- Modo **Bloqueada** (recorta la foto para llenar el marco) o **Desbloqueada** (muestra la foto completa sin recortarla, el borde se ajusta alrededor).
- Recorte y zoom con gestos táctiles (arrastrar para mover, pellizcar para hacer zoom).

**Collage**
- Combina hasta 12 fotos en una sola imagen.
- Modo **Plantilla**: grillas prediseñadas (normales y "creativas", con celdas de distinto tamaño), en estilo vertical u horizontal.
- Modo **Libre**: coloca, mueve, rota y redimensiona cada foto donde quieras dentro del lienzo.
- Control de borde exterior y espacio entre fotos.

**En ambos modos**
- Fondo del área de trabajo personalizable (varios tonos, se recuerda entre sesiones).
- Exportación en tres calidades (Máxima / Alta / Web) para balancear nitidez contra peso del archivo.
- Al exportar, se abre el panel nativo de compartir del sistema para guardar la foto directamente en la galería del celular.

## Por qué existe

Alternativas a esto suelen requerir cuenta, conexión a internet o dejan marca de agua. PolarGrid corre completamente local, no manda ninguna foto a ningún servidor, y queda instalada como una app normal del celular aunque no haya señal.

## Cómo correrlo en local

```bash
npm install
npm run dev       # servidor de desarrollo
npm run build     # build de producción (dist/)
npm run preview   # sirve el build de producción localmente
npm run lint       # linter (oxlint)
```

## Stack técnico

- **React 19** + **TypeScript**, empaquetado con **Vite**.
- **Zustand** para el estado de la app (fotos cargadas, ajustes de cada modo, etc.).
- **Konva** / **react-konva** para el lienzo interactivo (arrastrar, hacer zoom, rotar).
- **Tailwind CSS v4** para estilos.
- **vite-plugin-pwa** (Workbox) para que la app se pueda instalar y funcione offline, con actualización automática en segundo plano.
- Exportación de imágenes vía `<canvas>` nativo del navegador — sin backend, sin subir nada a ningún servidor.

## Despliegue

Cada push a `main` dispara un GitHub Action (`.github/workflows/deploy.yml`) que compila la app y la publica en GitHub Pages.
