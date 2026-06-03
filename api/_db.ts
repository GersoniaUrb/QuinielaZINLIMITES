import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Declarar la variable de cliente de Supabase
let supabaseClient: any;

const useMockDb = !supabaseUrl || !supabaseServiceRoleKey;

if (useMockDb) {
  console.warn("⚠️ SUPABASE CONFIG MISSING: Usando base de datos simulada local (quiniela_db.json).");
  supabaseClient = createMockSupabaseClient();
} else {
  supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false
    }
  });
}

export const supabase = supabaseClient;

// Helper para hashear contraseñas usando SHA-256
export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Genera un token de aprobación seguro para el administrador
export function generateAdminToken(nickname: string): string {
  const secret = process.env.ADMIN_SECRET_KEY || "fallback_secret_key_wc26_quiniela";
  return crypto
    .createHash("sha256")
    .update(nickname + secret)
    .digest("hex");
}

// Verifica si el token de aprobación proporcionado es válido
export function verifyAdminToken(nickname: string, token: string): boolean {
  const expectedToken = generateAdminToken(nickname);
  return token === expectedToken;
}

// --- IMPLEMENTACIÓN DEL MOCK SUPABASE CLIENT ---

interface DbData {
  quiniela_users: any[];
  match_predictions: any[];
  bracket_predictions: any[];
  match_results: any[];
}

const DB_FILE = path.resolve("quiniela_db.json");
const UPLOADS_DIR = path.resolve("website", "uploads");

function getDb(): DbData {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify({ quiniela_users: [], match_predictions: [], bracket_predictions: [], match_results: [] }, null, 2)
    );
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (e) {
    return { quiniela_users: [], match_predictions: [], bracket_predictions: [], match_results: [] };
  }
}

function saveDb(data: DbData) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function createMockSupabaseClient() {
  return {
    from(tableName: string) {
      return {
        _filters: [] as any[],
        _selectFields: "*",
        _insertData: null as any,
        _updateData: null as any,
        _upsertData: null as any,
        _upsertOptions: null as any,
        _action: "select",

        select(fields: string = "*") {
          this._selectFields = fields;
          return this;
        },
        insert(data: any) {
          this._insertData = data;
          this._action = "insert";
          return this;
        },
        update(data: any) {
          this._updateData = data;
          this._action = "update";
          return this;
        },
        upsert(data: any, options?: { onConflict: string }) {
          this._upsertData = data;
          this._upsertOptions = options;
          this._action = "upsert";
          return this;
        },
        eq(column: string, value: any) {
          this._filters.push({ column, value });
          return this;
        },
        // Métodos de resolución de consultas (deben ser async)
        async maybeSingle() {
          const res = await this._execute();
          if (res.error) return { data: null, error: res.error };
          return { data: res.data.length > 0 ? res.data[0] : null, error: null };
        },
        async single() {
          const res = await this._execute();
          if (res.error) return { data: null, error: res.error };
          if (res.data.length === 0) return { data: null, error: new Error("No rows found") };
          return { data: res.data[0], error: null };
        },
        // Para soportar el patrón await supabase.from(...) que resuelve como una promesa de lista
        then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
          return this._execute().then(onfulfilled, onrejected);
        },
        // Método de ejecución interno
        async _execute() {
          const db = getDb();
          let table = (db as any)[tableName];
          if (!table) {
            return { data: null, error: { message: `Table ${tableName} not found in mock DB` } };
          }

          // Filtrar si hay filtros
          let filtered = [...table];
          if (this._filters && this._filters.length > 0) {
            for (const filter of this._filters) {
              filtered = filtered.filter((row) => {
                const rowValue = row[filter.column];
                if (typeof rowValue === "string" && typeof filter.value === "string") {
                  return rowValue.toLowerCase() === filter.value.toLowerCase();
                }
                return rowValue === filter.value;
              });
            }
          }

          // Manejar inserción
          if (this._action === "insert") {
            const dataToInsert = Array.isArray(this._insertData) ? this._insertData : [this._insertData];
            const insertedRows = dataToInsert.map((row) => {
              const newRow = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
              table.push(newRow);
              return newRow;
            });
            saveDb(db);
            return { data: insertedRows, error: null };
          }

          // Manejar actualización
          if (this._action === "update") {
            // Actualizar todas las filas filtradas
            table.forEach((row, index) => {
              const matchesFilters = (this._filters || []).every((filter: any) => {
                const rowValue = row[filter.column];
                if (typeof rowValue === "string" && typeof filter.value === "string") {
                  return rowValue.toLowerCase() === filter.value.toLowerCase();
                }
                return rowValue === filter.value;
              });
              if (matchesFilters) {
                table[index] = { ...row, ...this._updateData };
              }
            });
            saveDb(db);
            return { data: this._updateData, error: null };
          }

          // Manejar upsert
          if (this._action === "upsert") {
            const dataToUpsert = Array.isArray(this._upsertData) ? this._upsertData : [this._upsertData];
            const onConflictCols = (this._upsertOptions?.onConflict || "").split(",").map((c: string) => c.trim());

            dataToUpsert.forEach((row) => {
              // Buscar coincidencia en onConflict
              const matchIndex = table.findIndex((r: any) => {
                if (onConflictCols.length === 0) return false;
                return onConflictCols.every((col) => r[col] === row[col]);
              });

              if (matchIndex > -1) {
                table[matchIndex] = { ...table[matchIndex], ...row, updated_at: new Date().toISOString() };
              } else {
                table.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row });
              }
            });
            saveDb(db);
            return { data: dataToUpsert, error: null };
          }

          // Si es un select, proyectar campos si no es "*"
          if (this._selectFields && this._selectFields !== "*") {
            // Soporta campos separados por coma, ej: "id, nickname, fullname"
            const fields = this._selectFields.split(",").map((f: string) => f.trim());
            filtered = filtered.map((row) => {
              const projected: any = {};
              fields.forEach((f: string) => {
                projected[f] = row[f];
              });
              return projected;
            });
          }

          return { data: filtered, error: null };
        }
      };
    },
    storage: {
      from(bucketName: string) {
        return {
          async upload(fileName: string, buffer: Buffer, options?: any) {
            try {
              if (!fs.existsSync(UPLOADS_DIR)) {
                fs.mkdirSync(UPLOADS_DIR, { recursive: true });
              }
              const filePath = path.join(UPLOADS_DIR, fileName);
              fs.writeFileSync(filePath, buffer);
              return { data: { path: fileName }, error: null };
            } catch (err: any) {
              return { data: null, error: err };
            }
          },
          getPublicUrl(fileName: string) {
            // Retorna una URL relativa que sirva localmente
            return { data: { publicUrl: `/uploads/${fileName}` } };
          }
        };
      }
    }
  };
}
