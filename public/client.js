// =================== SOCKET ===================
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

// --- Mídia & Upload ---
const imgBtn = document.getElementById("imgBtn");
const audioBtn = document.getElementById("audioBtn");
const videoBtn = document.getElementById("videoBtn");
const imageInput = document.getElementById("imageInput");
const audioInput = document.getElementById("audioInput");
const videoInput = document.getElementById("videoInput");
const progressBar = document.getElementById("progressBar");
const previewModal = document.getElementById("imagePreviewModal");
const previewImage = document.getElementById("previewImage");
const dragOverlay = document.getElementById("dragOverlay");

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

// --- Guerras & Minigame ---
const createWarBtn = document.getElementById("createWarBtn");
const warTargetInput = document.getElementById("warTargetInput");
const warZonePanel = document.getElementById("warZonePanel");
const requestRankingBtn = document.getElementById("requestRankingBtn");
const rankingDiv = document.getElementById("rankingDiv");

// Elementos do Jogo Hacker
const hackCodeDisplay = document.getElementById("hackCodeDisplay");
const hackInput = document.getElementById("hackInput");
const hackFeedback = document.getElementById("hackFeedback");
const warConfigArea = document.getElementById("warConfigArea");
const noWarMsg = document.getElementById("noWarMsg");
const warGameArea = document.getElementById("warGameArea");
const myClanScoreEl = document.getElementById("myClanScore");
const enemyClanScoreEl = document.getElementById("enemyClanScore");
const warProgressBar = document.getElementById("warProgressBar");

// --- Elementos do Captcha de Guerra ---
const warCaptchaModal = document.getElementById("warCaptchaModal");
const warCaptchaTokenDisplay = document.getElementById("warCaptchaToken");
const warCaptchaInput = document.getElementById("warCaptchaInput");
const warCaptchaSubmit = document.getElementById("warCaptchaSubmit");
const warCaptchaCancel = document.getElementById("warCaptchaCancel");

// --- Voz (WebRTC) ---
const joinVoiceBtn = document.getElementById("joinVoiceBtn");
const leaveVoiceBtn = document.getElementById("leaveVoiceBtn");
const voiceStatus = document.getElementById("voiceStatus");
const audioContainer = document.getElementById("audioContainer");

// =================== VARIÁVEIS GLOBAIS ===================
let username = localStorage.getItem("username");
let currentWarId = null;
let currentCode = "";
const HACK_CODES = ["ROOT","SUDO","HACK","CODE","BASH","NANO","PING","DDOS","VOID","NULL","JAVA","NODE","EXIT","WIFI","DATA"];

let localStream = null;
let peers = {};
let lastSentAt = 0;
let myCaptchaAnswer = null;

// =================== INICIALIZAÇÃO DE USUÁRIO ===================
if (username) {
    if (nameInput) {
        nameInput.value = username;
        nameInput.disabled = true;
        nameInput.style.opacity = "0.5";
    }
    if (saveNameBtn) saveNameBtn.style.display = "none";
    socket.emit("setUsername", username);
} else {
    username = "Visitante-" + Math.floor(Math.random() * 1000);
    if (nameInput) {
        nameInput.value = "";
        nameInput.placeholder = "Escolha seu Nick (Definitivo!)";
    }
}

if (saveNameBtn) {
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
}

if (joinBtn) {
    joinBtn.onclick = () => {
        const room = roomInput.value.trim();
        if (room) socket.emit("joinRoom", room);
    };
}

// =================== FUNÇÕES AUXILIARES ===================
function escapeHTML(str) {
    return String(str || "").replace(/[&<>"'`=\/]/g, s => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',"/":'&#x2F;','`':'&#96;','=':'&#61;'
    })[s]);
}

function formatTime(ts = Date.now()) {
    return new Date(ts).toLocaleTimeString();
}

function canSendMessage(minDelayMs = 2000) {
    const now = Date.now();
    if (now - lastSentAt < minDelayMs) return false;
    lastSentAt = now;
    return true;
}

function parseSimpleMarkdown(text) {
    let out = escapeHTML(text);
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
    out = out.replace(/`(.+?)`/g, '<code>$1</code>');
    out = out.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:cyan">$1</a>');
    return out;
}

// =================== CHAT PÚBLICO ===================

function addMessage(content, type = "text", target = "public", ts = Date.now()) {
    const msg = document.createElement("div");
    msg.className = "message";

    if (type === "text" || type === "system") {
        msg.innerHTML = content;
        if (type === "system") msg.style.color = "#10b981";
    } else if (type === "image") {
        const img = document.createElement("img");
        img.src = content;
        img.onclick = () => { if (previewImage) previewImage.src = content; if (previewModal) previewModal.style.display = "flex"; };
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
    } else if (type === "announce") {
        // Estilo especial para anúncios
        msg.style.borderLeft = "4px solid #ef4444";
        msg.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
        msg.style.padding = "10px";
        msg.innerHTML = `<b style="color:#ef4444">📢 ANÚNCIO:</b> ${content}`;
    }

    const timeSpan = document.createElement("span");
    timeSpan.style.fontSize = "0.7em";
    timeSpan.style.color = "#666";
    timeSpan.innerText = ` [${formatTime(ts)}] `;
    
    if(type !== "announce") msg.prepend(timeSpan);

    const box = (target === "clan") ? clanChatDiv : terminal;
    if (box) {
        box.appendChild(msg);
        box.scrollTop = box.scrollHeight;
    }
}

if (sendBtn) {
    sendBtn.onclick = () => {
        const text = cmdInput.value.trim();
        if (!text) return;

        // Rate limit simples (server valida também)
        if (!canSendMessage(1500)) {
            addMessage("Calma! Espere um pouco para enviar outra mensagem.", "system");
            return;
        }

        socket.emit("terminalInput", { text, meta: "text", username, ts: Date.now() });
        cmdInput.value = "";
    };
}
if (cmdInput) cmdInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendBtn.click(); });

socket.on("broadcastInput", ({ from, payload } = {}) => {
    payload = payload || {};
    const nome = payload.username || from || "Alguém";
    const ts = payload.ts || Date.now();
    
    if (payload.meta === "text") {
        const parsed = parseSimpleMarkdown(payload.text || "");
        addMessage(`<b>${escapeHTML(nome)}:</b> ${parsed}`, "text", "public", ts);
    } else {
        addMessage(`<b>${escapeHTML(nome)} enviou:</b>`, "text", "public", ts);
        addMessage(payload.data, payload.meta, "public", ts);
    }
});

socket.on("system", (txt) => addMessage(txt, "system", "public", Date.now()));

// =================== EVENTOS DE ADMINISTRAÇÃO ===================

// 1. Limpar Chat (/clear)
socket.on("clearChat", () => {
    if(terminal) terminal.innerHTML = "";
    addMessage("🧹 O chat foi limpo por um administrador.", "system");
});

// 2. Anúncio Global (/announce)
socket.on("announcement", (data) => {
    alert(`📢 ANÚNCIO: ${data.text}`);
    addMessage(escapeHTML(data.text), "announce");
});

// 3. Forçar Reload (/reload)
socket.on("forceReloadClients", () => {
    addMessage("🔄 O servidor está reiniciando clientes...", "system");
    setTimeout(() => location.reload(), 1000);
});

// 4. Forçar desconexão da voz (kick da voz)
socket.on("voiceForceDisconnect", (data) => {
    endCall(); // Função que já existe para fechar WebRTC
    addMessage(`🔊 Você foi desconectado da voz: ${data.reason}`, "system");
});

// =================== UPLOAD & DRAG AND DROP ===================

function handleFileSend(file) {
    if (!file) return;
    const max = 10 * 1024 * 1024; // 10MB
    if (file.size > max) return alert("Arquivo muito grande! Máx 10MB.");
    
    const reader = new FileReader();
    reader.onload = () => {
        const preview = reader.result;
        if(!confirm(`Deseja enviar o arquivo: ${file.name}?`)) return;

        const meta = file.type.startsWith("image/") ? "image" : 
                     (file.type.startsWith("audio/") ? "audio" : 
                     (file.type.startsWith("video/") ? "video" : "file"));
                     
        addMessage(`Enviando ${file.name}...`, "system");
        socket.emit("terminalInput", { meta, data: preview, username, ts: Date.now() });
    };
    reader.readAsDataURL(file);
}

if (imgBtn) imgBtn.onclick = () => imageInput.click();
if (imageInput) imageInput.onchange = () => { handleFileSend(imageInput.files[0]); imageInput.value = ""; };
if (audioBtn) audioBtn.onclick = () => audioInput.click();
if (audioInput) audioInput.onchange = () => { handleFileSend(audioInput.files[0]); audioInput.value = ""; };
if (videoBtn) videoBtn.onclick = () => videoInput.click();
if (videoInput) videoInput.onchange = () => { handleFileSend(videoInput.files[0]); videoInput.value = ""; };

if (dragOverlay) {
    window.addEventListener("dragenter", (e) => { e.preventDefault(); });
    window.addEventListener("dragover", (e) => {
        e.preventDefault();
        dragOverlay.classList.add("active");
    });
    dragOverlay.addEventListener("dragleave", (e) => {
        if (e.relatedTarget === null) dragOverlay.classList.remove("active");
    });
    window.addEventListener("drop", (e) => {
        e.preventDefault();
        dragOverlay.classList.remove("active");
        if (e.dataTransfer.files.length > 0) {
            handleFileSend(e.dataTransfer.files[0]);
        }
    });
}
if(previewModal) previewModal.onclick = () => previewModal.style.display = "none";

// =================== CLÃS ===================

if (createClanBtn) createClanBtn.onclick = () => socket.emit("createClan", clanInput.value);
if (leaveClanBtn) leaveClanBtn.onclick = () => socket.emit("leaveClan");
if (listClansBtn) listClansBtn.onclick = () => socket.emit("requestClans");
if (acceptInviteBtn) acceptInviteBtn.onclick = () => socket.emit("acceptInvite", clanInput.value);
if (declineInviteBtn) declineInviteBtn.onclick = () => socket.emit("declineInvite", clanInput.value);

if (inviteBtn) inviteBtn.onclick = () => socket.emit("inviteToClan", inviteTargetInput.value);
if (promoteBtn) promoteBtn.onclick = () => socket.emit("promoteMember", promoteTargetInput.value);
if (demoteBtn) demoteBtn.onclick = () => socket.emit("demoteMember", promoteTargetInput.value);

if (kickBtn) kickBtn.onclick = () => socket.emit("kickMember", ownerTargetInput.value);
if (muteBtn) muteBtn.onclick = () => socket.emit("muteMember", ownerTargetInput.value);
if (banBtn) banBtn.onclick = () => { if (confirm("Banir usuário permanentemente?")) socket.emit("banMember", ownerTargetInput.value); };

if (dissolveBtn) {
    dissolveBtn.onclick = () => {
        const confirmacao = prompt("Tem certeza? Isso apagará o clã e removerá TODOS os membros.\nDigite 'DELETAR' para confirmar:");
        if (confirmacao === "DELETAR") {
            socket.emit("dissolveClan");
        } else {
            alert("Ação cancelada.");
        }
    };
}

if (clanChatSendBtn) {
    clanChatSendBtn.onclick = () => {
        const txt = clanChatInput.value.trim();
        if (txt) {
            socket.emit("clanMessage", txt);
            clanChatInput.value = "";
        }
    };
}

socket.on("clanChat", (data) => {
    data = data || {};
    const sender = data.from || "Alguém";
    const nome = (sender === username) ? "[Eu]" : sender;
    addMessage(`<b>${escapeHTML(nome)}:</b> ${parseSimpleMarkdown(data.text || "")}`, "text", "clan", data.ts || Date.now());
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
            <div style="color: #3b82f6; font-weight:bold; font-size: 1.1em">${escapeHTML(data.name)}</div>
            <div>👑 Dono: ${escapeHTML(data.owner)}</div>
            <div style="margin-top:5px; font-size:0.9em; color:#bbb">🏆 Vitórias: ${data.wins} | ✨ Pontos: ${data.points}</div>
        `;
    }

    if (membersListDiv && data.members) {
        membersListDiv.innerHTML = "";
        let myRole = "Membro";
        
        data.members.forEach(member => {
            const memberName = member.name || "Alguém";
            if (memberName === username) myRole = member.role;
            
            const badge = (member.role === "Dono") ? "👑" : 
                          (member.role === "Admin") ? "🔧" : 
                          (member.role === "Co-Admin") ? "⚙️" : "👤";
                          
            const mutedIcon = member.muted ? " 🔇" : "";
            
            const item = document.createElement("div");
            item.className = "member-item";
            item.innerHTML = `
                <div class="member-info">
                    <span class="member-name">${escapeHTML(memberName)} ${badge}${mutedIcon}</span>
                    <span class="member-battles">⚔️ ${member.battles || 0}</span>
                </div>
                <span class="role-badge role-${member.role.replace(" ","-")}">${escapeHTML(member.role)}</span>
            `;
            membersListDiv.appendChild(item);
        });

        if (warZonePanel) {
            warZonePanel.style.display = "block";
            if (warConfigArea) {
                warConfigArea.style.display = (myRole === "Membro" || myRole === "Co-Admin") ? "none" : "block";
            }
        }
    }
});

socket.on("clanList", (clansData) => {
    let html = "<b>Clãs Disponíveis:</b><br>";
    const list = Object.values(clansData || {});
    if (list.length === 0) html += "Nenhum clã criado.";
    list.forEach(c => {
        const count = Array.isArray(c.members) ? c.members.length : (c.members ? c.members.length : 0);
        html += `• ${escapeHTML(c.name)} (Membros: ${count})<br>`;
    });
    if (clanInfoDiv) clanInfoDiv.innerHTML = html;
});

// =================== GUERRA & MINIGAME ===================

socket.on("warCaptchaChallenge", ({ warId, token }) => {
    if (warCaptchaModal) {
        warCaptchaTokenDisplay.innerText = token;
        warCaptchaModal.style.display = "flex";
        warCaptchaInput.value = "";
        warCaptchaInput.focus();
    }
});

if (warCaptchaSubmit) {
    warCaptchaSubmit.onclick = () => {
        const typed = warCaptchaInput.value.trim();
        if (!typed) return alert("Digite o código!");
        myCaptchaAnswer = typed;
        warCaptchaModal.style.display = "none";
        addMessage("Captcha salvo! Prepare-se para atacar.", "system");
    };
}

if (warCaptchaCancel) {
    warCaptchaCancel.onclick = () => {
        warCaptchaModal.style.display = "none";
        myCaptchaAnswer = null; 
    };
}

function generateCode() {
    const word = HACK_CODES[Math.floor(Math.random() * HACK_CODES.length)];
    const num = Math.floor(Math.random() * 99);
    currentCode = `${word}-${num}`;
    if (hackCodeDisplay) hackCodeDisplay.innerText = currentCode;
    if (hackInput) { hackInput.value = ""; hackInput.focus(); }
}

if (createWarBtn) {
    createWarBtn.onclick = () => {
        const target = warTargetInput.value.trim();
        if (!target) return alert("Digite o nome do clã inimigo!");
        socket.emit("createWar", { targetClan: target, durationSec: 60 });
    };
}

if (hackInput) {
    hackInput.addEventListener("input", () => {
        const val = hackInput.value.toUpperCase();
        if (val === currentCode) {
            if (!currentWarId) return;
            
            socket.emit("submitWarPoint", { 
                warId: currentWarId, 
                points: 15,
                captchaAnswer: myCaptchaAnswer
            });
            
            if (hackFeedback) { hackFeedback.style.color = "#0f0"; hackFeedback.innerText = ">> DADOS ENVIADOS <<"; }
            const hackTerm = document.querySelector(".hack-terminal");
            if (hackTerm) {
                hackTerm.classList.add("success-flash");
                setTimeout(() => hackTerm.classList.remove("success-flash"), 200);
            }
            generateCode();
        } else if (!currentCode.startsWith(val)) {
            if (hackFeedback) { hackFeedback.style.color = "red"; hackFeedback.innerText = "ERRO DE SINTAXE"; }
            if (hackInput) { 
                hackInput.classList.add("shake"); 
                setTimeout(() => hackInput.classList.remove("shake"), 300); 
                hackInput.value = ""; 
            }
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
    myCaptchaAnswer = null; 
    if (warGameArea) warGameArea.style.display = "none";
    if (noWarMsg) { noWarMsg.style.display = "block"; noWarMsg.innerText = "Aguardando conflito..."; }
    socket.emit("requestClans");
}

socket.on("warCreated", (info) => {
    addMessage(`⚔️ GUERRA: ${escapeHTML(info.clanA)} vs ${escapeHTML(info.clanB)}`, "system", "public", Date.now());
    startMinigame(info.warId);
});

socket.on("warUpdated", (data) => {
    if (!data || !data.scores) return;
    const clansKeys = Object.keys(data.scores);
    
    if (clansKeys.length >= 2 && myClanScoreEl && enemyClanScoreEl && warProgressBar) {
        const clanA = clansKeys[0];
        const clanB = clansKeys[1];
        myClanScoreEl.innerText = `${clanA}: ${data.scores[clanA]}`;
        enemyClanScoreEl.innerText = `${clanB}: ${data.scores[clanB]}`;
        
        const total = (data.scores[clanA] || 0) + (data.scores[clanB] || 0);
        if (total > 0) {
            const pct = ((data.scores[clanA] || 0) / total) * 100;
            warProgressBar.style.width = pct + "%";
        } else {
            warProgressBar.style.width = "50%";
        }
    }
    
    if (!currentWarId && data.warId) { 
        currentWarId = data.warId; 
        startMinigame(data.warId); 
    }
});

socket.on("warEnded", (res) => { 
    addMessage(`🏁 Vencedor: ${escapeHTML(res.winner || "Empate")}`, "system", "public", Date.now()); 
    endMinigame(); 
});

if (requestRankingBtn) requestRankingBtn.onclick = () => socket.emit("requestRanking");
socket.on("ranking", (list) => {
    rankingDiv.innerHTML = (list || []).map((c, i) =>
        `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding:4px;">
            <span>#${i+1} <b>${escapeHTML(c.name)}</b></span>
            <span>${c.points || 0} pts</span>
         </div>`
    ).join("");
});

// =================== VOZ (WebRTC) ===================

function createPeer(userToSignal, callerID, stream) {
    const peer = new SimplePeer({ initiator: true, trickle: false, stream: stream });
    peer.on("signal", signal => socket.emit("sendingSignal", { userToSignal, callerID, signal }));
    peer.on("stream", stream => addAudioElement(userToSignal, stream));
    return peer;
}

function addPeer(incomingSignal, callerID, stream) {
    const peer = new SimplePeer({ initiator: false, trickle: false, stream: stream });
    peer.on("signal", signal => socket.emit("returningSignal", { signal, callerID }));
    peer.signal(incomingSignal);
    peer.on("stream", stream => addAudioElement(callerID, stream));
    return peer;
}

function addAudioElement(id, stream) {
    if (document.getElementById(`audioBox_${id}`)) return;

    const div = document.createElement("div");
    div.id = `audioBox_${id}`;
    
    const audio = document.createElement("audio");
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.playsInline = true;
    
    div.appendChild(audio);
    if (audioContainer) audioContainer.appendChild(div);
    div.style.animation = "popIn 0.3s";
}

if (joinVoiceBtn) {
    joinVoiceBtn.onclick = async () => {
        let cName = clanInput.value;
        if (!cName && clanInfoDiv) {
            const divName = clanInfoDiv.querySelector("div:first-child");
            if (divName) cName = divName.innerText;
        }

        if (!cName) return alert("Você precisa estar em um clã.");

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            if (joinVoiceBtn) joinVoiceBtn.style.display = "none";
            if (leaveVoiceBtn) leaveVoiceBtn.style.display = "inline-block";
            if (voiceStatus) { voiceStatus.innerText = "Conectado"; voiceStatus.style.color = "#10b981"; }
            socket.emit("joinVoiceChannel", cName);
        } catch (err) {
            console.error("Erro no microfone:", err);
            alert("Erro ao acessar microfone.");
        }
    };
}

if (leaveVoiceBtn) {
    leaveVoiceBtn.onclick = () => {
        let cName = clanInput.value;
        if (!cName && clanInfoDiv) {
             const divName = clanInfoDiv.querySelector("div:first-child");
             if (divName) cName = divName.innerText;
        }
        socket.emit("leaveVoiceChannel", cName);
        endCall();
    };
}

function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    Object.values(peers).forEach(p => { try { if (p.destroy) p.destroy(); } catch(e) {} });
    peers = {};
    if (audioContainer) audioContainer.innerHTML = "";
    if (joinVoiceBtn) joinVoiceBtn.style.display = "inline-block";
    if (leaveVoiceBtn) leaveVoiceBtn.style.display = "none";
    if (voiceStatus) { voiceStatus.innerText = "Desconectado"; voiceStatus.style.color = "#aaa"; }
}

socket.on("allVoiceUsers", (users) => {
    users.forEach(userID => {
        const id = (typeof userID === 'object') ? userID.id : userID;
        const peer = createPeer(id, socket.id, localStream);
        peers[id] = peer;
    });
});

socket.on("userJoinedVoice", (payload) => {
    const peer = addPeer(payload.signal, payload.callerID, localStream);
    peers[payload.callerID] = peer;
});

socket.on("receivingReturnedSignal", (payload) => {
    const item = peers[payload.id];
    if (item) item.signal(payload.signal);
});

socket.on("userLeftVoice", (id) => {
    if (peers[id]) {
        try { peers[id].destroy(); } catch (e) {}
        delete peers[id];
    }
    const audioDiv = document.getElementById(`audioBox_${id}`);
    if (audioDiv) audioDiv.remove();
});

socket.on("clanInviteReceived", (data) => {
    addMessage(`📩 <b>CONVITE:</b> Clã <span style="color:yellow">${escapeHTML(data.clanName)}</span> te chamou!`, "system");
});

// ========================================================
//  MÓDULO VISUAL: FUNDO REATIVO (MOUSE + CLICK)
// ========================================================
(function initBackgroundAnimation() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    const particleCount = 70; 

    // Rastreamento do Mouse
    let mouse = { x: null, y: null, radius: 150 };

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.x;
        mouse.y = e.y;
    });

    // Se o mouse sair da tela, anula a posição
    window.addEventListener('mouseout', () => {
        mouse.x = null;
        mouse.y = null;
    });

    // Efeito de Explosão no Clique
    window.addEventListener('mousedown', (e) => {
        const clickX = e.x;
        const clickY = e.y;
        
        particles.forEach(p => {
            const dx = p.x - clickX;
            const dy = p.y - clickY;
            const dist = Math.sqrt(dx*dx + dy*dy);

            // Se a partícula estiver perto do clique (raio de 200px)
            if (dist < 200) {
                const forceDirectionX = dx / dist;
                const forceDirectionY = dy / dist;
                const force = (200 - dist) / 10; 
                
                // Empurra a partícula violentamente
                p.speedX += forceDirectionX * force;
                p.speedY += forceDirectionY * force;
            }
        });
    });

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    class Particle {
        constructor() { this.reset(); }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 1;
            
            this.baseSpeedX = (Math.random() - 0.5) * 1;
            this.baseSpeedY = (Math.random() - 0.5) * 1;
            
            this.speedX = this.baseSpeedX;
            this.speedY = this.baseSpeedY;
            
            // Cores Hacker/Cyberpunk
            const colors = ['#0f0', '#00ffff', '#b026ff', '#ffffff']; 
            this.color = colors[Math.floor(Math.random() * colors.length)];
            
            this.alpha = 0;
            this.fadeIn = true;
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;

            // Fricção (para desacelerar depois da explosão do clique)
            if (Math.abs(this.speedX) > Math.abs(this.baseSpeedX)) { this.speedX *= 0.95; }
            if (Math.abs(this.speedY) > Math.abs(this.baseSpeedY)) { this.speedY *= 0.95; }

            // Fade in/out
            if (this.fadeIn) {
                this.alpha += 0.01;
                if (this.alpha >= 1) this.fadeIn = false;
            } else {
                this.alpha -= 0.005;
            }

            // Reset se sair da tela ou sumir
            if (this.alpha <= 0 || this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                this.reset();
            }
        }

        draw() {
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;

            // 1. Conexão entre partículas (Rede)
            particles.forEach(p => {
                const dx = p.x - this.x;
                const dy = p.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < 100) {
                    ctx.beginPath();
                    ctx.strokeStyle = this.color;
                    ctx.lineWidth = 0.2;
                    ctx.globalAlpha = (1 - dist/100) * 0.3 * this.alpha;
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();
                }
            });

            // 2. Conexão com o Mouse (Efeito Hack)
            if (mouse.x != null) {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < mouse.radius) {
                    ctx.beginPath();
                    ctx.strokeStyle = '#fff'; 
                    ctx.lineWidth = 0.5;
                    ctx.globalAlpha = (1 - dist/mouse.radius) * 0.8;
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(mouse.x, mouse.y);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1.0;
        }
    }

    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    animate();
})();