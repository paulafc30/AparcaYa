/**
 * catalogo.js
 * ============
 * Datos estáticos del proyecto: qué parkings existen, dónde están y cómo
 * se comportan a lo largo del día.
 *
 * Este archivo NO hace llamadas a internet ni modifica la pantalla.
 * Solo define constantes que usan el resto de módulos.
 *
 * Módulos que dependen de este archivo:
 *   - prediccion.js  → usa TIPO y PATRONES para calcular la predicción
 *   - mapa.js        → usa CAT para colocar los marcadores en el mapa
 *   - chatbot.js     → usa CAT para mostrar nombre y dirección al recomendar
 *   - datos.js       → usa CAT para calcular plazas libres y % ocupación
 */

// ── 1. CATÁLOGO DE APARCAMIENTOS ─────────────────────────────────────────────
// Cada clave es el ID corto que usamos en todo el proyecto (CE, MA, AL...).
// lat/lng son las coordenadas GPS para el mapa (Leaflet).
// cap = plazas de ROTACIÓN según SMASSA (smassa.eu) — dato oficial verificado.
// Fuente: catálogo oficial Ayuntamiento de Málaga (datos abiertos, junio 2026)
// Coordenadas verificadas contra el CSV oficial ocupappublicosmun/catalogo.csv
const CAT = {
  CE: { n: 'Cervantes',           dir: 'C/ Cervantes',             lat: 36.7209,    lng: -4.4119,   cap: 409 },
  MA: { n: 'Pz. de la Marina',    dir: 'Plaza de la Marina',       lat: 36.7176,    lng: -4.4200,   cap: 450 },
  CA: { n: 'Camas',               dir: 'C/ Camas',                 lat: 36.7202,    lng: -4.4245,   cap: 350 },
  PA: { n: 'El Palo',             dir: 'C/ Alonso Carrillo',       lat: 36.7210,    lng: -4.3607,   cap: 127 },
  AN: { n: 'Av. de Andalucía',    dir: 'Av. de Andalucía',         lat: 36.7173,    lng: -4.4277,   cap: 613 },
  TE: { n: 'Tejón y Rodríguez',   dir: 'C/ Tejón y Rodríguez',    lat: 36.7236,    lng: -4.4215,   cap: 187 },
  AL: { n: 'Alcazaba',            dir: 'C/ Alcazabilla',           lat: 36.7224,    lng: -4.4165,   cap: 378 },
  SJ: { n: 'San Juan de la Cruz', dir: 'C/ Lemberg Ruiz',          lat: 36.7179,    lng: -4.4333,   cap: 624 },
  CY: { n: 'Carlos Haya',         dir: 'Av. Santa Rosa de Lima',   lat: 36.7119,    lng: -4.4410,   cap: 439 },
  PB: { n: 'Pío Baroja',          dir: 'Av. Pío Baroja - El Palo', lat: 36.7190,    lng: -4.3648,   cap: 261 },  
  SA: { n: 'Salitre',             dir: 'C/ Salitre',               lat: 36.7136,    lng: -4.42626,   cap: 435 },
  // SC = SACABA — aparcamiento en vía pública monitorizado por cámara TV16
  // Fuente: Ayuntamiento de Málaga, cámara TV16-SACABA (movilidad.malaga.eu, distrito 7)
  // cap: determinado por marcador_plazas.py al marcar las plazas visibles en cámara
  // ⚠️ coords aproximadas — verificar en https://movilidad.malaga.eu/es/servicios/camaras-de-trafico/distrito-7/tv-16/
  SC: { n: 'SACABA',              dir: 'Av. Manuel Alvar',          lat: 36.6803,    lng: -4.4485,    cap: 0, vision: true,
        camara: 'https://ctraficomovilidad.malaga.eu/recursos/movilidad/camaras_trafico/TV-16.jpg' },
};

// ── 2. TIPO DE PARKING ────────────────────────────────────────────────────────
// Clasificamos cada parking según su contexto principal.
// Esto determina qué patrón de ocupación se le aplica en la predicción.
// Valores posibles: 'centro', 'hospital', 'playa', 'comercial'
const TIPO = {
  CE: 'centro',    // Zona peatonal y turística
  MA: 'centro',    // Puerto y paseo marítimo
  AL: 'centro',    // Alcazaba, Catedral, museos
  TE: 'centro',    // Barrio histórico
  SA: 'centro',    // Vialia
  CY: 'hospital',  // Hospital Virgen de la Victoria (Carlos Haya)
  PA: 'playa',     // El Palo, playa este
  PB: 'playa',     // Pedregalejo / Pío Baroja
  AN: 'comercial', // El Corte Inglés, zona oeste
  SJ: 'comercial', // Universidad, Vialia, estación tren
  CA: 'comercial', // SoHo, CAC, zona Perchel
  SC: 'comercial', // Av. Manuel Alvar, barrio Sacaba (Carranque) — visión artificial
};

// PATRONES eliminados — la app solo muestra datos reales (Supabase/CSV).
// Si no hay datos reales disponibles, se muestra error. Sin simulación.
