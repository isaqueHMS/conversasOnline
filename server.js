const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 1e8
});

app.use(express.static("public"));

// =================== CONFIG ===================
const FILE_LIMITS = {
  image: 20_000_000,
  audio: 30_000_000,
  video: 50_000_000
};

// =================== ADMIN ===================
const ADMIN_PASSWORD = "isaquinho";
const admins = new Set();
const bannedUsers = new Set();
const blockedUsers = new Set();

// =================== SISTEMA DE CLÃS ===================
const clans = {};

function getClanOfUser(socketId) {
  for (let clanName in clans) {
    if (clans[clanName].members.includes(socketId)) {
      return clanName;
    }
  }
  return null;
}

function getSocketByUsername(username) {
  for (let [id, socket] of io.of("/").sockets) {
    if (socket.username === username) {
      return socket;
    }
  }
  return null;
}

// =================== SOCKET ===================
io.on("connection", (socket) => {
  console.log("Conectado:", socket.id);

  socket.username = "Anônimo";
  socket.room = null;
  socket.isAdmin = false;

  // =================== SALAS ===================
  socket.on("joinRoom", (room) => {
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

    socket.emit("clanInfo", `Clã "${clanName}" criado!`);
  });

  socket.on("joinClan", (clanName) => {
    if (!clans[clanName]) {
      socket.emit("clanInfo", "Esse clã não existe.");
      return;
    }

    const currentClan = getClanOfUser(socket.id);
    if (currentClan) {
      socket.emit("clanInfo", `Você já está no clã ${currentClan}.`);
      return;
    }

    clans[clanName].members.push(socket.id);
    socket.emit("clanInfo", `Você entrou no clã ${clanName}.`);
  });

  socket.on("leaveClan", () => {
    const clanName = getClanOfUser(socket.id);
    if (!clanName) return;

    clans[clanName].members =
      clans[clanName].members.filter(id => id !== socket.id);

    if (clans[clanName].members.length === 0) {
      delete clans[clanName];
    }

    socket.emit("clanInfo", `Você saiu do clã ${clanName}`);
  });

  // =================== CHAT + COMANDOS ===================
  socket.on("terminalInput", (payload) => {
    if (!socket.room) return;
    if (!payload || payload.meta !== "text") return;

    const msg = payload.text.trim();

    if (payload.username) {
      socket.username = payload.username.slice(0, 25);
    }

    // =================== SISTEMA DE BAN ===================
    if (bannedUsers.has(socket.username)) {
      socket.emit("system", "Você foi banido do chat.");
      return;
    }

    if (blockedUsers.has(socket.username)) {
      socket.emit("system", "Você está mutado.");
      return;
    }

    // =================== COMANDOS ===================
    if (msg.startsWith("/")) {
      const args = msg.split(" ");
      const command = args[0].toLowerCase();

      // VIRAR ADMIN
      if (command === "/admin") {
        if (args[1] === ADMIN_PASSWORD) {
          socket.isAdmin = true;
          admins.add(socket.username);
          socket.emit("system", "Você agora é ADMIN.");
        } else {
          socket.emit("system", "Senha incorreta.");
        }
        return;
      }

      if (!socket.isAdmin) {
        socket.emit("system", "Você não é admin.");
        return;
      }

      // BAN
      if (command === "/ban") {
        const targetName = args[1];
        bannedUsers.add(targetName);

        const targetSocket = getSocketByUsername(targetName);
        if (targetSocket) {
          targetSocket.emit("system", "Você foi banido do chat.");
        }

        io.to(socket.room).emit("system", `${targetName} foi banido.`);
        return;
      }

      // BLOCK (mute)
      if (command === "/block") {
        const targetName = args[1];
        blockedUsers.add(targetName);

        const targetSocket = getSocketByUsername(targetName);
        if (targetSocket) targetSocket.emit("system", "Você foi mutado.");

        io.to(socket.room).emit("system", `${targetName} foi mutado.`);
        return;
      }

      // UNBLOCK
      if (command === "/unblock") {
        const targetName = args[1];
        blockedUsers.delete(targetName);
        io.to(socket.room).emit("system", `${targetName} foi desmutado.`);
        return;
      }

      // KICK
      if (command === "/kick") {
        const targetName = args[1];
        const targetSocket = getSocketByUsername(targetName);

        if (targetSocket && targetSocket.room) {
          targetSocket.leave(targetSocket.room);
          targetSocket.emit("system", "Você foi expulso da sala.");
        }

        io.to(socket.room).emit("system", `${targetName} foi expulso.`);
        return;
      }

      // LISTA DE ADMINS
      if (command === "/admins") {
        socket.emit("system", "Admins: " + [...admins].join(", "));
        return;
      }

      return;
    }

    // =================== ENVIA MENSAGEM NORMAL ===================
    io.to(socket.room).emit("broadcastInput", {
      from: socket.id,
      payload: {
        meta: "text",
        text: msg,
        username: socket.username,
        admin: socket.isAdmin
      }
    });
  });

  // =================== DISCONNECT ===================
  socket.on("disconnect", () => {
    const clanName = getClanOfUser(socket.id);
    if (clanName) {
      clans[clanName].members =
        clans[clanName].members.filter(id => id !== socket.id);

      if (clans[clanName].members.length === 0) {
        delete clans[clanName];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor rodando em http://localhost:" + PORT);
});
