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
let currentUserData = null;
let currentActivePartner = "";
let activePartnerData = null;
let activeRoomId = "";

let selectedChatPartner = ""; // Long press selected user
let longPressTimer = null;

// PEERJS WEBRTC CALL ENGINE
let peer = null;
let localStream = null;
let currentCall = null;

// 1. ONLINE STATUS CONTROLLER & USER AUTH
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUserEmail = user.email.toLowerCase();
    
    currentUserData = {
      email: currentUserEmail,
      displayName: user.displayName || currentUserEmail.split('@')[0],
      photoURL: user.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png",
      bio: "Hey there! I am using WhatsApp."
    };

    db.collection('users').doc(currentUserEmail).set({
      ...currentUserData,
      isOnline: true,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    setupPresenceSystem();
    initPeerJS();
    openHome();
  } else {
    showScreen('screen-login');
  }
});

function setupPresenceSystem() {
  window.addEventListener('beforeunload', () => { setUserOffline(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setUserOnline();
    else setUserOffline();
  });
}

function setUserOnline() {
  if (currentUserEmail) db.collection('users').doc(currentUserEmail).update({ isOnline: true });
}

function setUserOffline() {
  if (currentUserEmail) {
    db.collection('users').doc(currentUserEmail).update({
      isOnline: false,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
}

function logout() {
  setUserOffline();
  auth.signOut();
}

function encryptText(text) { return btoa(encodeURIComponent(text)); }
function decryptText(cipher) {
  try { return decodeURIComponent(atob(cipher)); } catch (e) { return cipher; }
}

// 2. HOME & CHATS LIST
function openHome() {
  closeAllMenus();
  showScreen('screen-home');
  listenAcceptedChats();
}

function toggleHomeMenu() { document.getElementById('home-menu').classList.toggle('hidden'); }
function toggleChatMenu() { document.getElementById('chat-menu').classList.toggle('hidden'); }

function closeAllMenus() {
  const hm = document.getElementById('home-menu');
  const cm = document.getElementById('chat-menu');
  if (hm) hm.classList.add('hidden');
  if (cm) cm.classList.add('hidden');
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
        div.className = 'chat-card';
        div.innerHTML = `
          <span style="flex:1;">${u.email}</span>
          <button onclick="startNewChat('${u.email}')" style="background:#00a884; color:white; border:none; padding:6px 14px; border-radius:15px; cursor:pointer;">Message</button>
        `;
        resultsDiv.appendChild(div);
      });
    });
}

function startNewChat(targetEmail) {
  db.collection('chats').doc(`${currentUserEmail}_${targetEmail}`).set({
    users: [currentUserEmail, targetEmail]
  }).then(() => {
    document.getElementById('search-results').classList.add('hidden');
    db.collection('users').doc(targetEmail).get().then(doc => {
      openChatRoom(targetEmail, doc.data());
    });
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
          db.collection('users').doc(partner).onSnapshot(pDoc => {
            const pData = pDoc.exists ? pDoc.data() : { displayName: partner.split('@')[0], photoURL: 'https://cdn-icons-png.flaticon.com/512/149/149071.png', isOnline: false };
            
            let card = document.getElementById(`card-${partner.replace(/[^a-zA-Z0-9]/g, "")}`);
            if (!card) {
              card = document.createElement('div');
              card.id = `card-${partner.replace(/[^a-zA-Z0-9]/g, "")}`;
              card.className = 'chat-card';
              chatList.appendChild(card);
            }

            // CHECK LOCAL STORAGE FOR BADGES (PIN, STAR, MUTE, BLOCK)
            const isPinned = localStorage.getItem(`pin_${partner}`) === 'true';
            const isStarred = localStorage.getItem(`star_${partner}`) === 'true';
            const isMuted = localStorage.getItem(`mute_${partner}`) === 'true';
            const isBlocked = localStorage.getItem(`block_${partner}`) === 'true';

            let badgesHtml = '';
            if (isPinned) badgesHtml += `<i class="fa-solid fa-thumbtack" style="color:#00a884;"></i>`;
            if (isStarred) badgesHtml += `<i class="fa-solid fa-star" style="color:#eac54f;"></i>`;
            if (isMuted) badgesHtml += `<i class="fa-solid fa-volume-xmark"></i>`;
            if (isBlocked) badgesHtml += `<i class="fa-solid fa-ban" style="color:#ea4335;"></i>`;

            card.innerHTML = `
              <img src="${pData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}">
              <div style="flex:1;">
                <b style="font-size:15px;">${pData.displayName || partner.split('@')[0]}</b>
                <p class="user-status-text ${pData.isOnline ? 'online' : 'offline'}">${pData.isOnline ? 'Online' : 'Offline'}</p>
              </div>
              <div class="chat-badges">${badgesHtml}</div>
            `;

            // LONG PRESS HANDLERS FOR MOBILE & DESKTOP
            card.onmousedown = () => startLongPress(partner);
            card.onmouseup = () => cancelLongPress();
            card.ontouchstart = () => startLongPress(partner);
            card.ontouchend = () => cancelLongPress();

            card.onclick = () => {
              if (!card.dataset.longpressed) {
                openChatRoom(partner, pData);
              }
              delete card.dataset.longpressed;
            };
          });
        }
      });
    });
}

// 3. LONG PRESS ACTION SHEET LOGIC
function startLongPress(partner) {
  longPressTimer = setTimeout(() => {
    selectedChatPartner = partner;
    const card = document.getElementById(`card-${partner.replace(/[^a-zA-Z0-9]/g, "")}`);
    if (card) card.dataset.longpressed = "true";

    // UPDATE ACTION TEXTS ACCORDING TO STATE
    document.getElementById('pin-text').innerText = localStorage.getItem(`pin_${partner}`) === 'true' ? "Unpin Chat" : "Pin Chat";
    document.getElementById('star-text').innerText = localStorage.getItem(`star_${partner}`) === 'true' ? "Unstar Chat" : "Star Chat";
    document.getElementById('mute-text').innerText = localStorage.getItem(`mute_${partner}`) === 'true' ? "Unmute Notifications" : "Mute Notifications";
    document.getElementById('block-text').innerText = localStorage.getItem(`block_${partner}`) === 'true' ? "Unblock Contact" : "Block Contact";

    document.getElementById('action-sheet').classList.remove('hidden');
  }, 600); // 600ms Press
}

function cancelLongPress() {
  clearTimeout(longPressTimer);
}

function togglePinChat() {
  const cur = localStorage.getItem(`pin_${selectedChatPartner}`) === 'true';
  localStorage.setItem(`pin_${selectedChatPartner}`, !cur);
  closeModal('action-sheet');
  listenAcceptedChats();
}

function toggleStarChat() {
  const cur = localStorage.getItem(`star_${selectedChatPartner}`) === 'true';
  localStorage.setItem(`star_${selectedChatPartner}`, !cur);
  closeModal('action-sheet');
  listenAcceptedChats();
}

function toggleMuteChat() {
  const cur = localStorage.getItem(`mute_${selectedChatPartner}`) === 'true';
  localStorage.setItem(`mute_${selectedChatPartner}`, !cur);
  closeModal('action-sheet');
  listenAcceptedChats();
}

function toggleBlockUser() {
  const cur = localStorage.getItem(`block_${selectedChatPartner}`) === 'true';
  localStorage.setItem(`block_${selectedChatPartner}`, !cur);
  closeModal('action-sheet');
  listenAcceptedChats();
}

function deleteChatRoom() {
  if (confirm("Delete this chat and room history?")) {
    const ids = [currentUserEmail, selectedChatPartner].sort();
    const roomId = ids.join('_').replace(/[^a-zA-Z0-9]/g, "_");

    db.collection('chats').doc(`${currentUserEmail}_${selectedChatPartner}`).delete();
    db.collection('chats').doc(`${selectedChatPartner}_${currentUserEmail}`).delete();
    
    closeModal('action-sheet');
    listenAcceptedChats();
  }
}

// 4. CHAT ROOM & MESSAGES
function openChatRoom(partner, partnerData) {
  closeAllMenus();
  currentActivePartner = partner;
  activePartnerData = partnerData;
  const ids = [currentUserEmail, partner].sort();
  activeRoomId = ids.join('_').replace(/[^a-zA-Z0-9]/g, "_");

  showScreen('screen-chat');
  document.getElementById('chat-header-name').innerText = partnerData.displayName || partner.split('@')[0];
  document.getElementById('chat-header-avatar').src = partnerData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

  db.collection('users').doc(partner).onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      const statusElement = document.getElementById('chat-header-status');
      if (data.isOnline) {
        statusElement.innerText = "Online";
        statusElement.className = "user-status-text online";
      } else {
        statusElement.innerText = "Offline";
        statusElement.className = "user-status-text offline";
      }
    }
  });

  const savedBgColor = localStorage.getItem(`chat_bg_${activeRoomId}`);
  if (savedBgColor) {
    document.getElementById('chat-box').style.backgroundColor = savedBgColor;
    document.getElementById('chat-color-input').value = savedBgColor;
  } else {
    document.getElementById('chat-box').style.backgroundColor = '#0b141a';
    document.getElementById('chat-color-input').value = '#0b141a';
  }

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

function sendMediaMessage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result;
    db.collection('rooms').doc(activeRoomId).collection('messages').add({
      type: 'image',
      mediaUrl: base64Data,
      sender: currentUserEmail,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  };
  reader.readAsDataURL(file);
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

  if (msg.type === 'image') {
    div.innerHTML = `
      <img src="${msg.mediaUrl}">
      <span class="msg-meta">${deleteBtnHtml}</span>
    `;
  } else {
    div.innerHTML = `
      <span>${decryptText(msg.text)}</span>
      <span class="msg-meta">${deleteBtnHtml}</span>
    `;
  }
  chatBox.appendChild(div);
}

// 5. CUSTOM COLOR PICKER & PROFILE MODALS
function openColorPicker() {
  closeAllMenus();
  document.getElementById('color-modal').classList.remove('hidden');
}

function applyCustomColor(colorHex) {
  document.getElementById('chat-box').style.backgroundColor = colorHex;
  localStorage.setItem(`chat_bg_${activeRoomId}`, colorHex);
}

function openActivePartnerProfile() {
  closeAllMenus();
  if (activePartnerData) openProfileView(activePartnerData);
}

function openProfileView(userData) {
  document.getElementById('profile-modal-name').innerText = userData.displayName || userData.email.split('@')[0];
  document.getElementById('profile-modal-img').src = userData.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
  document.getElementById('profile-modal-email').innerText = userData.email;
  document.getElementById('profile-modal-bio').innerText = userData.bio || "Hey there! I am using WhatsApp.";
  document.getElementById('profile-modal').classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// 6. CALL ENGINE (PEERJS)
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

function toggleMuteMic() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      document.getElementById('btn-toggle-mic').classList.toggle('off', !audioTrack.enabled);
    }
  }
}

function toggleCamera() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      document.getElementById('btn-toggle-cam').classList.toggle('off', !videoTrack.enabled);
    }
  }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}