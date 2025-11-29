// server.js - atualizado: suporte melhorado para voice (names, join/leave, kick), limpeza de rooms, e pequenas correções
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
const rooms = {}; 
const clans = {}; 
const userClans = new Map(); 
const usernameToSocket = new Map();
const socketToUsername = new Map();
const userStats = {};
const wars = {};

// MAPA DE PERSISTÊNCIA (Agora salva CLÃ e CARGO)
// Key: Username, Value: { clan: "NomeDoCla", role: "admin" | "coAdmin" | "member" | "owner" }
const usernameMap = new Map(); 

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

function notifyClanUpdate(clanName) {
    if (!clanName) return;
    const data = serializeClanForClient(clanName);
    io.to("clan_" + clanName).emit("clanUpdated", data);
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

  // --- USERNAME & RECONEXÃO INTELIGENTE ---
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

    // === LÓGICA DE RECONEXÃO (AGORA MANTÉM O CARGO) ===
    const savedData = usernameMap.get(newName); // Retorna { clan, role }
    
    if (savedData && clans[savedData.clan]) {
        const c = clans[savedData.clan];
        const role = savedData.role;
        
        userClans.set(socket.id, savedData.clan);
        socket.join("clan_" + savedData.clan);

        // 2. Coloca no lugar certo baseado na memória
        if (role === 'owner') {
            c.owner = socket.id; // Atualiza o ID do dono
        } else if (role === 'admin') {
            c.admins.add(socket.id);
        } else if (role === 'coAdmin') {
            c.coAdmins.add(socket.id);
        } else {
            c.members.add(socket.id);
        }
        
        socket.emit("clanInfo", `Reconectado ao clã ${savedData.clan} como ${role}.`);
        notifyClanUpdate(savedData.clan);
    }
  });

  // --- SALAS & CHAT ---
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

  // ================== CLÃS (CORE) ==================
  socket.on("createClan", (name) => {
    if (!name) return;
    name = name.trim();
    if (clans[name]) return socket.emit("clanInfo", "Nome já existe.");
    if (userClans.has(socket.id)) return socket.emit("clanInfo", "Saia do atual.");

    clans[name] = { 
        owner: socket.id, 
        admins: new Set(), coAdmins: new Set(), members: new Set(),
        banned: new Set(), muted: new Set(), wins: 0, points: 0 
    };
    userClans.set(socket.id, name);
    usernameMap.set(socket.username, { clan: name, role: 'owner' }); // Salva como DONO
    
    socket.join("clan_" + name);
    socket.emit("clanInfo", `Clã ${name} criado.`);
    notifyClanUpdate(name);
  });

  socket.on("inviteToClan", (target) => {
    const cName = getClanOfUser(socket.id); if (!cName) return;
    const tSocket = getSocketByUsername(target);
    if (tSocket) {
        tSocket.emit("clanInviteReceived", { clanName: cName, from: socket.username });
        socket.emit("clanInfo", `Convite enviado para ${target}.`);
    }
  });

  socket.on("acceptInvite", (cName) => {
    if (!clans[cName]) return socket.emit("clanInfo", "Clã não existe.");
    const c = clans[cName];
    
    c.members.add(socket.id);
    userClans.set(socket.id, cName);
    usernameMap.set(socket.username, { clan: cName, role: 'member' }); // Salva como MEMBRO
    
    socket.join("clan_" + cName);
    socket.emit("clanInfo", `Entrou em ${cName}`);
    notifyClanUpdate(cName);
  });

  // --- GESTÃO HIERARQUIA (ATUALIZANDO PERSISTÊNCIA) ---
  socket.on("promoteMember", (targetName) => {
    const cName = getClanOfUser(socket.id); if(!cName) return;
    const c = clans[cName];
    const tSocket = getSocketByUsername(targetName);
    if(!tSocket || getClanOfUser(tSocket.id) !== cName) return;

    const myRole = c.owner === socket.id ? 3 : c.admins.has(socket.id) ? 2 : c.coAdmins.has(socket.id) ? 1 : 0;
    const targetId = tSocket.id;
    let targetRole = c.admins.has(targetId) ? 2 : c.coAdmins.has(targetId) ? 1 : 0;

    // Helper para atualizar mapa
    const updateRole = (name, role) => usernameMap.set(name, { clan: cName, role: role });

    if ((myRole === 1 || myRole === 2) && targetRole === 0) {
        c.members.delete(targetId); c.coAdmins.add(targetId);
        updateRole(targetName, 'coAdmin');
    }
    else if (myRole === 2 && targetRole === 1) {
         c.coAdmins.delete(targetId); c.admins.add(targetId);
         updateRole(targetName, 'admin');
    }
    else if (myRole === 3) {
        if (targetRole === 0) { 
            c.members.delete(targetId); c.coAdmins.add(targetId);
            updateRole(targetName, 'coAdmin');
        }
        else if (targetRole === 1) { 
            c.coAdmins.delete(targetId); c.admins.add(targetId);
            updateRole(targetName, 'admin');
        }
        else if (targetRole === 2) { 
            // Troca de Dono
            updateRole(socket.username, 'admin'); // Antigo dono vira admin
            updateRole(targetName, 'owner');      // Novo dono
            
            c.owner = targetId;
            c.admins.delete(targetId);
            c.admins.add(socket.id);
        }
    }
    notifyClanUpdate(cName);
  });

  socket.on("demoteMember", (targetName) => {
    const cName = getClanOfUser(socket.id); if(!cName) return;
    const c = clans[cName];
    const tSocket = getSocketByUsername(targetName);
    if(!tSocket) return;
    
    const myRole = c.owner === socket.id ? 3 : c.admins.has(socket.id) ? 2 : 0;
    const tRole = c.admins.has(tSocket.id) ? 2 : c.coAdmins.has(tSocket.id) ? 1 : 0;
    const updateRole = (name, role) => usernameMap.set(name, { clan: cName, role: role });

    if (myRole <= tRole && myRole !== 3) return;
    
    if (myRole === 2 && tRole === 1) { 
        c.coAdmins.delete(tSocket.id); c.members.add(tSocket.id);
        updateRole(targetName, 'member');
    }
    else if (myRole === 3) {
        if(tRole === 2) { 
            c.admins.delete(tSocket.id); c.coAdmins.add(tSocket.id); 
            updateRole(targetName, 'coAdmin');
        }
        else if(tRole === 1) { 
            c.coAdmins.delete(tSocket.id); c.members.add(tSocket.id); 
            updateRole(targetName, 'member');
        }
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
          usernameMap.delete(targetName); // Apaga da memória
          tSocket.leave("clan_" + cName);
          tSocket.emit("clanInfo", "Você foi expulso.");
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
          usernameMap.delete(targetName); 
          tSocket.leave("clan_" + cName);
          c.banned.add(tSocket.id); c.banned.add(targetName);
          tSocket.emit("clanInfo", "BANIDO DO CLÃ.");
          tSocket.emit("clanUpdated", null);
      } else { c.banned.add(targetName); }
      notifyClanUpdate(cName);
  });

  // === NOVO: DISSOLVER CLÃ (BOTÃO VERMELHO) ===
  socket.on("dissolveClan", () => {
      const cName = getClanOfUser(socket.id); if(!cName) return;
      const c = clans[cName];
      
      // Só o dono pode dissolver
      if(c.owner !== socket.id) return socket.emit("clanInfo", "Apenas o dono pode dissolver.");

      // 1. Avisa todo mundo e limpa os dados
      const allMembers = [...c.members, ...c.admins, ...c.coAdmins, c.owner];
      
      allMembers.forEach(uid => {
          const s = io.sockets.sockets.get(uid);
          if(s) {
              s.leave("clan_" + cName); // Sai da sala
              s.emit("clanUpdated", null); // Limpa UI
              s.emit("clanInfo", `O clã ${cName} foi dissolvido pelo dono.`);
              userClans.delete(uid);
              usernameMap.delete(s.username); // Limpa persistência de todos
          }
      });

      // 2. Apaga o clã
      delete clans[cName];
      io.emit("clanList", getAllClansList()); // Atualiza lista global
  });

  socket.on("leaveClan", () => {
    const cName = getClanOfUser(socket.id); if(!cName) return;
    socket.leave("clan_" + cName);
    removeUserFromClanStruct(cName, socket.id);
    usernameMap.delete(socket.username);
    socket.emit("clanUpdated", null);
    if(clans[cName]) notifyClanUpdate(cName);
  });

  function removeUserFromClanStruct(cName, uid) {
      const c = clans[cName];
      if(!c) return;
      c.members.delete(uid); c.admins.delete(uid); c.coAdmins.delete(uid);
      userClans.delete(uid);
  }

  socket.on("requestClans", () => socket.emit("clanList", getAllClansList()));

  socket.on("clanMessage", (txt) => {
      const cName = getClanOfUser(socket.id); if(!cName) return;
      if(clans[cName].muted.has(socket.id)) return socket.emit("clanInfo", "Silenciado.");
      io.to("clan_" + cName).emit("clanChat", { from: socket.username, text: txt });
  });

  // ================== GUERRAS & VOZ (Mesmo de antes, com melhorias) ==================
  socket.on("createWar", ({ targetClan, durationSec }) => {
      const cName = getClanOfUser(socket.id); if(!cName) return;
      const warId = generateId("war");
      wars[warId] = { id: warId, clanA: cName, clanB: targetClan, scores: { [cName]:0, [targetClan]:0 }, active: true };
      io.to("clan_" + cName).to("clan_" + targetClan).emit("warCreated", { warId, clanA: cName, clanB: targetClan });
      setTimeout(() => {
          if(wars[warId]) {
              const w = wars[warId];
              let winner = w.scores[w.clanA] > w.scores[w.clanB] ? w.clanA : w.clanB;
              if(clans[winner]) { clans[winner].wins++; clans[winner].points += 10; }
              if(clans[w.clanA]) clans[w.clanA].points += w.scores[w.clanA];
              if(clans[w.clanB]) clans[w.clanB].points += w.scores[w.clanB];
              io.emit("warEnded", { warId, winner });
              delete wars[warId];
              notifyClanUpdate(w.clanA); notifyClanUpdate(w.clanB);
          }
      }, durationSec * 1000);
  });

  socket.on("submitWarPoint", ({ warId, points }) => {
      const w = wars[warId]; if(!w || !w.active) return;
      const cName = getClanOfUser(socket.id);
      w.scores[cName] += points || 1;
      io.to("clan_" + w.clanA).to("clan_" + w.clanB).emit("warUpdated", { warId, scores: w.scores });
      notifyClanUpdate(cName);
  });

  socket.on("requestRanking", () => {
    socket.emit("ranking", Object.keys(clans).map(n => ({ name: n, wins: clans[n].wins, points: clans[n].points })).sort((a,b)=>b.wins-a.wins));
  });

  // ---------- VOICE: join, signaling, leave, kick, cleanup ----------
  socket.on("joinVoiceChannel", (payload) => {
      // payload expected: { clanName, username? } (client provides clanName)
      const clanName = typeof payload === "string" ? payload : (payload && payload.clanName);
      if (!clanName) return socket.emit("system", "Erro: nome do clã ausente.");
      const roomID = `voice_${clanName}`;
      socket.join(roomID);
      rooms[roomID] = rooms[roomID] || { users: new Set() };

      // Prepare list of existing users (id + name) BEFORE adicionar o novo
      const existing = Array.from(rooms[roomID].users)
        .filter(id => id !== socket.id)
        .map(id => ({ id, name: socketToUsername.get(id) || "Alguém" }));

      // Send to joining client the existing list with names
      socket.emit("allVoiceUsers", existing);

      // Add the new user to the voice set & track voiceRoom on socket
      rooms[roomID].users.add(socket.id);
      socket.voiceRoom = roomID;

      // Inform others in room that a new user joined (they'll receive 'userJoinedVoice' when signaling)
      io.to(roomID).emit("system", `${socket.username} entrou na voz.`); 
  });

  // client sends: { userToSignal, callerID, signal }
  socket.on("sendingSignal", p => {
      if (!p || !p.userToSignal) return;
      const callerName = socketToUsername.get(p.callerID) || socket.username || "Alguém";
      io.to(p.userToSignal).emit("userJoinedVoice", { signal: p.signal, callerID: p.callerID, name: callerName });
  });

  // client sends returningSignal: { signal, callerID }
  socket.on("returningSignal", p => {
      if (!p || !p.callerID) return;
      // include the name of the responder for convenience
      const responderName = socket.username || socketToUsername.get(socket.id) || "Alguém";
      io.to(p.callerID).emit("receivingReturnedSignal", { signal: p.signal, id: socket.id, name: responderName });
  });

  // Leave voice channel explicitly
  socket.on("leaveVoiceChannel", (payload) => {
      const clanName = typeof payload === "string" ? payload : (payload && payload.clanName);
      const roomID = clanName ? `voice_${clanName}` : socket.voiceRoom;
      if (!roomID || !rooms[roomID]) return;

      rooms[roomID].users.delete(socket.id);
      socket.leave(roomID);
      socket.voiceRoom = null;

      // Inform remaining users
      io.to(roomID).emit("userLeftVoice", socket.id);
      io.to(roomID).emit("system", `${socket.username} saiu da voz.`);
  });

  // Kick from voice (client sends { targetId })
  socket.on("voiceKick", ({ targetId }) => {
      if (!targetId) return;
      // Validate permissions: only owner or admins of the clan can kick
      const cName = getClanOfUser(socket.id);
      if (!cName) return socket.emit("clanInfo", "Você não está em um clã.");
      const c = clans[cName];
      if (!c) return;

      const isOwner = c.owner === socket.id;
      const isAdmin = c.admins.has(socket.id);
      // permissões mais restritas: só owner e admins
      if (!isOwner && !isAdmin) return socket.emit("clanInfo", "Sem permissão para expulsar da voz.");

      // check target socket
      const targetSocket = io.sockets.sockets.get(targetId);
      if (!targetSocket) return socket.emit("clanInfo", "Usuário alvo não encontrado (offline).");

      // Ensure target is in same voice room
      const roomID = socket.voiceRoom || (`voice_${cName}`);
      if (!roomID || !rooms[roomID] || !rooms[roomID].users.has(targetId)) {
          return socket.emit("clanInfo", "Alvo não está na chamada de voz.");
      }

      // Remove target from voice set & notify
      rooms[roomID].users.delete(targetId);
      targetSocket.leave(roomID);
      targetSocket.voiceRoom = null;

      // Tell the target to disconnect from voice
      targetSocket.emit("voiceForceDisconnect", { reason: `Expulso por ${socket.username}` });

      // Inform others in room that the user was kicked
      io.to(roomID).emit("userLeftVoice", targetId);
      io.to(roomID).emit("system", `${socket.username} expulsou ${socketToUsername.get(targetId) || targetId} da voz.`);
  });

  // When a socket disconnects, clean voice room and other maps
  socket.on("disconnect", () => {
      // Remove from username maps
      socketToUsername.delete(socket.id);
      const uname = socket.username;
      if (uname) usernameToSocket.delete(uname);

      // Remove from any text room
      if (socket.room && rooms[socket.room]) {
          rooms[socket.room].users.delete(socket.id);
      }

      // Remove from voice room if present
      if (socket.voiceRoom && rooms[socket.voiceRoom]) {
          rooms[socket.voiceRoom].users.delete(socket.id);
          // notify remaining users
          io.to(socket.voiceRoom).emit("userLeftVoice", socket.id);
          io.to(socket.voiceRoom).emit("system", `${socket.username} desconectou da voz.`);
      }

      // Nota: Não removemos do usernameMap aqui para permitir reconexão com F5
  });
});

// =================== HELPERS ===================
function getAllClansList() {
    const list = {};
    for(let n in clans) list[n] = serializeClanForClient(n);
    return list;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
