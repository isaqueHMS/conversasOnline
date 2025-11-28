// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve arquivos estáticos (caso queira servir o frontend do mesmo servidor)
app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("conectado:", socket.id);

  // entrar numa sala
  socket.on("joinRoom", (room) => {
    socket.join(room);
    socket.room = room;
    socket.to(room).emit("system", `${socket.id} entrou na sala.`);
  });

  // mensagem/tecla vinda do cliente
  socket.on("terminalInput", (payload) => {
    // payload: { text, cursor, meta }
    // Aqui você pode validar, aplicar regras e depois broadcast
    const room = socket.room;
    if (!room) return;
    // exemplo de validação simples: tamanho
    if (typeof payload.text !== "string" || payload.text.length > 1000) return;
    io.to(room).emit("broadcastInput", { from: socket.id, payload });
  });

  socket.on("disconnect", () => {
    const room = socket.room;
    if (room) socket.to(room).emit("system", `${socket.id} saiu.`);
    console.log("desconectado:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server rodando na porta ${PORT}`));
