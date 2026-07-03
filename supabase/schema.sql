-- ─────────────────────────────────────────────────────────────────────────────
-- AparcaYa · Supabase Schema
-- Ejecutar en el SQL Editor de Supabase (app.supabase.com → tu proyecto → SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────

-- Tabla principal: snapshot cada 5 minutos de todos los parkings
CREATE TABLE IF NOT EXISTS parking_estado (
  id           BIGSERIAL    PRIMARY KEY,
  ts           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  parking_id   TEXT         NOT NULL,          -- CE, MA, CA, PA, AN, TE, AL, SJ, CY, PB
  parking_nombre TEXT       NOT NULL,
  libres       INTEGER      NOT NULL,
  ocupados     INTEGER      NOT NULL,
  capacidad    INTEGER      NOT NULL,
  pct_ocupacion NUMERIC(5,4) NOT NULL,         -- 0.0000 – 1.0000
  estado       TEXT         NOT NULL,          -- LIBRE | DISPONIBLE | LLENO
  tendencia    INTEGER      NOT NULL DEFAULT 0 -- -1 baja | 0 estable | 1 sube
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_parking_estado_ts         ON parking_estado (ts DESC);
CREATE INDEX IF NOT EXISTS idx_parking_estado_parking_id ON parking_estado (parking_id, ts DESC);

-- Vista: último estado de cada parking (para el frontend)
CREATE OR REPLACE VIEW parking_ultimo AS
SELECT DISTINCT ON (parking_id)
  parking_id,
  parking_nombre,
  libres,
  ocupados,
  capacidad,
  pct_ocupacion,
  estado,
  tendencia,
  ts
FROM parking_estado
ORDER BY parking_id, ts DESC;

-- Política de acceso: lectura pública (anon key puede SELECT)
ALTER TABLE parking_estado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública" ON parking_estado
  FOR SELECT USING (true);

-- Solo el service_role puede INSERT (usado por el GitHub Action / Python)
CREATE POLICY "Escritura service role" ON parking_estado
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla de histórico compactado (opcional, para análisis de Luisa en Python)
-- Se puede llenar con una función pg_cron o desde el ingesta.py
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parking_historico (
  id           BIGSERIAL    PRIMARY KEY,
  fecha        DATE         NOT NULL,
  hora         SMALLINT     NOT NULL,          -- 0-23
  dia_semana   SMALLINT     NOT NULL,          -- 0=domingo … 6=sábado
  es_fin_semana BOOLEAN     NOT NULL,
  parking_id   TEXT         NOT NULL,
  libres_avg   NUMERIC(6,1) NOT NULL,
  pct_avg      NUMERIC(5,4) NOT NULL,
  n_muestras   SMALLINT     NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_historico_parking_dia
  ON parking_historico (parking_id, dia_semana, hora);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla de predicciones ML (generadas por predict.py cada 5 min)
-- El frontend las lee desde prediccion.js para mostrar la predicción de IA.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parking_predicciones (
  id               BIGSERIAL    PRIMARY KEY,
  ts               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),  -- cuándo se generó
  parking_id       TEXT         NOT NULL,                -- CE, MA, CA...
  horizonte_horas  SMALLINT     NOT NULL,                -- 1, 2 ó 3 horas
  libres_previstas INTEGER      NOT NULL,                -- plazas libres predichas
  pct_prevista     NUMERIC(5,4) NOT NULL,                -- % ocupación predicha
  estado_previsto  TEXT         NOT NULL,                -- LIBRE | DISPONIBLE | LLENO
  hora_prediccion  SMALLINT     NOT NULL,                -- hora del día objetivo (0-23)
  confianza        TEXT         NOT NULL DEFAULT 'media', -- alta | media | baja (según R²)
  modelo_r2        NUMERIC(6,4) NOT NULL DEFAULT 0       -- R² del modelo usado
);

-- Índices: el frontend siempre pide las predicciones más recientes por parking
CREATE INDEX IF NOT EXISTS idx_predicciones_ts
  ON parking_predicciones (ts DESC);
CREATE INDEX IF NOT EXISTS idx_predicciones_parking_horizonte
  ON parking_predicciones (parking_id, horizonte_horas, ts DESC);

-- Vista: última predicción disponible por parking y horizonte
CREATE OR REPLACE VIEW parking_prediccion_ultima AS
SELECT DISTINCT ON (parking_id, horizonte_horas)
  parking_id,
  horizonte_horas,
  libres_previstas,
  pct_prevista,
  estado_previsto,
  hora_prediccion,
  confianza,
  modelo_r2,
  ts
FROM parking_predicciones
ORDER BY parking_id, horizonte_horas, ts DESC;

-- RLS: lectura pública, escritura solo service_role
ALTER TABLE parking_predicciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública predicciones" ON parking_predicciones
  FOR SELECT USING (true);

CREATE POLICY "Escritura service role predicciones" ON parking_predicciones
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla de historial de usuario (parkings consultados)
-- Requiere Supabase Auth activo en el proyecto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_historial (
  id             BIGSERIAL    PRIMARY KEY,
  user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parking_id     TEXT         NOT NULL,
  parking_nombre TEXT         NOT NULL,
  estado         TEXT,                    -- LIBRE | DISPONIBLE | LLENO en el momento
  pct_ocupacion  NUMERIC(5,4),            -- % ocupación en el momento de la consulta
  libres         INTEGER,
  ts             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_user_ts
  ON user_historial (user_id, ts DESC);

-- RLS: cada usuario solo ve y gestiona su propio historial
ALTER TABLE user_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve su historial" ON user_historial
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuario inserta en su historial" ON user_historial
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuario borra su historial" ON user_historial
  FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla de perfil de usuario (nombre para mostrar)
-- Se rellena automáticamente en el registro desde el frontend.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_perfil (
  user_id        UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre         TEXT         NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE user_perfil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve su perfil" ON user_perfil
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuario actualiza su perfil" ON user_perfil
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Función RPC: eliminar cuenta propia (RGPD)
-- user_historial y user_perfil se borran en cascada por la FK ON DELETE CASCADE.
-- Llamar desde el frontend: supabase.rpc('delete_my_account')
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Las tablas user_historial y user_perfil se borran automáticamente en cascada.
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Solo el usuario autenticado puede llamar a esta función
REVOKE ALL ON FUNCTION delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
