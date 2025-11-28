const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 1e8 // 100MB
});

app.use(express.static("public"));

// =================== CONFIG ===================
const FILE_LIMITS = {
  image: 20_000_000,
  audio: 30_000_000,
  video: 50_000_000
};

// =================== SISTEMA DE CLÃS ===================
const clans = {}; 
// Estrutura:
// clans = {
//   nomeClan: {
//     owner: socket.id,
//     members: [socket.id]
//   }
// }

function getClanOfUser(socketId) {
  for (let clanName in clans) {
    if (clans[clanName].members.includes(socketId)) {
      return clanName;
    }
  }
  return null;
}

// =================== SOCKET ===================
io.on("connection", (socket) => {
  console.log("Conectado:", socket.id);

  socket.username = "Anônimo";
  socket.room = null;

  // =================== SALAS ===================
  socket.on("joinRoom", (room) => {
    if (!room || typeof room !== "string") return;

    socket.join(room);
    socket.room = room;

    socket.emit("system", `Você entrou na sala: ${room}`);
    socket.to(room).emit("system", `${socket.username} entrou na sala`);
  });

  // =================== SISTEMA DE CLÃS ===================
  socket.on("createClan", (clanName) => {
    if (!clanName) return;

    if (clans[clanName]) {
      socket.emit("clanInfo", "Esse clã já existe.");
      return;
    }

    clans[clanName] = {
      owner: socket.id,
      members: [socket.id]
    };

    socket.emit("clanInfo", `Clã "${clanName}" criado com sucesso!`);
  });

  socket.on("joinClan", (clanName) => {
    if (!clans[clanName]) {
      socket.emit("clanInfo", "Esse clã não existe.");
      return;
    }

    const currentClan = getClanOfUser(socket.id);
    if (currentClan) {
      socket.emit("clanInfo", `Você já está no clã ${currentClan}. Saia primeiro.`);
      return;
    }

    clans[clanName].members.push(socket.id);
    socket.emit("clanInfo", `Você entrou no clã ${clanName}.`);
  });

  socket.on("leaveClan", () => {
    const clanName = getClanOfUser(socket.id);

    if (!clanName) {
      socket.emit("clanInfo", "Você não está em nenhum clã.");
      return;
    }

    const clan = clans[clanName];
    clan.members = clan.members.filter(id => id !== socket.id);

    socket.emit("clanInfo", `Você saiu do clã ${clanName}.`);

    // Se o clã ficar vazio, apaga
    if (clan.members.length === 0) {
      delete clans[clanName];
      console.log("Clã removido:", clanName);
    }
  });

  socket.on("requestClans", () => {
    socket.emit("clanList", clans);
  });

  socket.on("myClan", () => {
    const clan = getClanOfUser(socket.id);

    if (!clan) {
      socket.emit("clanInfo", "Você não está em nenhum clã.");
      return;
    }

    const membersCount = clans[clan].members.length;
    socket.emit("clanInfo", `Seu clã: ${clan} (${membersCount} membros)`);
  });

  // =================== CHAT E MIDIA ===================
  socket.on("terminalInput", (payload) => {
    if (!socket.room) return;
    if (!payload || typeof payload !== "object") return;

    if (payload.username && typeof payload.username === "string") {
      socket.username = payload.username.slice(0, 25);
    }

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

    if (["image", "audio", "video"].includes(payload.meta)) {
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

  // =================== DISCONNECT ===================
  socket.on("disconnect", () => {
    const clanName = getClanOfUser(socket.id);

    if (clanName) {
      clans[clanName].members = clans[clanName].members.filter(id => id !== socket.id);

      if (clans[clanName].members.length === 0) {
        delete clans[clanName];
        console.log("Clã removido:", clanName);
      }
    }

    if (socket.room) {
      socket.to(socket.room).emit("system", `${socket.username} saiu da sala`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor rodando em http://localhost:" + PORT);
});
