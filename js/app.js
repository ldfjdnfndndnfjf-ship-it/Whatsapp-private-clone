let currentUser = null;
let userIp = '0.0.0.0';
let activeChatId = null;
let activeChatUser = null;
let activeTab = 'chats';
let messageUnsubscribe = null;

// Fetch User IP Address
fetch('https://api.ipify.org?format=json')
    .then(res => res.json())
    .then(data => userIp = data.ip)
    .catch(() => userIp = 'Hidden/VPN');

// Handle Auth (Register/Login automatically)
async function handleAuth(e) {
    e.preventDefault();
    const username = document.getElementById('authUsername').value.trim().toLowerCase();
    const password = document.getElementById('authPassword').value;

    if (!username || !password) return;

    try {
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();

        if (doc.exists) {
            // Login
            if (doc.data().password === password) {
                await userRef.update({ ipAddress: userIp, lastLogin: firebase.firestore.FieldValue.serverTimestamp() });
                loginSuccess(username);
            } else {
                showAlert('Incorrect password!', 'bg-red-500/20 text-red-400');
            }
        } else {
            // Register Unique Username
            await userRef.set({
                username: username,
                password: password,
                ipAddress: userIp,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            loginSuccess(username);
        }
    } catch (err) {
        showAlert('Database Error: ' + err.message, 'bg-red-500/20 text-red-400');
    }
}

function showAlert(msg, classes) {
    const box = document.getElementById('authAlert');
    box.className = `p-3 rounded-xl text-xs font-semibold text-center ${classes}`;
    box.innerText = msg;
    box.classList.remove('hidden');
}

function loginSuccess(username) {
    currentUser = username;
    localStorage.setItem('wa_user', username);
    document.getElementById('authModal').classList.add('hidden');
    document.getElementById('appInterface').classList.remove('hidden');
    document.getElementById('currentUsername').innerText = username;
    document.getElementById('userAvatar').innerText = username.charAt(0).toUpperCase();
    loadSidebarList();
}

// Auto login if session exists
window.onload = () => {
    const saved = localStorage.getItem('wa_user');
    if (saved) loginSuccess(saved);
};

function logout() {
    localStorage.removeItem('wa_user');
    location.reload();
}

function switchTab(tab) {
    activeTab = tab;
    loadSidebarList();
}

// Search Users
async function searchUsers(query) {
    const list = document.getElementById('sidebarList');
    if (!query.trim()) {
        loadSidebarList();
        return;
    }
    const snapshot = await db.collection('users')
        .where('username', '>=', query.toLowerCase())
        .where('username', '<=', query.toLowerCase() + '\uf8ff')
        .get();

    list.innerHTML = '';
    snapshot.forEach(doc => {
        if (doc.id !== currentUser) {
            list.appendChild(createContactItem(doc.data().username));
        }
    });
}

function createContactItem(username) {
    const div = document.createElement('div');
    div.className = "p-3 border-b border-wa-border hover:bg-wa-dark cursor-pointer flex items-center gap-3 transition";
    div.onclick = () => openChat(username);
    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-wa-border text-white font-bold flex items-center justify-center uppercase">
            ${username.charAt(0)}
        </div>
        <div class="flex-1">
            <h4 class="text-sm font-bold text-white">${username}</h4>
            <p class="text-[11px] text-gray-400">Click to start conversation</p>
        </div>
    `;
    return div;
}

// Load Sidebar Chats List
function loadSidebarList() {
    const list = document.getElementById('sidebarList');
    list.innerHTML = '<div class="p-4 text-center text-xs text-gray-500">Search users above to start new chat</div>';
    
    db.collection('chats')
        .where('participants', 'array-contains', currentUser)
        .onSnapshot(snapshot => {
            if (snapshot.empty) return;
            list.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                const otherUser = data.participants.find(u => u !== currentUser);
                const item = document.createElement('div');
                item.className = "p-3 border-b border-wa-border hover:bg-wa-dark cursor-pointer flex items-center gap-3 transition";
                item.onclick = () => openChat(otherUser);
                item.innerHTML = `
                    <div class="w-10 h-10 rounded-full bg-wa-green/20 text-wa-green font-bold flex items-center justify-center uppercase">
                        ${otherUser.charAt(0)}
                    </div>
                    <div class="flex-1">
                        <h4 class="text-sm font-bold text-white">${otherUser}</h4>
                        <p class="text-[11px] text-gray-400 truncate">${data.lastMessage || 'No messages yet'}</p>
                    </div>
                `;
                list.appendChild(item);
            });
        });
}

// Open 1-on-1 Chat
async function openChat(otherUser) {
    activeChatUser = otherUser;
    activeChatId = [currentUser, otherUser].sort().join('_');

    document.getElementById('activeChatTitle').innerText = otherUser;
    document.getElementById('activeChatSubtitle').innerText = 'End-to-end encrypted';
    document.getElementById('activeChatAvatar').innerText = otherUser.charAt(0).toUpperCase();

    document.getElementById('chatView').classList.remove('hidden');
    document.getElementById('chatView').classList.add('flex');

    // Listen to Realtime Messages
    if (messageUnsubscribe) messageUnsubscribe();
    
    messageUnsubscribe = db.collection('chats').doc(activeChatId).collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
            const msgContainer = document.getElementById('messagesContainer');
            msgContainer.innerHTML = '';
            snapshot.forEach(doc => {
                const m = doc.data();
                const isMe = m.sender === currentUser;
                const msgDiv = document.createElement('div');
                msgDiv.className = `flex ${isMe ? 'justify-end' : 'justify-start'}`;
                msgDiv.innerHTML = `
                    <div class="${isMe ? 'bg-wa-bubbleOut' : 'bg-wa-bubbleIn'} max-w-xs sm:max-w-md px-3.5 py-2 rounded-2xl text-xs text-white shadow">
                        <p>${m.text}</p>
                    </div>
                `;
                msgContainer.appendChild(msgDiv);
            });
            msgContainer.scrollTop = msgContainer.scrollHeight;
        });
}

// Send Message
async function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !activeChatId) return;

    input.value = '';

    const chatDoc = db.collection('chats').doc(activeChatId);
    await chatDoc.set({
        participants: [currentUser, activeChatUser],
        lastMessage: text,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await chatDoc.collection('messages').add({
        sender: currentUser,
        text: text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function closeChatMobile() {
    document.getElementById('chatView').classList.add('hidden');
    document.getElementById('chatView').classList.remove('flex');
}
