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

// Função pra adicionar mensagens no terminal
function addMessage(content, type = "text") {
  const msg = document.createElement("div");
  msg.classList.add("message");

  if (type === "text") {
    msg.textContent = content;
  }

  if (type === "image") {
    const img = document.createElement("img");
    img.src = content;
    img.style.maxWidth = "250px";
    img.style.display = "block";
    img.style.marginTop = "5px";
    msg.appendChild(img);
  }

  if (type === "audio") {
    const audio = document.createElement("audio");
    audio.src = content;
    audio.controls = true;
    audio.style.display = "block";
    audio.style.marginTop = "5px";
    msg.appendChild(audio);
  }

  terminal.appendChild(msg);
  terminal.scrollTop = terminal.scrollHeight;
}

// Entrar na sala
joinBtn.onclick = () => {
  const room = roomInput.value.trim();
  if (!room) return alert("Digite o nome da sala!");

  socket.emit("join", room);
  addMessage(`Conectado à sala: ${room}`);
};

// Enviar mensagem de texto
function sendMessage() {
  const text = cmdInput.value.trim();
  if (!text) return;

  socket.emit("message", text);
  cmdInput.value = "";
}

sendBtn.onclick = sendMessage;

cmdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// BOTÕES DE UPLOAD

imgBtn.onclick = () => {
  imageInput.click();
};

audioBtn.onclick = () => {
  audioInput.click();
};

// Envio de imagem
imageInput.onchange = () => {
  const file = imageInput.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    socket.emit("file", {
      type: "image",
      data: reader.result
    });
  };

  reader.readAsDataURL(file);
};

// Envio de áudio
audioInput.onchange = () => {
  const file = audioInput.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    socket.emit("file", {
      type: "audio",
      data: reader.result
    });
  };

  reader.readAsDataURL(file);
};

// Receber mensagens
socket.on("message", (msg) => {
  addMessage(msg, "text");
});

// Receber arquivos
socket.on("file", (file) => {
  addMessage(file.data, file.type);
});
