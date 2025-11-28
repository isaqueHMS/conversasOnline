const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 1e8 // Aumentado para suportar uploads maiores
});

app.use(express.static("public"));

// =================== CONFIGURAÇÕES ===================
const FILE_LIMITS = {
  image: 20_000_000,
  audio: 30_000_000,
  video: 50_000_000
};

const ADMIN_PASSWORD = "isaquinho";

// =================== ESTADO DO SERVIDOR ===================
const rooms = {};                // roomName -> { users: Set(socketId) }
const clans = {};                // clanName -> { owner, admins: Set, members: Set, wins, points }
const userClans = new Map();     // socket.id -> clanName
const usernameToSocket = new Map(); // username -> socket.id
const socketToUsername = new Map(); // socket.id -> username
const invitations = new Map();   // clanName -> Set(socket.id) invited
const bans = new Set();
const mutes = new Set();

// Estatísticas dos jogadores (Batalhas, etc)
const userStats = {}; // { "Username": { battles: 0 } }

// Guerras
const wars = {}; 

function generateId(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

// =================== FUNÇÕES AUXILIARES (A MÁGICA ESTÁ AQUI) ===================

function getClanOfUser(socketId) {
  return userClans.get(socketId) || null;
}

function getSocketByUsername(username) {
  const id = usernameToSocket.get(username);
  if (!id) return null;
  return io.sockets.sockets.get(id) || null;
}

// Essa é a função que estava faltando/errada antes
function serializeClanForClient(clanName) {
  const c = clans[clanName];
  if (!c) return null;

  // Função para montar o objeto de cada membro
  const getMemberData = (socketId) => {
    // Tenta pegar o nome pelo Socket ID. Se o user desconectou mas não saiu do clã, tenta achar o nome antigo ou põe Offline
    const name = socketToUsername.get(socketId) || "Offline/Desconhecido";
    
    let role = "Membro";
    if (c.owner === socketId) role = "Dono";
    else if (c.admins.has(socketId)) role = "Admin";
    
    // Pega as batalhas do nome do usuário
    const stats = userStats[name] || { battles: 0 };
    
    return { name, role, battles: stats.battles };
  };

  // Converte a lista de IDs em lista de objetos detalhados
  const detailedMembers = Array.from(c.members).map(id => getMemberData(id));

  // Ordena: Dono > Admin > Membro
  detailedMembers.sort((a, b) => {
      const roles = { "Dono": 3, "Admin": 2, "Membro": 1 };
      const roleDiff = roles[b.role] - roles[a.role];
      if (roleDiff !== 0) return roleDiff;
      return 0;
  });

  return {
    name: clanName,
    owner: socketToUsername.get(c.owner) || "Desconhecido",
    members: detailedMembers, // Agora enviamos a lista completa detalhada
    wins: c.wins || 0,
    points: c.points || 0
  };
}

function computeRanking() {
  return Object.keys(clans)
    .map(name => ({ name, wins: clans[name].wins || 0, points: clans[name].points || 0 }))
    .sort((a,b) => b.wins - a.wins || b.points - a.points);
}

// =================== CONEXÃO SOCKET ===================
io.on("connection", (socket) => {
  console.log("Conectado:", socket.id);

  // Nome padrão
  let username = "Anônimo";
  socketToUsername.set(socket.id, username);
  socket.username = username;
  socket.room = null;
  socket.isAdmin = false;

  // Atualizar Username
  socket.on("setUsername", (newName) => {
    if (!newName || typeof newName !== "string") return;
    newName = newName.slice(0, 25).trim();
    
    const prev = socketToUsername.get(socket.id);
    if (prev) usernameToSocket.delete(prev);

    socketToUsername.set(socket.id, newName);
    usernameToSocket.set(newName, socket.id);
    socket.username = newName;
    
    // Se o usuário já tiver stats salvos, mantemos, senão cria novo
    if (!userStats[newName]) userStats[newName] = { battles: 0 };

    socket.emit("system", `Nome atualizado para ${newName}`);
    
    // Se estiver em clã, avisa pra atualizar a lista de nomes
    const clanName = getClanOfUser(socket.id);
    if(clanName) io.emit("clanUpdated", serializeClanForClient(clanName));
  });

  // Entrar em Sala
  socket.on("joinRoom", (roomName) => {
    if (!roomName || typeof roomName !== "string") return;
    if (socket.room) {
      socket.leave(socket.room);
      if (rooms[socket.room]) {
        rooms[socket.room].users.delete(socket.id);
        if (rooms[socket.room].users.size === 0) delete rooms[socket.room];
      }
    }
    socket.join(roomName);
    socket.room = roomName;
    rooms[roomName] = rooms[roomName] || { users: new Set() };
    rooms[roomName].users.add(socket.id);
    socket.emit("system", `Entrou na sala: ${roomName}`);
  });

  // Chat e Mídia
  socket.on("terminalInput", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const { meta, text, data } = payload;

    // Comandos Admin (/admin, /ban, etc) - Simplificado
    if (meta === "text" && text.startsWith("/")) {
        if(text.startsWith("/admin " + ADMIN_PASSWORD)) {
            socket.isAdmin = true;
            return socket.emit("system", "Você agora é Admin!");
        }
    }

    if (socket.room) {
      io.to(socket.room).emit("broadcastInput", {
        from: socket.id,
        payload: { meta, text, data, username: socket.username }
      });
    } else {
        socket.emit("system", "Entre em uma sala primeiro!");
    }
  });

  // ================== CLÃS ==================
  socket.on("createClan", (clanName) => {
    if (!clanName) return;
    clanName = clanName.trim();
    if (clans[clanName]) return socket.emit("clanInfo", "Clã já existe.");
    if (userClans.has(socket.id)) return socket.emit("clanInfo", "Saia do seu clã atual antes.");

    clans[clanName] = { owner: socket.id, admins: new Set(), members: new Set([socket.id]), wins: 0, points: 0 };
    userClans.set(socket.id, clanName);
    
    socket.emit("clanInfo", `Clã ${clanName} criado!`);
    io.emit("clanUpdated", serializeClanForClient(clanName));
    io.emit("clanList", {}); // Força atualização da lista geral (simplificado)
  });

socket.on("inviteToClan", (target) => {
    const cName = getClanOfUser(socket.id);
    if (!cName) return socket.emit("clanInfo", "Você não tem clã.");
    
    const c = clans[cName];
    // Verifica permissão (Dono, Admin ou Co-Admin)
    if (c.owner !== socket.id && !c.admins.has(socket.id) && !c.coAdmins.has(socket.id)) 
        return socket.emit("clanInfo", "Sem permissão para convidar.");

    // Tenta achar o usuário (O NOME TEM QUE SER EXATO)
    const tSocket = getSocketByUsername(target);
    
    if (!tSocket) return socket.emit("clanInfo", "Usuário não encontrado ou offline.");
    if (c.banned.has(tSocket.username) || c.banned.has(tSocket.id)) return socket.emit("clanInfo", "Este usuário está banido.");
    
    // Verifica limite
    const total = 1 + c.admins.size + c.coAdmins.size + c.members.size;
    if(total >= LIMITS.members) return socket.emit("clanInfo", "Clã cheio.");

    // Salva o convite
    invitations.set(cName, invitations.get(cName) || new Set());
    invitations.get(cName).add(tSocket.id);

    // --- AQUI ESTA A CORREÇÃO ---
    // Envia um evento especial com o NOME DO CLÃ para o alvo
    tSocket.emit("clanInviteReceived", { clanName: cName, from: socket.username });
    
    socket.emit("clanInfo", `Convite enviado para ${target}.`);
  });

  socket.on("acceptInvite", (clanName) => {
    const inv = invitations.get(clanName);
    if (!inv || !inv.has(socket.id)) return socket.emit("clanInfo", "Sem convite pendente.");
    
    clans[clanName].members.add(socket.id);
    userClans.set(socket.id, clanName);
    inv.delete(socket.id);
    
    io.emit("clanUpdated", serializeClanForClient(clanName));
    socket.emit("clanInfo", `Você entrou no clã ${clanName}`);
  });
  
  socket.on("leaveClan", () => {
      const clanName = getClanOfUser(socket.id);
      if(!clanName) return;
      
      const c = clans[clanName];
      c.members.delete(socket.id);
      c.admins.delete(socket.id);
      userClans.delete(socket.id);
      
      // Se era dono, passar liderança ou deletar
      if(c.owner === socket.id) {
          if(c.members.size > 0) {
              const newOwner = c.members.values().next().value;
              c.owner = newOwner;
          } else {
              delete clans[clanName];
          }
      }
      
      socket.emit("clanInfo", "Você saiu do clã.");
      socket.emit("clanUpdated", null); // Limpa tela do usuário
      if(clans[clanName]) io.emit("clanUpdated", serializeClanForClient(clanName));
  });

  socket.on("requestClans", () => {
      const list = {};
      for(let name in clans) list[name] = serializeClanForClient(name);
      socket.emit("clanList", list);
  });

  socket.on("promoteMember", (targetName) => {
      const clanName = getClanOfUser(socket.id);
      if(!clanName) return;
      const c = clans[clanName];
      if(c.owner !== socket.id) return socket.emit("clanInfo", "Apenas o dono promove.");
      
      const targetSock = getSocketByUsername(targetName);
      if(targetSock && c.members.has(targetSock.id)) {
          c.admins.add(targetSock.id);
          io.emit("clanUpdated", serializeClanForClient(clanName));
      }
  });

  socket.on("demoteMember", (targetName) => {
      const clanName = getClanOfUser(socket.id);
      if(!clanName) return;
      const c = clans[clanName];
      if(c.owner !== socket.id) return;
      
      const targetSock = getSocketByUsername(targetName);
      if(targetSock) {
          c.admins.delete(targetSock.id);
          io.emit("clanUpdated", serializeClanForClient(clanName));
      }
  });
  
  socket.on("clanMessage", (txt) => {
      const clanName = getClanOfUser(socket.id);
      if(!clanName || !txt) return;
      const c = clans[clanName];
      c.members.forEach(mid => {
          const s = io.sockets.sockets.get(mid);
          if(s) s.emit("clanChat", { from: socket.username, text: txt });
      });
  });

  // ================== GUERRAS ==================
  socket.on("createWar", ({ targetClan, durationSec }) => {
      const myClan = getClanOfUser(socket.id);
      if(!myClan || !clans[targetClan]) return;
      
      const warId = generateId("war");
      wars[warId] = { id: warId, clanA: myClan, clanB: targetClan, scores: { [myClan]:0, [targetClan]:0 }, active: true };
      
      io.emit("warCreated", { warId, clanA: myClan, clanB: targetClan });
      
      setTimeout(() => {
          if(wars[warId]) {
              const w = wars[warId];
              let winner = null;
              if(w.scores[w.clanA] > w.scores[w.clanB]) winner = w.clanA;
              else if(w.scores[w.clanB] > w.scores[w.clanA]) winner = w.clanB;
              
              if(winner) {
                  clans[winner].wins++;
                  clans[winner].points += 10;
              }
              // Atualizar pontos baseados no score
              clans[w.clanA].points += w.scores[w.clanA];
              clans[w.clanB].points += w.scores[w.clanB];
              
              io.emit("warEnded", { warId, winner, scores: w.scores });
              io.emit("clanUpdated", serializeClanForClient(w.clanA));
              io.emit("clanUpdated", serializeClanForClient(w.clanB));
              delete wars[warId];
          }
      }, durationSec * 1000);
  });

  socket.on("submitWarPoint", ({ warId, points }) => {
      const w = wars[warId];
      if(!w || !w.active) return;
      
      const myClan = getClanOfUser(socket.id);
      if(w.clanA !== myClan && w.clanB !== myClan) return;
      
      w.scores[myClan] += (points || 1);
      
      // Contar batalha individual para o usuário
      if(!userStats[socket.username]) userStats[socket.username] = { battles: 0 };
      userStats[socket.username].battles += 1;
      
      io.emit("warUpdated", { warId, scores: w.scores });
      
      // Atualizar a lista de membros para mostrar a nova batalha
      io.emit("clanUpdated", serializeClanForClient(myClan));
  });

  socket.on("requestRanking", () => {
      socket.emit("ranking", computeRanking());
  });

  // ================== DISCONNECT ==================
  socket.on("disconnect", () => {
      console.log("Saiu:", socket.id);
      if(socket.room && rooms[socket.room]) {
          rooms[socket.room].users.delete(socket.id);
      }
      
      const clanName = getClanOfUser(socket.id);
      // Nota: Não removemos do clã ao desconectar, senão o clã some quando fecha a aba
      // Apenas atualizamos o status se necessário
      
      socketToUsername.delete(socket.id);
      // usernameToSocket mantemos ou deletamos? Se deletar, o user fica "Offline" na lista
      // usernameToSocket.delete(socket.username); 
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));