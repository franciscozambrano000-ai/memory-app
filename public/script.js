// ============================================================
// script.js → Este archivo corre en el NAVEGADOR, no en Node.
// Es el equivalente al <script> dentro de tu HtmlService.
// La gran diferencia con Apps Script:
//   - Allá usabas google.script.run.miFuncion(datos)
//   - Aquí usas fetch('/api/movimiento', {...})  →  estándar web
// ============================================================

// Estado mínimo del "juego" (recuerda: el juego no es el objetivo)
const JUGADOR = 'Francisco';
let contadorMovimientos = 0;

// Referencias al DOM
const tablero = document.getElementById('tablero');
const consola = document.getElementById('consola');

// ------------------------------------------------------------
// 1. DETECTAR EL CLIC (delegación de eventos)
//    En vez de poner un listener en cada carta, ponemos UNO en el
//    tablero y preguntamos: "¿lo que clicaste es una .carta?"
//    Esto escala mejor si luego generas cartas dinámicamente.
// ------------------------------------------------------------
tablero.addEventListener('click', (evento) => {
  const carta = evento.target.closest('.carta');
  if (!carta) return; // clic fuera de una carta → ignorar

  // Leemos el emoji desde el atributo data-carta del HTML
  const emoji = carta.dataset.carta;
  enviarMovimiento(emoji, carta);
});

// ------------------------------------------------------------
// 2. ENVIAR EL MOVIMIENTO AL SERVIDOR con fetch()
//    Equivalente Apps Script (lado cliente):
//      google.script.run
//        .withSuccessHandler(pintarRespuesta)
//        .doPostSimulado(datos)
//    fetch() es lo mismo pero universal: funciona contra CUALQUIER
//    servidor (Express, Apps Script Web App, una API externa...).
// ------------------------------------------------------------
async function enviarMovimiento(emoji, cartaElemento) {
  contadorMovimientos++;

  // Este objeto viaja como texto JSON por HTTP.
  // Es lo que Express recibirá en req.body.
  const movimiento = {
    jugador: JUGADOR,
    movimiento: contadorMovimientos,
    carta: emoji,
    hora: new Date().toISOString()
  };

  cartaElemento.classList.add('enviando'); // feedback visual

  try {
    // POST → misma idea que apuntar a tu URL /exec de Apps Script
    const respuesta = await fetch('/api/movimiento', {
      method: 'POST',
      // Este header es CLAVE: le dice a express.json()
      // "esto es JSON, pársealo". Sin él, req.body llega vacío.
      headers: { 'Content-Type': 'application/json' },
      // El objeto no viaja como objeto: viaja como TEXTO.
      // JSON.stringify lo convierte. (En Apps Script hacías lo mismo
      // con payload: JSON.stringify(datos) en UrlFetchApp).
      body: JSON.stringify(movimiento)
    });

    // La respuesta también llega como texto → .json() la parsea.
    // Es el JSON.parse(response.getContentText()) de UrlFetchApp.
    const datos = await respuesta.json();

    pintarRespuesta(datos);

  } catch (error) {
    // Si el servidor está apagado o falla la red, caemos aquí.
    consola.innerHTML =
      `<p class="respuesta-error">⚠️ No pude hablar con el servidor. ¿Está corriendo node server.js?</p>`;
  } finally {
    cartaElemento.classList.remove('enviando');
  }
}

// ------------------------------------------------------------
// 3. MOSTRAR LA RESPUESTA DEL SERVIDOR debajo del tablero
//    Esto es tu withSuccessHandler: qué hacer cuando el
//    servidor responde bien.
// ------------------------------------------------------------
function pintarRespuesta(datos) {
  consola.innerHTML = `
    <p class="respuesta-ok">✅ ${datos.mensaje}</p>
    <p class="respuesta-json">${JSON.stringify(datos, null, 2)}</p>
  `;
}
