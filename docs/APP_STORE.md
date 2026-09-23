# PolarGrid en el App Store — guía completa

Esta guía va desde "tengo la cuenta de Apple Developer" hasta "la app está en revisión". Síguela en orden.

- **Bundle ID:** `com.frangellcode.polargrid`
- **Propinas (IAP consumibles):**
  - `com.frangellcode.polargrid.tip.small` → $0.99
  - `com.frangellcode.polargrid.tip.medium` → $2.99
  - `com.frangellcode.polargrid.tip.large` → $4.99
- **Política de privacidad:** https://frangellcode.github.io/polargrid/privacy.html
- **Soporte:** https://frangellcode.github.io/polargrid/support.html

> Si cambias el Bundle ID, cámbialo también en `capacitor.config.ts`, en `src/lib/tipJar.ts`, en `ios/App/App/PolarGrid.storekit` y en Xcode. Hazlo **antes** de crear la app en App Store Connect, porque después ya no se puede cambiar.

---

## 0. Qué cambió en el código y por qué

| Cambio | Motivo (regla de Apple) |
|---|---|
| Proyecto iOS nativo con Capacitor (`ios/`) | Para subir a la App Store hace falta un binario nativo hecho en Xcode. |
| En iOS, el enlace de PayPal se reemplaza por **"Deja una propina"** con compras dentro de la app (StoreKit 2) | **3.1.1**: las propinas por contenido digital tienen que ir por In-App Purchase. Un enlace a PayPal dentro de la app es motivo de rechazo. En la web, PayPal sigue igual. |
| Las propinas son **consumibles que no desbloquean nada** y lo dicen claro | 3.1.1 permite propinas por IAP. Decir claramente que son opcionales evita el rechazo por "funcionalidad confusa". |
| Se quitó el botón "Actualizar app" y el service worker en iOS | **2.5.2**: la app no puede actualizarse sola por fuera de la App Store. |
| Guardar fotos usa la hoja de compartir nativa de iOS | **4.2** (funcionalidad mínima): que se note como app nativa y no como una página web metida en una app. |
| La página ya no rebota al hacer scroll, la barra de estado es clara y todo es oscuro | Lo mismo: evitar que la app se sienta como un sitio web (4.2). |
| Las fuentes (Syne/Jost) van dentro de la app en vez de cargarse desde Google Fonts | Funciona sin internet desde el primer arranque y no contacta a terceros (privacidad). |
| Textos de permisos de Fotos y Cámara en inglés y español | **5.1.1**: sin estos textos la app **se cierra** al guardar o tomar una foto, y es rechazo seguro. |
| `PrivacyInfo.xcprivacy` (manifiesto de privacidad) | Obligatorio desde 2024. Declara que no se recopila ningún dato. |
| `ITSAppUsesNonExemptEncryption = NO` | Te ahorra la pregunta de cumplimiento de exportación en cada subida. |
| Solo iPhone, solo vertical | La app está diseñada para teléfono en vertical. Con iPad tendrías que hacer capturas y pruebas para iPad y soportar todas las orientaciones. |
| Ícono de 1024×1024 sin transparencia y pantalla de inicio color tinta | Apple rechaza íconos con canal alfa. |
| `public/privacy.html` y `public/support.html` | App Store Connect exige una URL de privacidad y una de soporte. Se publican solas con tu deploy de GitHub Pages. |

---

## 1. Preparar tu Mac (una sola vez)

1. Abre la **Terminal** y ejecuta:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   xcodebuild -runFirstLaunch
   ```
2. Abre **Xcode → Settings → Components** e instala la plataforma **iOS** (el simulador), si no está.
3. **Xcode → Settings → Accounts → "+" → Apple Account**: entra con el Apple ID con el que pagaste el Developer Program. Debe aparecer tu equipo ("Team") con el rol *Account Holder*.

## 2. Abrir y probar la app en Xcode

```bash
npm run ios
```
Esto compila la web, la copia al proyecto iOS y abre Xcode. **Cada vez que cambies código React, vuelve a ejecutar este comando.**

En Xcode:

1. En la barra izquierda haz clic en **App** (el ícono azul de arriba) → target **App** → pestaña **Signing & Capabilities**.
2. Marca **Automatically manage signing** y en **Team** elige tu equipo.
3. Haz clic en **+ Capability** y agrega **In-App Purchase**.
4. Arriba, elige un simulador (por ejemplo *iPhone 17 Pro*) y pulsa ▶︎ (Run).

**Probar las propinas en el simulador:** el proyecto trae `PolarGrid.storekit`, una tienda de prueba con las 3 propinas, y el scheme ya la usa (comprobado). Ejecuta con ▶︎ desde Xcode (si la abres de otra forma, las propinas salen como "no disponibles"), toca "Deja una propina" y compra una: no se cobra nada real. Si Xcode pregunta *"An instance of App is already running"*, elige **Replace**.

**Probar en tu iPhone (muy recomendado antes de subir):**
1. Conecta el iPhone por cable y acepta "Confiar en esta computadora".
2. En el iPhone: **Ajustes → Privacidad y seguridad → Modo de desarrollador → Activar** (se reinicia).
3. En Xcode elige tu iPhone como destino y pulsa ▶︎.
4. Prueba todo: bordes, collage, exportar y **Guardar imagen** (debe pedir permiso para Fotos y guardar), cambiar de idioma y el enlace de Instagram.

## 3. App Store Connect: acuerdos, impuestos y banco (obligatorio para las propinas)

Sin esto **las propinas no aparecen** y la app falla en revisión.

1. Entra en https://appstoreconnect.apple.com → **Business** (o *Agreements, Tax, and Banking*).
2. Acepta el acuerdo **Paid Apps** (el de Free Apps ya está activo).
3. Completa **Bank Account** (tu cuenta bancaria) y **Tax Forms** (formulario W-8BEN si no vives en EE. UU., o W-9 si vives allí).
4. Espera a que el estado diga **Active** (puede tardar desde unas horas hasta un par de días).

## 4. Crear la app en App Store Connect

1. **Apps → "+" → New App**
   - Platform: **iOS**
   - Name: **PolarGrid** (si ya está ocupado: *PolarGrid: Borders & Collage*)
   - Primary Language: English (U.S.) o Spanish, como prefieras
   - Bundle ID: `com.frangellcode.polargrid` (si no aparece en la lista, créalo en https://developer.apple.com/account/resources/identifiers → "+" → App IDs → App, con ese mismo ID y la capacidad *In-App Purchase*)
   - SKU: `polargrid-ios`
   - User Access: Full Access
2. Agrega el español como segundo idioma: **App Information → Localizable Information → idioma → Spanish (Mexico) o Spanish (Spain)**.

## 5. Crear las propinas (In-App Purchases)

**Monetization → In-App Purchases → "+"**, tres veces:

| Type | Reference Name | Product ID | Precio |
|---|---|---|---|
| Consumable | Small tip | `com.frangellcode.polargrid.tip.small` | $0.99 |
| Consumable | Medium tip | `com.frangellcode.polargrid.tip.medium` | $2.99 |
| Consumable | Large tip | `com.frangellcode.polargrid.tip.large` | $4.99 |

En cada una:
- **Availability**: todos los países.
- **Price Schedule**: el precio de la tabla (Apple lo convierte a cada moneda).
- **App Store Localization** (inglés y español):
  - EN: *Small tip* / "A small thank-you. Unlocks nothing."
  - ES: *Propina pequeña* / "Un pequeño gracias. No desbloquea nada."
  - (lo mismo con *Medium/mediana* y *Large/grande*)
- **Review Information → Screenshot**: una captura de la ventana "Apoya a PolarGrid" con los precios (sácala del simulador con ⌘S).
- **Review Notes**: `Optional tip. Consumable, unlocks no content or features.`

⚠️ El Product ID tiene que ser **exactamente** igual al del código. Si no coincide, la propina no aparece.

## 6. Privacidad de la app

**App Privacy**:
- Privacy Policy URL: `https://frangellcode.github.io/polargrid/privacy.html`
- **Get Started → "Do you or your third-party partners collect data from this app?" → No, we do not collect data from this app.**
- Publica la etiqueta. En la tienda saldrá **"Data Not Collected"**.

(Primero haz push a `main` para que GitHub Pages publique `privacy.html` y `support.html`, y abre las dos URLs para comprobar que cargan.)

## 7. Precio, clasificación por edad y categoría

- **Pricing and Availability**: Price = **Free**, todos los países.
- **App Information**:
  - Category: **Photo & Video** (secundaria opcional: *Graphics & Design*).
  - **Age Rating**: responde "None/No" a todo → saldrá **4+**.
  - Content Rights: "No, it does not contain, show, or access third-party content".

## 8. Ficha de la tienda (versión 1.0)

**Capturas (obligatorio):** tamaño **iPhone 6.9"** (1320 × 2868). Sácalas en el simulador *iPhone 17 Pro Max* con ⌘S (se guardan en el Escritorio). Mínimo 1, lo ideal son 4–6: inicio, borde blanco, collage con plantilla, selector de plantillas, modo libre. Apple escala esas mismas para los demás tamaños de iPhone.

Textos sugeridos (puedes cambiarlos):

**Subtitle (máx. 30):** EN `White borders & photo collages` · ES `Bordes blancos y collages`

**Promotional text:** EN `Frame your photos and build collages in full quality. Everything stays on your iPhone.` · ES `Enmarca tus fotos y arma collages en calidad máxima. Todo se queda en tu iPhone.`

**Description (EN):**
```
PolarGrid does two things photographers keep needing: a clean border around a photo, and several photos laid out into one image — in full quality, with nothing uploaded anywhere.

WHITE BORDER
• Adjustable border in seven colours
• Aspect ratios: Original, 1:1, 4:5, 5:6, 3:4, 9:16 — vertical or horizontal
• Crop to fill, or show the whole photo uncropped
• Drag to reposition, pinch to zoom
• Film grain
• Batch mode: set it once, export up to 15 photos

COLLAGE
• 2 to 9 photos in one image
• Template grids, including creative layouts
• Free mode: place, resize and rotate each photo by hand
• Control outer border and spacing, square or rounded cells

PRIVATE BY DESIGN
Every photo is processed on your iPhone. No account, no uploads, no tracking. Works with no internet connection.

Free, with no watermark and nothing locked. If you enjoy it, you can leave an optional tip.
```

**Description (ES):**
```
PolarGrid hace dos cosas que los fotógrafos siempre necesitan: un borde limpio alrededor de una foto y varias fotos juntas en una sola imagen — en calidad máxima y sin subir nada a ningún lado.

BORDE BLANCO
• Borde ajustable en siete colores
• Proporciones: Original, 1:1, 4:5, 5:6, 3:4, 9:16 — vertical u horizontal
• Recorta para llenar o muestra la foto completa sin recortar
• Arrastra para mover, pellizca para hacer zoom
• Grano de película
• Modo lote: ajústalo una vez y exporta hasta 15 fotos

COLLAGE
• De 2 a 9 fotos en una imagen
• Plantillas, incluidas composiciones creativas
• Modo libre: coloca, cambia el tamaño y gira cada foto a mano
• Controla el borde exterior y el espacio entre fotos, celdas rectas o redondeadas

PRIVADA POR DISEÑO
Cada foto se procesa en tu iPhone. Sin cuenta, sin subidas, sin rastreo. Funciona sin internet.

Gratis, sin marca de agua y sin nada bloqueado. Si te gusta, puedes dejar una propina opcional.
```

**Keywords (máx. 100, separadas por coma, sin espacios):**
EN `border,frame,collage,white border,grid,layout,photo editor,instagram,film,grain`
ES `borde,marco,collage,borde blanco,grilla,fotos,editor,instagram,película,grano`

**Support URL:** `https://frangellcode.github.io/polargrid/support.html`
**Copyright:** `2026 Frangell Vasquez`

⚠️ **No escribas "Polaroid"** en el nombre, subtítulo, palabras clave ni capturas: es una marca registrada (regla 5.2.1). Tampoco menciones Android ni "la versión web" (regla 2.3.10).

## 9. Subir el binario desde Xcode

1. Asegúrate de que el código web está al día: `npm run ios`.
2. En Xcode, target **App → General**: **Version** `1.0` y **Build** `1`. (En cada subida nueva, sube el Build: 2, 3, 4…)
3. Arriba, como destino elige **Any iOS Device (arm64)**.
4. **Product → Archive**. Espera a que termine; se abre el **Organizer**.
5. **Distribute App → App Store Connect → Upload** → deja las opciones por defecto → **Upload**.
6. En unos 10–30 minutos el build aparece en App Store Connect → **TestFlight** (te llega un correo cuando termina de procesarse).

## 10. Probar con TestFlight (recomendado)

1. **TestFlight → Internal Testing → "+"** → crea un grupo y agrégate.
2. Instala **TestFlight** en tu iPhone desde la App Store y acepta la invitación.
3. Para probar las propinas **con Apple de verdad pero sin cobro real**: en App Store Connect ve a **Users and Access → Sandbox → Test Accounts** y crea una cuenta sandbox (con un correo que no sea tu Apple ID). En el iPhone: **Ajustes → App Store → Cuenta Sandbox** → entra con ella. Compra una propina desde TestFlight: debe salir el aviso *[Sandbox]* y el mensaje de gracias.

## 11. Enviar a revisión

En la página de la versión 1.0:
1. **Build → "+"** → elige el build que subiste.
2. **In-App Purchases and Subscriptions → "+"** → selecciona **las 3 propinas**. (La primera vez **tienen que ir junto con la app**; si no, se quedan sin revisar y el revisor no puede probarlas.)
3. **App Review Information**:
   - Sign-in required: **No**
   - Contact: tu nombre, teléfono y correo.
   - **Notes** (copia esto):
     ```
     PolarGrid is a photo tool for adding borders and building collages. All image processing happens on-device; the app has no backend, no accounts and collects no data.

     The "Leave a tip" button on the home screen opens a tip jar with three consumable in-app purchases. Tips are fully optional and unlock no content or features — every feature is free.

     To test: tap "White border", add a photo, then tap Export → Save to save it to Photos (asks for photo library permission).
     ```
4. **Release**: *Manually release this version* (así tú decides cuándo sale) o *Automatically*.
5. **Add for Review → Submit for Review.**

La revisión suele tardar entre 24 y 48 horas. Si te rechazan, el mensaje llega a **App Store Connect → Resolution Center**: responde ahí o corrige y sube un build nuevo.

## 12. Actualizaciones futuras

1. Cambia el código → `npm run ios`.
2. En Xcode sube **Version** (1.0 → 1.1) y/o **Build** (siempre mayor que el anterior).
3. Product → Archive → Upload.
4. En App Store Connect: **"+" Version** (o "iOS App +") → elige el build → escribe "What's New" → Submit.

---

## Riesgos que todavía tienes que revisar tú

1. **El ícono.** Ya es un diseño propio, hecho para PolarGrid (una cámara instantánea que saca una foto con una cuadrícula de 2×2), así que no depende de ninguna licencia de terceros. Si algún día lo cambias, edita el SVG en `scripts/generate-icons.mjs`, `src/components/Logo.tsx` e `index.html`, y ejecuta `npm run generate-icons`.
2. **"Funcionalidad mínima" (regla 4.2).** Las apps hechas con tecnología web a veces se rechazan por "parecer un sitio web". Ya se quitó lo que más lo delata (rebote de scroll, botón de actualizar, enlaces de pago, guardado vía navegador). PolarGrid tiene funcionalidad real de edición, así que el riesgo es bajo, pero si te lo marcan, responde en el Resolution Center explicando que todo funciona sin conexión y con la hoja de compartir nativa.
3. **Contacto de soporte.** La página de soporte usa Instagram y GitHub Issues. Apple acepta eso, pero un correo de contacto es más seguro; agrégalo a `public/support.html` si quieres.
4. **Probar en un iPhone real** antes de enviar: exportar collages de 9 fotos a calidad máxima usa mucha memoria, y el revisor lo va a probar en un dispositivo real.
