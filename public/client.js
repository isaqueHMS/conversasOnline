const socket = io();

const terminal = document.getElementById("terminal");
const cmdInput = document.getElementById("cmdInput");
const sendBtn = document.getElementById("sendBtn");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");

const imgBtn = document.getElementById("imgBtn");
const audioBtn = document.getElementById("audioBtn");
const videoBtn = document.getElementById("videoBtn");

const imageInput = document.getElementById("imageInput");
const audioInput = document.getElementById("audioInput");
const videoInput = document.getElementById("videoInput");

const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");

const progressBar = document.getElementById("progressBar");
const previewModal = document.getElementById("imagePreviewModal");
const previewImage = document.getElementById("previewImage");

// ---- CLANS: elementos do HTML ----
const clanInput = document.getElementById("clanInput");
const createClanBtn = document.getElementById("createClanBtn");
const joinClanBtn = document.getElementById("joinClanBtn");
const leaveClanBtn = document.getElementById("leaveClanBtn");
const listClansBtn = document.getElementById("listClansBtn");
const clanInfoDiv = document.getElementById("clanInfo");

let username = localStorage.getItem("username") || "Anônimo";
nameInput.value = username;

// =================== PROGRESSO ===================
function startProgress() {
  progressBar.style.width = "0%";
  let progress = 0;

  const interval = setInterval(() => {
    progress += 5;
    progressBar.style.width = progress + "%";

    if (progress >= 100) clearInterval(interval);
  }, 80);
}

// =================== MENSAGENS ===================
function addMessage(content, type = "text") {
  const msg = document.createElement("div");
  msg.classList.add("message");

  if (type === "text") {
    msg.innerHTML = content;
  }

  if (type === "image") {
    const img = document.createElement("img");
    img.src = content;
    img.style.maxWidth = "250px";
    img.style.cursor = "zoom-in";

    img.onclick = () => {
      previewImage.src = content;
      previewModal.style.display = "flex";
    };

    const saveBtn = document.createElement("a");
    saveBtn.textContent = "Salvar imagem";
    saveBtn.href = content;
    saveBtn.download = "imagem.png";
    saveBtn.className = "save-btn";

    msg.appendChild(img);
    msg.appendChild(saveBtn);
  }

  if (type === "audio") {
    const audio = document.createElement("audio");
    audio.src = content;
    audio.controls = true;
    msg.appendChild(audio);
  }

  if (type === "video") {
    const video = document.createElement("video");
    video.src = content;
    video.controls = true;
    video.style.maxWidth = "300px";
    msg.appendChild(video);
  }

  terminal.appendChild(msg);
  terminal.scrollTop = terminal.scrollHeight;
}

// =================== MODAL PREVIEW ===================
previewModal.onclick = () => {
  previewModal.style.display = "none";
};

// =================== NOME DE USUÁRIO ===================
saveNameBtn.onclick = () => {
  const newName = nameInput.value.trim();

  if (newName.length < 2) {
    alert("Nome muito curto.");
    return;
  }

  username = newName;
  localStorage.setItem("username", username);

  addMessage(`<span class="system">Seu nome agora é ${username}</span>`);
};

// =================== SALA ===================
joinBtn.onclick = () => {
  const room = roomInput.value.trim();
  if (!room) return alert("Digite o nome da sala!");

  socket.emit("joinRoom", room);
  addMessage(`<span class="system">Você entrou na sala: ${room}</span>`);
};

// =================== SISTEMA DE CLÃ (BOTÕES) ===================
createClanBtn.onclick = () => {
  const clan = clanInput.value.trim();
  if (!clan) return alert("Digite o nome do clã!");
  socket.emit("createClan", clan);
};

joinClanBtn.onclick = () => {
  const clan = clanInput.value.trim();
  if (!clan) return alert("Digite o nome do clã!");
  socket.emit("joinClan", clan);
};

leaveClanBtn.onclick = () => {
  socket.emit("leaveClan");
};

listClansBtn.onclick = () => {
  socket.emit("requestClans");
};

// =================== SISTEMA DE CLÃ (COMANDOS NO CHAT) ===================
function handleClanCommands(text) {
  if (text.startsWith("/criarlan ")) {
    const clan = text.replace("/criarlan ", "").trim();
    socket.emit("createClan", clan);
    return true;
  }

  if (text.startsWith("/entrarclan ")) {
    const clan = text.replace("/entrarclan ", "").trim();
    socket.emit("joinClan", clan);
    return true;
  }

  if (text === "/sairclan") {
    socket.emit("leaveClan");
    return true;
  }

  if (text === "/verclans") {
    socket.emit("requestClans");
    return true;
  }

  if (text === "/meucla") {
    socket.emit("myClan");
    return true;
  }

  return false;
}

// =================== ENVIO TEXTO ===================
function sendMessage() {
  const text = cmdInput.value.trim();
  if (!text) return;

  if (handleClanCommands(text)) {
    cmdInput.value = "";
    return;
  }

  socket.emit("terminalInput", {
    text,
    username,
    meta: "text"
  });

  cmdInput.value = "";
}

sendBtn.onclick = sendMessage;
cmdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// =================== ENVIO DE ARQUIVOS ===================
function sendFile(file, metaType) {
  const reader = new FileReader();

  startProgress();

  reader.onload = () => {
    socket.emit("terminalInput", {
      meta: metaType,
      data: reader.result,
      username
    });
  };

  reader.readAsDataURL(file);
}

// =================== BOTÕES DE UPLOAD ===================
imgBtn.onclick = () => imageInput.click();
audioBtn.onclick = () => audioInput.click();
videoBtn.onclick = () => videoInput.click();

imageInput.onchange = () => {
  const file = imageInput.files[0];
  if (file) sendFile(file, "image");
};

audioInput.onchange = () => {
  const file = audioInput.files[0];
  if (file) sendFile(file, "audio");
};

videoInput.onchange = () => {
  const file = videoInput.files[0];
  if (file) sendFile(file, "video");
};

// =================== RECEBENDO MENSAGENS ===================
socket.on("broadcastInput", ({ from, payload }) => {
  const name = payload.username || from;

  if (payload.meta === "text") {
    addMessage(`<b>${name}:</b> ${payload.text}`);
  }

  if (payload.meta === "image") {
    addMessage(`<b>${name}:</b>`);
    addMessage(payload.data, "image");
  }

  if (payload.meta === "audio") {
    addMessage(`<b>${name}:</b>`);
    addMessage(payload.data, "audio");
  }

  if (payload.meta === "video") {
    addMessage(`<b>${name}:</b>`);
    addMessage(payload.data, "video");
  }
});

// =================== CLÃ: respostas do server ===================
socket.on("clanList", (clans) => {
  clanInfoDiv.innerHTML = "<b>Clãs disponíveis:</b><br>";

  const entries = Object.keys(clans);

  if (entries.length === 0) {
    clanInfoDiv.innerHTML += "Nenhum clã criado ainda.";
    addMessage("<span class='system'>Nenhum clã criado ainda.</span>");
    return;
  }

  entries.forEach(clan => {
    const members = clans[clan].members.length;
    const line = `• ${clan} (${members} membros)`;
    clanInfoDiv.innerHTML += line + "<br>";
    addMessage(`<span class="system">${line}</span>`);
  });
});

socket.on("clanInfo", (msg) => {
  clanInfoDiv.innerHTML = msg;
  addMessage(`<span class="system">${msg}</span>`);
});

// =================== MENSAGENS DO SISTEMA ===================
socket.on("system", (msg) => {
  addMessage(`<span class="system">${msg}</span>`);
});
