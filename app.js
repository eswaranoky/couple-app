// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyA_T43xxOggTqRt_1V_COQaeE-4G0Ufjms",
  authDomain: "couple-app-4816e.firebaseapp.com",
  projectId: "couple-app-4816e",
  storageBucket: "couple-app-4816e.firebasestorage.app",
  messagingSenderId: "967046038404",
  appId: "1:967046038404:web:525d4c7a9fbbf058a153d1",
  measurementId: "G-065VWYDCNC"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUserEmail = "";
let partnerEmail = "";
let roomId = "";
let selectedReplyMsg = null;
let profileBase64 = "";

// 1. Google Auth Login
function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then((result) => {
      currentUserEmail = result.user.email;
      checkUserPartnerStatus();
    })
    .catch((error) => {
      alert("Login Error: " + error.message);
    });
}

// 2. Partner Linking Check
function checkUserPartnerStatus() {
  const userDocRef = db.collection('users').doc(currentUserEmail);
  userDocRef.get().then((doc) => {
    if (doc.exists && doc.data().partnerEmail) {
      partnerEmail = doc.data().partnerEmail;
      setupChatRoom();
    } else {
      showScreen('screen-partner');
    }
  });
}

function linkPartner() {
  const pEmail = document.getElementById('partner-email').value.trim().toLowerCase();
  if (!pEmail || !pEmail.includes('@')) {
    alert("Please enter a valid partner email address!");
    return;
  }

  partnerEmail = pEmail;
  db.collection('users').doc(currentUserEmail).set({ partnerEmail: pEmail }, { merge: true });
  setupChatRoom();
}

// 3. Real-time Chat
function setupChatRoom() {
  const ids = [currentUserEmail, partnerEmail].sort();
  roomId = ids.join('_').replace(/[^a-zA-Z0-9]/g, "_");

  showScreen('screen-chat');
  document.getElementById('header-partner-name').innerText = partnerEmail;

  db.collection('rooms').doc(roomId).collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot((snapshot) => {
      const chatBox = document.getElementById('chat-box');
      chatBox.innerHTML = '';
      snapshot.forEach((doc) => {
        renderMessage(doc.data());
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    });

  loadSettings();
}

function renderMessage(msg) {
  const chatBox = document.getElementById('chat-box');
  const div = document.createElement('div');
  const isMe = msg.sender === currentUserEmail;
  div.className = `msg-bubble ${isMe ? 'me' : 'partner'}`;

  let replyHtml = '';
  if (msg.replyTo) {
    replyHtml = `<div class="quoted-msg"><b>Reply:</b> ${msg.replyTo}</div>`;
  }

  const timeStr = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

  div.innerHTML = `
    ${replyHtml}
    <span>${msg.text}</span>
    <span class="msg-time">${timeStr}</span>
  `;

  div.onclick = () => {
    selectedReplyMsg = msg.text;
    document.getElementById('reply-preview').classList.remove('hidden');
    document.getElementById('reply-to-text').innerText = msg.text;
  };

  chatBox.appendChild(div);
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;

  const msgData = {
    text: text,
    sender: currentUserEmail,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (selectedReplyMsg) {
    msgData.replyTo = selectedReplyMsg;
  }

  db.collection('rooms').doc(roomId).collection('messages').add(msgData);
  input.value = '';
  cancelReply();
}

function cancelReply() {
  selectedReplyMsg = null;
  document.getElementById('reply-preview').classList.add('hidden');
}

function startCall(type) {
  alert(`Initiating 1-on-1 ${type.toUpperCase()} Call with ${partnerEmail}...`);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function openSettings() { showScreen('screen-settings'); }
function closeSettings() { showScreen('screen-chat'); }

function handleImageUpload(e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onloadend = () => {
    profileBase64 = reader.result;
    document.getElementById('settings-preview-img').src = profileBase64;
  };
  if (file) reader.readAsDataURL(file);
}

function loadSettings() {
  db.collection('users').doc(currentUserEmail).get().then((doc) => {
    if (doc.exists) {
      const data = doc.data();
      if (data.appName) {
        document.getElementById('app-title-head').innerText = data.appName;
        document.getElementById('edit-app-name').value = data.appName;
      }
      if (data.profilePic) {
        document.getElementById('settings-preview-img').src = data.profilePic;
        document.getElementById('header-avatar').src = data.profilePic;
      }

      if (data.lastUpdated) {
        const lastDate = data.lastUpdated.toDate();
        const now = new Date();
        const diffDays = Math.ceil((now - lastDate) / (1000 * 60 * 60 * 24));
        if (diffDays < 365) {
          document.getElementById('save-settings-btn').disabled = true;
          document.getElementById('lock-warning').classList.remove('hidden');
          document.getElementById('lock-warning').innerHTML = `🔒 Settings Locked! Next edit available in <b>${365 - diffDays} days</b>.`;
        }
      }
    }
  });
}

function saveSettings() {
  const newName = document.getElementById('edit-app-name').value.trim();
  const updateData = {
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (newName) updateData.appName = newName;
  if (profileBase64) updateData.profilePic = profileBase64;

  db.collection('users').doc(currentUserEmail).set(updateData, { merge: true }).then(() => {
    alert("Settings Saved! 1-Year Lock Activated.");
    loadSettings();
    closeSettings();
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}