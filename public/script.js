// ============================================================
// script.js v2 — corre en el NAVEGADOR
// Flujo: login → tablero barajado → volteo por pares →
//        guardar par en DB → refrescar historial desde la DB
// ============================================================

// ---------- Estado del juego ----------
const CARTAS_BASE = ['🍎', '🍌', '🍇', '🍓'];   // 4 figuras → 8 cartas (pares)
let jugador = null;          // { id, nombre } que devuelva el servidor
let seleccionadas = [];      // las cartas volteadas ahora mismo (máx 2)
let bloqueado = false;       // true mientras se resuelve un par (evita clics extra)

// ---------- Referencias al DOM ----------
const pantallaLogin = document.getElementById('pantalla-login');
const pantallaJuego = document.getElementById('pantalla-juego');
const inputNombre   = document.getElementById('input-nombre');
const btnJugar      = document.getElementById('btn-jugar');
const nombreJugador = document.getElementById('nombre-jugador');
const tablero       = document.getElementById('tablero');
const historial     = document.getElementById('historial');

// ============================================================
// 1. LOGIN
// ============================================================
btnJugar.addEventListener('click', entrar);
inputNombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });

async function entrar() {
  const nombre = inputNombre.value.trim();
  if (!nombre) { inputNombre.focus(); return; }

  try {
    // Registramos (o recuperamos) al jugador en la tabla jugadores.
    // El servidor nos devuelve su fila, incluyendo el id — ese
    // número es lo que usaremos para firmar cada movimiento.
    const respuesta = await fetch('/api/jugador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre })
    });
    const datos = await respuesta.json();
    if (!datos.ok) { alert(datos.mensaje); return; }

    jugador = datos.jugador;
    nombreJugador.textContent = jugador.nombre;

    // Cambio de pantalla: ocultar login, mostrar juego
    pantallaLogin.classList.add('oculto');
    pantallaJuego.classList.remove('oculto');

    construirTablero();
    cargarHistorial();

  } catch (error) {
    alert('No pude hablar con el servidor. ¿Está corriendo?');
  }
}

// ============================================================
// 2. CONSTRUIR EL TABLERO (barajado)
// ============================================================
function construirTablero() {
  // Duplicar las figuras (pares) y barajar.
  // sort con Math.random() es el barajado más simple que existe:
  // suficiente para este juego.
  const mazo = [...CARTAS_BASE, ...CARTAS_BASE].sort(() => Math.random() - 0.5);

  tablero.innerHTML = '';
  for (const figura of mazo) {
    const carta = document.createElement('button');
    carta.className = 'carta';
    carta.dataset.carta = figura;  // la figura vive escondida en el atributo
    carta.textContent = '❓';      // lo que se VE: la carta tapada
    tablero.appendChild(carta);
  }
}

// Un solo listener para todo el tablero (delegación, como en v1)
tablero.addEventListener('click', (evento) => {
  const carta = evento.target.closest('.carta');
  if (!carta) return;
  if (bloqueado) return;                              // hay un par resolviéndose
  if (carta.classList.contains('volteada')) return;   // ya está volteada
  if (carta.classList.contains('acertada')) return;   // ya se emparejó antes

  voltear(carta);
});

function voltear(carta) {
  carta.textContent = carta.dataset.carta;  // revelar la figura
  carta.classList.add('volteada');
  seleccionadas.push(carta);

  // ¿Ya hay dos? → resolver el par
  if (seleccionadas.length === 2) resolverPar();
}

// ============================================================
// 3. RESOLVER EL PAR → aquí (y SOLO aquí) hablamos con la DB
// ============================================================
async function resolverPar() {
  bloqueado = true;
  const [c1, c2] = seleccionadas;
  const acierto = c1.dataset.carta === c2.dataset.carta;

  // Guardar el par en PostgreSQL vía nuestro Express
  try {
    await fetch('/api/movimiento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jugador_id: jugador.id,       // el número, no el nombre
        carta1: c1.dataset.carta,
        carta2: c2.dataset.carta,
        acierto: acierto
      })
    });
  } catch (error) {
    console.error('No se pudo guardar el movimiento:', error);
  }

  if (acierto) {
    // Par encontrado: se quedan reveladas para siempre
    c1.classList.replace('volteada', 'acertada');
    c2.classList.replace('volteada', 'acertada');
    finalizarTurno();
  } else {
    // Fallo: se muestran un momento y se vuelven a tapar
    setTimeout(() => {
      for (const c of [c1, c2]) {
        c.textContent = '❓';
        c.classList.remove('volteada');
      }
      finalizarTurno();
    }, 900);
  }
}

function finalizarTurno() {
  seleccionadas = [];
  bloqueado = false;
  cargarHistorial();  // refrescar la lista con el par recién guardado

  // ¿Se acabaron las cartas? → nueva partida automática
  const quedan = tablero.querySelectorAll('.carta:not(.acertada)').length;
  if (quedan === 0) setTimeout(construirTablero, 1500);
}

// ============================================================
// 4. HISTORIAL — leer la DB y pintarla
// Este es tu "llamar la info de esa base de datos":
// GET al endpoint → JSON con filas → HTML
// ============================================================
async function cargarHistorial() {
  try {
    const respuesta = await fetch('/api/movimientos');
    const datos = await respuesta.json();

    if (!datos.ok || datos.movimientos.length === 0) {
      historial.innerHTML = '<li class="historial-vacio">Aún no hay movimientos</li>';
      return;
    }

    // Convertir cada fila de Postgres en un <li>.
    // map = transformar cada elemento; join('') = unir todo en un solo texto.
    historial.innerHTML = datos.movimientos.map(m => `
      <li>
        <span class="nombre">${m.nombre}</span>
        <span class="cartas">${m.carta1} ${m.carta2}</span>
        <span class="${m.acierto ? 'resultado-ok' : 'resultado-no'}">
          ${m.acierto ? '✔ par' : '✘ fallo'}
        </span>
      </li>
    `).join('');

  } catch (error) {
    historial.innerHTML = '<li class="historial-vacio">Error al cargar el historial</li>';
  }
}
