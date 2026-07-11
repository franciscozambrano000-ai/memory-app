// ============================================================
// server.js v3 — SALA MULTIJUGADOR CON TURNOS
//
// El gran cambio de arquitectura: el juego ya no vive en el
// navegador. Vive AQUÍ. El servidor es el árbitro:
//   - Él baraja y guarda el mazo (secreto)
//   - Él decide de quién es el turno
//   - Él valida cada volteo y cuenta los puntos
//   - Él declara al ganador y lo guarda en Postgres
// Los navegadores solo PREGUNTAN el estado y PIDEN voltear.
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
// LA SALA — vive en la MEMORIA del servidor (no en la DB).
// ¿Por qué? Es estado efímero: tableros y turnos cambian cada
// segundo y no importan mañana. A la DB solo van los HECHOS:
// jugadores y resultados de partidas (para el ranking).
// Consecuencia honesta: si el servidor se reinicia (git push),
// la partida en curso se pierde — pero el ranking no.
// ------------------------------------------------------------
const FIGURAS = ['🍎', '🍌', '🍇', '🍓', '🥝', '🍑']; // 6 pares = 12 cartas

let sala = crearSala();

function crearSala() {
  return {
    estado: 'esperando',   // esperando → jugando → terminada
    jugadores: [],         // [{ id, nombre, puntos }] — máximo 2
    mazo: [...FIGURAS, ...FIGURAS].sort(() => Math.random() - 0.5), // SECRETO
    volteadas: [],         // índices boca arriba en este turno (máx 2)
    emparejadas: [],       // índices ya resueltos
    turno: 0,              // 0 o 1: posición del jugador que mueve
    resolviendo: false,    // true mientras un par fallido se muestra
    ganador: null          // nombre del ganador, o 'empate'
  };
}

// ------------------------------------------------------------
// El "estado público": lo que los navegadores PUEDEN saber.
// Clave anti-trampa: las cartas tapadas viajan SIN figura.
// En la v2 el emoji estaba en el HTML (F12 lo revelaba).
// Ahora el secreto nunca sale del servidor.
// ------------------------------------------------------------
function estadoPublico() {
  return {
    estado: sala.estado,
    jugadores: sala.jugadores.map(j => ({ id: j.id, nombre: j.nombre, puntos: j.puntos })),
    turno_id: sala.jugadores[sala.turno] ? sala.jugadores[sala.turno].id : null,
    cartas: sala.mazo.map((figura, i) => {
      if (sala.emparejadas.includes(i)) return { estado: 'emparejada', figura };
      if (sala.volteadas.includes(i))   return { estado: 'volteada', figura };
      return { estado: 'tapada', figura: null }; // 🤫
    }),
    ganador: sala.ganador
  };
}

// ------------------------------------------------------------
// POST /api/jugador — el mini login (igual que antes)
// ------------------------------------------------------------
app.post('/api/jugador', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, mensaje: 'El nombre es obligatorio' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO jugadores (nombre) VALUES ($1)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING *`,
      [nombre.trim()]
    );
    res.json({ ok: true, jugador: resultado.rows[0] });
  } catch (error) {
    console.error('❌ Error de base de datos:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al registrar jugador' });
  }
});

// ------------------------------------------------------------
// POST /api/sala/entrar — ocupar un asiento (hay 2)
// ------------------------------------------------------------
app.post('/api/sala/entrar', (req, res) => {
  const { jugador_id, nombre } = req.body;

  // ¿Ya estaba sentado? (ej: recargó la página) → devolver su asiento
  let asiento = sala.jugadores.findIndex(j => j.id === jugador_id);

  if (asiento === -1) {
    if (sala.jugadores.length >= 2) {
      return res.status(403).json({ ok: false, mensaje: 'La sala está llena (2 jugadores)' });
    }
    sala.jugadores.push({ id: jugador_id, nombre, puntos: 0 });
    asiento = sala.jugadores.length - 1;
    console.log(`🎮 ${nombre} entró a la sala (asiento ${asiento + 1})`);

    // Con 2 jugadores, arranca la partida
    if (sala.jugadores.length === 2) {
      sala.estado = 'jugando';
      console.log('🟢 ¡Partida iniciada!');
    }
  }

  res.json({ ok: true, asiento, sala: estadoPublico() });
});

// ------------------------------------------------------------
// GET /api/sala/estado — el corazón del multijugador.
// Cada navegador pregunta esto cada ~1 segundo ("polling").
// ------------------------------------------------------------
app.get('/api/sala/estado', (req, res) => {
  res.json({ ok: true, sala: estadoPublico() });
});

// ------------------------------------------------------------
// POST /api/sala/voltear — pedir voltear una carta.
// Aquí el servidor ejerce de ÁRBITRO: valida TODO.
// ------------------------------------------------------------
app.post('/api/sala/voltear', async (req, res) => {
  const { jugador_id, indice } = req.body;

  // Las reglas del árbitro, una por una:
  if (sala.estado !== 'jugando')
    return res.status(400).json({ ok: false, mensaje: 'La partida no está en juego' });
  if (sala.jugadores[sala.turno].id !== jugador_id)
    return res.status(403).json({ ok: false, mensaje: 'No es tu turno' });
  if (sala.resolviendo)
    return res.status(400).json({ ok: false, mensaje: 'Espera, resolviendo el par anterior' });
  if (indice < 0 || indice >= sala.mazo.length ||
      sala.emparejadas.includes(indice) || sala.volteadas.includes(indice))
    return res.status(400).json({ ok: false, mensaje: 'Carta inválida' });

  sala.volteadas.push(indice);

  // ¿Segundo volteo del turno? → resolver el par
  if (sala.volteadas.length === 2) {
    const [a, b] = sala.volteadas;
    const acierto = sala.mazo[a] === sala.mazo[b];

    if (acierto) {
      sala.emparejadas.push(a, b);
      sala.jugadores[sala.turno].puntos++;
      sala.volteadas = [];
      // Regla clásica del memoria: si aciertas, REPITES turno 😎
      console.log(`✨ ${sala.jugadores[sala.turno].nombre} encontró un par (${sala.mazo[a]})`);

      if (sala.emparejadas.length === sala.mazo.length) await terminarPartida();

    } else {
      // Fallo: dejar las cartas visibles 1.4s (para que AMBOS
      // jugadores alcancen a verlas vía polling), luego taparlas
      // y pasar el turno.
      sala.resolviendo = true;
      setTimeout(() => {
        sala.volteadas = [];
        sala.turno = 1 - sala.turno; // el truco: 1-0=1, 1-1=0
        sala.resolviendo = false;
      }, 1400);
    }
  }

  res.json({ ok: true, sala: estadoPublico() });
});

// ------------------------------------------------------------
// Fin de partida: declarar ganador y guardarlo en Postgres.
// ESTO sí es un hecho histórico → a la DB (alimenta el ranking).
// ------------------------------------------------------------
async function terminarPartida() {
  sala.estado = 'terminada';
  const [j1, j2] = sala.jugadores;

  let ganador_id = null; // null = empate
  if (j1.puntos > j2.puntos) ganador_id = j1.id;
  if (j2.puntos > j1.puntos) ganador_id = j2.id;

  sala.ganador = ganador_id
    ? sala.jugadores.find(j => j.id === ganador_id).nombre
    : 'empate';

  console.log(`🏁 Partida terminada. ${j1.nombre} ${j1.puntos} - ${j2.puntos} ${j2.nombre} → 🏆 ${sala.ganador}`);

  try {
    await pool.query(
      `INSERT INTO partidas (jugador1_id, jugador2_id, puntos1, puntos2, ganador_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [j1.id, j2.id, j1.puntos, j2.puntos, ganador_id]
    );
  } catch (error) {
    console.error('❌ Error guardando la partida:', error.message);
  }
}

// ------------------------------------------------------------
// POST /api/sala/reiniciar — revancha (mismos jugadores, mazo nuevo)
// ------------------------------------------------------------
app.post('/api/sala/reiniciar', (req, res) => {
  const jugadoresPrevios = sala.jugadores.map(j => ({ ...j, puntos: 0 }));
  sala = crearSala();
  sala.jugadores = jugadoresPrevios;
  if (sala.jugadores.length === 2) sala.estado = 'jugando';
  console.log('🔄 ¡Revancha!');
  res.json({ ok: true, sala: estadoPublico() });
});

// ------------------------------------------------------------
// GET /api/ranking — la tabla de posiciones histórica
// ------------------------------------------------------------
app.get('/api/ranking', async (req, res) => {
  try {
    // Cada partida se une DOS veces a jugadores (una por participante),
    // así cada jugador recibe su propia fila de estadísticas.
    // FILTER = un COUNT condicional (cuenta solo donde ganó).
    const resultado = await pool.query(
      `SELECT j.nombre,
              COUNT(*) FILTER (WHERE p.ganador_id = j.id) AS victorias,
              COUNT(*) AS partidas,
              SUM(CASE WHEN p.jugador1_id = j.id THEN p.puntos1 ELSE p.puntos2 END) AS pares
       FROM partidas p
       JOIN jugadores j ON j.id IN (p.jugador1_id, p.jugador2_id)
       GROUP BY j.id, j.nombre
       ORDER BY victorias DESC, pares DESC`
    );
    res.json({ ok: true, ranking: resultado.rows });
  } catch (error) {
    console.error('❌ Error de base de datos:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al leer el ranking' });
  }
});

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PUERTO}`);
});
