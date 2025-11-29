const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, { maxHttpBufferSize: 1e8 });

app.use(express.static("public"));

// =================== CONFIGURAÇÕES ===================
const LIMITS = {
  admins: 3,
  coAdmins: 3,
  members: 50
};

// =================== ESTADO ===================
const rooms = {}; // Salas gerais (Chat e Voz)
const clans = {}; 
const userClans = new Map();
const usernameToSocket = new Map();
const socketToUsername = new Map();
const invitations = new Map();
const userStats = {};
const wars = {};

function generateId(prefix = "") { return prefix + Math.random().toString(36).slice(2, 9); }

// =================== FUNÇÕES AUXILIARES ===================
function getClanOfUser(socketId) { return userClans.get(socketId) || null; }

function getSocketByUsername(username) {
  const id = usernameToSocket.get(username);
  return id ? io.sockets.sockets.get(id) : null;
}

function serializeClanForClient(clanName) {
  const c = clans[clanName];
  if (!c) return null;

  const getMemberData = (socketId) => {
    const name = socketToUsername.get(socketId) || "Offline";
    let role = "Membro";
    if (c.owner === socketId) role = "Dono";
    else if (c.admins.has(socketId)) role = "Admin";
    else if (c.coAdmins.has(socketId)) role = "Co-Admin";

    const stats = userStats[name] || { battles: 0 };
    return { name, role, battles: stats.battles, muted: c.muted.has(socketId) };
  };

  const allIds = new Set([...c.members, ...c.admins, ...c.coAdmins, c.owner]);
  const detailedMembers = Array.from(allIds).map(id => getMemberData(id));

  detailedMembers.sort((a, b) => {
      const roles = { "Dono": 4, "Admin": 3, "Co-Admin": 2, "Membro": 1 };
      return roles[b.role] - roles[a.role];
  });

  return {
    name: clanName,
    owner: socketToUsername.get(c.owner) || "Unknown",
    members: detailedMembers,
    wins: c.wins || 0,
    points: c.points || 0
  };
}

// Helper para enviar update SÓ para quem é do clã
function notifyClanUpdate(clanName) {
    if (!clanName) return;
    const data = serializeClanForClient(clanName);
    // Envia para a sala específica do clã
    io.to("clan_" + clanName).emit("clanUpdated", data);
    // Atualiza a lista pública para todos (apenas nomes e qtd membros)
    io.emit("clanList", getAllClansList());
}

// =================== SOCKET ===================
io.on("connection", (socket) => {
  console.log("Conectado:", socket.id);

  let username = "Anônimo";
  socketToUsername.set(socket.id, username);
  socket.username = username;
  socket.room = null;      
  socket.voiceRoom = null; 

  // --- USERNAME ---
  socket.on("setUsername", (newName) => {
    if (!newName || typeof newName !== "string") return;
    newName = newName.slice(0, 25).trim();
    
    const prev = socketToUsername.get(socket.id);
    if (prev) usernameToSocket.delete(prev);
    
    socketToUsername.set(socket.id, newName);
    usernameToSocket.set(newName, socket.id);
    socket.username = newName;
    
    if (!userStats[newName]) userStats[newName] = { battles: 0 };
    socket.emit("system", `Nome atualizado: ${newName}`);
    
    const cName = getClanOfUser(socket.id);
    if(cName) notifyClanUpdate(cName);
  });

  // --- SALAS & CHAT PÚBLICO ---
  socket.on("joinRoom", (r) => {
    if(socket.room && rooms[socket.room]) rooms[socket.room].users.delete(socket.id);
    socket.join(r); socket.room = r;
    rooms[r] = rooms[r] || { users: new Set() };
    rooms[r].users.add(socket.id);
    socket.emit("system", `Sala: ${r}`);
  });
  
  socket.on("terminalInput", ({ meta, text, data }) => {
    if (socket.room) io.to(socket.room).emit("broadcastInput", { from: socket.id, payload: { meta, text, data, username: socket.username } });
  });

  // ================== SISTEMA DE CLÃS (CORE) ==================
  socket.on("createClan", (name) => {
    if (!name) return;
    name = name.trim();
    if (clans[name]) return socket.emit("clanInfo", "Nome já existe.");
    if (userClans.has(socket.id)) return socket.emit("clanInfo", "Saia do atual.");

    clans[name] = { 
        owner: socket.id, 
        admins: new Set(), 
        coAdmins: new Set(), 
        members: new Set(),
        banned: new Set(),
        muted: new Set(),
        wins: 0, points: 0 
    };
    userClans.set(socket.id, name);
    
    // CORREÇÃO: Entra na sala do Socket.io específica desse clã
    socket.join("clan_" + name);
    
    socket.emit("clanInfo", `Clã ${name} criado.`);
    notifyClanUpdate(name);
  });

  socket.on("inviteToClan", (target) => {
    const cName = getClanOfUser(socket.id);
    if (!cName) return socket.emit("clanInfo", "Sem clã.");
    const c = clans[cName];
    
    if (c.owner !== socket.id && !c.admins.has(socket.id) && !c.coAdmins.has(socket.id)) 
        return socket.emit("clanInfo", "Sem permissão.");

    const tSocket = getSocketByUsername(target);
    if (!tSocket) return socket.emit("clanInfo", "Usuário offline.");
    if (c.banned.has(tSocket.username) || c.banned.has(tSocket.id)) return socket.emit("clanInfo", "Banido.");
    
    const total = 1 + c.admins.size + c.coAdmins.size + c.members.size;
    if(total >= LIMITS.members) return socket.emit("clanInfo", "Clã cheio.");

    invitations.set(cName, invitations.get(cName) || new Set());
    invitations.get(cName).add(tSocket.id);
    
    tSocket.emit("clanInviteReceived", { clanName: cName, from: socket.username });
    socket.emit("clanInfo", `Convite enviado para ${target}.`);
  });

  socket.on("acceptInvite", (cName) => {
    const inv = invitations.get(cName);
    if (!inv || !inv.has(socket.id)) return socket.emit("clanInfo", "Sem convite.");
    
    const c = clans[cName];
    c.members.add(socket.id);
    userClans.set(socket.id, cName);
    inv.delete(socket.id);
    
    // CORREÇÃO: Entra na sala do clã
    socket.join("clan_" + cName);
    
    socket.emit("clanInfo", `Entrou em ${cName}`);
    notifyClanUpdate(cName);
  });

  // --- PROMOÇÃO ---
  socket.on("promoteMember", (targetName) => {
    const cName = getClanOfUser(socket.id); if(!cName) return;
    const c = clans[cName];
    const tSocket = getSocketByUsername(targetName);
    if(!tSocket || getClanOfUser(tSocket.id) !== cName) return;

    const myRole = c.owner === socket.id ? 3 : c.admins.has(socket.id) ? 2 : c.coAdmins.has(socket.id) ? 1 : 0;
    const targetId = tSocket.id;
    let targetRole = c.admins.has(targetId) ? 2 : c.coAdmins.has(targetId) ? 1 : 0;

    if ((myRole === 1 || myRole === 2) && targetRole === 0) {
        if(c.coAdmins.size >= LIMITS.coAdmins) return socket.emit("clanInfo", "Max Co-Admins.");
        c.members.delete(targetId); c.coAdmins.add(targetId);
    }
    else if (myRole === 2 && targetRole === 1) {
         if(c.admins.size >= LIMITS.admins) return socket.emit("clanInfo", "Max Admins.");
         c.coAdmins.delete(targetId); c.admins.add(targetId);
    }
    else if (myRole === 3) {
        if (targetRole === 0) { 
            if(c.coAdmins.size >= LIMITS.coAdmins) return;
            c.members.delete(targetId); c.coAdmins.add(targetId);
        } else if (targetRole === 1) { 
            if(c.admins.size >= LIMITS.admins) return;
            c.coAdmins.delete(targetId); c.admins.add(targetId);
        } else if (targetRole === 2) { 
            c.owner = targetId;
            c.admins.delete(targetId);
            c.admins.add(socket.id);
            io.emit("system", `CLÃ ${cName}: ${tSocket.username} é o novo DONO!`);
        }
    }
    notifyClanUpdate(cName);
  });

  // --- REBAIXAMENTO ---
  socket.on("demoteMember", (targetName) => {
    const cName = getClanOfUser(socket.id); if(!cName) return;
    const c = clans[cName];
    const tSocket = getSocketByUsername(targetName);
    if(!tSocket) return;
    
    const myRole = c.owner === socket.id ? 3 : c.admins.has(socket.id) ? 2 : 0;
    const tRole = c.admins.has(tSocket.id) ? 2 : c.coAdmins.has(tSocket.id) ? 1 : 0;

    if (myRole <= tRole && myRole !== 3) return;
    if (myRole === 0 || c.coAdmins.has(socket.id)) return;

    if (myRole === 2 && tRole === 1) { 
        c.coAdmins.delete(tSocket.id); c.members.add(tSocket.id);
    }
    else if (myRole === 3) {
        if(tRole === 2) { c.admins.delete(tSocket.id); c.coAdmins.add(tSocket.id); }
        else if(tRole === 1) { c.coAdmins.delete(tSocket.id); c.members.add(tSocket.id); }
    }
    notifyClanUpdate(cName);
  });

  // --- PODERES DONO ---
  socket.on("kickMember", (targetName) => {
      const cName = getClanOfUser(socket.id); if(!cName) return;
      const c = clans[cName];
      if(c.owner !== socket.id) return;
      const tSocket = getSocketByUsername(targetName);
      if(tSocket && tSocket.id !== socket.id) {
          removeUserFromClanStruct(cName, tSocket.id);
          // CORREÇÃO: Remove da sala do clã
          tSocket.leave("clan_" + cName);
          tSocket.emit("clanInfo", "Você foi expulso.");
          // Limpa a tela do usuário expulso
          tSocket.emit("clanUpdated", null);
          notifyClanUpdate(cName);
      }
  });

  socket.on("banMember", (targetName) => {
      const cName = getClanOfUser(socket.id); if(!cName) return;
      const c = clans[cName];
      if(c.owner !== socket.id) return;
      const tSocket = getSocketByUsername(targetName);
      if(tSocket) {
          removeUserFromClanStruct(cName, tSocket.id);
          // CORREÇÃO: Remove da sala do clã
          tSocket.leave("clan_" + cName);
          c.banned.add(tSocket.id); c.banned.add(targetName);
          tSocket.emit("clanInfo", "BANIDO DO CLÃ.");
          tSocket.emit("clanUpdated", null);
      } else { c.banned.add(targetName); }
      notifyClanUpdate(cName);
  });

  socket.on("muteMember", (targetName) => {
      const cName = getClanOfUser(socket.id); if(!cName) return;
      const c = clans[cName];
      if(c.owner !== socket.id) return;
      const tSocket = getSocketByUsername(targetName);
      if(tSocket) {
          if(c.muted.has(tSocket.id)) { c.muted.delete(tSocket.id); socket.emit("clanInfo", "Desmutado."); }
          else { c.muted.add(tSocket.id); socket.emit("clanInfo", "Mutado."); }
      }
      notifyClanUpdate(cName);
  });

  socket.on("leaveClan", () => {
    const cName = getClanOfUser(socket.id); if(!cName) return;
    
    // CORREÇÃO: Sai da sala do clã
    socket.leave("clan_" + cName);
    
    removeUserFromClanStruct(cName, socket.id);
    
    // Limpa a tela de quem saiu
    socket.emit("clanUpdated", null);
    
    // Atualiza a tela de quem ficou
    if(clans[cName]) notifyClanUpdate(cName);
  });

  function removeUserFromClanStruct(cName, uid) {
      const c = clans[cName];
      c.members.delete(uid); c.admins.delete(uid); c.coAdmins.delete(uid);
      userClans.delete(uid);
      if(c.owner === uid) {
          if(c.admins.size > 0) c.owner = c.admins.values().next().value;
          else if(c.coAdmins.size > 0) c.owner = c.coAdmins.values().next().value;
          else if(c.members.size > 0) c.owner = c.members.values().next().value;
          else delete clans[cName];
      }
  }

  socket.on("requestClans", () => socket.emit("clanList", getAllClansList()));

  socket.on("clanMessage", (txt) => {
      const cName = getClanOfUser(socket.id); if(!cName) return;
      const c = clans[cName];
      if(c.muted.has(socket.id)) return socket.emit("clanInfo", "Silenciado.");
      
      // CORREÇÃO: Envia mensagem apenas para a sala do clã
      io.to("clan_" + cName).emit("clanChat", { from: socket.username, text: txt });
  });

  // ================== GUERRAS ==================
  socket.on("createWar", ({ targetClan, durationSec }) => {
      const cName = getClanOfUser(socket.id);
      if(!cName || !clans[targetClan]) return;
      const c = clans[cName];
      if(c.owner !== socket.id && !c.admins.has(socket.id)) return socket.emit("clanInfo", "Sem permissão.");

      const warId = generateId("war");
      wars[warId] = { id: warId, clanA: cName, clanB: targetClan, scores: { [cName]:0, [targetClan]:0 }, active: true };
      
      // Avisa os dois clãs envolvidos
      io.to("clan_" + cName).to("clan_" + targetClan).emit("warCreated", { warId, clanA: cName, clanB: targetClan });

      setTimeout(() => {
          if(wars[warId]) {
              const w = wars[warId];
              let winner = null;
              if(w.scores[w.clanA] > w.scores[w.clanB]) winner = w.clanA;
              else if(w.scores[w.clanB] > w.scores[w.clanA]) winner = w.clanB;
              
              if(winner) { clans[winner].wins++; clans[winner].points += 10; }
              clans[w.clanA].points += w.scores[w.clanA];
              clans[w.clanB].points += w.scores[w.clanB];
              
              io.emit("warEnded", { warId, winner });
              delete wars[warId];
              
              notifyClanUpdate(w.clanA);
              notifyClanUpdate(w.clanB);
          }
      }, durationSec * 1000);
  });

  socket.on("submitWarPoint", ({ warId, points }) => {
      const w = wars[warId];
      if(!w || !w.active) return;
      const cName = getClanOfUser(socket.id);
      const c = clans[cName];
      if(c.coAdmins.has(socket.id)) return;

      w.scores[cName] += points || 1;
      if(!userStats[socket.username]) userStats[socket.username] = { battles: 0 };
      userStats[socket.username].battles++;
      
      // Atualiza placar para os envolvidos
      io.to("clan_" + w.clanA).to("clan_" + w.clanB).emit("warUpdated", { warId, scores: w.scores });
      notifyClanUpdate(cName);
  });

  socket.on("requestRanking", () => {
    socket.emit("ranking", Object.keys(clans).map(n => ({ name: n, wins: clans[n].wins, points: clans[n].points })).sort((a,b)=>b.wins-a.wins));
  });

  // ================== SISTEMA DE VOZ ==================
  socket.on("joinVoiceChannel", (clanName) => {
      const roomID = `voice_${clanName}`;
      socket.voiceRoom = roomID;
      socket.join(roomID);

      rooms[roomID] = rooms[roomID] || { users: new Set() };
      const usersInThisRoom = Array.from(rooms[roomID].users).filter(id => id !== socket.id);
      rooms[roomID].users.add(socket.id);
      
      socket.emit("allVoiceUsers", usersInThisRoom);
  });

  socket.on("sendingSignal", payload => {
      io.to(payload.userToSignal).emit("userJoinedVoice", { 
          signal: payload.signal, 
          callerID: payload.callerID 
      });
  });

  socket.on("returningSignal", payload => {
      io.to(payload.callerID).emit("receivingReturnedSignal", { 
          signal: payload.signal, 
          id: socket.id 
      });
  });

  socket.on("leaveVoiceChannel", (clanName) => {
      const roomID = `voice_${clanName}`;
      if(rooms[roomID]) rooms[roomID].users.delete(socket.id);
      socket.leave(roomID);
      socket.voiceRoom = null;
      socket.to(roomID).emit("userLeftVoice", socket.id);
  });

  // ================== DESCONEXÃO ==================
  socket.on("disconnect", () => {
      if(socket.room && rooms[socket.room]) rooms[socket.room].users.delete(socket.id);
      if(socket.voiceRoom) {
          const vRoom = socket.voiceRoom;
          if(rooms[vRoom]) rooms[vRoom].users.delete(socket.id);
          socket.to(vRoom).emit("userLeftVoice", socket.id);
      }
      socketToUsername.delete(socket.id);
  });
});

function getAllClansList() {
    const list = {};
    for(let n in clans) list[n] = serializeClanForClient(n);
    return list;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));