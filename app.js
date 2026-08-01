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
let currentViewImgUrl = "";
let deferredPrompt;

// PWA INSTALL LOGIC
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('install-pwa-btn').classList.remove('hidden');
});

function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      document.getElementById('install-pwa-btn').classList.add('hidden');
    });
  }
}

// 1. AUTO LOGIN & AUTH CHECK
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUserEmail = user.email.toLowerCase();
    db.collection('users').doc(currentUserEmail).get().then((doc) => {
      if (!doc.exists) {
        db.collection('users').doc(currentUserEmail).set({
          email: currentUserEmail,
          displayName: user.displayName || currentUserEmail.split('@')[0],
          photoURL: user.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png",
          bio: "Hey there! I am using WhatsApp."
        });
      }
    });
    openHome();
  } else {
    showScreen('screen-login');
  }
});

function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
}

function logout() { auth.signOut(); }

function encryptText(text) { return btoa(encodeURIComponent(text)); }
function decryptText(cipher) {
  try { return decodeURIComponent(atob(cipher)); } catch (e) { return cipher; }
}

// 2. HOME SCREEN & LISTS
function openHome() {
  showScreen('screen-home');
  listenFriendRequests();
  listenAcceptedChats();
}

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
      if (snapshot.empty) { resultsDiv.classList.add('hidden'); return; }
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

      if (snapshot.empty) { section.classList.add('hidden'); return; }
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

        db.collection('users').doc(partner).get().then(pDoc => {
          const pData = pDoc.exists ? pDoc.data() : { displayName: partner.split('@')[0], photoURL: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' };
          
          const savedNickname = localStorage.getItem(`nickname_${currentUserEmail}_${partner}`);
          const nameToShow = savedNickname || pData.displayName || partner.split('@')[0];

          const card = document.createElement('div');
          card.className = 'chat-card';
          card.onclick = () => openChatRoom(partner, pData);
          card.innerHTML = `
            <img src="${pData.photoURL}">
            <div>
              <b>${nameToShow}</b>
              <p style="font-size:12px; color:#666;">Tap to chat</p>
            </div>
          `;
          chatList.appendChild(card);
        });
      });
    });
}

// 3. CHAT ROOM & NAME MANAGEMENT
function openChatRoom(partner, partnerData) {
  currentActivePartner = partner;
  const ids = [currentUserEmail, partner].sort();
  activeRoomId = ids.join('_').replace(/[^a-zA-Z0-9]/g, "_");

  showScreen('screen-chat');

  const savedNickname = localStorage.getItem(`nickname_${currentUserEmail}_${partner}`);
  const displayNameToShow = savedNickname || partnerData.displayName || partner.split('@')[0];

  document.getElementById('chat-header-name').innerText = displayNameToShow;
  document.getElementById('chat-header-avatar').src = partnerData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

  db.collection('rooms').doc(activeRoomId).collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot((snapshot) => {
      const chatBox = document.getElementById('chat-box');
      chatBox.innerHTML = '';

      snapshot.forEach((doc) => {
        const msg = doc.data();
        if (msg.sender !== currentUserEmail && msg.status !== 'read') {
          db.collection('rooms').doc(activeRoomId).collection('messages').doc(doc.id).update({ status: 'read' });
        }
        renderMessage(doc.data(), doc.id);
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    });
}

function toggleChatHeaderMenu() {
  document.getElementById('chat-header-menu').classList.toggle('hidden');
}

function editPartnerNickname() {
  document.getElementById('chat-header-menu').classList.add('hidden');
  const currentName = document.getElementById('chat-header-name').innerText;
  const newName = prompt("Enter a custom name for this user:", currentName);
  
  if (newName && newName.trim() !== "") {
    localStorage.setItem(`nickname_${currentUserEmail}_${currentActivePartner}`, newName.trim());
    document.getElementById('chat-header-name').innerText = newName.trim();
  }
}

// 4. MESSAGES SENDING
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

// 5. VIEW ONCE & HD PHOTO VIEWER
function handleViewOnceClick(msgId, mediaData, isOpened, sender) {
  if (sender === currentUserEmail) return;

  if (isOpened) {
    alert("Photo is already expired!");
    return;
  }

  openPhotoViewer(mediaData);
  db.collection('rooms').doc(activeRoomId).collection('messages').doc(msgId).update({
    isOpened: true,
    mediaData: ""
  });
}

function openPhotoViewer(imgSrc) {
  currentViewImgUrl = imgSrc;
  document.getElementById('modal-viewer-img').src = imgSrc;
  document.getElementById('hd-download-link').href = imgSrc;
  document.getElementById('photo-viewer-modal').classList.remove('hidden');
}

function closePhotoViewer() {
  document.getElementById('photo-viewer-modal').classList.add('hidden');
  document.getElementById('photo-menu').classList.add('hidden');
}

function togglePhotoMenu() {
  document.getElementById('photo-menu').classList.toggle('hidden');
}

function openFullImageWindow() {
  const win = window.open("");
  win.document.write(`<img src="${currentViewImgUrl}" style="max-width:100%;" />`);
}

// 6. VOICE RECORDING
let mediaRecorder, audioChunks = [];
function startRecording() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();
    document.getElementById('voice-btn').classList.add('recording');
    audioChunks = [];
    mediaRecorder.addEventListener("dataavailable", e => audioChunks.push(e.data));
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

// 7. REALTIME CALLING (JITSI INTEGRATION)
function startCall(type) {
  const roomName = `Calling_${activeRoomId}`;
  const domain = "meet.jit.si";
  const jitsiUrl = `https://${domain}/${roomName}#config.startWithVideoMuted=${type === 'voice'}`;

  document.getElementById('call-type-title').innerText = `${type.toUpperCase()} Call Active`;
  document.getElementById('jitsi-iframe').src = jitsiUrl;
  document.getElementById('call-modal').classList.remove('hidden');
}

function endCall() {
  document.getElementById('jitsi-iframe').src = "";
  document.getElementById('call-modal').classList.add('hidden');
}

// 8. RENDER MESSAGES WITH ORANGE TICK
function renderMessage(msg, msgId) {
  const chatBox = document.getElementById('chat-box');
  const div = document.createElement('div');
  const isMe = msg.sender === currentUserEmail;
  div.className = `msg-bubble ${isMe ? 'me' : 'partner'}`;

  const timeStr = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

  let tickHtml = '';
  if (isMe) {
    tickHtml = msg.status === 'read' ? `<span class="tick orange-tick"><i class="fa-solid fa-check-double"></i></span>` : `<span class="tick grey-tick"><i class="fa-solid fa-check-double"></i></span>`;
  }

  let contentHtml = '';
  if (msg.type === 'image') {
    contentHtml = `<img src="${msg.mediaData}" class="chat-img" onclick="openPhotoViewer('${msg.mediaData}')" />`;
  } else if (msg.type === 'view_once') {
    if (isMe) {
      const textStatus = msg.isOpened ? "Opened by recipient" : "📷 View Once Photo Sent";
      contentHtml = `<div class="view-once-bubble opened"><i class="fa-solid fa-circle-notch"></i> ${textStatus}</div>`;
    } else {
      const textStatus = msg.isOpened ? "Opened Photo Expired" : "📷 Tap to View Once Photo";
      const openedClass = msg.isOpened ? "opened" : "";
      contentHtml = `<div class="view-once-bubble ${openedClass}" onclick="handleViewOnceClick('${msgId}', '${msg.mediaData}', ${msg.isOpened}, '${msg.sender}')"><i class="fa-solid fa-circle-notch"></i> ${textStatus}</div>`;
    }
  } else if (msg.type === 'audio') {
    contentHtml = `<audio controls src="${msg.mediaData}" style="max-width:200px;"></audio>`;
  } else {
    contentHtml = `<span>${decryptText(msg.text)}</span>`;
  }

  div.innerHTML = `${contentHtml}<span class="msg-meta"><span class="msg-time">${timeStr}</span>${tickHtml}</span>`;
  chatBox.appendChild(div);
}

// 9. SETTINGS MANAGEMENT
function openSettings() {
  showScreen('screen-settings');
  db.collection('users').doc(currentUserEmail).get().then(doc => {
    if (doc.exists) {
      const u = doc.data();
      document.getElementById('edit-display-name').value = u.displayName || '';
      document.getElementById('edit-user-bio').value = u.bio || '';
      document.getElementById('settings-avatar-preview').src = u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    }
  });
}

function handleProfilePhoto(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    document.getElementById('settings-avatar-preview').src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function saveSettings() {
  const newName = document.getElementById('edit-display-name').value.trim();
  const newBio = document.getElementById('edit-user-bio').value.trim();
  const avatarSrc = document.getElementById('settings-avatar-preview').src;

  db.collection('users').doc(currentUserEmail).update({
    displayName: newName,
    bio: newBio,
    photoURL: avatarSrc
  }).then(() => {
    alert("Profile Saved!");
    openHome();
  });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}