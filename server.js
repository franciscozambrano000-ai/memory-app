// ============================================================
// server.js v2 — ahora con memoria (PostgreSQL en Neon)
// ============================================================

// Cargar el archivo .env hacia process.env (SIEMPRE primero de todo)
require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ------------------------------------------------------------
// CONEXIÓN A LA BASE DE DATOS
// Un "Pool" es un grupo de conexiones reutilizables.
// Abrir una conexión a Postgres es costoso (viaje a São Paulo,
// autenticación, cifrado); el Pool abre unas pocas y las presta
// a cada petición que llega. Equivalente Apps Script:
// SpreadsheetApp.openByUrl(...) pero hecho una sola vez y bien.
// ------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // tu secreto, leído del entorno
  ssl: { rejectUnauthorized: false }          // Neon exige conexión cifrada
});

// ------------------------------------------------------------
// POST /api/movimiento — ahora ESCRIBE en la base
// ------------------------------------------------------------
app.post('/api/movimiento', async (req, res) => {
  const datos = req.body;

  try {
    // Equivalente Apps Script:
    //   hoja.appendRow([datos.jugador, datos.movimiento, datos.carta])
    //
    // Los $1, $2, $3 son "parámetros": pg inserta los valores de
    // forma SEGURA. NUNCA construyas SQL pegando texto del usuario
    // (`INSERT ... VALUES ('${datos.jugador}')`) — eso abre la
    // puerta al ataque más famoso de la historia: SQL Injection.
    //
    // RETURNING * = "devuélveme la fila recién creada completa",
    // incluyendo el id y la hora que Postgres generó solo.
    const resultado = await pool.query(
      'INSERT INTO movimientos (jugador, movimiento, carta) VALUES ($1, $2, $3) RETURNING *',
      [datos.jugador, datos.movimiento, datos.carta]
    );

    const filaGuardada = resultado.rows[0];
    console.log('💾 Guardado en Postgres:', filaGuardada);

    res.json({
      ok: true,
      mensaje: `Movimiento ${filaGuardada.id} guardado para siempre 🗄️`,
      datos: filaGuardada
    });

  } catch (error) {
    // Si la base rechaza algo (tipo incorrecto, caída de red...)
    console.error('❌ Error de base de datos:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar en la base de datos' });
  }
});

// ------------------------------------------------------------
// GET /api/movimientos — NUEVO: leer el historial
// Equivalente Apps Script: hoja.getDataRange().getValues()
// pero con superpoderes: ORDER BY ordena, LIMIT recorta.
// ------------------------------------------------------------
app.get('/api/movimientos', async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT * FROM movimientos ORDER BY id DESC LIMIT 20'
    );
    res.json({ ok: true, total: resultado.rowCount, movimientos: resultado.rows });
  } catch (error) {
    console.error('❌ Error de base de datos:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al leer la base de datos' });
  }
});

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PUERTO}`);
});