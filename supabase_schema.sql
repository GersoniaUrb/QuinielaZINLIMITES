-- SCRIPT DE CREACIÓN DE TABLAS EN SUPABASE PARA LA QUINIELA MUNDIAL 2026
-- Ejecuta este script en el editor SQL (SQL Editor) de tu proyecto de Supabase.

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Usuarios de la Quiniela
CREATE TABLE IF NOT EXISTS quiniela_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nickname VARCHAR(50) UNIQUE NOT NULL,      -- Apodo único utilizado para iniciar sesión
    fullname VARCHAR(100) NOT NULL,            -- Nombre completo del participante
    password_hash VARCHAR(64) NOT NULL,        -- Hash SHA-256 de la contraseña
    avatar_url TEXT NOT NULL,                  -- URL de la foto de perfil en Supabase Storage
    approved BOOLEAN DEFAULT FALSE,            -- Estado de aprobación por parte del admin
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Tabla de Predicciones de Partidos (Fase de Grupos)
CREATE TABLE IF NOT EXISTS match_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES quiniela_users(id) ON DELETE CASCADE,
    match_id VARCHAR(10) NOT NULL,             -- ID del partido en el proyecto (ej. "m1")
    home_score INT NOT NULL CHECK (home_score >= 0),
    away_score INT NOT NULL CHECK (away_score >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_user_match UNIQUE (user_id, match_id)
);

-- 3. Tabla de Predicciones de Fases Finales (Llaves)
CREATE TABLE IF NOT EXISTS bracket_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES quiniela_users(id) ON DELETE CASCADE UNIQUE,
    -- Contiene un objeto JSON con las predicciones del bracket:
    -- {
    --   "r16": ["arg", "bra", "esp", ...], -- Los 16 que clasifican a octavos
    --   "qf": ["arg", "bra", ...],         -- Los 8 que clasifican a cuartos
    --   "sf": ["arg", "fra", ...],         -- Los 4 semifinalistas
    --   "finalists": ["arg", "fra"],       -- Los 2 finalistas
    --   "champion": "arg"                  -- El campeón mundial
    -- }
    predictions JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar políticas de seguridad si es necesario.
-- Por simplicidad, desactivamos RLS para desarrollo inicial o configuramos acceso público para lectura/escritura controlado por los endpoints de nuestra API en Vercel.
ALTER TABLE quiniela_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE match_predictions DISABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_predictions DISABLE ROW LEVEL SECURITY;

-- Nota sobre Storage:
-- Debes crear un Bucket de almacenamiento público en Supabase llamado "avatars" para alojar las fotos de perfil.

-- 4. Tabla de Resultados Reales (sincronizada desde API externa)
CREATE TABLE IF NOT EXISTS match_results (
    match_id VARCHAR(10) PRIMARY KEY,   -- ID del partido en nuestro sistema (ej. "m1")
    home_score INT,
    away_score INT,
    status VARCHAR(20) DEFAULT 'scheduled', -- 'scheduled' | 'live' | 'completed'
    api_fixture_id INT,                 -- ID del fixture en API-Football (para debug)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE match_results DISABLE ROW LEVEL SECURITY;
