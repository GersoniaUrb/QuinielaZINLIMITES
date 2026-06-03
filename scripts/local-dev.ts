import http from "http";
import fs from "fs";
import path from "path";
import { URL } from "url";

const PORT = 3000;
const WEBSITE_DIR = path.resolve("website");
const API_DIR = path.resolve("api");

// Mime types para servir archivos estáticos
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || "", `http://${req.headers.host}`);
  const pathname = reqUrl.pathname;

  // 1. Manejar CORS para todas las solicitudes
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // 2. Comprobar si es un endpoint de API (/api/*)
  if (pathname.startsWith("/api/")) {
    console.log(`[API Request] ${req.method} ${pathname}`);
    
    // Obtener la ruta del archivo correspondiente en la carpeta api/
    let apiPath = pathname.substring(5); // Quitar "/api/"
    
    // Manejar rewrites específicos de vercel.json
    if (apiPath === "quiniela/login") apiPath = "quiniela/login";
    else if (apiPath === "quiniela/register") apiPath = "quiniela/register";
    else if (apiPath === "quiniela/get-user-data") apiPath = "quiniela/get-user-data";
    else if (apiPath === "quiniela/submit-scores") apiPath = "quiniela/submit-scores";
    else if (apiPath === "quiniela/submit-bracket") apiPath = "quiniela/submit-bracket";
    else if (apiPath === "quiniela/leaderboard") apiPath = "quiniela/leaderboard";
    else if (apiPath === "quiniela/approve") apiPath = "quiniela/approve";
    else if (apiPath === "quiniela/participants") apiPath = "quiniela/participants";

    
    const tsFilePath = path.join(API_DIR, `${apiPath}.ts`);
    const jsFilePath = path.join(API_DIR, `${apiPath}.js`);

    let targetFilePath = "";
    if (fs.existsSync(tsFilePath)) {
      targetFilePath = tsFilePath;
    } else if (fs.existsSync(jsFilePath)) {
      targetFilePath = jsFilePath;
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `API route not found: ${pathname}` }));
      return;
    }

    // Leer el body de la petición
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        let parsedBody = {};
        if (body) {
          try {
            parsedBody = JSON.parse(body);
          } catch (e) {
            // No es JSON, dejar como vacío o procesar como query
          }
        }

        // Mockear los objetos req y res similares a los de Vercel Node helper
        const vercelReq = req as any;
        vercelReq.body = parsedBody;
        vercelReq.query = Object.fromEntries(reqUrl.searchParams.entries());

        const vercelRes = res as any;
        vercelRes.status = (code: number) => {
          res.statusCode = code;
          return vercelRes;
        };
        vercelRes.json = (data: any) => {
          if (!res.headersSent) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.writeHead(res.statusCode || 200);
          }
          res.end(JSON.stringify(data));
        };
        vercelRes.send = (data: any) => {
          if (!res.headersSent) {
            res.writeHead(res.statusCode || 200);
          }
          res.end(data);
        };

        // Cargar dinámicamente la función serverless
        // En Node con tsx, podemos importar directamente el archivo .ts
        // Agregamos un timestamp para limpiar caché de importación si se edita el archivo
        const moduleUrl = `file://${targetFilePath}?t=${Date.now()}`;
        const { default: handler } = await import(moduleUrl);

        await handler(vercelReq, vercelRes);
      } catch (err: any) {
        console.error(`Error procesando API ${pathname}:`, err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
        }
        res.end(JSON.stringify({ error: "Internal Server Error", details: err.message }));
      }
    });
    return;
  }

  // 3. Servir archivos estáticos del frontend (/website/*)
  console.log(`[Static Request] GET ${pathname}`);
  let filePath = pathname === "/" || pathname === "" ? "/login.html" : pathname;
  
  // Agregar soporte para Clean URLs (ej: /login -> /login.html)
  let fullPath = path.join(WEBSITE_DIR, filePath);
  if (!fs.existsSync(fullPath) && !path.extname(fullPath)) {
    if (fs.existsSync(fullPath + ".html")) {
      fullPath += ".html";
      filePath += ".html";
    }
  }

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    // Si no existe, retornar 404
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h1>404 - Archivo no encontrado</h1><p>El recurso <code>${pathname}</code> no existe en la web.</p>`);
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`⚽ SERVIDOR LOCAL DE LA QUINIELA MUNDIAL 2026 INICIADO`);
  console.log(`👉 Abre en tu navegador: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
