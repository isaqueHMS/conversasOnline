const socket = io(); // conecta
const terminal = document.getElementById("terminal");
const roomInput = document.getElementById("roomInput");
const joinBtn = document.getElementById("joinBtn");
const cmdInput = document.getElementById("cmdInput");
const sendBtn = document.getElementById("sendBtn");

function appendLine(text, cls){
  const el = document.createElement("div");
  el.className = cls ? `line ${cls}` : "line";
  el.textContent = text;
  terminal.appendChild(el);
  terminal.scrollTop = terminal.scrollHeight;
}

joinBtn.addEventListener("click", () => {
  const room = roomInput.value.trim();
  if (!room) return alert("Escolha o nome da sala");
  socket.emit("joinRoom", room);
  appendLine(`Você entrou na sala "${room}"`, "system");
});

sendBtn.addEventListener("click", sendCmd);
cmdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendCmd();
});

function sendCmd(){
  const text = cmdInput.value;
  if (!text) return;
  // envia para o servidor (pode ser tecla por tecla também)
  socket.emit("terminalInput", { text, at: Date.now() });
  appendLine(`> ${text}`, "you");
  cmdInput.value = "";
}

// Recebe broadcast do servidor
socket.on("broadcastInput", ({ from, payload }) => {
  // se for de você mesmo, talvez ignore (já mostramos localmente)
  if (socket.id === from) return;
  appendLine(`${from}: ${payload.text}`, "other");
});

socket.on("system", (msg) => appendLine(msg, "system"));
