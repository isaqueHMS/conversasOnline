const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Limite geral do socket
const io = new Server(server, {
  maxHttpBufferSize: 1e8 // 100MB
});

// Pasta do front
app.use(express.static("public"));

// Limites por tipo (base64 é maior que o arquivo real)
const FILE_LIMITS = {
  image: 20_000_000, // ~20MB
  audio: 30_000_000, // ~30MB
  video: 50_000_000  // ~50MB
};

io.on("connection", (socket) => {
  console.log("Conectado:", socket.id);

  socket.username = "Anônimo";
  socket.room = null;

  // Entrar em sala
  socket.on("joinRoom", (room) => {
    if (!room || typeof room !== "string") return;

    socket.join(room);
    socket.room = room;

    socket.emit("system", `Você entrou na sala: ${room}`);
    socket.to(room).emit("system", ` ${socket.username} entrou na sala`);
  });

  // Receber mensagens e midias
  socket.on("terminalInput", (payload) => {
    if (!socket.room) return;
    if (!payload || typeof payload !== "object") return;

    // Atualizar nome
    if (payload.username && typeof payload.username === "string") {
      socket.username = payload.username.slice(0, 25);
    }

    // TEXTO
    if (payload.meta === "text") {
      if (!payload.text || typeof payload.text !== "string") return;
      if (payload.text.length > 1000) return;

      io.to(socket.room).emit("broadcastInput", {
        from: socket.id,
        payload: {
          meta: "text",
          text: payload.text,
          username: socket.username
        }
      });
    }

    // MIDIAS
    if (
      payload.meta === "image" ||
      payload.meta === "audio" ||
      payload.meta === "video"
    ) {
      if (!payload.data || typeof payload.data !== "string") return;

      const size = payload.data.length;
      const maxSize = FILE_LIMITS[payload.meta];

      if (size > maxSize) {
        socket.emit("system", `Arquivo muito grande para ${payload.meta}`);
        return;
      }

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

  // Desconectou
  socket.on("disconnect", () => {
    if (socket.room) {
      socket.to(socket.room).emit(
        "system",
        ` ${socket.username} saiu da sala`
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
