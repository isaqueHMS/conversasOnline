const socket = io();

const terminal = document.getElementById("terminal");
const cmdInput = document.getElementById("cmdInput");
const sendBtn = document.getElementById("sendBtn");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");

const imgBtn = document.getElementById("imgBtn");
const audioBtn = document.getElementById("audioBtn");
const imageInput = document.getElementById("imageInput");
const audioInput = document.getElementById("audioInput");

// Area de nome
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");

// Nome do usuário
let username = localStorage.getItem("username") || "Anônimo";

// Se já tem nome salvo, coloca no input
if (nameInput) {
  nameInput.value = username;
}

// Função pra adicionar mensagens
function addMessage(content, type = "text") {
  const msg = document.createElement("div");
  msg.classList.add("message");

  if (type === "text") {
    msg.innerHTML = content;
  }

  if (type === "image") {
    const img = document.createElement("img");
    img.src = content;
    msg.appendChild(img);
  }

  if (type === "audio") {
    const audio = document.createElement("audio");
    audio.src = content;
    audio.controls = true;
    msg.appendChild(audio);
  }

  terminal.appendChild(msg);
  terminal.scrollTop = terminal.scrollHeight;
}

// Salvar / trocar nome
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
  if (!room) {
    alert("Digite o nome da sala!");
    return;
  }

  socket.emit("joinRoom", room);
  addMessage(`<span class="system">Você entrou na sala: ${room}</span>`);
};

// Enviar mensagem
function sendMessage() {
  const text = cmdInput.value.trim();
  if (!text) return;

  socket.emit("terminalInput", {
    text: text,
    username: username,
    meta: "text"
  });

  cmdInput.value = "";
}

// Clique no botão
sendBtn.onclick = sendMessage;

// Enter no input
cmdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Enviar imagem
imgBtn.onclick = () => imageInput.click();

imageInput.onchange = () => {
  const file = imageInput.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    socket.emit("terminalInput", {
      meta: "image",
      type: "image",
      data: reader.result,
      username: username
    });
  };

  reader.readAsDataURL(file);
};

// Enviar áudio
audioBtn.onclick = () => audioInput.click();

audioInput.onchange = () => {
  const file = audioInput.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    socket.emit("terminalInput", {
      meta: "audio",
      type: "audio",
      data: reader.result,
      username: username
    });
  };

  reader.readAsDataURL(file);
};

// Receber mensagens
socket.on("broadcastInput", ({ from, payload }) => {

  const name = payload.username || from;

  if (payload.meta === "text") {
    addMessage(`<b>${name}:</b> ${payload.text}`, "text");
  }

  if (payload.meta === "image") {
    addMessage(`<b>${name}:</b>`, "text");
    addMessage(payload.data, "image");
  }

  if (payload.meta === "audio") {
    addMessage(`<b>${name}:</b>`, "text");
    addMessage(payload.data, "audio");
  }
});

// Mensagens do sistema
socket.on("system", (msg) => {
  addMessage(`<span class="system">${msg}</span>`);
});
