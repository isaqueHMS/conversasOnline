const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8 // permite arquivos maiores
});

// Servir frontend
app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("Conectado:", socket.id);

  // Entrar numa sala
  socket.on("join", (room) => {
    socket.join(room);
    socket.room = room;

    socket.emit("message", `Você entrou na sala: ${room}`);
    socket.to(room).emit("message", `Usuário ${socket.id} entrou.`);
  });

  // Mensagem de texto
  socket.on("message", (msg) => {
    if (!socket.room) return;

    if (typeof msg !== "string") return;
    if (msg.length > 2000) return;

    io.to(socket.room).emit("message", msg);
  });

  // Receber arquivos (imagem ou áudio)
  socket.on("file", (file) => {
    if (!socket.room) return;

    if (!file || !file.type || !file.data) return;

    const allowedTypes = ["image", "audio"];
    if (!allowedTypes.includes(file.type)) return;

    // Evitar arquivos absurdos (30MB)
    if (file.data.length > 40_000_000) return;

    io.to(socket.room).emit("file", file);
  });

  socket.on("disconnect", () => {
    if (socket.room) {
      socket.to(socket.room).emit(
        "message",
        `Usuário ${socket.id} saiu.`
      );
    }
    console.log("Desconectado:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Servidor rodando na porta " + PORT));
