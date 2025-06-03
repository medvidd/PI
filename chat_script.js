let socket; 
if (typeof io !== 'undefined') {
    socket = io('http://localhost:3000');
    window.chatSocket = socket; 
    console.log('Socket.IO підключено (chat_script.js) і збережено в window.chatSocket');
} else {
    console.error('FATAL: io is not defined. Socket.IO library not loaded. (chat_script.js)');
}

let currentUserId = null;
let currentUsername = null;
let currentChat = null; 
let currentGroupChat = null; 
let userStatuses = {}; 
let activeChatList = []; 
let currentGroupDetails = null; 

function updateGroupActionButtonsVisibility() {
    const addMembersBtn = document.getElementById('addMembersToGroupBtn');
    const groupInfoBtn = document.getElementById('groupInfoBtn');

    if (currentGroupChat && currentGroupDetails) {
        if (groupInfoBtn) groupInfoBtn.style.display = 'inline-block';
        if (currentGroupDetails.creator_id === currentUserId) {
            if (addMembersBtn) addMembersBtn.style.display = 'inline-block';
        } else {
            if (addMembersBtn) addMembersBtn.style.display = 'none';
        }
    } else {
        if (groupInfoBtn) groupInfoBtn.style.display = 'none';
        if (addMembersBtn) addMembersBtn.style.display = 'none';
    }
}

function updateChatHeaderUIForLoggedInUser(username) {
    const loginButton = document.getElementById('loginButton');
    const account = document.getElementById('account');
    const notificationElement = document.getElementById('notification'); 
    const usernameDisplay = document.getElementById('usernameDisplay');

    if (loginButton) loginButton.style.display = 'none';
    if (account) account.style.display = 'flex';
    if (notificationElement) notificationElement.style.display = 'block'; 
    if (usernameDisplay) usernameDisplay.textContent = username;
}

function updateChatHeaderUIForLoggedOutUser() {
    const loginButton = document.getElementById('loginButton');
    const account = document.getElementById('account');
    const notificationElement = document.getElementById('notification');

    if (loginButton) loginButton.style.display = 'flex';
    if (account) account.style.display = 'none';
    if (notificationElement) notificationElement.style.display = 'none'; 
}

function updateChatNotificationDotState() {
    const notificationContainer = document.getElementById('notification');
    if (!notificationContainer) return;
    const notificationDot = notificationContainer.querySelector('.notification-dot');
    const bmodal = notificationContainer.querySelector('.bmodal');

    if (bmodal && notificationDot) {
        if (bmodal.children.length > 0) {
            notificationDot.style.display = 'block';
            notificationDot.classList.add('active');
        } else {
            notificationDot.style.display = 'none';
            notificationDot.classList.remove('active');
        }
    }
}

function showChatNotification(messageData) {
    console.log('[CHAT_SCRIPT] showChatNotification called with:', JSON.stringify(messageData, null, 2)); 
    if (!messageData || !messageData.sender) {
        console.error('showChatNotification: messageData or messageData.sender is undefined', messageData);
        return;
    }

    const { sender, message, recipient_id } = messageData;
    const actualGroupChatIdFromServer = messageData.group_chat_id; 
    const actualGroupNameFromServer = messageData.group_name;     

    const notificationContainer = document.getElementById('notification');
    if (!notificationContainer) return;

    const notificationDot = notificationContainer.querySelector('.notification-dot');
    const bmodal = notificationContainer.querySelector('.bmodal');
    const bellIcon = notificationContainer.querySelector('.bell');

    const chatWindowVisible = document.getElementById('messagesArea') && document.getElementById('messagesArea').offsetParent !== null;
    let isChatActiveWithMessageSource = false;
    if (chatWindowVisible) {
        if (actualGroupChatIdFromServer) {
            isChatActiveWithMessageSource = currentGroupChat === actualGroupChatIdFromServer;
        } else if (currentChat) { 
            isChatActiveWithMessageSource = (currentChat.toString() === sender.id.toString() && sender.id !== currentUserId) ||
                                          (currentChat.toString() === recipient_id?.toString() && sender.id === currentUserId);
        }
    }

    if (isChatActiveWithMessageSource && sender.id !== currentUserId) { 
        clearChatNotificationForSource(actualGroupChatIdFromServer ? actualGroupChatIdFromServer : sender.id, !!actualGroupChatIdFromServer);
        return; 
    } 
    
    if (sender.id === currentUserId) {
        return;
    }

    const MAX_NOTIFICATIONS = 3;
    const senderIdForNotification = actualGroupChatIdFromServer ? `group_${actualGroupChatIdFromServer}` : sender.id.toString();
    const displayName = actualGroupChatIdFromServer ? (actualGroupNameFromServer || `Group ${actualGroupChatIdFromServer}`) : sender.username;
    console.log(`[CHAT_SCRIPT] showChatNotification: senderIdForNotification=${senderIdForNotification}, displayName=${displayName}`);

    const existingNotification = bmodal.querySelector(`.message[data-source-id="${senderIdForNotification}"]`);
    if (existingNotification) {
        existingNotification.remove();
    }

    const newMessageDiv = document.createElement('div');
    newMessageDiv.className = 'message';
    newMessageDiv.dataset.sourceId = senderIdForNotification;
    newMessageDiv.innerHTML = `
        <img src="/PI/images/account.png" alt="User picture" class="avatar">
        <div class="message-box">
            <div class="message-content">
                <h2>${displayName}</h2>
                <p>${actualGroupChatIdFromServer ? sender.username + ': ' : ''}${message}</p>
            </div>
        </div>
    `;

    newMessageDiv.addEventListener('click', () => {
        newMessageDiv.remove();
        updateChatNotificationDotState();
        const targetChatId = actualGroupChatIdFromServer ? actualGroupChatIdFromServer : sender.id;
        const isGroup = !!actualGroupChatIdFromServer;
        
        if (window.location.pathname.endsWith('messages.html')) {
            switchChat(targetChatId, isGroup);
        } else {
            const targetUrl = `messages.html?${isGroup ? 'group_chat=' : 'chat='}${targetChatId}`;
            window.location.href = targetUrl;
        }
    });

    bmodal.prepend(newMessageDiv);

    while (bmodal.children.length > MAX_NOTIFICATIONS) {
        bmodal.removeChild(bmodal.lastChild);
    }

    notificationContainer.style.display = 'block';
    if (notificationDot) {
        notificationDot.style.display = 'block';
        notificationDot.classList.add('active');
    }
    
    if (bellIcon) {
        bellIcon.classList.add('ringing');
        setTimeout(() => {
            bellIcon.classList.remove('ringing');
        }, 600);
    }
}

function clearChatNotificationForSource(sourceId, isGroup = false) {
    const bmodal = document.querySelector('#notification .bmodal');
    if (bmodal) {
        const dataSourceId = isGroup ? `group_${sourceId}` : sourceId.toString();
        const notificationElement = bmodal.querySelector(`.message[data-source-id="${dataSourceId}"]`);
        if (notificationElement) {
            notificationElement.remove();
        }
        updateChatNotificationDotState();
    }
}

async function initializeChat() {
    try {
        const response = await fetch('/PI/api/check_session.php', {
            headers: { 'Cache-Control': 'no-cache' }
        });
        const result = await response.json();

        if (result.success) {
            const userResponse = await fetch('/PI/api/get_user_id.php', {
                headers: { 'Cache-Control': 'no-cache' }
            });
            const userData = await userResponse.json();

            if (userData.success) {
                currentUsername = result.username;
                currentUserId = userData.userId;

                updateChatHeaderUIForLoggedInUser(currentUsername);
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('username', currentUsername); 
                
                socket.emit('auth', {
                    username: currentUsername,
                    id: currentUserId
                });
                socket.emit('user_activity', { userId: currentUserId, page: window.location.pathname });
                
                socket.emit('get_active_chats'); 
                
                setupEventListeners();
                setupModalEventListeners();
                updateChatNotificationDotState(); 

                const urlParams = new URLSearchParams(window.location.search);
                const chatIdFromUrl = urlParams.get('chat');
                const groupChatIdFromUrl = urlParams.get('group_chat');

                if (chatIdFromUrl) {
                    switchChat(parseInt(chatIdFromUrl), false);
                } else if (groupChatIdFromUrl) {
                    switchChat(groupChatIdFromUrl, true);
                }

            } else {
                updateChatHeaderUIForLoggedOutUser();
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('username');
                throw new Error('Failed to get user ID for chat.');
            }
        } else {
            updateChatHeaderUIForLoggedOutUser();
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('username');
            window.location.href = '/PI/index.html'; 
        }
    } catch (error) {
        console.error('Error initializing chat:', error);
        updateChatHeaderUIForLoggedOutUser();
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('username');
        if (!localStorage.getItem('isLoggedIn')) {
             window.location.href = '/PI/index.html';
        }
    }
}

socket.on('user_statuses', ({ statuses }) => {
    userStatuses = statuses;
    updateUserStatusesUI(); 
});

function updateUserStatusesUI() {
    document.querySelectorAll('.chat-item[data-chat]').forEach(item => {
        if (item.dataset.isGroup === 'true') return; 

        const userId = parseInt(item.dataset.chat);
        if (isNaN(userId)) return;

        const statusElement = item.querySelector('.chat-status');
        if (statusElement) {
            const userDataFromServer = userStatuses[userId];
            const currentStatusString = userDataFromServer && userDataFromServer.status ? userDataFromServer.status : 'offline';
            
            statusElement.className = 'chat-status'; 
            statusElement.classList.add(`status-${currentStatusString}`); 
            statusElement.textContent = currentStatusString.charAt(0).toUpperCase() + currentStatusString.slice(1);
        }
    });
}

function renderChatList(chats) {
    const chatItemsContainer = document.getElementById('chatItems');
    chatItemsContainer.innerHTML = ''; 
    activeChatList = chats; 

    if (!chats || chats.length === 0) {
        chatItemsContainer.innerHTML = '<p class="no-chats-message">No active chats yet. Start a new one!</p>';
        return;
    }

    chats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chat = chat.id; 
        chatItem.dataset.isGroup = chat.isGroup.toString();
        if ((chat.isGroup && currentGroupChat === chat.id) || (!chat.isGroup && currentChat === chat.id)) {
            chatItem.classList.add('active');
        }

        const avatarLetter = chat.avatarLetter || (chat.name ? chat.name[0].toUpperCase() : '?');
        const avatarIcon = chat.isGroup ? '<i class="fas fa-users"></i>' : avatarLetter;

        let previewText = 'No messages yet.';
        let previewTimestamp = '';

        if (chat.lastMessage) {
            if (chat.isGroup) {
                previewText = `${chat.lastMessage.senderIsSelf ? 'You' : (chat.lastMessage.senderName || 'User')}: ${chat.lastMessage.text}`;
            } else {
                // For 1-on-1 chats, show sender if not self
                previewText = `${chat.lastMessage.senderIsSelf ? 'You' : chat.name}: ${chat.lastMessage.text}`;
            }
            previewTimestamp = chat.lastMessage.timestamp ? new Date(chat.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        }
        
        previewText = previewText.length > 35 ? previewText.substring(0, 32) + "..." : previewText;

        chatItem.innerHTML = `
            <div class="chat-avatar">${avatarIcon}</div>
            <div class="chat-info">
                <div class="chat-name-time">
                    <div class="chat-name">${chat.name}</div>
                    ${previewTimestamp ? `<div class="chat-time">${previewTimestamp}</div>` : ''}
                </div>
                <p class="chat-preview">${previewText}</p>
                ${!chat.isGroup ? '<div class="chat-status status-offline">Offline</div>' : ''} 
            </div>
        `;

        chatItem.addEventListener('click', () => switchChat(chat.id, chat.isGroup));
        chatItemsContainer.appendChild(chatItem);
    });
    updateUserStatusesUI(); 
}

socket.on('active_chats_list', (chats) => {
    console.log('Received active_chats_list:', chats);
    renderChatList(chats);
});

function sendMessageToChat(recipientsIgnored, message) { 
    if (!currentUsername || (!currentChat && !currentGroupChat)) {
        console.error('User not authenticated or no chat selected for sending message.');
        return;
    }
    console.log(`[CHAT_SCRIPT] sendMessageToChat: currentChat=${currentChat}, currentGroupChat=${currentGroupChat}`); 

    const messageData = {
        message: message,
        sender: {
            username: currentUsername,
            id: currentUserId
        },
        timestamp: new Date().toISOString()
    };

    if (currentGroupChat) {
        messageData.groupChatId = currentGroupChat;
    } else if (currentChat) {
        messageData.recipients = [currentChat]; 
    } else {
        console.error("Cannot send message: No active chat.");
        return; 
    }
    
    displayMessageInChat(messageData);
    updateChatPreviewInList(messageData);
    
    socket.emit('send_message', messageData);
}

socket.on('new_message', (messageData) => {
    console.log('[CHAT_SCRIPT] Raw new_message received from server:', JSON.stringify(messageData, null, 2)); 
    console.log('[CHAT_SCRIPT] Received new_message (parsed object):', messageData);
    console.log('[CHAT_SCRIPT] Current state: currentUserId:', currentUserId, 'currentChat:', currentChat, 'currentGroupChat:', currentGroupChat);

    if (!messageData || !messageData.sender || typeof messageData.sender.id === 'undefined') {
        console.error('[CHAT_SCRIPT] Invalid messageData received (no sender or sender.id):', messageData);
        return;
    }

    const isMessageForCurrentGroupChat = messageData.group_chat_id && messageData.group_chat_id === currentGroupChat;
    
    const isMessageForCurrentPrivateChat = !messageData.group_chat_id && currentChat && 
                                          ((messageData.sender.id === currentChat && messageData.sender.id !== currentUserId) || 
                                           (messageData.recipient_id === currentChat && messageData.sender.id === currentUserId));

    const isActiveChat = isMessageForCurrentGroupChat || isMessageForCurrentPrivateChat;

    console.log(`[CHAT_SCRIPT] isMessageForCurrentGroupChat: ${isMessageForCurrentGroupChat}, isMessageForCurrentPrivateChat: ${isMessageForCurrentPrivateChat}, isActiveChat evaluation: ${isActiveChat}`);

    if (isActiveChat) {
        console.log('[CHAT_SCRIPT] Message is for the active chat. Calling displayMessageInChat.');
        displayMessageInChat(messageData); 
    }

    if (messageData.sender.id !== currentUserId) { 
        if (!isActiveChat) {
            console.log('[CHAT_SCRIPT] Message is from another user AND NOT for active chat. Calling showChatNotification.');
            showChatNotification(messageData);
        } else {
            console.log('[CHAT_SCRIPT] Message is from another user FOR active chat. Chat updated. Not showing bell notification.');

            clearChatNotificationForSource(messageData.group_chat_id ? messageData.group_chat_id : messageData.sender.id, !!messageData.group_chat_id);
        }
    } else {
        console.log('[CHAT_SCRIPT] Message is from current user. Not showing bell notification.');
    }
    
    updateChatPreviewInList(messageData);
});

socket.on('message_history', (data) => {
    const { messages } = data;
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.innerHTML = '';
    
    if (messages) {
        messages.forEach(msg => {
            displayMessageInChat({ 
                sender: {
                    username: msg.sender_name, 
                    id: msg.sender_id
                },
                message: msg.message,
                timestamp: msg.timestamp,
                groupChatId: msg.group_chat_id 
            });
        });
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }
});

function displayMessageInChat(messageData) { 
    const { sender, message, timestamp, groupChatId, group_name } = messageData; 
    const messagesArea = document.getElementById('messagesArea');
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('message'); 
    
    const isOwnMessage = sender.id === currentUserId;
    if (isOwnMessage) {
        messageElement.classList.add('own');
    }
    
    const senderDisplayName = groupChatId && !isOwnMessage ? sender.username : (isOwnMessage ? 'You' : sender.username);
    const messageSenderNameContent = groupChatId && !isOwnMessage 
        ? `<div class="message-sender-name">${sender.username} ${group_name ? 'in ' + group_name : ''}</div>` 
        : '';

    messageElement.innerHTML = `
        <div class="message-avatar">${(sender.username || 'S')[0].toUpperCase()}</div>
        <div class="message-content">
            ${messageSenderNameContent} 
            <div class="message-bubble">${message}</div>
            <div class="message-info">
                <span>${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>•</span>
                <span>${senderDisplayName}</span>
            </div>
        </div>
    `;
    messagesArea.appendChild(messageElement);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function updateChatPreviewInList(messageData) { 
    console.log('[CHAT_SCRIPT] updateChatPreviewInList called with:', JSON.stringify(messageData, null, 2));
    const { sender, message, recipients, timestamp } = messageData;
    
    let targetId;
    let isGroupChat;
    let chatNameForUpdate = messageData.group_name; 

    const serverGroupId = messageData.group_chat_id; 
    const localGroupId = messageData.groupChatId;   

    if (serverGroupId) {
        targetId = serverGroupId;
        isGroupChat = true;
    } else if (localGroupId) {
        targetId = localGroupId;
        isGroupChat = true;
    } else {
        if (sender.id === currentUserId && recipients && recipients.length > 0) {
            targetId = recipients[0]; 
        } else {
            targetId = sender.id; 
        }
        isGroupChat = false;
    }
    
    console.log(`[CHAT_SCRIPT] updateChatPreviewInList: Determined targetId=${targetId}, isGroupChat=${isGroupChat}, groupNameForUpdate=${chatNameForUpdate}`);
    
    const chatItemSelector = `.chat-item[data-chat="${targetId}"][data-is-group="${isGroupChat.toString()}"]`;
    const chatItem = document.querySelector(chatItemSelector);
    console.log(`[CHAT_SCRIPT] updateChatPreviewInList: Attempting to find chat item with selector: ${chatItemSelector}`);

    if (chatItem) {
        console.log(`[CHAT_SCRIPT] updateChatPreviewInList: Chat item FOUND for targetId=${targetId}, isGroupChat=${isGroupChat}`);
        const previewEl = chatItem.querySelector('.chat-preview');
        const timeEl = chatItem.querySelector('.chat-time');
        const nameEl = chatItem.querySelector('.chat-name');

        if (isGroupChat && chatNameForUpdate && nameEl && nameEl.textContent !== chatNameForUpdate) {
            nameEl.textContent = chatNameForUpdate;
        }

        if (previewEl) {
            let previewText;
            if (isGroupChat) {
                previewText = `${sender.id === currentUserId ? 'You' : sender.username}: ${message}`;
            } else {
                previewText = `${sender.id === currentUserId ? 'You: ' : ''}${message}`;
            }
            previewEl.textContent = previewText.length > 30 ? previewText.substring(0, 27) + "..." : previewText;
        }
        if (timeEl && timestamp) {
            timeEl.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const chatItemsContainer = document.getElementById('chatItems');
        if (chatItemsContainer && chatItemsContainer.firstChild !== chatItem) {
            chatItemsContainer.prepend(chatItem);
        }
    } else {
        socket.emit('get_active_chats');
        socket.emit('get_active_chats');
    }
}

function switchChat(chatOrGroupId, isGroup) {
    console.log(`[CHAT_SCRIPT] switchChat called with: chatOrGroupId=${chatOrGroupId}, isGroup=${isGroup}, typeof chatOrGroupId=${typeof chatOrGroupId}`);
    const messagesArea = document.getElementById('messagesArea');
    const chatTitle = document.getElementById('chatTitle');
    const addMembersBtn = document.getElementById('addMembersToGroupBtn');
    const groupInfoBtn = document.getElementById('groupInfoBtn');

    messagesArea.innerHTML = '<p style="text-align:center; color:#aaa; margin-top:20px;">Loading messages...</p>'; 

    document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
    
    const chatOrGroupIdStr = chatOrGroupId.toString();
    const activeItemInDom = document.querySelector(`.chat-item[data-chat="${chatOrGroupIdStr}"][data-is-group="${isGroup.toString()}"]`);
    
    if (activeItemInDom) {
        activeItemInDom.classList.add('active');
        chatTitle.textContent = activeItemInDom.querySelector('.chat-name').textContent;
    } else {
        const chatInfoFromCache = activeChatList.find(c => c.id.toString() === chatOrGroupIdStr && c.isGroup === isGroup);
        if (chatInfoFromCache) {
            chatTitle.textContent = chatInfoFromCache.name;
        } else {
            chatTitle.textContent = isGroup ? "Group Chat" : "Chat"; 
            console.warn(`Switched to chat ID ${chatOrGroupIdStr} (isGroup: ${isGroup}) but no DOM item or cache entry. Requesting chat list.`);
            socket.emit('get_active_chats');
        }
    }

 
    currentGroupDetails = null; 

    if (isGroup) {
        currentGroupChat = chatOrGroupIdStr;
        currentChat = null;
        console.log(`[CHAT_SCRIPT] Switched to GROUP chat. currentGroupChat set to: ${currentGroupChat}`);
        socket.emit('get_chat_history', { groupChatId: chatOrGroupIdStr });
        socket.emit('get_group_chat_details', { groupId: currentGroupChat });
        
        if (groupInfoBtn) groupInfoBtn.style.display = 'none'; 
        if (addMembersBtn) addMembersBtn.style.display = 'none';

    } else {
        currentChat = parseInt(chatOrGroupIdStr);
        currentGroupChat = null;
        console.log(`[CHAT_SCRIPT] Switched to INDIVIDUAL chat. currentChat set to: ${currentChat}`);
        socket.emit('get_chat_history', { 
            userId1: currentUserId, 
            userId2: parseInt(chatOrGroupIdStr)
        });
        if (addMembersBtn) addMembersBtn.style.display = 'none';
        if (groupInfoBtn) groupInfoBtn.style.display = 'none';
    }
    clearChatNotificationForSource(chatOrGroupIdStr, isGroup);

    const url = new URL(window.location);
    url.searchParams.delete('chat');
    url.searchParams.delete('group_chat');
    if (isGroup) {
        url.searchParams.set('group_chat', chatOrGroupIdStr);
    } else {
        url.searchParams.set('chat', chatOrGroupIdStr);
    }
    window.history.pushState({}, '', url);
}

function setupEventListeners() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    if (messageInput && sendBtn) {
        const sendMessageHandler = () => {
            const message = messageInput.value.trim();
            if (message && (currentChat || currentGroupChat)) { 
                sendMessageToChat([], message); 
                messageInput.value = '';
            }
        };
        sendBtn.addEventListener('click', sendMessageHandler);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault();
                sendMessageHandler();
            }
        });
    }
}

function setupModalEventListeners() {
    const newChatBtn = document.getElementById('newChatBtn');
    const closeNewChatModal = document.getElementById('closeNewChatModal');
    const cancelNewChatBtn = document.getElementById('cancelNewChatBtn');
    const createChatBtn = document.getElementById('createChatBtn');

    if (newChatBtn) {
        newChatBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/PI/api/get_users.php?exclude_self=true'); 
                const result = await response.json();
                
                if (result.success) {
                    const studentList = document.getElementById('studentList');
                    studentList.innerHTML = ''; 
                    
                    const usersToDisplay = result.users.filter(user => user.id !== currentUserId); 

                    usersToDisplay.forEach(user => {
                        const studentItem = document.createElement('div');
                        studentItem.className = 'student-item';
                        studentItem.dataset.id = user.id;
                        studentItem.innerHTML = `
                            <input type="checkbox" id="student_select_${user.id}" data-username="${user.username}">
                            <div class="student-info">
                                <div class="student-name">${user.username}</div>
                                <div class="student-group">${user.role || 'User'}</div> 
                            </div>
                            <div class="student-avatar">${user.username[0].toUpperCase()}</div>`;
                        studentList.appendChild(studentItem);
                    });
                    
                    document.querySelectorAll('.chat-type-option').forEach(opt => opt.classList.remove('selected'));
                    document.querySelector('.chat-type-option[data-type="individual"]').classList.add('selected');
                    toggleChatNameField(false); 
                    
                    const chatNameInput = document.getElementById('chatName');
                    if (chatNameInput) chatNameInput.value = '';
                    
                    document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => cb.checked = false);
                    updateStudentSelectionInModal(); 
                    document.getElementById('newChatModal').style.display = 'flex';
                } else {
                    console.error("Failed to load users for new chat:", result.message);
                    
                }
            } catch (error) {
                console.error('Error loading users for new chat:', error);
            }
        });
    }

    if (closeNewChatModal) closeNewChatModal.addEventListener('click', () => closeModalAndReset('newChatModal'));
    if (cancelNewChatBtn) cancelNewChatBtn.addEventListener('click', () => closeModalAndReset('newChatModal'));
    if (createChatBtn) createChatBtn.addEventListener('click', createNewChatFromModal);

    document.querySelectorAll('.chat-type-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.chat-type-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            const isGroup = this.dataset.type === 'group';
            toggleChatNameField(isGroup);
            document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => cb.checked = false); 
            updateStudentSelectionInModal();
        });
    });

    const studentSearch = document.getElementById('studentSearch');
    if (studentSearch) studentSearch.addEventListener('input', function() { filterStudentsInModal(this.value); });

    const studentListModal = document.getElementById('studentList');
    if (studentListModal) {
         studentListModal.addEventListener('change', function(e) {
             if (e.target.matches('input[type="checkbox"]')) {
                 const selectedType = document.querySelector('.chat-type-option.selected');
                 if (selectedType?.dataset.type === 'individual') {
                     document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => {
                         if (cb !== e.target) cb.checked = false;
                     });
                 }
                 updateStudentSelectionInModal();
             }
         });
         studentListModal.addEventListener('click', function(e) { 
             const item = e.target.closest('.student-item');
             if (item) {
                 const checkbox = item.querySelector('input[type="checkbox"]');
                 if (checkbox) {
                     checkbox.checked = !checkbox.checked;
                     const event = new Event('change', { bubbles: true });
                     checkbox.dispatchEvent(event);
                 }
             }
         });
    }


    // group information
    const groupInfoBtn = document.getElementById('groupInfoBtn');
    if (groupInfoBtn) {
        groupInfoBtn.addEventListener('click', () => {
            if (currentGroupChat && currentGroupDetails) {
                fillChatInfoModal(currentGroupDetails);
                document.getElementById('chatInfoModal').style.display = 'flex';
            } else if (currentGroupChat) {
                socket.emit('get_group_chat_details', { groupId: currentGroupChat });
            } else {
            }
        });
    }

    const addMembersToGroupBtn = document.getElementById('addMembersToGroupBtn');
    if (addMembersToGroupBtn) {
        addMembersToGroupBtn.addEventListener('click', () => {
            openAddMembersModal();
        });
    }

    const closeChatInfoModal = document.getElementById('closeChatInfoModal');
    const cancelChatInfoBtn = document.getElementById('cancelChatInfoBtn');
    const saveChatInfoBtn = document.getElementById('saveChatInfoBtn');
    const editChatNameInput = document.getElementById('editChatName');

    if (closeChatInfoModal) closeChatInfoModal.addEventListener('click', () => closeModalAndReset('chatInfoModal'));
    if (cancelChatInfoBtn) cancelChatInfoBtn.addEventListener('click', () => closeModalAndReset('chatInfoModal'));

    if (saveChatInfoBtn && editChatNameInput) {
        saveChatInfoBtn.addEventListener('click', () => {
            const newName = editChatNameInput.value.trim();
            if (currentGroupChat && newName && currentGroupDetails && newName !== currentGroupDetails.name) {
                if (currentGroupDetails.creator_id !== currentUserId) {
                    return;
                }
                if (newName.length > 0 && newName.length <= 100) {
                    socket.emit('update_group_chat_info', { groupId: currentGroupChat, newName: newName });
                } else {
                    document.getElementById('editChatNameError').textContent = 'Name must be 1-100 characters.';
                }
            } else if (newName === currentGroupDetails?.name) {
                closeModalAndReset('chatInfoModal');
            } else {
                 document.getElementById('editChatNameError').textContent = 'Please enter a valid name.';
            }
        });
        editChatNameInput.addEventListener('input', () => {
            document.getElementById('editChatNameError').textContent = '';
        });
    }
    

    // add new member
    const closeAddMembersModal = document.getElementById('closeAddMembersModal');
    const cancelAddMembersBtn = document.getElementById('cancelAddMembersBtn');
    const confirmAddMembersBtn = document.getElementById('confirmAddMembersBtn');
    const addMemberSearchInput = document.getElementById('addMemberSearch');

    if (closeAddMembersModal) closeAddMembersModal.addEventListener('click', () => closeModalAndReset('addMembersModal'));
    if (cancelAddMembersBtn) cancelAddMembersBtn.addEventListener('click', () => closeModalAndReset('addMembersModal'));

    if (confirmAddMembersBtn) {
        confirmAddMembersBtn.addEventListener('click', () => {
            const selectedUserCheckboxes = document.querySelectorAll('#addMembersList input[type="checkbox"]:checked');
            const memberIdsToAdd = Array.from(selectedUserCheckboxes).map(cb => parseInt(cb.dataset.userId));

            if (currentGroupChat && memberIdsToAdd.length > 0) {
                socket.emit('add_members_to_group', { groupId: currentGroupChat, memberIdsToAdd: memberIdsToAdd });
            } else if (memberIdsToAdd.length === 0) {
            }
        });
    }
    if (addMemberSearchInput) {
        addMemberSearchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const items = document.querySelectorAll('#addMembersList .student-item');
            items.forEach(item => {
                const name = item.querySelector('.student-name').textContent.toLowerCase();
                item.style.display = name.includes(searchTerm) ? 'flex' : 'none';
            });
        });
    }
}

function toggleChatNameField(show) {
    const chatNameGroup = document.getElementById('chatNameGroup');
    if (chatNameGroup) {
        chatNameGroup.style.display = show ? 'block' : 'none';
        const chatNameInput = document.getElementById('chatName');
        if (chatNameInput && !show) {
             chatNameInput.value = '';
        }
    }
}

function updateCreateChatButtonState() { 
    const selectedType = document.querySelector('.chat-type-option.selected');
    if (!selectedType) return;

    const selectedCheckboxes = document.querySelectorAll('#studentList input[type="checkbox"]:checked');
    const selectedStudentsCount = selectedCheckboxes.length;
    const chatName = document.getElementById('chatName')?.value.trim() || '';
    const createBtn = document.getElementById('createChatBtn');

    if (!createBtn) return;
    let canCreate = false;

    if (selectedType.dataset.type === 'individual') {
        canCreate = selectedStudentsCount === 1;
    } else { 
        canCreate = selectedStudentsCount >= 1 && chatName.length > 0; 
    }
    createBtn.disabled = !canCreate;
}

function filterStudentsInModal(searchTerm) { 
    const studentItems = document.querySelectorAll('#studentList .student-item');
    const term = searchTerm.toLowerCase();
    studentItems.forEach(item => {
        const studentName = item.querySelector('.student-name').textContent.toLowerCase();
        const matches = studentName.includes(term);  
        item.style.display = matches ? 'flex' : 'none';
    });
}

function updateStudentSelectionInModal() { 
    const selectedCount = document.querySelectorAll('#studentList input[type="checkbox"]:checked').length;
    const countElement = document.getElementById('selectedCount');
    
    if (countElement) {
        if (selectedCount > 0) {
            countElement.textContent = `Вибрано: ${selectedCount} користувач${selectedCount === 1 ? '' : (selectedCount > 1 && selectedCount < 5 ? 'і' : 'ів')}`;
            countElement.style.display = 'block';
        } else {
            countElement.style.display = 'none';
        }
    }
    document.querySelectorAll('#studentList .student-item').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        item.classList.toggle('selected', checkbox?.checked);
    });
    updateCreateChatButtonState(); 
}

function createNewChatFromModal() { 
    const selectedType = document.querySelector('.chat-type-option.selected');
    if (!selectedType) return;

    const selectedUsersData = Array.from(document.querySelectorAll('#studentList input[type="checkbox"]:checked'))
        .map(cb => ({
            id: parseInt(cb.closest('.student-item').dataset.id),
            username: cb.dataset.username 
        }));
    
    if (selectedUsersData.length === 0) {
        return;
    }

    if (selectedType.dataset.type === 'individual') {
        if (selectedUsersData.length === 1) {
            const userToChatWith = selectedUsersData[0];
            const existingChat = activeChatList.find(chat => chat.id === userToChatWith.id && !chat.isGroup);
            
            if (existingChat) {
                switchChat(userToChatWith.id, false); 
            } else {
                console.log(`Creating a new local visual for chat with ${userToChatWith.username} (ID: ${userToChatWith.id})`);

                const messagesArea = document.getElementById('messagesArea');
                messagesArea.innerHTML = `<p style="text-align:center; color:#aaa; margin-top:20px;">Starting new chat with ${userToChatWith.username}. Type a message to begin.</p>`;
                
                const chatTitle = document.getElementById('chatTitle');
                chatTitle.textContent = userToChatWith.username;

                const addMembersBtn = document.getElementById('addMembersToGroupBtn');
                const groupInfoBtn = document.getElementById('groupInfoBtn');
                if (addMembersBtn) addMembersBtn.style.display = 'none';
                if (groupInfoBtn) groupInfoBtn.style.display = 'none';

                currentChat = userToChatWith.id;
                currentGroupChat = null;

                const url = new URL(window.location);
                url.searchParams.delete('chat');
                url.searchParams.delete('group_chat');
                url.searchParams.set('chat', currentChat);
                window.history.pushState({}, '', url);

                document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));

                const chatItemsContainer = document.getElementById('chatItems');
                const existingTempItem = chatItemsContainer.querySelector(`.chat-item[data-chat="${userToChatWith.id}"][data-is-group="false"]`);
                if (existingTempItem) {
                    existingTempItem.remove();
                }

                const tempChatItem = document.createElement('div');
                tempChatItem.className = 'chat-item active'; 
                tempChatItem.dataset.chat = userToChatWith.id.toString();
                tempChatItem.dataset.isGroup = "false";
                const avatarLetter = userToChatWith.username ? userToChatWith.username[0].toUpperCase() : '?';

                tempChatItem.innerHTML = `
                    <div class="chat-avatar">${avatarLetter}</div>
                    <div class="chat-info">
                        <div class="chat-name-time">
                            <div class="chat-name">${userToChatWith.username}</div>
                            <div class="chat-time"></div> <!-- No time initially -->
                        </div>
                        <p class="chat-preview">New chat, send a message...</p>
                        <div class="chat-status status-offline">Offline</div> <!-- Placeholder status -->
                    </div>
                `;
                tempChatItem.addEventListener('click', () => switchChat(userToChatWith.id, false));
                chatItemsContainer.prepend(tempChatItem);
                
                updateUserStatusesUI(); 
                clearChatNotificationForSource(userToChatWith.id, false);
            }
        }
    } else { 
        const chatName = document.getElementById('chatName').value.trim();
        if (chatName && selectedUsersData.length > 0) {
            const memberIds = selectedUsersData.map(user => user.id);
            socket.emit('create_group_chat', {
                name: chatName,
                members: [...memberIds, currentUserId] 
            });
        } else if (!chatName) {
            return;
        }
    }
    closeModalAndReset('newChatModal');
}

// socket.on('group_chat_created', (groupData) => { 
// });

socket.on('group_chat_creation_success', (newGroup) => {
    console.log("Group chat creation successful on client:", newGroup);
    if (newGroup && newGroup.id) {
        switchChat(newGroup.id, true);
    }
});

function closeModalAndReset(modalId) { // Renamed
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        
        const chatNameInput = document.getElementById('chatName');
        if (chatNameInput) chatNameInput.value = '';
        
        document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
            cb.closest('.student-item')?.classList.remove('selected');
        });
        
        const studentSearchInput = document.getElementById('studentSearch');
        if (studentSearchInput) {
            studentSearchInput.value = '';
            filterStudentsInModal(''); 
        }
        updateStudentSelectionInModal(); 
        
        document.querySelectorAll('.chat-type-option').forEach(opt => opt.classList.remove('selected'));
        const individualOption = document.querySelector('.chat-type-option[data-type="individual"]');
        if (individualOption) individualOption.classList.add('selected');
        toggleChatNameField(false);
    }
}

socket.on('group_chat_details_response', (data) => {
    console.log('[CHAT_SCRIPT] Received group_chat_details_response:', data);
    if (data.error) {
        currentGroupDetails = null; 
    } else {
        currentGroupDetails = data; 
    }
    updateGroupActionButtonsVisibility(); 
    const chatInfoModal = document.getElementById('chatInfoModal');
    if (chatInfoModal.dataset.waitingForDetails === 'true' && currentGroupDetails && !data.error) {
        fillChatInfoModal(currentGroupDetails);
        chatInfoModal.style.display = 'flex';
        delete chatInfoModal.dataset.waitingForDetails;
    }
});

socket.on('group_chat_update_response', (data) => {
    console.log('[CHAT_SCRIPT] Received group_chat_update_response:', data);
    if (data.error) {
    } else if (data.success) {
        if (data.groupDetails && currentGroupChat === data.groupDetails.id) {
            currentGroupDetails = data.groupDetails;
            updateGroupActionButtonsVisibility(); 
            const chatTitle = document.getElementById('chatTitle');
            if (chatTitle) chatTitle.textContent = data.newName;
            const chatItemName = document.querySelector(`.chat-item[data-chat="${data.groupDetails.id}"][data-is-group="true"] .chat-name`);
            if (chatItemName) chatItemName.textContent = data.newName;
        }
        const chatInfoModal = document.getElementById('chatInfoModal');
        if (chatInfoModal.style.display === 'flex' && currentGroupDetails) {
            fillChatInfoModal(currentGroupDetails); 
        }
    }
});

socket.on('group_members_update_response', (data) => {
    console.log('[CHAT_SCRIPT] Received group_members_update_response:', data);
    if (data.error) {
    } else if (data.success) {
        if (data.groupDetails && currentGroupChat === data.groupDetails.id) {
            currentGroupDetails = data.groupDetails;
            updateGroupActionButtonsVisibility();
        }
        const chatInfoModal = document.getElementById('chatInfoModal');
        if (chatInfoModal.style.display === 'flex' && currentGroupDetails) {
            fillChatInfoModal(currentGroupDetails);
        }
        const addMembersModal = document.getElementById('addMembersModal');
        if (addMembersModal.style.display === 'flex') {
            closeModalAndReset('addMembersModal');
        }
    }
});

socket.on('group_chat_updated', (updatedGroupDetails) => {
    console.log('[CHAT_SCRIPT] Received group_chat_updated:', updatedGroupDetails);
    if (updatedGroupDetails && currentGroupChat === updatedGroupDetails.id) {
        currentGroupDetails = updatedGroupDetails;
        updateGroupActionButtonsVisibility();
        const chatTitle = document.getElementById('chatTitle');
        if (chatTitle) chatTitle.textContent = updatedGroupDetails.name;
        const chatInfoModal = document.getElementById('chatInfoModal');
        if (chatInfoModal.style.display === 'flex') {
            fillChatInfoModal(updatedGroupDetails);
        }
    }
    const chatItemName = document.querySelector(`.chat-item[data-chat="${updatedGroupDetails.id}"][data-is-group="true"] .chat-name`);
    if (chatItemName) chatItemName.textContent = updatedGroupDetails.name;
});

socket.on('group_chat_removed_or_left', ({ groupId }) => {
    console.log(`[CHAT_SCRIPT] Current user removed from group ${groupId} or left.`);
    if (currentGroupChat === groupId) {
        currentGroupChat = null;
        currentGroupDetails = null;
        updateGroupActionButtonsVisibility(); 
        document.getElementById('chatTitle').textContent = 'Select a chat';
        document.getElementById('messagesArea').innerHTML = '<p style="text-align:center; color:#aaa; margin-top:20px;">You are no longer a member of this group.</p>';
        document.getElementById('groupInfoBtn').style.display = 'none';
        document.getElementById('addMembersToGroupBtn').style.display = 'none';
        const url = new URL(window.location);
        url.searchParams.delete('group_chat');
        window.history.pushState({}, '', url);
    }
    socket.emit('get_active_chats');
});

function fillChatInfoModal(groupDetails) {
    if (!groupDetails) {
        console.error("fillChatInfoModal: groupDetails is null or undefined");
        closeModalAndReset('chatInfoModal');
        return;
    }
    const chatInfoModal = document.getElementById('chatInfoModal');
    const editChatNameInput = document.getElementById('editChatName');
    const chatMemberCountSpan = document.getElementById('chatMemberCount');
    const chatMembersListDiv = document.getElementById('chatMembersList');
    const saveChatInfoBtn = document.getElementById('saveChatInfoBtn');

    editChatNameInput.value = groupDetails.name;
    chatMemberCountSpan.textContent = groupDetails.members.length;
    chatMembersListDiv.innerHTML = ''; 

    const isCurrentUserCreator = groupDetails.creator_id === currentUserId;
    editChatNameInput.disabled = !isCurrentUserCreator;

    groupDetails.members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'student-item'; 
        memberItem.dataset.userId = member.id;

        let memberRole = '';
        if (member.id === groupDetails.creator_id) {
            memberRole = '(Creator)';
        }

        memberItem.innerHTML = `
            <div class="student-avatar">${(member.username || 'U')[0].toUpperCase()}</div>
            <div class="student-info">
                <div class="student-name">${member.username} ${memberRole}</div>
            </div>
            ${ (isCurrentUserCreator && member.id !== currentUserId) || (member.id === currentUserId && member.id !== groupDetails.creator_id) ? 
            `<button class="button-remove-member" data-user-id="${member.id}" title="${member.id === currentUserId ? 'Leave group' : 'Remove member'}">
                <i class="fas fa-${member.id === currentUserId ? 'door-open' : 'times'}"></i>
            </button>` : '' }
        `;
        chatMembersListDiv.appendChild(memberItem);

        if ((isCurrentUserCreator && member.id !== currentUserId) || (member.id === currentUserId && member.id !== groupDetails.creator_id)) {
            memberItem.querySelector('.button-remove-member').addEventListener('click', function() {
                const userIdToRemove = this.dataset.userId;
                const userIsLeaving = parseInt(userIdToRemove) === currentUserId;
                const confirmationMessage = userIsLeaving 
                    ? "Are you sure you want to leave this group?" 
                    : `Are you sure you want to remove ${member.username} from the group?`;

                if (confirm(confirmationMessage)) {
                    socket.emit('remove_member_from_group', { 
                        groupId: currentGroupChat, 
                        memberIdToRemove: parseInt(userIdToRemove) 
                    });
                }
            });
        }
    });
    chatInfoModal.style.display = 'flex';
}

async function openAddMembersModal() {
    if (!currentGroupChat || !currentGroupDetails) {
        return;
    }
    if (currentGroupDetails.creator_id !== currentUserId) {
        return;
    }

    const addMembersModal = document.getElementById('addMembersModal');
    const groupNameSpan = document.getElementById('addMembersGroupName');
    const membersListDiv = document.getElementById('addMembersList');
    const confirmBtn = document.getElementById('confirmAddMembersBtn');
    const searchInput = document.getElementById('addMemberSearch');

    groupNameSpan.textContent = currentGroupDetails.name;
    membersListDiv.innerHTML = '<p>Loading users...</p>';
    confirmBtn.disabled = true;
    searchInput.value = '';

    try {
        const response = await fetch('/PI/api/get_users.php?exclude_self=false'); 
        const result = await response.json();
        if (result.success) {
            membersListDiv.innerHTML = '';
            const existingMemberIds = currentGroupDetails.members.map(m => m.id);
            const usersToAdd = result.users.filter(user => !existingMemberIds.includes(user.id) && user.id !== currentUserId);

            if (usersToAdd.length === 0) {
                membersListDiv.innerHTML = '<p>No new users available to add.</p>';
                return;
            }

            usersToAdd.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'student-item'; 
                userItem.innerHTML = `
                    <input type="checkbox" id="add_user_${user.id}" data-user-id="${user.id}">
                    <div class="student-avatar">${(user.username || 'U')[0].toUpperCase()}</div>
                    <div class="student-info">
                        <div class="student-name">${user.username}</div>
                        <div class="student-group">${user.role || 'User'}</div>
                    </div>
                `;
                membersListDiv.appendChild(userItem);
                userItem.querySelector('input[type="checkbox"]').addEventListener('change', () => {
                    const selectedCount = membersListDiv.querySelectorAll('input[type="checkbox"]:checked').length;
                    confirmBtn.disabled = selectedCount === 0;
                    document.getElementById('addMemberSelectedCount').textContent = `Selected: ${selectedCount} user(s)`;
                    document.getElementById('addMemberSelectedCount').style.display = selectedCount > 0 ? 'block' : 'none';
                });
                userItem.addEventListener('click', function(e) {
                    if (e.target.type !== 'checkbox') {
                        const checkbox = this.querySelector('input[type="checkbox"]');
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change')); 
                    }
                });
            });
            document.getElementById('addMemberSelectedCount').style.display = 'none';
        } else {
            membersListDiv.innerHTML = '<p>Failed to load users.</p>';
        }
    } catch (error) {
        console.error("Error fetching users for addMembersModal:", error);
        membersListDiv.innerHTML = '<p>Error loading users.</p>';
    }
    addMembersModal.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Chat script DOMContentLoaded, initializing chat...");
    await initializeChat(); 

    const bellInHeader = document.querySelector('header .notification .bell');
    if (bellInHeader) {
        bellInHeader.addEventListener('click', function (e) {
            if (!localStorage.getItem('isLoggedIn')) {
                e.preventDefault();
                alert('Please log in to view messages.');
                return;
            }
            if (window.location.pathname.endsWith('messages.html')) {
                e.preventDefault(); 
                const bmodal = document.querySelector('#notification .bmodal');
                if (bmodal) {
                }
            }
        });
    }
});