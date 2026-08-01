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
let currentMyStatusDocId = null;
let currentStatusAudio = null;

// WEBRTC PEERJS GLOBAL VARIABLES
let peer = null;
let localStream = null;
let currentCall = null;

// HARDWARE BACK BUTTON HANDLER
window.onpopstate = function(event) {
  const currentScreen = document.querySelector('.screen.active');
  if (currentScreen && currentScreen.id !== 'screen-home' && currentScreen.id !== 'screen-login') {
    openHome();
  }
};

// PWA INSTALL EVENT
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

function installAppDirect() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      openHome();
    });
  } else {
    alert("To install, tap browser menu (3 dots) and select 'Add to Home screen'.");
    openHome();
  }
}

function skipInstallAndGoHome() { openHome(); }

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

    // INIT PEERJS FOR CALLS
    initPeerJS();

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) { openHome(); } else { showScreen('screen-install'); }

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

// 2. PEERJS NATIVE WEBRTC CALL ENGINE (FIXED BLACK SCREEN / DUAL STREAM)
function initPeerJS() {
  const myPeerId = currentUserEmail.replace(/[^a-zA-Z0-9]/g, "");
  peer = new Peer(myPeerId);

  // LISTEN FOR INCOMING CALLS
  peer.on('call', (call) => {
    currentCall = call;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      localStream = stream;
      
      // Show own stream in small preview
      const localVideo = document.getElementById('local-video-stream');
      if (localVideo) localVideo.srcObject = stream;

      call.answer(stream);

      document.getElementById('call-type-title').innerText = "Incoming Call Connected";
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
    
    // Show own stream in small preview
    const localVideo = document.getElementById('local-video-stream');
    if (localVideo) localVideo.srcObject = stream;

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

  showBackgroundPopUp(`Calling ${currentActivePartner.split('@')[0]}`, `Outgoing ${type} call initiated...`);
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

// 3. POP-UP NOTIFICATION PERMISSIONS
function requestNotificationPermission() {
  if ("Notification" in window) {
    if (Notification.permission !== "granted") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          console.log("Notification permission granted!");
        }
      });
    }
  }
}

function showBackgroundPopUp(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    const options = {
      body: body,
      icon: "https://cdn-icons-png.flaticon.com/512/134/134937.png",
      badge: "https://cdn-icons-png.flaticon.com/512/134/134937.png",
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      renotify: true,
      tag: "couple-app-msg"
    };

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, options);
      });
    } else {
      new Notification(title, options);
    }
  }
}

function listenIncomingMessagesGlobally() {
  db.collection('chats').where('users', 'array-contains', currentUserEmail)
    .onSnapshot(snapshot => {
      snapshot.forEach(doc => {
        const users = doc.data().users;
        const partner = users.find(u => u !== currentUserEmail);
        const roomId = users.sort().join('_').replace(/[^a-zA-Z0-9]/g, "_");

        db.collection('rooms').doc(roomId).collection('messages')
          .orderBy('timestamp', 'desc').limit(1)
          .onSnapshot(msgSnap => {
            msgSnap.docChanges().forEach(change => {
              if (change.type === "added") {
                const msg = change.doc.data();
                if (msg.sender !== currentUserEmail && msg.status !== 'read') {
                  showBackgroundPopUp(`New Message from ${partner.split('@')[0]}`, decryptText(msg.text) || "Sent a media file");
                }
              }
            });
          });
      });
    });
}

// 4. HOME SCREEN & TAB SYSTEM
function openHome() {
  showScreen('screen-home');
  requestNotificationPermission();
  listenIncomingMessagesGlobally();
  listenFriendRequests();
  listenAcceptedChats();
  listenStatuses();
  history.pushState({ page: 'home' }, "Home", "#home");
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
      if (!chatList) return;
      chatList.innerHTML = '';

      snapshot.forEach((doc) => {
        const users = doc.data().users;
        const partner = users.find(u => u !== currentUserEmail);

        if (partner) {
          db.collection('users').doc(partner).get().then(pDoc => {
            const pData = pDoc.exists ? pDoc.data() : { displayName: partner.split('@')[0], photoURL: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' };
            
            const savedNickname = localStorage.getItem(`nickname_${currentUserEmail}_${partner}`);
            const nameToShow = savedNickname || pData.displayName || partner.split('@')[0];
            const avatarUrl = pData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

            const card = document.createElement('div');
            card.className = 'chat-card';
            card.onclick = () => openChatRoom(partner, pData);
            card.innerHTML = `
              <img src="${avatarUrl}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'">
              <div>
                <b>${nameToShow}</b>
                <p style="font-size:12px; color:#666;">Tap to chat</p>
              </div>
            `;
            chatList.appendChild(card);
          });
        }
      });
    });
}

// 5. CHAT ROOM FUNCTIONALITY
function openChatRoom(partner, partnerData) {
  currentActivePartner = partner;
  const ids = [currentUserEmail, partner].sort();
  activeRoomId = ids.join('_').replace(/[^a-zA-Z0-9]/g, "_");

  showScreen('screen-chat');
  history.pushState({ page: 'chat' }, "Chat", "#chat");

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

function toggleChatHeaderMenu() { document.getElementById('chat-header-menu').classList.toggle('hidden'); }

function editPartnerNickname() {
  document.getElementById('chat-header-menu').classList.add('hidden');
  const currentName = document.getElementById('chat-header-name').innerText;
  const newName = prompt("Enter a custom name for this user:", currentName);
  
  if (newName && newName.trim() !== "") {
    localStorage.setItem(`nickname_${currentUserEmail}_${currentActivePartner}`, newName.trim());
    document.getElementById('chat-header-name').innerText = newName.trim();
  }
}

// 6. SENDING & DELETING MESSAGES
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

  compressImage(file, 600, 0.7, (compressedDataUrl) => {
    db.collection('rooms').doc(activeRoomId).collection('messages').add({
      type: 'image',
      mediaData: compressedDataUrl,
      sender: currentUserEmail,
      status: 'sent',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
}

function sendViewOnceMessage(e) {
  const file = e.target.files[0];
  if (!file) return;

  compressImage(file, 600, 0.7, (compressedDataUrl) => {
    db.collection('rooms').doc(activeRoomId).collection('messages').add({
      type: 'view_once',
      mediaData: compressedDataUrl,
      isOpened: false,
      sender: currentUserEmail,
      status: 'sent',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
}

function deleteMessage(msgId, senderEmail) {
  if (senderEmail !== currentUserEmail) {
    alert("You can only delete your own messages!");
    return;
  }
  if (confirm("Delete this message?")) {
    db.collection('rooms').doc(activeRoomId).collection('messages').doc(msgId).delete().then(() => {
      // Message deleted successfully
    }).catch(err => {
      alert("Error deleting message");
    });
  }
}

// 7. STATUS LOGIC
function uploadStatusPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;

  compressImage(file, 600, 0.7, (compressedUrl) => {
    db.collection('statuses').doc(currentUserEmail).set({
      userEmail: currentUserEmail,
      type: 'image',
      content: compressedUrl,
      audioUrl: '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => { alert("Status uploaded!"); });
  });
}

function openAudioTextStatusModal() { document.getElementById('audio-status-modal').classList.remove('hidden'); }
function closeAudioStatusModal() { document.getElementById('audio-status-modal').classList.add('hidden'); }

function saveAudioTextStatus() {
  const textVal = document.getElementById('status-song-text').value.trim();
  const audioFile = document.getElementById('status-audio-input').files[0];

  if (!textVal) { alert("Please enter some text!"); return; }

  if (audioFile) {
    const reader = new FileReader();
    reader.readAsDataURL(audioFile);
    reader.onload = function (e) {
      db.collection('statuses').doc(currentUserEmail).set({
        userEmail: currentUserEmail,
        type: 'audio_text',
        content: textVal,
        audioUrl: e.target.result,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        closeAudioStatusModal();
        alert("Status posted with Song! 🎵");
      });
    };
  } else {
    db.collection('statuses').doc(currentUserEmail).set({
      userEmail: currentUserEmail,
      type: 'text',
      content: textVal,
      audioUrl: '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      closeAudioStatusModal();
      alert("Status posted!");
    });
  }
}

function listenStatuses() {
  db.collection('users').doc(currentUserEmail).get().then(uDoc => {
    if (uDoc.exists) {
      document.getElementById('my-status-avatar').src = uDoc.data().photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    }
  });

  db.collection('statuses').doc(currentUserEmail).onSnapshot(doc => {
    if (doc.exists) {
      currentMyStatusDocId = doc.id;
      document.getElementById('my-status-subtext').innerText = "Tap to view or delete status";
    } else {
      currentMyStatusDocId = null;
      document.getElementById('my-status-subtext').innerText = "Tap to add status update";
    }
  });

  db.collection('statuses').onSnapshot(snapshot => {
    const list = document.getElementById('recent-statuses-list');
    list.innerHTML = '';

    snapshot.forEach(doc => {
      const s = doc.data();
      if (s.userEmail !== currentUserEmail) {
        db.collection('users').doc(s.userEmail).get().then(uDoc => {
          const u = uDoc.exists ? uDoc.data() : { displayName: s.userEmail.split('@')[0], photoURL: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' };
          const card = document.createElement('div');
          card.className = 'status-item-card';
          card.onclick = () => viewStatusModal(u.displayName, u.photoURL, s.type, s.content, false, s.audioUrl || '');
          card.innerHTML = `
            <img src="${u.photoURL}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'">
            <div>
              <b>${u.displayName || s.userEmail.split('@')[0]}</b>
              <p style="font-size:12px; color:#666;">${s.audioUrl ? '🎵 Music Status' : 'Tap to view status'}</p>
            </div>
          `;
          list.appendChild(card);
        });
      }
    });
  });
}

function triggerMyStatusAction() {
  if (currentMyStatusDocId) {
    db.collection('statuses').doc(currentUserEmail).get().then(doc => {
      if (doc.exists) {
        const s = doc.data();
        db.collection('users').doc(currentUserEmail).get().then(uDoc => {
          const u = uDoc.data();
          viewStatusModal("My Status", u.photoURL, s.type, s.content, true, s.audioUrl || '');
        });
      }
    });
  } else {
    openAudioTextStatusModal();
  }
}

function viewStatusModal(name, avatar, type, content, isOwner, audioUrl) {
  document.getElementById('status-user-name').innerText = name;
  document.getElementById('status-user-avatar').src = avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

  const imgElem = document.getElementById('status-img-display');
  const txtElem = document.getElementById('status-text-display');

  if (currentStatusAudio) {
    currentStatusAudio.pause();
    currentStatusAudio = null;
  }

  if (type === 'image') {
    imgElem.src = content;
    imgElem.classList.remove('hidden');
    txtElem.classList.add('hidden');
  } else {
    txtElem.innerText = content;
    txtElem.classList.remove('hidden');
    imgElem.classList.add('hidden');

    if (audioUrl) {
      currentStatusAudio = new Audio(audioUrl);
      currentStatusAudio.play();
    }
  }

  if (isOwner) {
    document.getElementById('my-status-owner-actions').classList.remove('hidden');
  } else {
    document.getElementById('my-status-owner-actions').classList.add('hidden');
  }

  document.getElementById('status-viewer-modal').classList.remove('hidden');
}

function closeStatusViewer() {
  if (currentStatusAudio) {
    currentStatusAudio.pause();
    currentStatusAudio = null;
  }
  document.getElementById('status-viewer-modal').classList.add('hidden');
}

function deleteMyStatus() {
  if (confirm("Do you want to delete your status?")) {
    db.collection('statuses').doc(currentUserEmail).delete().then(() => {
      closeStatusViewer();
      alert("Status deleted!");
    });
  }
}

// 8. VIEW ONCE & HD PHOTO VIEWER
function handleViewOnceClick(msgId, mediaData, isOpened, sender) {
  if (sender === currentUserEmail) return;
  if (isOpened) { alert("Photo is already expired!"); return; }

  openPhotoViewer(mediaData);
  db.collection('rooms').doc(activeRoomId).collection('messages').doc(msgId).update({
    isOpened: true, mediaData: ""
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

function togglePhotoMenu() { document.getElementById('photo-menu').classList.toggle('hidden'); }

function openFullImageWindow() {
  const win = window.open("");
  win.document.write(`<img src="${currentViewImgUrl}" style="max-width:100%;" />`);
}

// 9. VOICE RECORDING
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

// 10. RENDER MESSAGES WITH DELETE OPTION & TICKS
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

  // Delete button for user's own messages
  let deleteHtml = '';
  if (isMe) {
    deleteHtml = `<i class="fa-solid fa-trash msg-delete-btn" onclick="deleteMessage('${msgId}', '${msg.sender}')" title="Delete Message" style="margin-left: 8px; font-size: 11px; color: #888; cursor: pointer;"></i>`;
  }

  div.innerHTML = `${contentHtml}<span class="msg-meta"><span class="msg-time">${timeStr}</span>${tickHtml}${deleteHtml}</span>`;
  chatBox.appendChild(div);
}

// 11. PROFILE SETTINGS
function openSettings() {
  showScreen('screen-settings');
  history.pushState({ page: 'settings' }, "Settings", "#settings");
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

  compressImage(file, 200, 0.6, (compressedDataUrl) => {
    document.getElementById('settings-avatar-preview').src = compressedDataUrl;
  });
}

function saveSettings() {
  const saveBtn = document.getElementById('save-settings-btn');
  saveBtn.innerText = "Saving...";
  saveBtn.disabled = true;

  const newName = document.getElementById('edit-display-name').value.trim();
  const newBio = document.getElementById('edit-user-bio').value.trim();
  const avatarSrc = document.getElementById('settings-avatar-preview').src;

  db.collection('users').doc(currentUserEmail).update({
    displayName: newName,
    bio: newBio,
    photoURL: avatarSrc
  }).then(() => {
    saveBtn.innerText = "Save Changes";
    saveBtn.disabled = false;
    alert("Profile Updated Successfully!");
    openHome();
  }).catch(err => {
    saveBtn.innerText = "Save Changes";
    saveBtn.disabled = false;
    alert("Error updating profile. Please try again.");
  });
}

// IMAGE COMPRESSION HELPER
function compressImage(file, maxWidth, quality, callback) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = function(event) {
    const img = new Image();
    img.src = event.target.result;
    img.onload = function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
  };
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}