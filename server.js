const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 1e8 // até 100MB
});

// Servir a pasta do front
app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("Conectado:", socket.id);

  socket.username = "Anônimo";
  socket.room = null;

  // Entrar em uma sala
  socket.on("joinRoom", (room) => {
    if (!room || typeof room !== "string") return;

    socket.join(room);
    socket.room = room;

    socket.emit("system", `Você entrou na sala: ${room}`);
    socket.to(room).emit("system", `Um usuário entrou: ${socket.username}`);
  });

  // Receber mensagens, imagens e áudio
  socket.on("terminalInput", (payload) => {
    if (!socket.room) return;
    if (!payload || typeof payload !== "object") return;

    // Atualizar nome se vier
    if (payload.username && typeof payload.username === "string") {
      socket.username = payload.username.slice(0, 25);
    }

    // Texto
    if (payload.meta === "text") {
      const text = payload.text;

      if (!text || typeof text !== "string") return;
      if (text.length > 1000) return; // limite de texto

      io.to(socket.room).emit("broadcastInput", {
        from: socket.id,
        payload: {
          meta: "text",
          text: text,
          username: socket.username
        }
      });
    }

    // Imagem ou áudio
    if (payload.meta === "image" || payload.meta === "audio") {
      if (!payload.data) return;

      const dataSize = payload.data.length;

      // Limite ~30MB base64
      if (dataSize > 40_000_000) return;

      io.to(socket.room).emit("broadcastInput", {
        from: socket.id,
        payload: {
          meta: payload.meta,
          data: payload.data,
          username: socket.username
        }
      });
    }
  });

  // Desconexão
  socket.on("disconnect", () => {
    if (socket.room) {
      socket.to(socket.room).emit(
        "system",
        `Usuário ${socket.username} saiu`
      );
    }

    console.log("Desconectado:", socket.id);
  });
});

// Porta
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor rodando em http://localhost:" + PORT);
});
