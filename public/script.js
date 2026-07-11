// ============================================================
// script.js v3 — el navegador como "pantalla" de la sala
//
// Cambio de filosofía respecto a la v2:
//   ANTES: el navegador ERA el juego (barajaba, resolvía pares)
//   AHORA: el navegador solo PREGUNTA y PINTA. Cada ~1 segundo
//          pide el estado al servidor ("polling") y redibuja.
// Así los dos jugadores ven exactamente lo mismo: la única
// verdad vive en el servidor.
// ============================================================

let jugador = null;        // { id, nombre }
let ultimoEstado = '';     // para no redibujar si nada cambió
let poller = null;         // el setInterval del polling

// ---------- Referencias al DOM ----------
const pantallas = {
  login:  document.getElementById('pantalla-login'),
  espera: document.getElementById('pantalla-espera'),
  juego:  document.getElementById('pantalla-juego'),
  final:  document.getElementById('pantalla-final')
};
const inputNombre  = document.getElementById('input-nombre');
const btnJugar     = document.getElementById('btn-jugar');
const avisoLogin   = document.getElementById('aviso-login');
const marcador     = document.getElementById('marcador');
const mensajeTurno = document.getElementById('mensaje-turno');
const tablero      = document.getElementById('tablero');
const emojiFinal   = document.getElementById('emoji-final');
const textoFinal   = document.getElementById('texto-final');
const marcadorFinal = document.getElementById('marcador-final');
const btnRevancha  = document.getElementById('btn-revancha');
const ranking      = document.getElementById('ranking');

function mostrarPantalla(nombre) {
  for (const [clave, seccion] of Object.entries(pantallas)) {
    seccion.classList.toggle('oculto', clave !== nombre);
  }
}

// ============================================================
// 1. LOGIN → ENTRAR A LA SALA
// ============================================================
btnJugar.addEventListener('click', entrar);
inputNombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });

async function entrar() {
  const nombre = inputNombre.value.trim();
  if (!nombre) { inputNombre.focus(); return; }

  try {
    // Paso 1: registrar/recuperar al jugador en la DB
    const r1 = await fetch('/api/jugador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre })
    });
    const d1 = await r1.json();
    if (!d1.ok) { avisoLogin.textContent = d1.mensaje; return; }
    jugador = d1.jugador;

    // Paso 2: ocupar un asiento en la sala
    const r2 = await fetch('/api/sala/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jugador_id: jugador.id, nombre: jugador.nombre })
    });
    const d2 = await r2.json();
    if (!d2.ok) { avisoLogin.textContent = d2.mensaje; return; } // sala llena

    // Paso 3: empezar a "escuchar" la sala
    render(d2.sala);
    poller = setInterval(refrescar, 1000);

  } catch (error) {
    avisoLogin.textContent = 'No pude hablar con el servidor 😢';
  }
}

// ============================================================
// 2. POLLING — preguntar el estado cada segundo
// (La versión profesional de esto son los WebSockets, donde el
//  servidor AVISA en vez de esperar la pregunta. Otro nivel 😉)
// ============================================================
async function refrescar() {
  try {
    const respuesta = await fetch('/api/sala/estado');
    const datos = await respuesta.json();
    if (datos.ok) render(datos.sala);
  } catch (error) { /* si falla un ciclo, el siguiente lo intenta */ }
}

// ============================================================
// 3. RENDER — pintar lo que el servidor diga
// ============================================================
function render(sala) {
  // Optimización: si el estado es idéntico al anterior, no redibujar
  const firma = JSON.stringify(sala);
  if (firma === ultimoEstado) return;
  ultimoEstado = firma;

  if (sala.estado === 'esperando') { mostrarPantalla('espera'); return; }
  if (sala.estado === 'terminada') { renderFinal(sala); return; }

  // --- estado: jugando ---
  mostrarPantalla('juego');
  const esMiTurno = sala.turno_id === jugador.id;

  // Marcador: chip por jugador, resaltado el que mueve
  marcador.innerHTML = sala.jugadores.map(j => `
    <div class="chip ${j.id === sala.turno_id ? 'chip-activo' : ''}">
      <span class="chip-nombre">${j.nombre}</span>
      <span class="chip-puntos">${j.puntos}</span>
    </div>
  `).join('');

  mensajeTurno.textContent = esMiTurno ? '✋ ¡Tu turno!' : `Turno de ${nombreEnTurno(sala)}…`;
  mensajeTurno.className = esMiTurno ? 'turno turno-mio' : 'turno';

  // Tablero: el servidor manda cada carta con su estado.
  // Las tapadas llegan SIN figura — el secreto nunca sale de allá.
  tablero.innerHTML = sala.cartas.map((c, i) => `
    <button class="carta ${c.estado === 'volteada' ? 'volteada' : ''} ${c.estado === 'emparejada' ? 'acertada' : ''}"
            data-indice="${i}" ${!esMiTurno || c.estado !== 'tapada' ? 'disabled' : ''}>
      ${c.figura ?? '❓'}
    </button>
  `).join('');
}

function nombreEnTurno(sala) {
  const j = sala.jugadores.find(x => x.id === sala.turno_id);
  return j ? j.nombre : '…';
}

// ============================================================
// 4. VOLTEAR — pedirle el movimiento al árbitro
// ============================================================
tablero.addEventListener('click', async (evento) => {
  const carta = evento.target.closest('.carta');
  if (!carta || carta.disabled) return;

  try {
    const respuesta = await fetch('/api/sala/voltear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jugador_id: jugador.id, indice: Number(carta.dataset.indice) })
    });
    const datos = await respuesta.json();
    if (datos.ok) render(datos.sala); // pintar YA, sin esperar al próximo poll
  } catch (error) { /* el polling corregirá cualquier desfase */ }
});

// ============================================================
// 5. FINAL — emojis de ganador + ranking desde la DB
// ============================================================
function renderFinal(sala) {
  mostrarPantalla('final');
  const [j1, j2] = sala.jugadores;

  if (sala.ganador === 'empate') {
    emojiFinal.textContent = '🤝';
    textoFinal.textContent = '¡Empate!';
  } else if (sala.ganador === jugador.nombre) {
    emojiFinal.textContent = '🏆🎉';
    textoFinal.textContent = `¡Ganaste, ${jugador.nombre}!`;
  } else {
    emojiFinal.textContent = '👏';
    textoFinal.textContent = `Ganó ${sala.ganador}`;
  }

  marcadorFinal.textContent = `${j1.nombre} ${j1.puntos} — ${j2.puntos} ${j2.nombre}`;
  cargarRanking();
}

btnRevancha.addEventListener('click', async () => {
  await fetch('/api/sala/reiniciar', { method: 'POST' });
  ultimoEstado = ''; // forzar redibujo
  refrescar();
});

async function cargarRanking() {
  try {
    const respuesta = await fetch('/api/ranking');
    const datos = await respuesta.json();

    if (!datos.ok || datos.ranking.length === 0) {
      ranking.innerHTML = '<li class="historial-vacio">Aún no hay partidas</li>';
      return;
    }

    const medallas = ['🥇', '🥈', '🥉'];
    ranking.innerHTML = datos.ranking.map((r, i) => `
      <li>
        <span class="cartas">${medallas[i] ?? '🎖️'}</span>
        <span class="nombre">${r.nombre}</span>
        <span class="stats">${r.victorias} 🏆 · ${r.partidas} partidas · ${r.pares} pares</span>
      </li>
    `).join('');

  } catch (error) {
    ranking.innerHTML = '<li class="historial-vacio">Error al cargar el ranking</li>';
  }
}
