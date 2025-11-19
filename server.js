// server.js
const express = require("express");
const app = express();

// ===== Middlewares globales ===== //

// CORS sencillo para permitir peticiones desde frontends externos
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,PUT,POST,DELETE,OPTIONS,PATCH"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Para parsear JSON en el body
app.use(express.json());

// ===== Rutas ===== //

const usersRoute = require("./routes/users");
const sitesRoute = require("./routes/sites");
const resenasRoute = require("./routes/resenas");
const chatRoute = require("./routes/chat");

// Endpoint raíz de prueba / healthcheck
app.get("/", (req, res) => {
  res.send("<h1>Huila_app backend funcionando 🚀</h1>");
});

// Montar rutas principales
app.use("/users", usersRoute);
app.use("/sites", sitesRoute);
app.use("/resenas", resenasRoute);
app.use("/chat", chatRoute);

// Middleware de manejo básico de errores (por si algo lanza next(err))
app.use((err, req, res, next) => {
  console.error("Error en el servidor:", err);
  res
    .status(err.status || 500)
    .json({ error: err.message || "Error interno del servidor" });
});

// ===== Inicio del servidor ===== //

// Render asigna el puerto en process.env.PORT
const PORT = process.env.PORT || 3000;

// '0.0.0.0' permite aceptar conexiones externas (necesario en Render)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
