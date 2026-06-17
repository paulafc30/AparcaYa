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
  SC: { n: 'SACABA',              dir: 'Av. Manuel Alvar',          lat: 36.7105,    lng: -4.4545,    cap: 0, vision: true },
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

// ── 3. PATRONES DE OCUPACIÓN POR HORA Y DÍA ──────────────────────────────────
// Generados a partir del dataset histórico simulado (dataset_historico_aparcaya.csv).
// Trabajo de Luisa: análisis de series temporales con pandas/numpy.
//
// Estructura: PATRONES[tipo][hora][diaSemana]
//   → Devuelve un número entre 0 y 1 (% de ocupación esperado)
//
// Días de la semana: 0=domingo, 1=lunes, 2=martes ... 6=sábado
// Horas: 0=medianoche, 12=mediodía, 23=11 de la noche
//
// Ejemplo de lectura:
//   PATRONES['centro'][9][1]  → ocupación esperada a las 9h del lunes → 0.82
//   PATRONES['playa'][12][0]  → ocupación esperada a las 12h del domingo → 0.82
const PATRONES = {

  // Parkings de centro: pico en horas de oficina (9-14h) y tarde-noche (18-21h)
  centro: [
    // h    dom    lun    mar    mié    jue    vie    sáb
    [.10,  .15,   .15,   .15,   .15,   .15,   .10],  // 00h - madrugada tranquila
    [.08,  .10,   .10,   .10,   .10,   .10,   .08],  // 01h
    [.07,  .08,   .08,   .08,   .08,   .08,   .07],  // 02h
    [.06,  .07,   .07,   .07,   .07,   .07,   .06],  // 03h
    [.06,  .07,   .07,   .07,   .07,   .07,   .06],  // 04h
    [.07,  .10,   .10,   .10,   .10,   .10,   .07],  // 05h
    [.10,  .20,   .20,   .20,   .20,   .20,   .12],  // 06h - empieza a despertar
    [.18,  .45,   .45,   .45,   .45,   .45,   .20],  // 07h - hora punta entrada
    [.30,  .65,   .65,   .65,   .65,   .65,   .35],  // 08h
    [.45,  .82,   .82,   .82,   .82,   .82,   .50],  // 09h - pleno rendimiento laboral
    [.58,  .88,   .88,   .88,   .88,   .88,   .65],  // 10h
    [.65,  .90,   .90,   .90,   .90,   .90,   .72],  // 11h
    [.70,  .88,   .88,   .88,   .88,   .88,   .78],  // 12h - mediodía
    [.72,  .80,   .80,   .80,   .80,   .80,   .80],  // 13h
    [.68,  .72,   .72,   .72,   .72,   .72,   .75],  // 14h - baja un poco
    [.65,  .75,   .75,   .75,   .75,   .75,   .72],  // 15h
    [.62,  .82,   .82,   .82,   .82,   .82,   .70],  // 16h - sube de nuevo
    [.68,  .88,   .88,   .88,   .88,   .88,   .75],  // 17h
    [.75,  .85,   .85,   .85,   .85,   .90,   .82],  // 18h - pico tarde (viernes++)
    [.72,  .75,   .75,   .75,   .75,   .88,   .85],  // 19h
    [.65,  .60,   .60,   .60,   .60,   .80,   .80],  // 20h - empieza a bajar
    [.50,  .45,   .45,   .45,   .45,   .65,   .70],  // 21h
    [.35,  .30,   .30,   .30,   .30,   .45,   .55],  // 22h
    [.20,  .18,   .18,   .18,   .18,   .28,   .35],  // 23h
  ],

  // Parkings de hospital: flujo constante todos los días, pico en horario de visitas
  hospital: [
    [.15,  .15,   .15,   .15,   .15,   .15,   .15],  // 00h - guardia nocturna constante
    [.12,  .12,   .12,   .12,   .12,   .12,   .12],  // 01h
    [.10,  .10,   .10,   .10,   .10,   .10,   .10],  // 02h
    [.10,  .10,   .10,   .10,   .10,   .10,   .10],  // 03h
    [.10,  .15,   .15,   .15,   .15,   .15,   .10],  // 04h
    [.12,  .25,   .25,   .25,   .25,   .25,   .12],  // 05h - turno de mañana llega
    [.15,  .45,   .45,   .45,   .45,   .45,   .15],  // 06h
    [.20,  .70,   .70,   .70,   .70,   .70,   .20],  // 07h - entrada masiva trabajadores
    [.25,  .85,   .85,   .85,   .85,   .85,   .25],  // 08h
    [.30,  .88,   .88,   .88,   .88,   .88,   .30],  // 09h - consultas externas
    [.35,  .90,   .90,   .90,   .90,   .90,   .35],  // 10h
    [.40,  .92,   .92,   .92,   .92,   .92,   .40],  // 11h - pico visitas a pacientes
    [.45,  .88,   .88,   .88,   .88,   .88,   .45],  // 12h
    [.40,  .85,   .85,   .85,   .85,   .85,   .40],  // 13h
    [.40,  .82,   .82,   .82,   .82,   .82,   .40],  // 14h - turno tarde entra
    [.38,  .80,   .80,   .80,   .80,   .80,   .38],  // 15h
    [.35,  .78,   .78,   .78,   .78,   .78,   .35],  // 16h
    [.30,  .75,   .75,   .75,   .75,   .75,   .30],  // 17h - visitas de tarde
    [.25,  .65,   .65,   .65,   .65,   .65,   .25],  // 18h
    [.20,  .50,   .50,   .50,   .50,   .50,   .20],  // 19h - empieza a bajar
    [.18,  .38,   .38,   .38,   .38,   .38,   .18],  // 20h
    [.15,  .25,   .25,   .25,   .25,   .25,   .15],  // 21h
    [.15,  .18,   .18,   .18,   .18,   .18,   .15],  // 22h
    [.15,  .15,   .15,   .15,   .15,   .15,   .15],  // 23h
  ],

  // Parkings de playa: pico fuerte en fines de semana y mediodía (verano)
  playa: [
    [.20,  .15,   .15,   .15,   .15,   .15,   .20],  // 00h
    [.15,  .10,   .10,   .10,   .10,   .10,   .15],  // 01h
    [.10,  .08,   .08,   .08,   .08,   .08,   .10],  // 02h
    [.08,  .07,   .07,   .07,   .07,   .07,   .08],  // 03h
    [.08,  .08,   .08,   .08,   .08,   .08,   .08],  // 04h
    [.10,  .12,   .12,   .12,   .12,   .12,   .12],  // 05h - primeros bañistas madrugadores
    [.15,  .20,   .20,   .20,   .20,   .20,   .18],  // 06h
    [.25,  .30,   .30,   .30,   .30,   .30,   .35],  // 07h
    [.40,  .40,   .40,   .40,   .40,   .40,   .60],  // 08h - empieza a llenarse en finde
    [.60,  .45,   .45,   .45,   .45,   .45,   .75],  // 09h
    [.75,  .50,   .50,   .50,   .50,   .50,   .85],  // 10h - lleno los fines de semana
    [.80,  .52,   .52,   .52,   .52,   .52,   .90],  // 11h
    [.82,  .50,   .50,   .50,   .50,   .50,   .88],  // 12h - mediodía: pico máximo en finde
    [.80,  .48,   .48,   .48,   .48,   .48,   .85],  // 13h
    [.78,  .45,   .45,   .45,   .45,   .45,   .82],  // 14h - siesta, algunos se van
    [.75,  .45,   .45,   .45,   .45,   .45,   .80],  // 15h
    [.72,  .48,   .48,   .48,   .48,   .48,   .78],  // 16h - vuelven a la tarde
    [.70,  .50,   .50,   .50,   .50,   .50,   .75],  // 17h
    [.65,  .48,   .48,   .48,   .48,   .48,   .70],  // 18h - puesta de sol
    [.60,  .42,   .42,   .42,   .42,   .42,   .65],  // 19h
    [.50,  .35,   .35,   .35,   .35,   .35,   .55],  // 20h - bajada rápida
    [.40,  .28,   .28,   .28,   .28,   .28,   .45],  // 21h
    [.32,  .22,   .22,   .22,   .22,   .22,   .35],  // 22h
    [.25,  .18,   .18,   .18,   .18,   .18,   .25],  // 23h
  ],

  // Parkings comerciales: pico en horario de tiendas y tarde de compras
  comercial: [
    [.08,  .10,   .10,   .10,   .10,   .10,   .08],  // 00h
    [.05,  .07,   .07,   .07,   .07,   .07,   .05],  // 01h
    [.04,  .05,   .05,   .05,   .05,   .05,   .04],  // 02h
    [.03,  .04,   .04,   .04,   .04,   .04,   .03],  // 03h
    [.03,  .05,   .05,   .05,   .05,   .05,   .03],  // 04h
    [.05,  .10,   .10,   .10,   .10,   .10,   .05],  // 05h
    [.08,  .18,   .18,   .18,   .18,   .18,   .10],  // 06h - apertura de tiendas
    [.12,  .35,   .35,   .35,   .35,   .35,   .15],  // 07h
    [.20,  .50,   .50,   .50,   .50,   .50,   .30],  // 08h
    [.35,  .65,   .65,   .65,   .65,   .65,   .55],  // 09h - mañana de compras
    [.55,  .75,   .75,   .75,   .75,   .75,   .72],  // 10h
    [.65,  .80,   .80,   .80,   .80,   .80,   .80],  // 11h
    [.70,  .78,   .78,   .78,   .78,   .78,   .82],  // 12h
    [.72,  .70,   .70,   .70,   .70,   .70,   .80],  // 13h - cierre mediodía
    [.68,  .68,   .68,   .68,   .68,   .68,   .78],  // 14h
    [.65,  .72,   .72,   .72,   .72,   .72,   .75],  // 15h - reapertura tarde
    [.62,  .78,   .78,   .78,   .78,   .78,   .72],  // 16h
    [.65,  .82,   .82,   .82,   .82,   .82,   .75],  // 17h - pico tarde entre semana
    [.68,  .80,   .80,   .80,   .80,   .80,   .78],  // 18h
    [.65,  .70,   .70,   .70,   .70,   .70,   .75],  // 19h - cierre tiendas
    [.58,  .55,   .55,   .55,   .55,   .55,   .68],  // 20h
    [.45,  .40,   .40,   .40,   .40,   .40,   .55],  // 21h
    [.30,  .25,   .25,   .25,   .25,   .25,   .40],  // 22h
    [.15,  .12,   .12,   .12,   .12,   .12,   .22],  // 23h
  ],
};
