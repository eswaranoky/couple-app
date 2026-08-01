// Exact Config Credentials
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

let confirmationResult = null;
let currentUserPhone = "";
let partnerPhone = "";
let roomId = "";
let selectedReplyMsg = null;
let profileBase64 = "";
let recaptchaVerifier = null;

// OTP Send Fix
function sendOTP() {
  const phoneInput = document.getElementById('phone-number').value.trim();
  
  if (!phoneInput || phoneInput.length < 12) {
    alert("Please enter a valid 10-digit phone number with +91!");
    return;
  }

  if (!recaptchaVerifier) {
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      'size': 'invisible'
    });
    recaptchaVerifier = window.recaptchaVerifier;
  }

  auth.signInWithPhoneNumber(phoneInput, recaptchaVerifier)
    .then((result) => {
      confirmationResult = result;
      currentUserPhone = phoneInput;
      document.getElementById('otp-group').classList.remove('hidden');
      document.getElementById('send-otp-btn').classList.add('hidden');
      alert("OTP sent to " + phoneInput);
    })
    .catch((err) => {
      alert("Error sending OTP: " + err.message);
    });
}

function verifyOTP() {
  const code = document.getElementById('otp-code').value.trim();
  confirmationResult.confirm(code)
    .then(() => {
      checkUserPartnerStatus();
    })
    .catch(() => {
      alert("Invalid OTP! Try again.");
    });
}

function checkUserPartnerStatus() {
  db.collection('users').doc(currentUserPhone).get().then((doc) => {
    if (doc.exists && doc.data().partnerPhone) {
      partnerPhone = doc.data().partnerPhone;
      setupChatRoom();
    } else {
      showScreen('screen-partner');
    }
  });
}

function linkPartner() {
  const pPhone = document.getElementById('partner-phone').value.trim();
  if (!pPhone || pPhone.length < 12) {
    alert("Enter valid partner number with +91!");
    return;
  }

  partnerPhone = pPhone;
  db.collection('users').doc(currentUserPhone).set({ partnerPhone: pPhone }, { merge: true });
  setupChatRoom();
}

function setupChatRoom() {
  const ids = [currentUserPhone, partnerPhone].sort();
  roomId = ids.join('_');

  showScreen('screen-chat');
  document.getElementById('header-partner-name').innerText = partnerPhone;

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
  const isMe = msg.sender === currentUserPhone;
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
    sender: currentUserPhone,
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
  alert(`Initiating 1-on-1 ${type.toUpperCase()} Call with ${partnerPhone}... (Agora WebRTC Ready)`);
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
  db.collection('users').doc(currentUserPhone).get().then((doc) => {
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

  db.collection('users').doc(currentUserPhone).set(updateData, { merge: true }).then(() => {
    alert("Settings Saved! 1-Year Lock Activated.");
    loadSettings();
    closeSettings();
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}