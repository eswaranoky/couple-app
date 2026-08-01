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

// PEERJS WEBRTC CALL VARIABLES
let peer = null;
let localStream = null;
let currentCall = null;
let isMicMuted = false;
let isCamOff = false;

// 1. AUTO LOGIN & INITIAL SETUP
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

    initPeerJS();
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

// 2. WEBRTC CALL ENGINE (FIXED FULLSCREEN & CALL CONTROLS)
function initPeerJS() {
  const myPeerId = currentUserEmail.replace(/[^a-zA-Z0-9]/g, "");
  peer = new Peer(myPeerId);

  peer.on('call', (call) => {
    currentCall = call;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      localStream = stream;
      
      const localVideo = document.getElementById('local-video-stream');
      if (localVideo) localVideo.srcObject = stream;

      call.answer(stream);

      document.getElementById('call-partner-name').innerText = currentActivePartner ? currentActivePartner.split('@')[0] : "Incoming Call";
      document.getElementById('call-type-title').innerText = "Call Connected";
      document.getElementById('call-modal').classList.remove('hidden');

      call.on('stream', (remoteStream) => {
        const remoteVideo = document.getElementById('remote-video-stream');
        if (remoteVideo) {
          remoteVideo.srcObject = remoteStream;
          remoteVideo.play().catch(e => console.log("Auto-play error:", e));
        }
      });
    }).catch(err => {
      alert("Microphone/Camera permission required!");
    });
  });
}

function startCall(type) {
  if (!currentActivePartner) { alert("Please select a user to call!"); return; }

  const targetPeerId = currentActivePartner.replace(/[^a-zA-Z0-9]/g, "");
  const isVideo = (type === 'video');

  navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true }).then((stream) => {
    localStream = stream;
    
    const localVideo = document.getElementById('local-video-stream');
    if (localVideo) localVideo.srcObject = stream;

    document.getElementById('call-partner-name').innerText = currentActivePartner.split('@')[0];
    document.getElementById('call-type-title').innerText = `${type.toUpperCase()} Call Active`;
    document.getElementById('call-modal').classList.remove('hidden');

    const call = peer.call(targetPeerId, stream);
    currentCall = call;

    call.on('stream', (remoteStream) => {
      const remoteVideo = document.getElementById('remote-video-stream');
      if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
        remoteVideo.play().catch(e => console.log("Auto-play error:", e));
      }
    });
  }).catch(err => {
    alert("Camera/Mic permission needed for call!");
  });
}

// CUT / END CALL
function endCall() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  document.getElementById('call-modal').classList.add('hidden');
}

// TOGGLE MIC
function toggleMuteMic() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      isMicMuted = !isMicMuted;
      audioTrack.enabled = !isMicMuted;
      const btn = document.getElementById('btn-toggle-mic');
      if (isMicMuted) {
        btn.classList.add('off');
        btn.innerHTML = `<i class="fa-solid fa-microphone-slash"></i>`;
      } else {
        btn.classList.remove('off');
        btn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;
      }
    }
  }
}

// TOGGLE CAMERA
function toggleCamera() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      isCamOff = !isCamOff;
      videoTrack.enabled = !isCamOff;
      const btn = document.getElementById('btn-toggle-cam');
      if (isCamOff) {
        btn.classList.add('off');
        btn.innerHTML = `<i class="fa-solid fa-video-slash"></i>`;
      } else {
        btn.classList.remove('off');
        btn.innerHTML = `<i class="fa-solid fa-video"></i>`;
      }
    }
  }
}

// 3. HOME & NAVIGATION
function openHome() {
  showScreen('screen-home');
  listenAcceptedChats();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

  if (tabName === 'chats') {
    document.getElementById('tab-chats-btn').classList.add('active');
    document.getElementById('tab-chats-content').classList.remove('hidden');
  } else {
    document.getElementById('tab-status-btn').classList.add('active');
    document.getElementById('tab-status-content').classList.remove('hidden');
  }
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
          <button onclick="sendFriendRequest('${u.email}')" style="background:#00a884; color:white; border:none; padding:5px 10px; border-radius:4px;">Add</button>
        `;
        resultsDiv.appendChild(div);
      });
    });
}

function sendFriendRequest(targetEmail) {
  db.collection('chats').doc(`${currentUserEmail}_${targetEmail}`).set({
    users: [currentUserEmail, targetEmail]
  }).then(() => {
    alert("Chat Started!");
    document.getElementById('search-results').classList.add('hidden');
  });
}

function listenAcceptedChats() {
  db.collection('chats').where('users', 'array-contains', currentUserEmail)
    .onSnapshot((snapshot) => {
      const chatList = document.getElementById('recent-chats-list');
      if (!chatList) return;
      chatList.innerHTML = '';

      snapshot.forEach((doc) => {
        const users = doc.data().users;
        const partner = users.find(u => u !== currentUserEmail);

        if (partner) {
          db.collection('users').doc(partner).get().then(pDoc => {
            const pData = pDoc.exists ? pDoc.data() : { displayName: partner.split('@')[0], photoURL: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' };
            const card = document.createElement('div');
            card.className = 'chat-card';
            card.onclick = () => openChatRoom(partner, pData);
            card.innerHTML = `
              <img src="${pData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}">
              <div>
                <b>${pData.displayName || partner.split('@')[0]}</b>
                <p style="font-size:12px; color:#8696a0;">Tap to chat</p>
              </div>
            `;
            chatList.appendChild(card);
          });
        }
      });
    });
}

// 4. CHAT ROOM & MESSAGES WITH DELETE OPTION
function openChatRoom(partner, partnerData) {
  currentActivePartner = partner;
  const ids = [currentUserEmail, partner].sort();
  activeRoomId = ids.join('_').replace(/[^a-zA-Z0-9]/g, "_");

  showScreen('screen-chat');
  document.getElementById('chat-header-name').innerText = partnerData.displayName || partner.split('@')[0];
  document.getElementById('chat-header-avatar').src = partnerData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

  db.collection('rooms').doc(activeRoomId).collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot((snapshot) => {
      const chatBox = document.getElementById('chat-box');
      chatBox.innerHTML = '';

      snapshot.forEach((doc) => {
        renderMessage(doc.data(), doc.id);
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    });
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;

  db.collection('rooms').doc(activeRoomId).collection('messages').add({
    type: 'text',
    text: encryptText(text),
    sender: currentUserEmail,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = '';
}

function deleteMessage(msgId, senderEmail) {
  if (senderEmail !== currentUserEmail) {
    alert("You can only delete your own messages!");
    return;
  }
  if (confirm("Delete this message?")) {
    db.collection('rooms').doc(activeRoomId).collection('messages').doc(msgId).delete();
  }
}

function renderMessage(msg, msgId) {
  const chatBox = document.getElementById('chat-box');
  const div = document.createElement('div');
  const isMe = msg.sender === currentUserEmail;
  div.className = `msg-bubble ${isMe ? 'me' : 'partner'}`;

  let deleteBtnHtml = isMe ? `<i class="fa-solid fa-trash" onclick="deleteMessage('${msgId}', '${msg.sender}')" style="margin-left:8px; cursor:pointer; font-size:11px; opacity:0.7;"></i>` : '';

  div.innerHTML = `
    <span>${decryptText(msg.text)}</span>
    <span class="msg-meta">${deleteBtnHtml}</span>
  `;
  chatBox.appendChild(div);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}