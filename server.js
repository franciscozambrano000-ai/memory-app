// ============================================================
// server.js v3 — jugadores + pares de cartas + historial con JOIN
// ============================================================
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ------------------------------------------------------------
// POST /api/jugador — el "mini login"
// Recibe { nombre } y devuelve la fila del jugador (con su id).
// ------------------------------------------------------------
app.post('/api/jugador', async (req, res) => {
  const { nombre } = req.body;

  // Validación en el servidor: NUNCA confíes solo en el HTML.
  // (El required del input se puede saltar con F12; esto no.)
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, mensaje: 'El nombre es obligatorio' });
  }

  try {
    // ON CONFLICT = "upsert": si el nombre ya existe (gracias al
    // UNIQUE de la tabla), no crees un duplicado — devuélveme al
    // jugador existente. Así "Antonella" siempre es la misma fila,
    // juegue hoy o la próxima semana.
    // Equivalente Apps Script: buscar el nombre en la hoja con un
    // bucle, y solo hacer appendRow si no está. Aquí: una línea.
    const resultado = await pool.query(
      `INSERT INTO jugadores (nombre) VALUES ($1)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING *`,
      [nombre.trim()]
    );

    const jugador = resultado.rows[0];
    console.log('👤 Jugador en sesión:', jugador.nombre, `(id ${jugador.id})`);
    res.json({ ok: true, jugador });

  } catch (error) {
    console.error('❌ Error de base de datos:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al registrar jugador' });
  }
});

// ------------------------------------------------------------
// POST /api/movimiento — ahora registra un PAR de cartas
// Recibe { jugador_id, carta1, carta2, acierto }
// ------------------------------------------------------------
app.post('/api/movimiento', async (req, res) => {
  const { jugador_id, carta1, carta2, acierto } = req.body;

  try {
    // Nota que guardamos jugador_id (el número), no el nombre.
    // El nombre vive UNA sola vez en la tabla jugadores; aquí
    // solo apuntamos a él. Si Antonella corrige su nombre algún
    // día, todos sus movimientos se actualizan solos.
    const resultado = await pool.query(
      `INSERT INTO movimientos (jugador_id, carta1, carta2, acierto)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [jugador_id, carta1, carta2, acierto]
    );

    console.log('💾 Par guardado:', resultado.rows[0]);
    res.json({ ok: true, movimiento: resultado.rows[0] });

  } catch (error) {
    console.error('❌ Error de base de datos:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar el movimiento' });
  }
});

// ------------------------------------------------------------
// GET /api/movimientos — el historial, uniendo las DOS tablas
// ------------------------------------------------------------
app.get('/api/movimientos', async (req, res) => {
  try {
    // JOIN = el VLOOKUP de SQL.
    // La tabla movimientos solo tiene jugador_id (un número).
    // El JOIN dice: "por cada movimiento, busca en jugadores la
    // fila cuyo id coincida, y tráeme su nombre".
    // En Sheets harías =BUSCARV(jugador_id, Jugadores!A:B, 2)
    // en cada fila. Postgres lo hace para todas de un golpe.
    const resultado = await pool.query(
      `SELECT m.id, j.nombre, m.carta1, m.carta2, m.acierto, m.hora
       FROM movimientos m
       JOIN jugadores j ON j.id = m.jugador_id
       ORDER BY m.id DESC
       LIMIT 20`
    );

    res.json({ ok: true, total: resultado.rowCount, movimientos: resultado.rows });

  } catch (error) {
    console.error('❌ Error de base de datos:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al leer el historial' });
  }
});

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PUERTO}`);
});
