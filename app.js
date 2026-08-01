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

let selectedChatPartner = "";
let longPressTimer = null;
let isViewOnceMode = false;
let activeReplyMsg = null;
let typingTimeout = null;

let isE2EEnabled = localStorage.getItem('e2e_encryption') !== 'false';

// CALL DURATION TRACKER
let peer = null;
let localStream = null;
let currentCall = null;
let callStartTime = null;

// NOTIFICATION SOUND ENGINE
const msgAudioSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');

// 1. APP INITIALIZATION & SECURITY LOCK
window.addEventListener('DOMContentLoaded', () => {
  checkAppLockState();
});

function checkAppLockState() {
  const isLockActive = localStorage.getItem('app_lock_enabled') === 'true';
  const savedPin = localStorage.getItem('app_passcode_pin');
  if (isLockActive && savedPin) {
    document.getElementById('app-lock-screen').classList.remove('hidden');
  }
}

function checkAppPasscode() {
  const inputPin = document.getElementById('app-passcode-input').value;
  const savedPin = localStorage.getItem('app_passcode_pin');
  if (inputPin === savedPin) {
    document.getElementById('app-lock-screen').classList.add('hidden');
    document.getElementById('app-passcode-input').value = '';
  }
}

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
    
    showScreen('screen-home');
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

function encryptText(text) { 
  if (!isE2EEnabled) return text;
  return btoa(encodeURIComponent(text)); 
}

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
            const pData = pDoc.exists ? pDoc.data() : { displayName: partner.split('@')[0], photoURL: 'https://cdn-icons-png.flaticon.com/512/149/149071.png', isOnline: false, lastSeen: null };
            
            let card = document.getElementById(`card-${partner.replace(/[^a-zA-Z0-9]/g, "")}`);
            if (!card) {
              card = document.createElement('div');
              card.id = `card-${partner.replace(/[^a-zA-Z0-9]/g, "")}`;
              card.className = 'chat-card';
              chatList.appendChild(card);
            }

            const isPinned = localStorage.getItem(`pin_${partner}`) === 'true';
            const isStarred = localStorage.getItem(`star_${partner}`) === 'true';
            const isMuted = localStorage.getItem(`mute_${partner}`) === 'true';
            const isBlocked = localStorage.getItem(`block_${partner}`) === 'true';

            let badgesHtml = '';
            if (isPinned) badgesHtml += `<i class="fa-solid fa-thumbtack" style="color:#00a884;"></i>`;
            if (isStarred) badgesHtml += `<i class="fa-solid fa-star" style="color:#eac54f;"></i>`;
            if (isMuted) badgesHtml += `<i class="fa-solid fa-volume-xmark"></i>`;
            if (isBlocked) badgesHtml += `<i class="fa-solid fa-ban" style="color:#ea4335;"></i>`;

            let lastSeenStr = 'Offline';
            if (pData.lastSeen && pData.lastSeen.toDate) {
              const dt = pData.lastSeen.toDate();
              lastSeenStr = `Last seen at ${dt.getHours()}:${dt.getMinutes() < 10 ? '0' : ''}${dt.getMinutes()}`;
            }

            card.innerHTML = `
              <img src="${pData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}">
              <div style="flex:1;">
                <b style="font-size:15px;">${pData.displayName || partner.split('@')[0]}</b>
                <p class="user-status-text ${pData.isOnline ? 'online' : 'offline'}">${pData.isOnline ? 'Online' : lastSeenStr}</p>
              </div>
              <div class="chat-badges">${badgesHtml}</div>
            `;

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

    document.getElementById('pin-text').innerText = localStorage.getItem(`pin_${partner}`) === 'true' ? "Unpin Chat" : "Pin Chat";
    document.getElementById('star-text').innerText = localStorage.getItem(`star_${partner}`) === 'true' ? "Unstar Chat" : "Star Chat";
    document.getElementById('mute-text').innerText = localStorage.getItem(`mute_${partner}`) === 'true' ? "Unmute Notifications" : "Mute Notifications";
    document.getElementById('block-text').innerText = localStorage.getItem(`block_${partner}`) === 'true' ? "Unblock Contact" : "Block Contact";

    document.getElementById('action-sheet').classList.remove('hidden');
  }, 600);
}

function cancelLongPress() { clearTimeout(longPressTimer); }

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
    db.collection('chats').doc(`${currentUserEmail}_${selectedChatPartner}`).delete();
    db.collection('chats').doc(`${selectedChatPartner}_${currentUserEmail}`).delete();
    closeModal('action-sheet');
    listenAcceptedChats();
  }
}

// 4. CHAT ROOM & TYPING INDICATOR & BLUE TICKS
function openChatRoom(partner, partnerData) {
  closeAllMenus();
  currentActivePartner = partner;
  activePartnerData = partnerData;
  const ids = [currentUserEmail, partner].sort();
  activeRoomId = ids.join('_').replace(/[^a-zA-Z0-9]/g, "_");

  showScreen('screen-chat');
  document.getElementById('chat-header-name').innerText = partnerData.displayName || partner.split('@')[0];
  document.getElementById('chat-header-avatar').src = partnerData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

  // ONLINE & TYPING REALTIME LISTENERS
  db.collection('users').doc(partner).onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      const statusElement = document.getElementById('chat-header-status');
      
      if (data.isTypingIn === currentUserEmail) {
        statusElement.innerText = "Typing...";
        statusElement.className = "user-status-text online";
      } else if (data.isOnline) {
        statusElement.innerText = "Online";
        statusElement.className = "user-status-text online";
      } else {
        statusElement.innerText = "Offline";
        statusElement.className = "user-status-text offline";
      }
    }
  });

  // WALLPAPER / THEME RESTORE
  const savedBg = localStorage.getItem(`chat_bg_${activeRoomId}`);
  const chatBox = document.getElementById('chat-box');
  if (savedBg) {
    if (savedBg.startsWith('data:image')) {
      chatBox.style.backgroundImage = `url(${savedBg})`;
      chatBox.style.backgroundColor = 'transparent';
    } else {
      chatBox.style.backgroundImage = 'none';
      chatBox.style.backgroundColor = savedBg;
      document.getElementById('chat-color-input').value = savedBg;
    }
  } else {
    chatBox.style.backgroundImage = 'none';
    chatBox.style.backgroundColor = '#0b141a';
  }

  // MESSAGES SNAPSHOT
  db.collection('rooms').doc(activeRoomId).collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot((snapshot) => {
      chatBox.innerHTML = '';
      let hasNewPartnerMsg = false;

      snapshot.forEach((doc) => {
        const msg = doc.data();
        if (msg.sender !== currentUserEmail && !msg.isRead) {
          db.collection('rooms').doc(activeRoomId).collection('messages').doc(doc.id).update({ isRead: true });
          hasNewPartnerMsg = true;
        }
        renderMessage(msg, doc.id);
      });

      if (hasNewPartnerMsg) msgAudioSound.play().catch(e=>console.log(e));
      chatBox.scrollTop = chatBox.scrollHeight;
    });
}

function handleTyping() {
  if (!currentUserEmail) return;
  db.collection('users').doc(currentUserEmail).update({ isTypingIn: currentActivePartner });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    db.collection('users').doc(currentUserEmail).update({ isTypingIn: "" });
  }, 1500);
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;

  const payload = {
    type: 'text',
    text: encryptText(text),
    sender: currentUserEmail,
    isRead: false,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (activeReplyMsg) {
    payload.replyTo = activeReplyMsg;
    cancelReply();
  }

  db.collection('rooms').doc(activeRoomId).collection('messages').add(payload);
  input.value = '';
}

function toggleViewOnceMode() {
  isViewOnceMode = !isViewOnceMode;
  document.getElementById('view-once-btn').classList.toggle('active', isViewOnceMode);
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
      isViewOnce: isViewOnceMode,
      isRead: false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (isViewOnceMode) toggleViewOnceMode();
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

// 5. SWIPE TO REPLY & RENDER MESSAGES
function renderMessage(msg, msgId) {
  const chatBox = document.getElementById('chat-box');
  
  if (msg.type === 'call_log') {
    const callDiv = document.createElement('div');
    callDiv.className = 'call-log-msg';
    callDiv.innerHTML = `<i class="fa-solid fa-phone"></i> ${msg.text}`;
    chatBox.appendChild(callDiv);
    return;
  }

  const div = document.createElement('div');
  const isMe = msg.sender === currentUserEmail;
  div.className = `msg-bubble ${isMe ? 'me' : 'partner'}`;

  // SWIPE TOUCH EVENT
  let startX = 0;
  div.ontouchstart = (e) => { startX = e.touches[0].clientX; };
  div.ontouchmove = (e) => {
    let diff = e.touches[0].clientX - startX;
    if (Math.abs(diff) < 80) div.style.transform = `translateX(${diff}px)`;
  };
  div.ontouchend = (e) => {
    div.style.transform = 'translateX(0px)';
    setReplyTarget(msg.type === 'text' ? decryptText(msg.text) : 'Media Photo');
  };

  let replyHtml = msg.replyTo ? `<div class="reply-preview-box">↩️ ${msg.replyTo}</div>` : '';
  let deleteBtnHtml = isMe ? `<i class="fa-solid fa-trash" onclick="deleteMessage('${msgId}', '${msg.sender}')" style="margin-left:8px; cursor:pointer; font-size:11px; opacity:0.7;"></i>` : '';
  let tickHtml = isMe ? `<i class="fa-solid fa-check-double ${msg.isRead ? 'blue-tick' : ''}"></i>` : '';

  if (msg.isViewOnce) {
    if (msg.openedBy && msg.openedBy.includes(currentUserEmail)) {
      div.innerHTML = `<span style="font-style:italic; color:#8696a0;">👁️ Opened View Once Media</span>`;
    } else {
      div.innerHTML = `<button onclick="openViewOnceMedia('${msgId}', '${msg.mediaUrl}')" style="background:#202c33; color:#00a884; border:1px solid #00a884; padding:6px 12px; border-radius:12px; cursor:pointer;">👁️ Photo (View Once)</button>`;
    }
  } else if (msg.type === 'image') {
    div.innerHTML = `
      ${replyHtml}
      <img src="${msg.mediaUrl}">
      <span class="msg-meta">${tickHtml} ${deleteBtnHtml}</span>
    `;
  } else {
    div.innerHTML = `
      ${replyHtml}
      <span>${decryptText(msg.text)}</span>
      <span class="msg-meta">${tickHtml} ${deleteBtnHtml}</span>
    `;
  }
  chatBox.appendChild(div);
}

function openViewOnceMedia(msgId, mediaUrl) {
  const windowRef = window.open("");
  windowRef.document.write(`<img src="${mediaUrl}" style="max-width:100%; border-radius:8px;">`);
  db.collection('rooms').doc(activeRoomId).collection('messages').doc(msgId).update({
    openedBy: firebase.firestore.FieldValue.arrayUnion(currentUserEmail)
  });
}

function setReplyTarget(text) {
  activeReplyMsg = text;
  document.getElementById('reply-target-text').innerText = text;
  document.getElementById('reply-preview-bar').classList.remove('hidden');
}

function cancelReply() {
  activeReplyMsg = null;
  document.getElementById('reply-preview-bar').classList.add('hidden');
}

// 6. TAMIL STICKERS & DIALOGUES
function toggleStickerPanel() {
  document.getElementById('sticker-panel').classList.toggle('hidden');
}

function showStickerTab(tab) {
  if (tab === 'stickers') {
    document.getElementById('stickers-tab-content').classList.remove('hidden');
    document.getElementById('dialogues-tab-content').classList.add('hidden');
  } else {
    document.getElementById('stickers-tab-content').classList.add('hidden');
    document.getElementById('dialogues-tab-content').classList.remove('hidden');
  }
}

function sendSticker(url) {
  db.collection('rooms').doc(activeRoomId).collection('messages').add({
    type: 'image',
    mediaUrl: url,
    sender: currentUserEmail,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  toggleStickerPanel();
}

function sendDialogue(text) {
  db.collection('rooms').doc(activeRoomId).collection('messages').add({
    type: 'text',
    text: encryptText(text),
    sender: currentUserEmail,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  toggleStickerPanel();
}

// 7. SETTINGS, WALLPAPER & FULL HD PROFILE
function openSettingsModal() {
  closeAllMenus();
  document.getElementById('e2e-toggle').checked = isE2EEnabled;
  document.getElementById('passcode-toggle').checked = localStorage.getItem('app_lock_enabled') === 'true';
  document.getElementById('settings-modal').classList.remove('hidden');
}

function toggleE2E(checked) {
  isE2EEnabled = checked;
  localStorage.setItem('e2e_encryption', checked);
}

function togglePasscodeSetting(checked) {
  localStorage.setItem('app_lock_enabled', checked);
  document.getElementById('set-pin-box').classList.toggle('hidden', !checked);
}

function saveNewPin() {
  const pin = document.getElementById('new-pin-input').value;
  if (pin.length === 4) {
    localStorage.setItem('app_passcode_pin', pin);
    alert("Passcode PIN Saved Successfully!");
  } else alert("Please enter 4-digit PIN!");
}

function openColorPicker() {
  closeAllMenus();
  document.getElementById('color-modal').classList.remove('hidden');
}

function applyCustomColor(colorHex) {
  const chatBox = document.getElementById('chat-box');
  chatBox.style.backgroundImage = 'none';
  chatBox.style.backgroundColor = colorHex;
  localStorage.setItem(`chat_bg_${activeRoomId}`, colorHex);
}

function applyPhotoWallpaper(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result;
    const chatBox = document.getElementById('chat-box');
    chatBox.style.backgroundImage = `url(${base64Data})`;
    chatBox.style.backgroundColor = 'transparent';
    localStorage.setItem(`chat_bg_${activeRoomId}`, base64Data);
    closeModal('color-modal');
  };
  reader.readAsDataURL(file);
}

function openFullHDProfile() {
  if (activePartnerData) openProfileView(activePartnerData);
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

// 8. PEERJS CALLS & DURATION LOG IN CHAT
function initPeerJS() {
  const myPeerId = currentUserEmail.replace(/[^a-zA-Z0-9]/g, "");
  peer = new Peer(myPeerId);

  peer.on('call', (call) => {
    currentCall = call;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      localStream = stream;
      callStartTime = new Date();

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
          remoteVideo.play().catch(e => console.log(e));
        }
      });
    });
  });
}

function startCall(type) {
  if (!currentActivePartner) { alert("Please select a user to call!"); return; }

  const targetPeerId = currentActivePartner.replace(/[^a-zA-Z0-9]/g, "");
  const isVideo = (type === 'video');

  navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true }).then((stream) => {
    localStream = stream;
    callStartTime = new Date();

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
        remoteVideo.play().catch(e => console.log(e));
      }
    });
  });
}

function endCall() {
  if (callStartTime) {
    const durationSec = Math.floor((new Date() - callStartTime) / 1000);
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const durationStr = `${mins < 10 ? '0' : ''}${mins}m ${secs < 10 ? '0' : ''}${secs}s`;

    db.collection('rooms').doc(activeRoomId).collection('messages').add({
      type: 'call_log',
      text: `Call Ended (${durationStr})`,
      sender: currentUserEmail,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    callStartTime = null;
  }

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