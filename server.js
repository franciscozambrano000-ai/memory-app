// ============================================================
// server.js  →  Este archivo es tu "Code.gs"
// Es el ÚNICO archivo que se ejecuta en el servidor (Node.js).
// Todo lo demás (public/) se envía al navegador tal cual.
// ============================================================

// 1. Importar Express.
//    En Apps Script las librerías (SpreadsheetApp, ContentService...)
//    ya vienen cargadas. En Node.js TÚ decides qué importar.
const express = require('express');

// 2. Crear la aplicación.
//    Piensa en "app" como tu proyecto de Apps Script completo:
//    el objeto donde vas a colgar tus doGet/doPost.
const app = express();

// 3. MIDDLEWARE: express.json()
//    En Apps Script, e.postData.contents llega como TEXTO y tú haces
//    JSON.parse(e.postData.contents) a mano.
//    Esta línea le dice a Express: "haz ese JSON.parse automáticamente
//    en cada petición que llegue con Content-Type: application/json".
//    Gracias a esto, req.body ya es un objeto JavaScript listo para usar.
app.use(express.json());

// 4. Servir la carpeta /public automáticamente.
//    En Apps Script usas HtmlService.createHtmlOutputFromFile('index')
//    para entregar tu HTML. Aquí, con UNA línea, Express entrega
//    index.html, style.css y script.js sin que escribas nada más.
//    Si el navegador pide "/", Express busca public/index.html solo.
app.use(express.static('public'));

// 5. RUTA POST: /api/movimiento
//    Esto es tu doPost(e), pero con una gran diferencia:
//    en Apps Script solo existe UN doPost para todo el proyecto
//    y tienes que hacer if/else con e.parameter para distinguir acciones.
//    En Express puedes tener MUCHAS rutas, cada una con su propia URL:
//    app.post('/api/movimiento'), app.post('/api/jugador'), etc.
app.post('/api/movimiento', (req, res) => {

  // req.body  →  equivale a JSON.parse(e.postData.contents)
  // pero ya viene parseado gracias a express.json() (paso 3).
  const datos = req.body;

  // console.log aquí NO sale en el navegador.
  // Sale en la TERMINAL donde ejecutaste "node server.js".
  // Es el equivalente a Logger.log() / console.log() de Apps Script,
  // pero lo ves EN VIVO, sin abrir "Ejecuciones".
  console.log('📥 Movimiento recibido:');
  console.log(`   Jugador:    ${datos.jugador}`);
  console.log(`   Movimiento: ${datos.movimiento}`);
  console.log(`   Carta:      ${datos.carta}`);
  console.log(`   Hora:       ${datos.hora}`);

  // res.json()  →  equivale a:
  //   ContentService.createTextOutput(JSON.stringify(objeto))
  //     .setMimeType(ContentService.MimeType.JSON)
  // Express hace el stringify y pone el Content-Type por ti.
  res.json({
    ok: true,
    mensaje: `Movimiento registrado: ${datos.carta} de ${datos.jugador}`,
    datos: {
      jugador: datos.jugador,
      movimiento: datos.movimiento,
      carta: datos.carta
    }
  });
});

// 6. Encender el servidor.
//    Apps Script no tiene esto: Google "enciende" tu script por ti
//    cuando alguien llama a tu URL /exec.
//    En Node.js TÚ eres el servidor. Esta línea deja el proceso
//    escuchando en el puerto 3000 hasta que lo detengas con Ctrl+C.
const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PUERTO}`);
  console.log('   (Ctrl+C para detenerlo)');
});
