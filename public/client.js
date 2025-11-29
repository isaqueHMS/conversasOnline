// client.js - versão completa com melhorias no sistema de voz (mute local, nomes, menu por usuário, kick)
// Dependências: SimplePeer, socket.io (mesmo que já usava)

const socket = io();

// =================== ELEMENTOS DO DOM ===================

// --- Toolbar & Login ---
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");

// --- Chat Público ---
const terminal = document.getElementById("terminal");
const cmdInput = document.getElementById("cmdInput");
const sendBtn = document.getElementById("sendBtn");

// --- Mídia ---
const imgBtn = document.getElementById("imgBtn");
const audioBtn = document.getElementById("audioBtn");
const videoBtn = document.getElementById("videoBtn");
const imageInput = document.getElementById("imageInput");
const audioInput = document.getElementById("audioInput");
const videoInput = document.getElementById("videoInput");
const progressBar = document.getElementById("progressBar");
const previewModal = document.getElementById("imagePreviewModal");
const previewImage = document.getElementById("previewImage");

// --- Clãs: Home & Ações ---
const clanInput = document.getElementById("clanInput");
const createClanBtn = document.getElementById("createClanBtn");
const leaveClanBtn = document.getElementById("leaveClanBtn");
const listClansBtn = document.getElementById("listClansBtn");
const clanInfoDiv = document.getElementById("clanInfo");
const membersListDiv = document.getElementById("membersListDiv");
const acceptInviteBtn = document.getElementById("acceptInviteBtn");
const declineInviteBtn = document.getElementById("declineInviteBtn");

// --- Clãs: Gestão Hierarquia ---
const inviteBtn = document.getElementById("inviteBtn");
const inviteTargetInput = document.getElementById("inviteTargetInput");
const promoteBtn = document.getElementById("promoteBtn");
const demoteBtn = document.getElementById("demoteBtn");
const promoteTargetInput = document.getElementById("promoteTargetInput");

// --- Clãs: Zona do Dono ---
const ownerTargetInput = document.getElementById("ownerTargetInput");
const kickBtn = document.getElementById("kickBtn");
const banBtn = document.getElementById("banBtn");
const muteBtn = document.getElementById("muteBtn");
const dissolveBtn = document.getElementById("dissolveBtn");

// --- Clãs: Chat ---
const clanChatDiv = document.getElementById("clanChatDiv");
const clanChatInput = document.getElementById("clanChatInput");
const clanChatSendBtn = document.getElementById("clanChatSendBtn");

// --- Clãs: Guerras & Minigame Hacking ---
const createWarBtn = document.getElementById("createWarBtn");
const warTargetInput = document.getElementById("warTargetInput");
const warZonePanel = document.getElementById("warZonePanel");
const requestRankingBtn = document.getElementById("requestRankingBtn");
const rankingDiv = document.getElementById("rankingDiv");

// --- Clãs: Voz (WebRTC) ---
const joinVoiceBtn = document.getElementById("joinVoiceBtn");
const leaveVoiceBtn = document.getElementById("leaveVoiceBtn");
const voiceStatus = document.getElementById("voiceStatus");
const audioContainer = document.getElementById("audioContainer");
const localMuteBtn = document.getElementById("localMuteBtn"); // botão adicional no HTML

// =================== VARIÁVEIS GLOBAIS & BLOQUEIO DE NOME ===================

let username = localStorage.getItem("username");
let currentWarId = null;
let currentCode = "";
const HACK_CODES = ["ROOT", "SUDO", "HACK", "CODE", "BASH", "NANO", "PING", "DDOS", "VOID", "NULL", "JAVA", "NODE", "EXIT", "WIFI", "DATA"];

let localStream = null;
let peers = {}; // estrutura: peers[peerId] = { peer: SimplePeerInstance, name: "...", wrapperEl: ..., audioEl: ... }
let isMuted = false; // mute do microfone local (tudo)
let isVoiceJoined = false;

// =================== Inicialização de nome ===================

if (username) {
    nameInput.value = username;
    nameInput.disabled = true;
    nameInput.style.opacity = "0.5";
    saveNameBtn.style.display = "none";
    socket.emit("setUsername", username);
} else {
    username = "Visitante-" + Math.floor(Math.random() * 1000);
    nameInput.value = "";
    nameInput.placeholder = "Escolha seu Nick (Definitivo!)";
}

saveNameBtn.onclick = () => {
    const newName = nameInput.value.trim();
    if (!newName) return alert("Por favor, digite um nome.");
    if (newName.length > 15) return alert("Nome muito longo! Máximo 15 letras.");

    username = newName;
    localStorage.setItem("username", username);
    socket.emit("setUsername", username);
    addMessage(`Nome registrado permanentemente: ${username}`, "system");

    nameInput.disabled = true;
    nameInput.style.opacity = "0.5";
    saveNameBtn.style.display = "none";
};

joinBtn.onclick = () => {
    const room = roomInput.value.trim();
    if (room) socket.emit("joinRoom", room);
};

// =================== FUNÇÕES DE CHAT E MÍDIA ===================

function addMessage(content, type = "text", target = "public") {
    const msg = document.createElement("div");
    msg.className = "message";

    if (type === "text" || type === "system") {
        msg.innerHTML = content;
        if (type === "system") msg.style.color = "#10b981";
    } else if (type === "image") {
        const img = document.createElement("img");
        img.src = content;
        img.onclick = () => { previewImage.src = content; previewModal.style.display = "flex"; };
        msg.appendChild(img);
    } else if (type === "audio") {
        const audio = document.createElement("audio");
        audio.src = content;
        audio.controls = true;
        msg.appendChild(audio);
    } else if (type === "video") {
        const video = document.createElement("video");
        video.src = content;
        video.controls = true;
        msg.appendChild(video);
    }

    const box = (target === "clan") ? clanChatDiv : terminal;
    if (box) {
        box.appendChild(msg);
        box.scrollTop = box.scrollHeight;
    }
}

sendBtn.onclick = () => {
    const text = cmdInput.value.trim();
    if (!text) return;
    socket.emit("terminalInput", { text, meta: "text", username });
    cmdInput.value = "";
};
cmdInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendBtn.click(); });

socket.on("broadcastInput", ({ from, payload }) => {
    if (payload.meta === "text") {
        addMessage(`<b>${payload.username}:</b> ${payload.text}`);
    } else {
        const nome = payload.username || "Alguém";
        addMessage(`<b>${nome} enviou:</b>`, "text");
        addMessage(payload.data, payload.meta);
    }
});

socket.on("system", (txt) => addMessage(txt, "system"));

function sendFile(file, type) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert("Arquivo muito grande! Máximo 10MB.");
    addMessage(`Enviando ${type}... aguarde.`, "system");
    const reader = new FileReader();
    reader.onload = () => socket.emit("terminalInput", { meta: type, data: reader.result, username });
    reader.readAsDataURL(file);
}

imgBtn.onclick = () => imageInput.click();
imageInput.onchange = () => { sendFile(imageInput.files[0], "image"); imageInput.value = ""; };
audioBtn.onclick = () => audioInput.click();
audioInput.onchange = () => { sendFile(audioInput.files[0], "audio"); audioInput.value = ""; };
videoBtn.onclick = () => videoInput.click();
videoInput.onchange = () => { sendFile(videoInput.files[0], "video"); videoInput.value = ""; };
previewModal.onclick = () => previewModal.style.display = "none";

// =================== CLÃS: GERAL E GUERRAS (mantive sua lógica) ===================

createClanBtn.onclick = () => socket.emit("createClan", clanInput.value);
leaveClanBtn.onclick = () => socket.emit("leaveClan");
listClansBtn.onclick = () => socket.emit("requestClans");
acceptInviteBtn.onclick = () => socket.emit("acceptInvite", clanInput.value);
declineInviteBtn.onclick = () => socket.emit("declineInvite", clanInput.value);

inviteBtn.onclick = () => socket.emit("inviteToClan", inviteTargetInput.value);
promoteBtn.onclick = () => socket.emit("promoteMember", promoteTargetInput.value);
demoteBtn.onclick = () => socket.emit("demoteMember", promoteTargetInput.value);

kickBtn.onclick = () => socket.emit("kickMember", ownerTargetInput.value);
muteBtn.onclick = () => socket.emit("muteMember", ownerTargetInput.value);
banBtn.onclick = () => {
    if (confirm("Banir usuário permanentemente?")) socket.emit("banMember", ownerTargetInput.value);
};

if (dissolveBtn) {
    dissolveBtn.onclick = () => {
        const confirmacao = prompt("Tem certeza? Isso apagará o clã e removerá TODOS os membros.\nDigite 'DELETAR' para confirmar:");
        if (confirmacao === "DELETAR") {
            socket.emit("dissolveClan");
        } else {
            alert("Ação cancelada. Você precisa digitar DELETAR.");
        }
    };
}

clanChatSendBtn.onclick = () => {
    const txt = clanChatInput.value.trim();
    if (txt) {
        socket.emit("clanMessage", txt);
        clanChatInput.value = "";
    }
};

socket.on("clanChat", ({ from, text }) => {
    const nome = (from === username) ? "[Eu]" : from;
    addMessage(`<b>${nome}:</b> ${text}`, "text", "clan");
});

socket.on("clanInfo", (msg) => addMessage(msg, "system"));

socket.on("clanInviteReceived", (data) => {
    addMessage(`📩 <b>CONVITE:</b> Clã <span style="color:yellow">${data.clanName}</span> te chamou!`, "system");
    if (clanInput) clanInput.value = data.clanName;
    if (typeof openTab === "function") openTab('tab-home');
});

socket.on("clanUpdated", (data) => {
    if (!data) {
        if (clanInfoDiv) clanInfoDiv.innerHTML = "Sem Clã";
        if (membersListDiv) membersListDiv.innerHTML = "...";
        if (warZonePanel) warZonePanel.style.display = "none";
        return;
    }

    if (clanInfoDiv) {
        clanInfoDiv.innerHTML = `
            <div style="color: #3b82f6; font-weight:bold; font-size: 1.1em">${data.name}</div>
            <div>👑 Dono: ${data.owner}</div>
            <div style="margin-top:5px; font-size:0.9em; color:#bbb">
                🏆 Vitórias: ${data.wins} | ✨ Pontos: ${data.points}
            </div>
        `;
    }

    if (membersListDiv && data.members) {
        membersListDiv.innerHTML = "";
        let myRole = "Membro";
        data.members.forEach(member => {
            if (member.name === username) myRole = member.role;
            const item = document.createElement("div");
            item.className = "member-item";
            const mutedIcon = member.muted ? "🔇" : "";
            item.innerHTML = `
                <div class="member-info">
                    <span class="member-name">${member.name} ${mutedIcon}</span>
                    <span class="member-battles">⚔️ Batalhas: ${member.battles || 0}</span>
                </div>
                <span class="role-badge role-${member.role.replace(" ", "-")}">${member.role}</span>
            `;
            membersListDiv.appendChild(item);
        });

        if (warZonePanel) {
            warZonePanel.style.display = "block";
            if (myRole === "Membro" || myRole === "Co-Admin") {
                if (warConfigArea) warConfigArea.style.display = "none";
            } else {
                if (warConfigArea) warConfigArea.style.display = "block";
            }
        }
    }
});

socket.on("clanList", (clans) => {
    let html = "<b>Clãs Disponíveis:</b><br>";
    const list = Object.values(clans);
    if (list.length === 0) html += "Nenhum clã criado.";
    list.forEach(c => {
        const count = Array.isArray(c.members) ? c.members.length : 0;
        html += `• ${c.name} (Membros: ${count})<br>`;
    });
    if (clanInfoDiv) clanInfoDiv.innerHTML = html;
});

// =================== GUERRA E MINIGAME (mantive iguais) ===================

function generateCode() {
    const word = HACK_CODES[Math.floor(Math.random() * HACK_CODES.length)];
    const num = Math.floor(Math.random() * 99);
    currentCode = `${word}-${num}`;
    if (hackCodeDisplay) hackCodeDisplay.innerText = currentCode;
    if (hackInput) { hackInput.value = ""; hackInput.focus(); }
}

createWarBtn.onclick = () => {
    const target = warTargetInput.value.trim();
    if (!target) return alert("Digite o nome do clã inimigo!");
    socket.emit("createWar", { targetClan: target, durationSec: 60 });
};

if (hackInput) {
    hackInput.addEventListener("input", () => {
        const val = hackInput.value.toUpperCase();
        if (val === currentCode) {
            if (!currentWarId) return;
            socket.emit("submitWarPoint", { warId: currentWarId, points: 15 });
            hackFeedback.style.color = "#0f0";
            hackFeedback.innerText = ">> DADOS ENVIADOS <<";
            document.querySelector(".hack-terminal").classList.add("success-flash");
            setTimeout(() => document.querySelector(".hack-terminal").classList.remove("success-flash"), 200);
            generateCode();
        } else if (!currentCode.startsWith(val)) {
            hackFeedback.style.color = "red";
            hackFeedback.innerText = "ERRO DE SINTAXE";
            hackInput.classList.add("shake");
            setTimeout(() => hackInput.classList.remove("shake"), 300);
            hackInput.value = "";
        }
    });
}

function startMinigame(warId) {
    currentWarId = warId;
    if (noWarMsg) noWarMsg.style.display = "none";
    if (warConfigArea) warConfigArea.style.display = "none";
    if (warGameArea) warGameArea.style.display = "block";
    generateCode();
}

function endMinigame() {
    currentWarId = null;
    if (warGameArea) warGameArea.style.display = "none";
    if (noWarMsg) { noWarMsg.style.display = "block"; noWarMsg.innerText = "Aguardando conflito..."; }
    socket.emit("requestClans");
}

socket.on("warCreated", (info) => {
    addMessage(`⚔️ GUERRA: ${info.clanA} vs ${info.clanB}`, "system");
    startMinigame(info.warId);
});

socket.on("warUpdated", (data) => {
    const clans = Object.keys(data.scores);
    if (clans.length >= 2 && myClanScoreEl && enemyClanScoreEl) {
        myClanScoreEl.innerText = `${clans[0]}: ${data.scores[clans[0]]}`;
        enemyClanScoreEl.innerText = `${clans[1]}: ${data.scores[clans[1]]}`;
        const total = data.scores[clans[0]] + data.scores[clans[1]];
        if (total > 0 && warProgressBar) {
            const pct = (data.scores[clans[0]] / total) * 100;
            warProgressBar.style.width = pct + "%";
        }
    }
    if (!currentWarId) { currentWarId = data.warId; startMinigame(data.warId); }
});

socket.on("warEnded", (res) => {
    addMessage(`🏁 Vencedor: ${res.winner || "Empate"}`, "system");
    endMinigame();
});

requestRankingBtn.onclick = () => socket.emit("requestRanking");
socket.on("ranking", (list) => {
    rankingDiv.innerHTML = list.map((c, i) =>
        `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding:4px;">
            <span>#${i + 1} <b>${c.name}</b></span>
            <span>${c.points} pts</span>
         </div>`
    ).join("");
});

// =================== SISTEMA DE VOZ (WEBRTC) - REESCRITO E APRIMORADO ===================

// Helper para criar SimplePeer iniciador
function createPeer(userToSignal, callerID, stream) {
    const peer = new SimplePeer({ initiator: true, trickle: false, stream: stream });
    peer.on("signal", signal => socket.emit("sendingSignal", { userToSignal, callerID, signal }));
    peer.on("stream", stream => addAudioElement(userToSignal, stream));
    return peer;
}

// Helper para responder peer (não iniciador)
function addPeer(incomingSignal, callerID, stream) {
    const peer = new SimplePeer({ initiator: false, trickle: false, stream: stream });
    peer.on("signal", signal => socket.emit("returningSignal", { signal, callerID }));
    peer.signal(incomingSignal);
    peer.on("stream", stream => addAudioElement(callerID, stream));
    return peer;
}

// Cria a UI do usuário na call: bolinha + nome + menu
function addAudioElement(id, stream, name = "Alguém") {
    // Evita duplicata
    if (document.getElementById(`audioBox_${id}`)) return;

    const wrapper = document.createElement("div");
    wrapper.id = `audioBox_${id}`;
    wrapper.className = "voice-user-wrapper";
    wrapper.style.position = "relative";
    wrapper.style.padding = "6px";
    wrapper.style.margin = "6px";
    wrapper.style.border = "1px solid rgba(255,255,255,0.06)";
    wrapper.style.borderRadius = "8px";
    wrapper.style.display = "inline-block";
    wrapper.style.minWidth = "120px";
    wrapper.style.textAlign = "center";

    // Label com o nome
    const label = document.createElement("div");
    label.className = "voice-label";
    label.innerText = name;
    label.style.fontSize = "0.9em";
    label.style.marginBottom = "6px";
    wrapper.appendChild(label);

    // Elemento de áudio (invisível)
    const audio = document.createElement("audio");
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.controls = false;
    audio.style.width = "100%";
    wrapper.appendChild(audio);

    // Uma indicação simples de que está conectado
    const statusDot = document.createElement("div");
    statusDot.className = "voice-status-dot";
    statusDot.style.width = "10px";
    statusDot.style.height = "10px";
    statusDot.style.borderRadius = "50%";
    statusDot.style.background = "#6ee7b7";
    statusDot.style.display = "inline-block";
    statusDot.style.marginTop = "6px";
    wrapper.appendChild(statusDot);

    audioContainer.appendChild(wrapper);

    // Armazena na tabela local
    peers[id] = peers[id] || {};
    peers[id].audioEl = audio;
    peers[id].wrapperEl = wrapper;
    peers[id].name = name;

    // Cria o menu (volume, mute local, kick)
    createUserMenu(id, name, wrapper, audio);
}

// Cria menu de ações quando clica na pessoa
function createUserMenu(peerId, peerName, wrapper, audio) {
    const menu = document.createElement("div");
    menu.className = "voice-menu";
    menu.style.position = "absolute";
    menu.style.left = "6px";
    menu.style.top = "6px";
    menu.style.background = "rgba(0,0,0,0.8)";
    menu.style.border = "1px solid rgba(255,255,255,0.06)";
    menu.style.padding = "8px";
    menu.style.borderRadius = "8px";
    menu.style.display = "none";
    menu.style.minWidth = "140px";
    menu.style.zIndex = "50";
    menu.style.color = "#fff";

    menu.innerHTML = `
        <div style="font-weight:bold; margin-bottom:6px">${peerName}</div>
        <div style="margin-bottom:6px">
            <label style="font-size:0.85em">Volume</label><br>
            <input class="volume-slider" type="range" min="0" max="100" value="100">
        </div>
        <div style="display:flex; gap:6px; justify-content:space-between">
            <button class="mute-btn" style="flex:1">Mutar</button>
            <button class="kick-btn" style="flex:1; color:#ff6666">Expulsar</button>
        </div>
    `;

    wrapper.appendChild(menu);

    // Toggle menu ao clicar na wrapper
    wrapper.addEventListener("click", (ev) => {
        // não fechar em clique nos controles internos
        if (ev.target.closest(".voice-menu")) return;
        menu.style.display = menu.style.display === "none" ? "block" : "none";
    });

    // Volume slider
    const slider = menu.querySelector(".volume-slider");
    slider.oninput = (e) => {
        audio.volume = e.target.value / 100;
    };

    // Mute local (só para você)
    const muteBtn = menu.querySelector(".mute-btn");
    muteBtn.onclick = (e) => {
        e.stopPropagation();
        audio.muted = !audio.muted;
        muteBtn.innerText = audio.muted ? "Desmutar" : "Mutar";
    };

    // Kick (envia evento para o server, server decide permissões)
    const kickBtnMenu = menu.querySelector(".kick-btn");
    kickBtnMenu.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Expulsar ${peerName} da chamada de voz?`)) return;
        socket.emit("voiceKick", { targetId: peerId });
    };
}

// =================== CONTROLES DE JOIN / LEAVE VOICE ===================

joinVoiceBtn.onclick = async () => {
    let cName = clanInput.value;

    if (!cName && clanInfoDiv) {
        const divName = clanInfoDiv.querySelector("div:first-child");
        if (divName) cName = divName.innerText;
    }

    if (!cName) return alert("Entre em um clã primeiro.");

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        // garante que microfone inicia ativo
        localStream.getAudioTracks().forEach(t => t.enabled = true);
        isMuted = false;

        joinVoiceBtn.style.display = "none";
        leaveVoiceBtn.style.display = "inline-block";
        voiceStatus.innerText = "Conectado | Falando...";
        voiceStatus.style.color = "#10b981";
        if (localMuteBtn) localMuteBtn.style.display = "inline-block";

        socket.emit("joinVoiceChannel", { clanName: cName, username });
        isVoiceJoined = true;

    } catch (err) {
        console.error("Erro no microfone:", err);
        alert("Erro no microfone. Use HTTPS ou Localhost.");
    }
};

leaveVoiceBtn.onclick = () => {
    let cName = clanInput.value;
    if (!cName && clanInfoDiv) {
        const divName = clanInfoDiv.querySelector("div:first-child");
        if (divName) cName = divName.innerText;
    }
    socket.emit("leaveVoiceChannel", { clanName: cName, username });
    endCall();
};

function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    Object.values(peers).forEach(p => {
        try {
            if (p.peer && p.peer.destroy) p.peer.destroy();
        } catch (e) { /* ignore */ }
    });
    peers = {};
    audioContainer.innerHTML = "";
    joinVoiceBtn.style.display = "inline-block";
    leaveVoiceBtn.style.display = "none";
    voiceStatus.innerText = "Desconectado";
    voiceStatus.style.color = "#aaa";
    if (localMuteBtn) localMuteBtn.style.display = "none";
    isVoiceJoined = false;
}

// Botão de mute global (sua voz)
if (localMuteBtn) {
    localMuteBtn.onclick = () => {
        if (!localStream) return;
        isMuted = !isMuted;
        localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
        localMuteBtn.innerText = isMuted ? "Unmute" : "Mute";
    };
}

// =================== SOCKET EVENTS PARA VOZ (compatível com variantes do server) ===================

// Recebe lista de usuários já na sala - aceita tanto array de ids como array de objetos {id, name}
socket.on("allVoiceUsers", (users) => {
    // users pode ser: ["id1","id2"] ou [{ id: "id1", name: "Fulano" }, ...]
    // se users for array de ids, o server deve enviar mais evento com nomes; aqui fazemos o melhor esforço.
    users.forEach(u => {
        if (typeof u === "string") {
            // apenas ID - cria peer sem nome por enquanto
            const userID = u;
            if (!peers[userID]) {
                const peer = createPeer(userID, socket.id, localStream);
                peers[userID] = { peer, name: "Alguém" };
            }
        } else if (typeof u === "object") {
            const userID = u.id;
            const name = u.name || "Alguém";
            if (!peers[userID]) {
                const peer = createPeer(userID, socket.id, localStream);
                peers[userID] = { peer, name };
                // armazenamos o nome para usar quando receber o stream
                peers[userID].pendingName = name;
            } else {
                peers[userID].name = name;
            }
        }
    });
});

// Outro usuário entrou - payload pode ter signal e callerID (se equivalente ao teu server original) e opcionalmente name
socket.on("userJoinedVoice", (payload) => {
    // payload esperado: { signal, callerID, name? }
    if (!payload) return;
    const callerID = payload.callerID || payload.id;
    const incomingSignal = payload.signal;
    const name = payload.name || payload.username || "Alguém";

    const peer = addPeer(incomingSignal, callerID, localStream);
    peers[callerID] = peers[callerID] || {};
    peers[callerID].peer = peer;
    peers[callerID].name = name;
    peers[callerID].pendingName = name;
});

// Recebe retorno de signal (quando iniciador recebe resposta)
socket.on("receivingReturnedSignal", (payload) => {
    const item = peers[payload.id];
    if (item && item.peer) item.peer.signal(payload.signal);
});

// Quando alguém sai da call
socket.on("userLeftVoice", (id) => {
    if (peers[id]) {
        try { if (peers[id].peer && peers[id].peer.destroy) peers[id].peer.destroy(); } catch (e) {}
        delete peers[id];
    }
    const audioDiv = document.getElementById(`audioBox_${id}`);
    if (audioDiv) audioDiv.remove();
});

// Servidor força desconexão (por exemplo kick)
socket.on("voiceForceDisconnect", () => {
    // o server manda isso para o usuário alvo
    endCall();
});

// Se o servidor enviar info adicional (nome vinculado a id)
socket.on("voiceUserInfo", ({ id, name }) => {
    if (peers[id]) {
        peers[id].name = name;
        peers[id].pendingName = name;
        // atualiza label se já existir
        const wrapper = peers[id].wrapperEl;
        if (wrapper) {
            const lbl = wrapper.querySelector(".voice-label");
            if (lbl) lbl.innerText = name;
        }
    }
});

// Se o server enviar stream de um peer já existente, tenta setar o nome pendente
// Observação: SimplePeer dispara 'stream' no peer - nós já tratamos isso nas factories acima.
// Aqui só reforçamos: quando o audio for criado, usamos peers[id].pendingName caso exista.

// =================== EVENTOS GERAIS DO SOCKET (mantive) ===================

socket.on("clanInviteReceived", (data) => {
    addMessage(`📩 <b>CONVITE:</b> Clã <span style="color:yellow">${data.clanName}</span> te chamou!`, "system");
});

socket.on("clanUpdated", (data) => {
    // já tratado acima
});

// =================== FIM DO ARQUIVO ===================
