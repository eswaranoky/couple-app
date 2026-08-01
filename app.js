// Firebase Configuration & Initialization
// Replace these values with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Global App States
let currentUserEmail = "";
let activeRoomId = "";
let currentReplyText = null;

// --- SIMPLE ENCRYPTION / DECRYPTION HELPERS ---
function encryptText(text) {
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch (e) {
    return text;
  }
}

function decryptText(encodedText) {
  try {
    return decodeURIComponent(escape(atob(encodedText)));
  } catch (e) {
    return encodedText;
  }
}

// --- USER LOGIN & ROOM INITIALIZATION ---
function loginUser() {
  const emailInput = document.getElementById('user-email');
  const roomInput = document.getElementById('room-id');

  const email = emailInput ? emailInput.value.trim() : '';
  const room = roomInput ? roomInput.value.trim() : '';

  if (!email || !room) {
    alert('Please enter both Email and Room ID!');
    return;
  }

  currentUserEmail = email;
  activeRoomId = room;

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('chat-screen').style.display = 'flex';

  document.getElementById('display-room').innerText = `Room: ${activeRoomId}`;
  document.getElementById('display-user').innerText = `User: ${currentUserEmail}`;

  // Start Real-time Message Listener
  listenForMessages();
}

// --- REAL-TIME FIRESTORE LISTENER ---
function listenForMessages() {
  if (!activeRoomId) return;

  db.collection('rooms')
    .doc(activeRoomId)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot((snapshot) => {
      const chatBox = document.getElementById('chat-box');
      chatBox.innerHTML = ''; // Clear chat container on updates

      snapshot.forEach((doc) => {
        renderMessage(doc.data(), doc.id);
      });

      // Auto-scroll to bottom
      chatBox.scrollTop = chatBox.scrollHeight;
    }, (error) => {
      console.error("Firestore listen error: ", error);
    });
}

// --- RENDER SINGLE MESSAGE BUBBLE ---
function renderMessage(msg, msgId) {
  const chatBox = document.getElementById('chat-box');

  // Handle Call Log Message Type
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

  // SWIPE TO REPLY (Touch Gesture)
  let startX = 0;
  div.ontouchstart = (e) => { startX = e.touches[0].clientX; };
  div.ontouchmove = (e) => {
    let diff = e.touches[0].clientX - startX;
    if (Math.abs(diff) < 80) div.style.transform = `translateX(${diff}px)`;
  };
  div.ontouchend = () => {
    div.style.transform = 'translateX(0px)';
    setReplyTarget(msg.type === 'text' ? decryptText(msg.text) : 'Photo');
  };

  let replyHtml = msg.replyTo ? `<div class="reply-preview-box">↩️ ${msg.replyTo}</div>` : '';
  
  // DIRECT DELETE BUTTON (Stop propagation prevents trigger conflict with swipe/click)
  let deleteBtnHtml = isMe ? `<i class="fa-solid fa-trash delete-btn" onclick="event.stopPropagation(); deleteMessage('${msgId}')" title="Delete Message"></i>` : '';
  let tickHtml = isMe ? `<i class="fa-solid fa-check-double ${msg.isRead ? 'blue-tick' : ''}"></i>` : '';

  // Render View-Once Media
  if (msg.isViewOnce) {
    if (msg.openedBy && msg.openedBy.includes(currentUserEmail)) {
      div.innerHTML = `<span style="font-style:italic; color:#8696a0;">👁️ Opened View Once Media</span> ${deleteBtnHtml}`;
    } else {
      div.innerHTML = `<button class="view-once-btn" onclick="openViewOnceMedia('${msgId}', '${msg.mediaUrl}')">👁️ Photo (View Once)</button> ${deleteBtnHtml}`;
    }
  } 
  // Render Regular Image Message
  else if (msg.type === 'image') {
    div.innerHTML = `
      ${replyHtml}
      <img src="${msg.mediaUrl}" class="chat-img-hd" onclick="openHDLightbox('${msg.mediaUrl}')" alt="Shared Image">
      <span class="msg-meta">${tickHtml} ${deleteBtnHtml}</span>
    `;
  } 
  // Render Text Message
  else {
    div.innerHTML = `
      ${replyHtml}
      <span class="msg-text">${decryptText(msg.text)}</span>
      <span class="msg-meta">${tickHtml} ${deleteBtnHtml}</span>
    `;
  }

  chatBox.appendChild(div);
}

// --- SEND TEXT MESSAGE ---
function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();

  if (!text || !activeRoomId) return;

  const encryptedText = encryptText(text);

  const payload = {
    sender: currentUserEmail,
    text: encryptedText,
    type: 'text',
    replyTo: currentReplyText || null,
    isRead: false,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection('rooms')
    .doc(activeRoomId)
    .collection('messages')
    .add(payload)
    .then(() => {
      input.value = '';
      clearReply();
    })
    .catch((error) => {
      console.error("Send message error: ", error);
    });
}

// --- SEND IMAGE (Regular or View-Once) ---
function sendImage(imageUrl, isViewOnce = false) {
  if (!imageUrl || !activeRoomId) return;

  const payload = {
    sender: currentUserEmail,
    mediaUrl: imageUrl,
    type: 'image',
    isViewOnce: isViewOnce,
    openedBy: [],
    replyTo: currentReplyText || null,
    isRead: false,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection('rooms')
    .doc(activeRoomId)
    .collection('messages')
    .add(payload)
    .then(() => {
      clearReply();
    })
    .catch((error) => {
      console.error("Send image error: ", error);
    });
}

// --- DELETE MESSAGE (FIXED) ---
function deleteMessage(msgId) {
  if (!activeRoomId || !msgId) return;

  if (confirm("Indha message-a delete panna virumbureengala?")) {
    db.collection('rooms')
      .doc(activeRoomId)
      .collection('messages')
      .doc(msgId)
      .delete()
      .then(() => {
        console.log("Message deleted successfully!");
      })
      .catch((error) => {
        console.error("Error deleting message: ", error);
        alert("Delete panna mudiyala. Retry pannunga!");
      });
  }
}

// --- VIEW ONCE MEDIA HANDLER ---
function openViewOnceMedia(msgId, mediaUrl) {
  if (!activeRoomId || !msgId) return;

  // Open Lightbox
  openHDLightbox(mediaUrl);

  // Mark Media as Opened by Current User
  db.collection('rooms')
    .doc(activeRoomId)
    .collection('messages')
    .doc(msgId)
    .update({
      openedBy: firebase.firestore.FieldValue.arrayUnion(currentUserEmail)
    })
    .catch((error) => {
      console.error("Error updating view once status: ", error);
    });
}

// --- LIGHTBOX CONTROL ---
function openHDLightbox(url) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  img.src = url;
  lightbox.style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}

// --- REPLY TARGET HELPERS ---
function setReplyTarget(text) {
  currentReplyText = text;
  const replyContainer = document.getElementById('reply-preview');
  const replyTextSpan = document.getElementById('reply-text');
  
  if (replyContainer && replyTextSpan) {
    replyTextSpan.innerText = text;
    replyContainer.style.display = 'flex';
  }
}

function clearReply() {
  currentReplyText = null;
  const replyContainer = document.getElementById('reply-preview');
  if (replyContainer) {
    replyContainer.style.display = 'none';
  }
}

// Enter Key Listener for Message Input
document.addEventListener('DOMContentLoaded', () => {
  const msgInput = document.getElementById('msg-input');
  if (msgInput) {
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }
});