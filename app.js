// FIREBASE CONFIGURATION
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
let currentActivePartner = "";
let activeRoomId = "";

// 1. AUTO LOGIN & AUTH CHECK
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUserEmail = user.email.toLowerCase();
    db.collection('users').doc(currentUserEmail).set({
      email: currentUserEmail,
      displayName: user.displayName || currentUserEmail,
      photoURL: user.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png"
    }, { merge: true });

    openHome();
  } else {
    showScreen('screen-login');
  }
});

function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
}

function logout() {
  auth.signOut();
}

// 2. ENCRYPTION / DECRYPTION HELPERS
function encryptText(text) {
  return btoa(encodeURIComponent(text));
}

function decryptText(cipher) {
  try {
    return decodeURIComponent(atob(cipher));
  } catch (e) {
    return cipher;
  }
}

// 3. HOME SCREEN & SETTINGS
function openHome() {
  showScreen('screen-home');
  loadAppSettings();
  listenFriendRequests();
  listenAcceptedChats();
}

function loadAppSettings() {
  db.collection('users').doc(currentUserEmail).get().then((doc) => {
    if (doc.exists && doc.data().appName) {
      document.getElementById('app-display-title').innerText = doc.data().appName;
      document.getElementById('app-title-head').innerText = doc.data().appName;
    }
  });
}

// 4. USER SEARCH & FRIEND REQUESTS
function searchUser() {
  const query = document.getElementById('search-email-input').value.trim().toLowerCase();
  const resultsDiv = document.getElementById('search-results');

  if (!query || query === currentUserEmail) {
    resultsDiv.classList.add('hidden');
    return;
  }

  db.collection('users').where('email', '>=', query).where('email', '<=', query + '\uf8ff').get()
    .then((snapshot) => {
      resultsDiv.innerHTML = '';
      if (snapshot.empty) {
        resultsDiv.classList.add('hidden');
        return;
      }
      resultsDiv.classList.remove('hidden');
      snapshot.forEach((doc) => {
        const u = doc.data();
        if (u.email === currentUserEmail) return;

        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
          <span>${u.email}</span>
          <button onclick="sendFriendRequest('${u.email}')">Send Request</button>
        `;
        resultsDiv.appendChild(div);
      });
    });
}

function sendFriendRequest(targetEmail) {
  const reqId = `${currentUserEmail}_${targetEmail}`;
  db.collection('requests').doc(reqId).set({
    from: currentUserEmail,
    to: targetEmail,
    status: 'pending'
  }).then(() => {
    alert("Friend Request Sent!");
    document.getElementById('search-results').classList.add('hidden');
    document.getElementById('search-email-input').value = '';
  });
}

function listenFriendRequests() {
  db.collection('requests').where('to', '==', currentUserEmail).where('status', '==', 'pending')
    .onSnapshot((snapshot) => {
      const section = document.getElementById('requests-section');
      const list = document.getElementById('requests-list');
      list.innerHTML = '';

      if (snapshot.empty) {
        section.classList.add('hidden');
        return;
      }

      section.classList.remove('hidden');
      snapshot.forEach((doc) => {
        const req = doc.data();
        const card = document.createElement('div');
        card.className = 'req-card';
        card.innerHTML = `
          <span><b>${req.from}</b></span>
          <div class="req-btns">
            <button class="btn-accept" onclick="respondRequest('${doc.id}', '${req.from}', true)">Accept</button>
            <button class="btn-reject" onclick="respondRequest('${doc.id}', '${req.from}', false)">Reject</button>
          </div>
        `;
        list.appendChild(card);
      });
    });
}

function respondRequest(reqId, fromEmail, accept) {
  if (accept) {
    db.collection('requests').doc(reqId).update({ status: 'accepted' });
    db.collection('chats').doc(`${currentUserEmail}_${fromEmail}`).set({ users: [currentUserEmail, fromEmail] });
  } else {
    db.collection('requests').doc(reqId).delete();
  }
}

function listenAcceptedChats() {
  db.collection('chats').where('users', 'array-contains', currentUserEmail)
    .onSnapshot((snapshot) => {
      const chatList = document.getElementById('recent-chats-list');
      chatList.innerHTML = '';

      snapshot.forEach((doc) => {
        const users = doc.data().users;
        const partner = users.find(u => u !== currentUserEmail);

        const card = document.createElement('div');
        card.className = 'chat-card';
        card.onclick = () => openChatRoom(partner);
        card.innerHTML = `
          <img src="https://cdn-icons-png.flaticon.com/512/149/149071.png">
          <div>
            <b>${partner}</b>
            <p style="font-size:12px; color:#666;">Tap to chat</p>
          </div>
        `;
        chatList.appendChild(card);
      });
    });
}

// 5. CHAT ROOM & READ MESSAGES (ORANGE TICK LOGIC)
function openChatRoom(partner) {
  currentActivePartner = partner;
  const ids = [currentUserEmail, partner].sort();
  activeRoomId = ids.join('_').replace(/[^a-zA-Z0-9]/g, "_");

  showScreen('screen-chat');
  document.getElementById('chat-header-name').innerText = partner;

  db.collection('rooms').doc(activeRoomId).collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot((snapshot) => {
      const chatBox = document.getElementById('chat-box');
      chatBox.innerHTML = '';

      snapshot.forEach((doc) => {
        const msg = doc.data();

        // Opposite person mesage-a open panna "read" (Orange Tick)-a update pannum
        if (msg.sender !== currentUserEmail && msg.status !== 'read') {
          db.collection('rooms').doc(activeRoomId).collection('messages').doc(doc.id).update({
            status: 'read'
          });
        }

        renderMessage(doc.data(), doc.id);
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    });
}

// 6. SEND TEXT MESSAGE
function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;

  db.collection('rooms').doc(activeRoomId).collection('messages').add({
    type: 'text',
    text: encryptText(text),
    sender: currentUserEmail,
    status: 'sent',
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = '';
}

// 7. SEND IMAGE MEDIA
function sendMediaMessage(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    db.collection('rooms').doc(activeRoomId).collection('messages').add({
      type: 'image',
      mediaData: evt.target.result,
      sender: currentUserEmail,
      status: 'sent',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  };
  reader.readAsDataURL(file);
}

// 8. SEND VIEW ONCE PHOTO
function sendViewOnceMessage(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    db.collection('rooms').doc(activeRoomId).collection('messages').add({
      type: 'view_once',
      mediaData: evt.target.result,
      isOpened: false,
      sender: currentUserEmail,
      status: 'sent',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  };
  reader.readAsDataURL(file);
}

function openViewOnce(msgId, mediaData, isOpened) {
  if (isOpened) {
    alert("This photo has already expired!");
    return;
  }
  const w = window.open("");
  w.document.write(`<img src="${mediaData}" style="max-width:100%; height:auto;" />`);

  db.collection('rooms').doc(activeRoomId).collection('messages').doc(msgId).update({
    isOpened: true,
    mediaData: ""
  });
}

// 9. VOICE RECORDING LOGIC
let mediaRecorder;
let audioChunks = [];

function startRecording() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();
    document.getElementById('voice-btn').classList.add('recording');
    audioChunks = [];

    mediaRecorder.addEventListener("dataavailable", event => {
      audioChunks.push(event.data);
    });
  });
}

function stopRecording() {
  if (!mediaRecorder) return;
  mediaRecorder.stop();
  document.getElementById('voice-btn').classList.remove('recording');

  mediaRecorder.addEventListener("stop", () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = () => {
      db.collection('rooms').doc(activeRoomId).collection('messages').add({
        type: 'audio',
        mediaData: reader.result,
        sender: currentUserEmail,
        status: 'sent',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    };
  });
}

// 10. RENDER MESSAGES WITH ORANGE TICK
function renderMessage(msg, msgId) {
  const chatBox = document.getElementById('chat-box');
  const div = document.createElement('div');
  const isMe = msg.sender === currentUserEmail;
  div.className = `msg-bubble ${isMe ? 'me' : 'partner'}`;

  const timeStr = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

  // Orange Tick Generator
  let tickHtml = '';
  if (isMe) {
    if (msg.status === 'read') {
      tickHtml = `<span class="tick orange-tick"><i class="fa-solid fa-check-double"></i></span>`;
    } else {
      tickHtml = `<span class="tick grey-tick"><i class="fa-solid fa-check-double"></i></span>`;
    }
  }

  // Body content render by type
  let contentHtml = '';
  if (msg.type === 'image') {
    contentHtml = `<img src="${msg.mediaData}" class="chat-img" />`;
  } else if (msg.type === 'view_once') {
    const statusText = msg.isOpened ? "Opened Photo (Expired)" : "📷 Photo (View Once)";
    const openedClass = msg.isOpened ? "opened" : "";
    contentHtml = `
      <div class="view-once-bubble ${openedClass}" onclick="openViewOnce('${msgId}', '${msg.mediaData}', ${msg.isOpened})">
        <i class="fa-solid fa-circle-notch"></i> ${statusText}
      </div>`;
  } else if (msg.type === 'audio') {
    contentHtml = `<audio controls src="${msg.mediaData}" style="max-width:200px;"></audio>`;
  } else {
    contentHtml = `<span>${decryptText(msg.text)}</span>`;
  }

  div.innerHTML = `
    ${contentHtml}
    <span class="msg-meta">
      <span class="msg-time">${timeStr}</span>
      ${tickHtml}
    </span>
  `;

  chatBox.appendChild(div);
}

// 11. NAVIGATION & SETTINGS
function startCall(type) { alert(`Calling ${currentActivePartner} via ${type.toUpperCase()}...`); }
function openSettings() { showScreen('screen-settings'); }

function saveSettings() {
  const newName = document.getElementById('edit-app-name').value.trim();
  if (newName) {
    db.collection('users').doc(currentUserEmail).update({ appName: newName }).then(() => {
      alert("App Name Updated!");
      openHome();
    });
  }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}