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

let username = localStorage.getItem("username") || "Anônimo";
nameInput.value = username;

// Atualizar barra de progresso fake
function startProgress() {
  progressBar.style.width = "0%";
  let progress = 0;

  const interval = setInterval(() => {
    progress += 5;
    progressBar.style.width = progress + "%";
    if (progress >= 100) clearInterval(interval);
  }, 80);
}

// Função de adicionar mensagem
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

    // Zoom ao clicar
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

// Fechar modal de preview
previewModal.onclick = () => {
  previewModal.style.display = "none";
};

// Salvar nome
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

// Entrar na sala
joinBtn.onclick = () => {
  const room = roomInput.value.trim();
  if (!room) return alert("Digite o nome da sala!");

  socket.emit("joinRoom", room);
  addMessage(`<span class="system">Você entrou na sala: ${room}</span>`);
};

// Enviar mensagem texto
function sendMessage() {
  const text = cmdInput.value.trim();
  if (!text) return;

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

// Função para enviar arquivos
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

// Botões de upload
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

// Receber mensagens
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

// Mensagens do sistema
socket.on("system", (msg) => {
  addMessage(`<span class="system">${msg}</span>`);
});
