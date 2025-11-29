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

// Elementos do Minigame
const warConfigArea = document.getElementById("warConfigArea");
const warGameArea = document.getElementById("warGameArea");
const noWarMsg = document.getElementById("noWarMsg");
const hackCodeDisplay = document.getElementById("hackCodeDisplay");
const hackInput = document.getElementById("hackInput");
const hackFeedback = document.getElementById("hackFeedback");
const myClanScoreEl = document.getElementById("myClanScore");
const enemyClanScoreEl = document.getElementById("enemyClanScore");
const warProgressBar = document.getElementById("warProgressBar");

// --- Clãs: Voz (WebRTC) ---
const joinVoiceBtn = document.getElementById("joinVoiceBtn");
const leaveVoiceBtn = document.getElementById("leaveVoiceBtn");
const voiceStatus = document.getElementById("voiceStatus");
const audioContainer = document.getElementById("audioContainer");

// =================== VARIÁVEIS GLOBAIS ===================
let username = localStorage.getItem("username") || "Visitante";
nameInput.value = username;

let currentWarId = null;
let currentCode = "";
const HACK_CODES = ["ROOT", "SUDO", "HACK", "CODE", "BASH", "NANO", "PING", "DDOS", "VOID", "NULL", "JAVA", "NODE", "EXIT", "WIFI", "DATA"];

// Variáveis de Voz
let localStream = null;
let peers = {}; // Guarda conexões: { socketId: SimplePeerInstance }


// =================== LÓGICA DE USUÁRIO ===================
saveNameBtn.onclick = () => {
    username = nameInput.value.trim() || "Visitante";
    localStorage.setItem("username", username);
    socket.emit("setUsername", username);
    addMessage(`Nome alterado para: ${username}`, "system");
};

joinBtn.onclick = () => {
    const room = roomInput.value.trim();
    if(room) socket.emit("joinRoom", room);
};

// =================== CHAT E MÍDIA ===================
function addMessage(content, type="text", target="public") {
    const msg = document.createElement("div");
    msg.className = "message";

    if (type === "text" || type === "system") {
        msg.innerHTML = content;
        if(type === "system") msg.style.color = "#10b981";
    } 
    else if (type === "image") {
        const img = document.createElement("img");
        img.src = content;
        img.onclick = () => { previewImage.src = content; previewModal.style.display = "flex"; };
        msg.appendChild(img);
    }
    else if (type === "audio") {
        const audio = document.createElement("audio");
        audio.src = content;
        audio.controls = true;
        msg.appendChild(audio);
    }
    else if (type === "video") {
        const video = document.createElement("video");
        video.src = content;
        video.controls = true;
        msg.appendChild(video);
    }
    
    const box = (target === "clan") ? clanChatDiv : terminal;
    if(box) {
        box.appendChild(msg);
        box.scrollTop = box.scrollHeight;
    }
}

sendBtn.onclick = () => {
    const text = cmdInput.value.trim();
    if(!text) return;
    socket.emit("terminalInput", { text, meta: "text", username });
    cmdInput.value = "";
};
cmdInput.addEventListener("keypress", (e) => { if(e.key === "Enter") sendBtn.click(); });

socket.on("broadcastInput", ({ from, payload }) => {
    if(payload.meta === "text") {
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

// =================== CLÃS: GERAL ===================
createClanBtn.onclick = () => socket.emit("createClan", clanInput.value);
leaveClanBtn.onclick = () => socket.emit("leaveClan");
listClansBtn.onclick = () => socket.emit("requestClans");
acceptInviteBtn.onclick = () => socket.emit("acceptInvite", clanInput.value);
declineInviteBtn.onclick = () => socket.emit("declineInvite", clanInput.value); // Nota: declineInvite não estava no server, mas ok

inviteBtn.onclick = () => socket.emit("inviteToClan", inviteTargetInput.value);
promoteBtn.onclick = () => socket.emit("promoteMember", promoteTargetInput.value);
demoteBtn.onclick = () => socket.emit("demoteMember", promoteTargetInput.value);

kickBtn.onclick = () => socket.emit("kickMember", ownerTargetInput.value);
muteBtn.onclick = () => socket.emit("muteMember", ownerTargetInput.value);
banBtn.onclick = () => {
    if(confirm("Banir usuário permanentemente?")) socket.emit("banMember", ownerTargetInput.value);
};

clanChatSendBtn.onclick = () => {
    const txt = clanChatInput.value.trim();
    if(txt) {
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
    if(clanInput) clanInput.value = data.clanName;
    if(typeof openTab === "function") openTab('tab-home');
});

socket.on("clanUpdated", (data) => {
    if (!data) return;

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
            warZonePanel.style.display = (myRole === "Co-Admin" || myRole === "Membro") ? "none" : "block";
        }
    }
});

socket.on("clanList", (clans) => {
    let html = "<b>Clãs Disponíveis:</b><br>";
    const list = Object.values(clans);
    if(list.length === 0) html += "Nenhum clã criado.";
    list.forEach(c => {
        const count = Array.isArray(c.members) ? c.members.length : 0;
        html += `• ${c.name} (Membros: ${count})<br>`;
    });
    if(clanInfoDiv) clanInfoDiv.innerHTML = html;
});

// =================== GUERRAS & MINIGAME ===================
function generateCode() {
    const word = HACK_CODES[Math.floor(Math.random() * HACK_CODES.length)];
    const num = Math.floor(Math.random() * 99);
    currentCode = `${word}-${num}`;
    if(hackCodeDisplay) hackCodeDisplay.innerText = currentCode;
    if(hackInput) { hackInput.value = ""; hackInput.focus(); }
}

createWarBtn.onclick = () => {
    const target = warTargetInput.value.trim();
    if(!target) return alert("Digite o nome do clã inimigo!");
    socket.emit("createWar", { targetClan: target, durationSec: 60 });
};

if(hackInput) {
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
        } 
        else if (!currentCode.startsWith(val)) {
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
    if(noWarMsg) noWarMsg.style.display = "none";
    if(warConfigArea) warConfigArea.style.display = "none";
    if(warGameArea) warGameArea.style.display = "block";
    generateCode();
}

function endMinigame() {
    currentWarId = null;
    if(warGameArea) warGameArea.style.display = "none";
    if(warConfigArea) warConfigArea.style.display = "block";
    if(noWarMsg) { noWarMsg.style.display = "block"; noWarMsg.innerText = "Aguardando conflito..."; }
}

socket.on("warCreated", (info) => {
    addMessage(`⚔️ GUERRA: ${info.clanA} vs ${info.clanB}`, "system");
    startMinigame(info.warId);
});

socket.on("warUpdated", (data) => {
    const clans = Object.keys(data.scores);
    if(clans.length >= 2 && myClanScoreEl && enemyClanScoreEl) {
        myClanScoreEl.innerText = `${clans[0]}: ${data.scores[clans[0]]}`;
        enemyClanScoreEl.innerText = `${clans[1]}: ${data.scores[clans[1]]}`;
        const total = data.scores[clans[0]] + data.scores[clans[1]];
        if(total > 0 && warProgressBar) {
            const pct = (data.scores[clans[0]] / total) * 100;
            warProgressBar.style.width = pct + "%";
        }
    }
    if(!currentWarId) { currentWarId = data.warId; startMinigame(data.warId); }
});

socket.on("warEnded", (res) => {
    addMessage(`🏁 Vencedor: ${res.winner || "Empate"}`, "system");
    endMinigame();
});

requestRankingBtn.onclick = () => socket.emit("requestRanking");
socket.on("ranking", (list) => {
    rankingDiv.innerHTML = list.map((c, i) => 
        `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding:4px;">
            <span>#${i+1} <b>${c.name}</b></span>
            <span>${c.points} pts</span>
         </div>`
    ).join("");
});

// =================== SISTEMA DE VOZ (WEBRTC) ===================

joinVoiceBtn.onclick = async () => {
    // Tenta pegar o nome do clã do input ou do contexto visual (se tiver como pegar do DOM)
    // Assumindo que o usuário digita no clanInput ou já está num clã
    const cName = clanInput.value; 
    
    // Pequena validação para garantir que tem um nome
    if (!cName) return alert("Digite o nome do seu clã no campo 'Nome do Clã' ou entre em um.");

    try {
        // Solicita Microfone
        localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        
        // Atualiza Interface
        joinVoiceBtn.style.display = "none";
        leaveVoiceBtn.style.display = "inline-block";
        voiceStatus.innerText = "Conectado | Falando...";
        voiceStatus.style.color = "#10b981";

        // Avisa server que entrei na voz
        socket.emit("joinVoiceChannel", cName);

    } catch (err) {
        console.error("Erro no microfone:", err);
        alert("Não foi possível acessar o microfone. Verifique se o site tem permissão ou use HTTPS/Localhost.");
    }
};

leaveVoiceBtn.onclick = () => {
    const cName = clanInput.value;
    socket.emit("leaveVoiceChannel", cName);
    endCall();
};

function endCall() {
    // Fecha stream local
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Fecha conexões com outros peers
    Object.values(peers).forEach(peer => {
        if(peer) peer.destroy();
    });
    peers = {};

    // Remove elementos de áudio da tela
    audioContainer.innerHTML = "";

    // Restaura UI
    joinVoiceBtn.style.display = "inline-block";
    leaveVoiceBtn.style.display = "none";
    voiceStatus.innerText = "Desconectado";
    voiceStatus.style.color = "#aaa";
}

// --- Eventos do Socket para WebRTC ---

// 1. Recebi a lista de quem já está na sala (Eu sou o Novato)
socket.on("allVoiceUsers", (users) => {
    users.forEach(userID => {
        const peer = createPeer(userID, socket.id, localStream);
        peers[userID] = peer;
    });
});

// 2. Alguém novo entrou na sala (Eu sou o Veterano)
socket.on("userJoinedVoice", payload => {
    const peer = addPeer(payload.signal, payload.callerID, localStream);
    peers[payload.callerID] = peer;
    addMessage("Novo usuário na voz.", "system", "clan");
});

// 3. O Novato aceitou minha oferta (Handshake completo)
socket.on("receivingReturnedSignal", payload => {
    const item = peers[payload.id];
    if (item) {
        item.signal(payload.signal);
    }
});

// 4. Alguém saiu
socket.on("userLeftVoice", id => {
    if (peers[id]) {
        peers[id].destroy();
        delete peers[id];
    }
    // Remove o áudio específico
    const audioDiv = document.getElementById(`audioBox_${id}`);
    if (audioDiv) audioDiv.remove();
});

// --- Funções Helper do SimplePeer ---

function createPeer(userToSignal, callerID, stream) {
    const peer = new SimplePeer({
        initiator: true, // Eu começo a conexão
        trickle: false,
        stream: stream
    });

    peer.on("signal", signal => {
        socket.emit("sendingSignal", { userToSignal, callerID, signal });
    });

    peer.on("stream", stream => {
        addAudioElement(userToSignal, stream);
    });

    return peer;
}

function addPeer(incomingSignal, callerID, stream) {
    const peer = new SimplePeer({
        initiator: false, // Eu respondo a conexão
        trickle: false,
        stream: stream
    });

    peer.on("signal", signal => {
        socket.emit("returningSignal", { signal, callerID });
    });

    peer.signal(incomingSignal);

    peer.on("stream", stream => {
        addAudioElement(callerID, stream);
    });

    return peer;
}

function addAudioElement(id, stream) {
    // Evita duplicatas
    if (document.getElementById(`audioBox_${id}`)) return;

    const div = document.createElement("div");
    div.id = `audioBox_${id}`;
    
    const audio = document.createElement("audio");
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.playsInline = true; // Importante para mobile
    
    // (Opcional) Visualização simples que alguém está falando
    // div.innerText = `Usuário ${id.substr(0,4)} falando...`;
    // div.style.fontSize = "10px";
    
    div.appendChild(audio);
    audioContainer.appendChild(div);
}