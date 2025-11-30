// server.js - Versão Estável e Segura
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

// Limite de 100MB para aceitar uploads grandes
const io = new Server(server, { maxHttpBufferSize: 1e8 });

app.use(express.static(path.join(__dirname, "public")));

// =================== CONFIGURAÇÕES ===================
const LIMITS = {
  admins: 3,
  coAdmins: 3,
  members: 50
};

const MESSAGE_MIN_DELAY_MS = 1500; // 1.5s entre mensagens (Anti-spam)
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const CLEANUP_INTERVAL_MS = 1000 * 60 * 5; // Limpeza a cada 5 min

// =================== ESTADO (BANCO DE DADOS EM MEMÓRIA) ===================
const rooms = {}; 
const clans = {}; 
const userClans = new Map(); 
const usernameToSocket = new Map(); 
const socketToUsername = new Map(); 
const userStats = {}; 
const wars = {}; 
const usernameMap = new Map(); // Persistência de Clã/Cargo (Resiste ao F5)
const lastMsgAt = new Map(); // Rate Limit
const warCaptchas = {}; // Tokens de segurança da guerra

// =================== HELPERS ===================
function generateId(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

// Proteção contra XSS (Scripts maliciosos no chat)
function escapeForHtml(s) {
  if (typeof s !== "string") return s;
  return s.replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
}

function getClanOfUser(socketId) {
  return userClans.get(socketId) || null;
}

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
    points: c.points || 0,
    color: c.color || "#3b82f6",
    logs: c.logs || []
  };
}

function notifyClanUpdate(clanName) {
  if (!clanName) return;
  const data = serializeClanForClient(clanName);
  io.to("clan_" + clanName).emit("clanUpdated", data);
  io.emit("clanList", getAllClansList());
}

function getAllClansList() {
  const list = {};
  for (let n in clans) list[n] = serializeClanForClient(n);
  return list;
}

// Rotina de Limpeza
setInterval(() => {
  // Limpa salas vazias
  for (const r in rooms) {
    if (!rooms[r] || !rooms[r].users || rooms[r].users.size === 0) delete rooms[r];
  }
  // Limpa guerras velhas (> 1 hora)
  const now = Date.now();
  for (const w in wars) {
    if (wars[w] && (now - (wars[w].createdAt || now)) > 1000 * 60 * 60) {
      delete wars[w];
      delete warCaptchas[w];
    }
  }
}, CLEANUP_INTERVAL_MS);

// =================== SOCKET LÓGICA ===================
io.on("connection", (socket) => {
  console.log("Conectado:", socket.id);

  let username = "Anônimo";
  socketToUsername.set(socket.id, username);
  socket.username = username;
  socket.room = null;
  socket.voiceRoom = null;

  // --- 1. CONFIGURAÇÃO DE NOME E RECONEXÃO ---
  socket.on("setUsername", (newName) => {
    if (!newName || typeof newName !== "string") return;
    newName = newName.slice(0, 25).trim();

    const prevName = socketToUsername.get(socket.id);
    if (prevName) usernameToSocket.delete(prevName);

    socketToUsername.set(socket.id, newName);
    usernameToSocket.set(newName, socket.id);
    socket.username = newName;

    if (!userStats[newName]) userStats[newName] = { battles: 0 };
    socket.emit("system", `Nome atualizado: ${newName}`);

    // Reconexão Inteligente (F5)
    const savedData = usernameMap.get(newName);
    if (savedData && clans[savedData.clan]) {
      const c = clans[savedData.clan];
      const role = savedData.role;
      userClans.set(socket.id, savedData.clan);
      socket.join("clan_" + savedData.clan);

      // Restaura cargo
      if (role === "owner") c.owner = socket.id;
      else if (role === "admin") c.admins.add(socket.id);
      else if (role === "coAdmin") c.coAdmins.add(socket.id);
      else c.members.add(socket.id);

      socket.emit("clanInfo", `Reconectado ao clã ${savedData.clan} como ${role}.`);
      notifyClanUpdate(savedData.clan);
    }
  });

  // --- 2. SALAS PÚBLICAS ---
  socket.on("joinRoom", (r) => {
    if (!r || typeof r !== "string") return;
    if (socket.room && rooms[socket.room]) rooms[socket.room].users.delete(socket.id);

    socket.join(r);
    socket.room = r;
    rooms[r] = rooms[r] || { users: new Set() };
    rooms[r].users.add(socket.id);
    socket.emit("system", `Sala: ${r}`);
  });

  // --- 3. MENSAGENS E UPLOADS ---
  socket.on("terminalInput", (payload = {}) => {
    try {
      // Rate Limit
      const now = Date.now();
      const last = lastMsgAt.get(socket.id) || 0;
      if (now - last < MESSAGE_MIN_DELAY_MS) {
        return socket.emit("system", `Aguarde um pouco antes de enviar outra mensagem.`);
      }
      lastMsgAt.set(socket.id, now);

      const meta = payload.meta || "text";
      const usernameFromPayload = socket.username || "Alguém";
      let text = typeof payload.text === "string" ? payload.text : "";
      text = escapeForHtml(text); // Sanitização

      // Validação de Upload
      if (["image", "audio", "video", "file"].includes(meta)) {
        const data = payload.data;
        if (typeof data !== "string" || !data.startsWith("data:")) return socket.emit("system", "Upload inválido.");
        
        // Verificação aproximada de tamanho
        const sizeApprox = Math.ceil((data.length - data.indexOf(",") - 1) * 3 / 4);
        if (sizeApprox > UPLOAD_MAX_BYTES) return socket.emit("system", "Arquivo muito grande (Máx 10MB).");
      }

      if (socket.room) {
        io.to(socket.room).emit("broadcastInput", { 
            from: socket.id, 
            payload: { meta, text, data: payload.data, username: usernameFromPayload, ts: Date.now() } 
        });
      } else {
        socket.emit("system", "Você não está em uma sala.");
      }
    } catch (err) { console.error(err); }
  });

  // --- 4. GESTÃO DE CLÃS ---
  socket.on("createClan", (name) => {
    if (!name || typeof name !== "string") return;
    name = name.trim();
    if (clans[name]) return socket.emit("clanInfo", "Nome já existe.");
    if (userClans.has(socket.id)) return socket.emit("clanInfo", "Saia do atual.");

    clans[name] = {
      owner: socket.id,
      admins: new Set(), coAdmins: new Set(), members: new Set(),
      banned: new Set(), muted: new Set(),
      wins: 0, points: 0, logs: [], createdAt: Date.now()
    };
    
    userClans.set(socket.id, name);
    usernameMap.set(socket.username, { clan: name, role: "owner" });

    socket.join("clan_" + name);
    socket.emit("clanInfo", `Clã ${name} criado.`);
    notifyClanUpdate(name);
  });

  socket.on("inviteToClan", (targetName) => {
    const cName = getClanOfUser(socket.id); if (!cName) return;
    const tSocket = getSocketByUsername(targetName);
    if (tSocket) {
      tSocket.emit("clanInviteReceived", { clanName: cName, from: socket.username });
      socket.emit("clanInfo", `Convite enviado para ${targetName}.`);
    } else {
      socket.emit("clanInfo", "Usuário não encontrado.");
    }
  });

  socket.on("acceptInvite", (cName) => {
    if (!cName || !clans[cName]) return socket.emit("clanInfo", "Clã não existe.");
    const c = clans[cName];

    if (c.banned.has(socket.id) || c.banned.has(socket.username)) return socket.emit("clanInfo", "Você está banido deste clã.");

    c.members.add(socket.id);
    userClans.set(socket.id, cName);
    usernameMap.set(socket.username, { clan: cName, role: "member" });

    socket.join("clan_" + cName);
    socket.emit("clanInfo", `Entrou em ${cName}`);
    notifyClanUpdate(cName);
  });

  // Funções de Hierarquia (Promover/Rebaixar) com Log
  const logAction = (cName, msg) => {
      const c = clans[cName];
      if(c) { c.logs = c.logs || []; c.logs.push({ ts: Date.now(), text: msg }); }
  };

  socket.on("promoteMember", (targetName) => {
    const cName = getClanOfUser(socket.id); if (!cName) return;
    const c = clans[cName];
    const tSocket = getSocketByUsername(targetName);
    if (!tSocket || getClanOfUser(tSocket.id) !== cName) return;

    const myRole = c.owner === socket.id ? 3 : c.admins.has(socket.id) ? 2 : c.coAdmins.has(socket.id) ? 1 : 0;
    const targetId = tSocket.id;
    let targetRole = c.admins.has(targetId) ? 2 : c.coAdmins.has(targetId) ? 1 : 0;
    const updateRole = (name, role) => usernameMap.set(name, { clan: cName, role });

    if ((myRole === 1 || myRole === 2) && targetRole === 0) {
      c.members.delete(targetId); c.coAdmins.add(targetId);
      updateRole(targetName, "coAdmin");
      logAction(cName, `${socket.username} promoveu ${targetName} a Co-Admin.`);
    } else if (myRole === 2 && targetRole === 1) {
      c.coAdmins.delete(targetId); c.admins.add(targetId);
      updateRole(targetName, "admin");
      logAction(cName, `${socket.username} promoveu ${targetName} a Admin.`);
    } else if (myRole === 3) {
      // Lógica do Dono
      if (targetRole === 0) {
        c.members.delete(targetId); c.coAdmins.add(targetId); updateRole(targetName, "coAdmin");
      } else if (targetRole === 1) {
        c.coAdmins.delete(targetId); c.admins.add(targetId); updateRole(targetName, "admin");
      } else if (targetRole === 2) {
        updateRole(socket.username, "admin");
        updateRole(targetName, "owner");
        c.owner = targetId;
        c.admins.delete(targetId); c.admins.add(socket.id);
        logAction(cName, `${socket.username} passou a liderança para ${targetName}.`);
      }
    }
    notifyClanUpdate(cName);
  });

  socket.on("kickMember", (targetName) => {
    const cName = getClanOfUser(socket.id); if (!cName) return;
    const c = clans[cName];
    if (c.owner !== socket.id) return;
    const tSocket = getSocketByUsername(targetName);
    
    if (tSocket && tSocket.id !== socket.id) {
      removeUserFromClanStruct(cName, tSocket.id);
      usernameMap.delete(targetName);
      tSocket.leave("clan_" + cName);
      tSocket.emit("clanInfo", "Você foi expulso.");
      tSocket.emit("clanUpdated", null);
      logAction(cName, `${socket.username} expulsou ${targetName}.`);
      notifyClanUpdate(cName);
    }
  });

  socket.on("dissolveClan", () => {
    const cName = getClanOfUser(socket.id); if (!cName) return;
    const c = clans[cName];
    if (c.owner !== socket.id) return socket.emit("clanInfo", "Apenas o dono pode dissolver.");

    const allMembers = [...c.members, ...c.admins, ...c.coAdmins, c.owner];
    allMembers.forEach(uid => {
      const s = io.sockets.sockets.get(uid);
      if (s) {
        s.leave("clan_" + cName);
        s.emit("clanUpdated", null);
        s.emit("clanInfo", `O clã ${cName} foi dissolvido.`);
        userClans.delete(uid);
        usernameMap.delete(s.username);
      }
    });

    delete clans[cName];
    io.emit("clanList", getAllClansList());
  });

  socket.on("leaveClan", () => {
    const cName = getClanOfUser(socket.id); if (!cName) return;
    socket.leave("clan_" + cName);
    removeUserFromClanStruct(cName, socket.id);
    usernameMap.delete(socket.username);
    socket.emit("clanUpdated", null);
    if (clans[cName]) notifyClanUpdate(cName);
  });

  function removeUserFromClanStruct(cName, uid) {
    const c = clans[cName]; if (!c) return;
    c.members.delete(uid); c.admins.delete(uid); c.coAdmins.delete(uid);
    userClans.delete(uid);
  }

  socket.on("requestClans", () => socket.emit("clanList", getAllClansList()));

  socket.on("clanMessage", (txt) => {
    const cName = getClanOfUser(socket.id); if (!cName) return;
    if (clans[cName].muted.has(socket.id)) return socket.emit("clanInfo", "Silenciado.");
    io.to("clan_" + cName).emit("clanChat", { from: socket.username, text: escapeForHtml(txt), ts: Date.now() });
  });

  // --- 5. GUERRAS & CAPTCHA ---
  socket.on("createWar", ({ targetClan, durationSec }) => {
    const cName = getClanOfUser(socket.id); if (!cName) return;
    if (!targetClan) return socket.emit("system", "Clã alvo inválido.");
    
    const warId = generateId("war");
    wars[warId] = { id: warId, clanA: cName, clanB: targetClan, scores: { [cName]: 0, [targetClan]: 0 }, active: true, createdAt: Date.now() };

    // Gera tokens para membros ativos
    warCaptchas[warId] = warCaptchas[warId] || {};
    const getMembers = (cl) => clans[cl] ? [clans[cl].owner, ...clans[cl].admins, ...clans[cl].coAdmins, ...clans[cl].members] : [];
    
    [...getMembers(cName), ...getMembers(targetClan)].forEach(uid => {
        if(!uid) return;
        const token = Math.random().toString(36).substring(2, 6).toUpperCase();
        warCaptchas[warId][uid] = token;
        const s = io.sockets.sockets.get(uid);
        if(s) s.emit("warCaptchaChallenge", { warId, token }); // Client deve mostrar esse token
    });

    io.to("clan_" + cName).to("clan_" + targetClan).emit("warCreated", { warId, clanA: cName, clanB: targetClan });
    
    setTimeout(() => {
      if (wars[warId]) {
        const w = wars[warId];
        let winner = w.scores[w.clanA] > w.scores[w.clanB] ? w.clanA : (w.scores[w.clanB] > w.scores[w.clanA] ? w.clanB : null);
        
        if (winner && clans[winner]) { clans[winner].wins++; clans[winner].points += 10; }
        if (clans[w.clanA]) clans[w.clanA].points += (w.scores[w.clanA] || 0);
        if (clans[w.clanB]) clans[w.clanB].points += (w.scores[w.clanB] || 0);
        
        io.emit("warEnded", { warId, winner });
        delete wars[warId];
        delete warCaptchas[warId];
        notifyClanUpdate(w.clanA); notifyClanUpdate(w.clanB);
      }
    }, (durationSec || 60) * 1000);
  });

  socket.on("submitWarPoint", ({ warId, points = 1, captchaAnswer } = {}) => {
    const w = wars[warId]; if (!w || !w.active) return;
    const cName = getClanOfUser(socket.id); if (!cName) return;

    // Verificação de Captcha
    if (warCaptchas[warId] && warCaptchas[warId][socket.id]) {
        const expected = warCaptchas[warId][socket.id];
        if (!captchaAnswer || String(captchaAnswer).toUpperCase() !== String(expected).toUpperCase()) {
            return socket.emit("system", "Captcha incorreto.");
        }
        // Opcional: Rotacionar token para dificultar bot
        // delete warCaptchas[warId][socket.id]; 
    }

    w.scores[cName] = (w.scores[cName] || 0) + (points || 1);
    io.to("clan_" + w.clanA).to("clan_" + w.clanB).emit("warUpdated", { warId, scores: w.scores });
    notifyClanUpdate(cName);
  });

  socket.on("requestRanking", () => {
    socket.emit("ranking", Object.keys(clans).map(n => ({ name: n, wins: clans[n].wins, points: clans[n].points })).sort((a, b) => b.wins - a.wins));
  });

  // --- 6. VOZ (WEBRTC) ---
  socket.on("joinVoiceChannel", (payload) => {
    const clanName = payload.clanName || payload;
    if (!clanName) return;

    const roomID = `voice_${clanName}`;
    socket.join(roomID);
    rooms[roomID] = rooms[roomID] || { users: new Set() };

    const existing = Array.from(rooms[roomID].users)
      .filter(id => id !== socket.id)
      .map(id => ({ id, name: socketToUsername.get(id) || "Alguém" }));

    socket.emit("allVoiceUsers", existing);
    rooms[roomID].users.add(socket.id);
    socket.voiceRoom = roomID;
    io.to(roomID).emit("system", `${socket.username} entrou na voz.`);
  });

  socket.on("sendingSignal", p => io.to(p.userToSignal).emit("userJoinedVoice", { signal: p.signal, callerID: p.callerID, name: socket.username }));
  socket.on("returningSignal", p => io.to(p.callerID).emit("receivingReturnedSignal", { signal: p.signal, id: socket.id, name: socket.username }));

  socket.on("leaveVoiceChannel", (clanName) => {
    const roomID = clanName ? `voice_${clanName}` : socket.voiceRoom;
    if (!roomID || !rooms[roomID]) return;
    
    rooms[roomID].users.delete(socket.id);
    socket.leave(roomID);
    socket.voiceRoom = null;
    io.to(roomID).emit("userLeftVoice", socket.id);
  });

  socket.on("voiceKick", ({ targetId }) => {
    const cName = getClanOfUser(socket.id);
    const c = clans[cName];
    if (!c || (c.owner !== socket.id && !c.admins.has(socket.id))) return socket.emit("clanInfo", "Sem permissão.");

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
        const roomID = targetSocket.voiceRoom;
        if(roomID) {
            targetSocket.leave(roomID);
            targetSocket.voiceRoom = null;
            if(rooms[roomID]) rooms[roomID].users.delete(targetId);
            targetSocket.emit("voiceForceDisconnect", { reason: `Expulso por ${socket.username}` });
            io.to(roomID).emit("userLeftVoice", targetId);
        }
    }
  });

  // --- 7. DESCONEXÃO ---
  socket.on("disconnect", () => {
    socketToUsername.delete(socket.id);
    if(socket.username) usernameToSocket.delete(socket.username);
    lastMsgAt.delete(socket.id);

    // Limpa salas públicas
    if (socket.room && rooms[socket.room]) {
        rooms[socket.room].users.delete(socket.id);
        if (rooms[socket.room].users.size === 0) delete rooms[socket.room];
    }

    // Limpa Voz
    if (socket.voiceRoom && rooms[socket.voiceRoom]) {
        rooms[socket.voiceRoom].users.delete(socket.id);
        io.to(socket.voiceRoom).emit("userLeftVoice", socket.id);
        if (rooms[socket.voiceRoom].users.size === 0) delete rooms[socket.voiceRoom];
    }

    // Limpa Estrutura Ativa do Clã (Mas mantém usernameMap)
    const cName = getClanOfUser(socket.id);
    if (cName && clans[cName]) {
        clans[cName].members.delete(socket.id);
        clans[cName].admins.delete(socket.id);
        clans[cName].coAdmins.delete(socket.id);
        userClans.delete(socket.id);
        notifyClanUpdate(cName);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));