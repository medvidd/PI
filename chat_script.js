// --- START OF FILE chat_script.js ---

// Підключення до сервера Socket.IO
const socket = io('http://localhost:3000');
console.log('Socket.IO підключено (chat_script.js)');

// Глобальні змінні
let currentUserId = null;
let currentUsername = null;
let currentChat = null; 
let currentGroupChat = null; 
let userStatuses = {}; // Local cache of user statuses

// Функція для оновлення UI хедера (скопійовано з script.js для автономності, якщо script.js не завантажено або зміниться)
function updateChatHeaderUIForLoggedInUser(username) {
    const loginButton = document.getElementById('loginButton');
    const account = document.getElementById('account');
    const notificationElement = document.getElementById('notification'); // Note: 'notification' is ID for the bell container
    const usernameDisplay = document.getElementById('usernameDisplay');

    if (loginButton) loginButton.style.display = 'none';
    if (account) account.style.display = 'flex';
    if (notificationElement) notificationElement.style.display = 'block'; // Show bell
    if (usernameDisplay) usernameDisplay.textContent = username;
}

function updateChatHeaderUIForLoggedOutUser() {
    const loginButton = document.getElementById('loginButton');
    const account = document.getElementById('account');
    const notificationElement = document.getElementById('notification');

    if (loginButton) loginButton.style.display = 'flex';
    if (account) account.style.display = 'none';
    if (notificationElement) notificationElement.style.display = 'none'; // Hide bell
}

// Допоміжна функція для оновлення стану червоної крапки (з script.js)
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

// Функція для показу сповіщення (з script.js, адаптована)
function showChatNotification(messageData) {
    const { sender, message, groupChatId, groupName } = messageData;
    const notificationContainer = document.getElementById('notification');
    if (!notificationContainer) return;

    const notificationDot = notificationContainer.querySelector('.notification-dot');
    const bmodal = notificationContainer.querySelector('.bmodal');
    const bellIcon = notificationContainer.querySelector('.bell'); // Renamed to avoid conflict with bell variable

    // Check if this notification is for the currently active chat
    let isChatActiveWithMessageSource = false;
    if (groupChatId) {
        isChatActiveWithMessageSource = currentGroupChat === groupChatId;
    } else {
        isChatActiveWithMessageSource = currentChat === sender.id && !currentGroupChat;
    }

    if (isChatActiveWithMessageSource) {
        // console.log("Chat Notification suppressed: user in active chat with sender/group (chat_script.js).");
        return; // Don't show notification if chat is active
    }

    const MAX_NOTIFICATIONS = 3;
    const senderIdForNotification = groupChatId ? `group_${groupChatId}` : sender.id.toString();
    const displayName = groupChatId ? (groupName || `Group ${groupChatId}`) : sender.username;

    const existingNotification = bmodal.querySelector(`.message[data-source-id="${senderIdForNotification}"]`);
    if (existingNotification) {
        existingNotification.remove();
    }

    const newMessageDiv = document.createElement('div');
    newMessageDiv.className = 'message'; // This is for bmodal notifications
    newMessageDiv.dataset.sourceId = senderIdForNotification;
    newMessageDiv.innerHTML = `
        <img src="/PI/images/account.png" alt="User picture" class="avatar">
        <div class="message-box">
            <div class="message-content">
                <h2>${displayName}</h2>
                <p>${groupChatId ? sender.username + ': ' : ''}${message}</p>
            </div>
        </div>
    `;

    newMessageDiv.addEventListener('click', () => {
        newMessageDiv.remove();
        updateChatNotificationDotState();
        const targetUrl = groupChatId 
            ? `messages.html?group_chat=${groupChatId}` // Stay on page, switch chat
            : `messages.html?chat=${sender.id}`;
        // If already on messages.html, just switch chat, otherwise navigate
        if (window.location.pathname.endsWith('messages.html')) {
            switchChat(groupChatId ? groupChatId : sender.id, !!groupChatId);
        } else {
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

                updateChatHeaderUIForLoggedInUser(currentUsername); // Use chat-specific UI update
                // localStorage items are likely set by script.js, but good to ensure consistency
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('username', currentUsername); 
                
                socket.emit('auth', {
                    username: currentUsername,
                    id: currentUserId
                });
                // Inform server of activity on the chat page
                socket.emit('user_activity', { userId: currentUserId, page: window.location.pathname });
                
                await loadUsersAndGroups(); 
                setupEventListeners();
                setupModalEventListeners();
                updateChatNotificationDotState(); // Initial check for notifications

                const urlParams = new URLSearchParams(window.location.search);
                const chatIdFromUrl = urlParams.get('chat');
                const groupChatIdFromUrl = urlParams.get('group_chat');

                if (chatIdFromUrl) {
                    switchChat(parseInt(chatIdFromUrl), false);
                } else if (groupChatIdFromUrl) {
                    switchChat(parseInt(groupChatIdFromUrl), true);
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
            window.location.href = '/PI/index.html'; // Redirect if not logged in
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
    // console.log('Chat_script received user_statuses:', statuses);
    userStatuses = statuses;
    updateUserStatusesUI(); // Changed function name for clarity
});

function updateUserStatusesUI() {
    // console.log("Updating UI with userStatuses from chat_script.js:", JSON.parse(JSON.stringify(userStatuses)));
    document.querySelectorAll('.chat-item[data-chat]').forEach(item => {
        if (item.dataset.isGroup === 'true') return; 

        const userId = parseInt(item.dataset.chat);
        if (isNaN(userId)) return;

        const statusElement = item.querySelector('.chat-status');
        if (statusElement) {
            const userDataFromServer = userStatuses[userId];
            const currentStatusString = userDataFromServer && userDataFromServer.status ? userDataFromServer.status : 'offline';
            
            // console.log(`Chat User ${userId}: currentStatus = ${currentStatusString}, Element:`, statusElement);
            
            statusElement.classList.remove('status-online', 'status-offline'); // Clear old classes
            statusElement.classList.add(`status-${currentStatusString}`); // Add current class e.g. status-online
            statusElement.textContent = currentStatusString.charAt(0).toUpperCase() + currentStatusString.slice(1);
        }
    });
}

async function loadUsersAndGroups() {
    await loadUsersForChat(); // Renamed to avoid conflict if script.js had a loadUsers
    await loadGroupChatsForChat(); 
}

async function loadUsersForChat() { 
    try {
        const response = await fetch('/PI/api/get_users.php'); // This PHP should return user.status correctly
        const result = await response.json();
        const chatItemsContainer = document.getElementById('chatItems');
        
        if (result.success) {
            // Clear only individual chat items before adding/updating
            chatItemsContainer.querySelectorAll('.chat-item[data-is-group="false"]').forEach(el => el.remove());

            result.users.forEach(user => {
                if (user.id !== currentUserId) {
                    const chatItem = document.createElement('div');
                    chatItem.className = 'chat-item';
                    chatItem.dataset.chat = user.id;
                    chatItem.dataset.isGroup = "false"; 
                    
                    // Initial status from get_users.php; will be updated by socket 'user_statuses' event
                    const initialStatus = user.status || 'offline'; 

                    chatItem.innerHTML = `
                        <div class="chat-avatar">${user.username[0].toUpperCase()}</div>
                        <div class="chat-info">
                            <div class="chat-name">${user.username}</div>
                            <p class="chat-preview">Click to start chatting</p>
                            <div class="chat-status status-${initialStatus}">
                                ${initialStatus.charAt(0).toUpperCase() + initialStatus.slice(1)}
                            </div>
                        </div>
                    `;
                    chatItem.addEventListener('click', () => switchChat(user.id, false));
                    chatItemsContainer.appendChild(chatItem);
                }
            });
            updateUserStatusesUI(); // Apply latest statuses after rendering
        }
    } catch (error) {
        console.error('Error loading users for chat:', error);
    }
}

async function loadGroupChatsForChat() {
    try {
        const response = await fetch('/PI/api/get_group_chats.php');
        const result = await response.json();
        const chatItemsContainer = document.getElementById('chatItems');

        if (result.success) {
             // Clear only group chat items before adding/updating
            chatItemsContainer.querySelectorAll('.chat-item[data-is-group="true"]').forEach(el => el.remove());

            result.groupChats.forEach(group => {
                const chatItem = document.createElement('div');
                chatItem.className = 'chat-item group-chat-item'; 
                chatItem.dataset.chat = group.id; 
                chatItem.dataset.isGroup = "true"; 

                chatItem.innerHTML = `
                    <div class="chat-avatar"><i class="fas fa-users"></i></div>
                    <div class="chat-info">
                        <div class="chat-name">${group.name}</div>
                        <p class="chat-preview">Group chat</p>
                        <!-- No status for group chats in this example -->
                    </div>
                `;
                chatItem.addEventListener('click', () => switchChat(group.id, true));
                chatItemsContainer.appendChild(chatItem);
            });
        }
    } catch (error) {
        console.error('Error loading group chats:', error);
    }
}

function sendMessageToChat(recipientsIgnored, message) { // Renamed
    if (!currentUsername || (!currentChat && !currentGroupChat)) {
        console.error('User not authenticated or no chat selected for sending message.');
        return;
    }
    
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
    
    // Відображаємо повідомлення локально одразу після надсилання
    displayMessageInChat(messageData);
    updateChatPreviewInList(messageData);
    
    socket.emit('send_message', messageData);
}

socket.on('new_message', (messageData) => {
    const isActiveChat = (messageData.groupChatId && messageData.groupChatId === currentGroupChat) ||
                         (!messageData.groupChatId && messageData.sender.id === currentChat) || // Message from the other user in 1-1 chat
                         (!messageData.groupChatId && messageData.recipients && messageData.recipients.includes(currentChat) && messageData.sender.id === currentUserId); // Our own message in 1-1 chat
                        
    if (isActiveChat) {
        displayMessageInChat(messageData); // Renamed
    }
    updateChatPreviewInList(messageData); // Renamed
    
    if (messageData.sender.id !== currentUserId) { 
        showChatNotification(messageData);
    }
});

socket.on('message_history', (data) => {
    const { messages } = data;
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.innerHTML = '';
    
    if (messages) {
        messages.forEach(msg => {
            displayMessageInChat({ // Renamed
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

function displayMessageInChat(messageData) { // Renamed
    const { sender, message, timestamp, groupChatId } = messageData;
    const messagesArea = document.getElementById('messagesArea');
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('message'); // This is for messages in messagesArea
    
    const isOwnMessage = sender.id === currentUserId;
    if (isOwnMessage) {
        messageElement.classList.add('own');
    }
    
    const senderDisplayName = groupChatId && !isOwnMessage ? sender.username : (isOwnMessage ? 'You' : sender.username);

    messageElement.innerHTML = `
        <div class="message-avatar">${(sender.username || 'S')[0].toUpperCase()}</div>
        <div class="message-content">
            ${groupChatId && !isOwnMessage ? `<div class="message-sender-name">${sender.username}</div>` : ''}
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

function updateChatPreviewInList(messageData) { // Renamed
    const { sender, message, groupChatId, recipients } = messageData;
    let chatItem;
    let targetId;

    if (groupChatId) {
        targetId = groupChatId;
        chatItem = document.querySelector(`.chat-item[data-chat="${groupChatId}"][data-is-group="true"]`);
    } else {
        targetId = sender.id === currentUserId ? recipients[0] : sender.id;
        chatItem = document.querySelector(`.chat-item[data-chat="${targetId}"][data-is-group="false"]`);
    }
    
    if (chatItem) {
        const preview = chatItem.querySelector('.chat-preview');
        if (preview) {
            const previewText = groupChatId && sender.id !== currentUserId ? `${sender.username}: ${message}` : message;
            preview.textContent = previewText.length > 30 ? previewText.substring(0, 27) + "..." : previewText;
        }
        // Move chat item to top
        const chatItemsContainer = document.getElementById('chatItems');
        if (chatItemsContainer && chatItemsContainer.firstChild !== chatItem) {
            chatItemsContainer.prepend(chatItem);
        }
    }
}

function switchChat(chatOrGroupId, isGroup) {
    const messagesArea = document.getElementById('messagesArea');
    const chatTitle = document.getElementById('chatTitle');
    const addMembersBtn = document.getElementById('addMembersToGroupBtn');
    const groupInfoBtn = document.getElementById('groupInfoBtn');

    messagesArea.innerHTML = '<p style="text-align:center; color:#aaa; margin-top:20px;">Loading messages...</p>'; 

    document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
    const activeItem = document.querySelector(`.chat-item[data-chat="${chatOrGroupId}"][data-is-group="${isGroup}"]`);
    
    if (activeItem) {
        activeItem.classList.add('active');
        chatTitle.textContent = activeItem.querySelector('.chat-name').textContent;
    } else {
        chatTitle.textContent = "Select a chat";
    }

    if (isGroup) {
        currentGroupChat = chatOrGroupId;
        currentChat = null;
        socket.emit('get_chat_history', { groupChatId: chatOrGroupId });
        if (addMembersBtn) addMembersBtn.style.display = 'inline-block';
        if (groupInfoBtn) groupInfoBtn.style.display = 'inline-block';
    } else {
        currentChat = chatOrGroupId;
        currentGroupChat = null;
        socket.emit('get_chat_history', { 
            userId1: currentUserId,
            userId2: chatOrGroupId
        });
        if (addMembersBtn) addMembersBtn.style.display = 'none';
        if (groupInfoBtn) groupInfoBtn.style.display = 'none';
    }
    clearChatNotificationForSource(chatOrGroupId, isGroup); // Clear bmodal notification for this chat

    // Update URL
    const url = new URL(window.location);
    url.searchParams.delete('chat');
    url.searchParams.delete('group_chat');
    if (isGroup) {
        url.searchParams.set('group_chat', chatOrGroupId);
    } else {
        url.searchParams.set('chat', chatOrGroupId);
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
                sendMessageToChat([], message); // First arg (recipients) is ignored by this func
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
                // Fetch users that current user can chat with (excluding self)
                const response = await fetch('/PI/api/get_users.php?exclude_self=true'); 
                const result = await response.json();
                
                if (result.success) {
                    const studentList = document.getElementById('studentList');
                    studentList.innerHTML = ''; // Clear previous list
                    
                    result.users.forEach(user => {
                        // No need to check user.id !== currentUserId if API handles it
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
                    alert("Could not load users. Please try again.");
                }
            } catch (error) {
                console.error('Error loading users for new chat:', error);
                alert("An error occurred while loading users.");
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
            document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => cb.checked = false); // Reset selection on type change
            updateStudentSelectionInModal();
        });
    });

    const studentSearch = document.getElementById('studentSearch');
    if (studentSearch) studentSearch.addEventListener('input', function() { filterStudentsInModal(this.value); });

    // Event delegation for checkboxes inside studentList
    const studentListModal = document.getElementById('studentList');
    if (studentListModal) {
         studentListModal.addEventListener('change', function(e) {
             if (e.target.matches('input[type="checkbox"]')) {
                 const selectedType = document.querySelector('.chat-type-option.selected');
                 if (selectedType?.dataset.type === 'individual') {
                     // If individual chat, only one checkbox can be selected
                     document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => {
                         if (cb !== e.target) cb.checked = false;
                     });
                 }
                 updateStudentSelectionInModal();
             }
         });
         studentListModal.addEventListener('click', function(e) { // Allow clicking whole item
             const item = e.target.closest('.student-item');
             if (item) {
                 const checkbox = item.querySelector('input[type="checkbox"]');
                 if (checkbox) {
                     checkbox.checked = !checkbox.checked;
                     // Manually trigger change event for the logic above
                     const event = new Event('change', { bubbles: true });
                     checkbox.dispatchEvent(event);
                 }
             }
         });
    }
}

function toggleChatNameField(show) {
    const chatNameGroup = document.getElementById('chatNameGroup');
    if (chatNameGroup) {
        chatNameGroup.style.display = show ? 'block' : 'none';
        const chatNameInput = document.getElementById('chatName');
        if (chatNameInput && !show) { // Clear name if field is hidden
             chatNameInput.value = '';
        }
    }
}

function updateCreateChatButtonState() { // Renamed
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

function filterStudentsInModal(searchTerm) { // Renamed
    const studentItems = document.querySelectorAll('#studentList .student-item');
    const term = searchTerm.toLowerCase();
    studentItems.forEach(item => {
        const studentName = item.querySelector('.student-name').textContent.toLowerCase();
        // const studentGroup = item.querySelector('.student-group').textContent.toLowerCase(); // If group is relevant
        const matches = studentName.includes(term); // || studentGroup.includes(term);
        item.style.display = matches ? 'flex' : 'none';
    });
}

function updateStudentSelectionInModal() { // Renamed
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
    updateCreateChatButtonState(); // Renamed
}

function createNewChatFromModal() { // Renamed
    const selectedType = document.querySelector('.chat-type-option.selected');
    if (!selectedType) return;

    const selectedUsersData = Array.from(document.querySelectorAll('#studentList input[type="checkbox"]:checked'))
        .map(cb => ({
            id: parseInt(cb.closest('.student-item').dataset.id),
            username: cb.dataset.username 
        }));
    
    if (selectedUsersData.length === 0) {
        alert("Please select at least one user.");
        return;
    }

    if (selectedType.dataset.type === 'individual') {
        if (selectedUsersData.length === 1) {
            const userToChatWith = selectedUsersData[0];
            const existingChatItem = document.querySelector(`.chat-item[data-chat="${userToChatWith.id}"][data-is-group="false"]`);
            
            if (!existingChatItem) { // If chat doesn't exist in the list, add it (server handles actual creation implicitly)
                loadUsersForChat().then(() => { // Reload users which might add the new one if not present
                     const newlyAddedItem = document.querySelector(`.chat-item[data-chat="${userToChatWith.id}"][data-is-group="false"]`);
                     if (newlyAddedItem) {
                         switchChat(userToChatWith.id, false);
                     } else { // If still not found (e.g. user not in get_users list), create a temporary item
                          const chatItemsContainer = document.getElementById('chatItems');
                          const tempChatItem = document.createElement('div');
                          tempChatItem.className = 'chat-item';
                          tempChatItem.dataset.chat = userToChatWith.id;
                          tempChatItem.dataset.isGroup = "false";
                          tempChatItem.innerHTML = `
                             <div class="chat-avatar">${userToChatWith.username[0].toUpperCase()}</div>
                             <div class="chat-info">
                                 <div class="chat-name">${userToChatWith.username}</div>
                                 <p class="chat-preview">New chat</p>
                                 <div class="chat-status status-offline">Offline</div>
                             </div>
                          `;
                          tempChatItem.addEventListener('click', () => switchChat(userToChatWith.id, false));
                          chatItemsContainer.prepend(tempChatItem);
                          updateUserStatusesUI(); // Try to get status
                          switchChat(userToChatWith.id, false);
                     }
                });
            } else {
                 switchChat(userToChatWith.id, false);
            }
        }
    } else { // Group chat
        const chatName = document.getElementById('chatName').value.trim();
        if (chatName && selectedUsersData.length > 0) {
            const memberIds = selectedUsersData.map(user => user.id);
            // Current user is added on the server if not already in memberIds
            socket.emit('create_group_chat', {
                name: chatName,
                members: [...memberIds, currentUserId] // Ensure current user is part of the member list sent
            });
        } else if (!chatName) {
            alert("Please enter a name for the group chat.");
            return;
        }
    }
    closeModalAndReset('newChatModal');
}

socket.on('group_chat_created', (groupData) => {
    const chatItemsContainer = document.getElementById('chatItems');
    const existingItem = chatItemsContainer.querySelector(`.chat-item[data-chat="${groupData.id}"][data-is-group="true"]`);
    if(existingItem) { // If chat already exists (e.g. from another client), update it or just switch
        switchChat(groupData.id, true);
        return; 
    }

    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item group-chat-item';
    chatItem.dataset.chat = groupData.id;
    chatItem.dataset.isGroup = "true";
    chatItem.innerHTML = `
        <div class="chat-avatar"><i class="fas fa-users"></i></div>
        <div class="chat-info">
            <div class="chat-name">${groupData.name}</div>
            <p class="chat-preview">${groupData.message && groupData.message.message ? groupData.message.message : 'Group chat created'}</p>
        </div>
    `;
    chatItem.addEventListener('click', () => switchChat(groupData.id, true));
    chatItemsContainer.prepend(chatItem); // Add to top

    switchChat(groupData.id, true); // Switch to the new group chat
    if(groupData.message) displayMessageInChat(groupData.message); 
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
            filterStudentsInModal(''); // Reset filter
        }
        updateStudentSelectionInModal(); // Update count display and button state
        
        // Reset chat type to individual by default
        document.querySelectorAll('.chat-type-option').forEach(opt => opt.classList.remove('selected'));
        const individualOption = document.querySelector('.chat-type-option[data-type="individual"]');
        if (individualOption) individualOption.classList.add('selected');
        toggleChatNameField(false);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Chat script DOMContentLoaded, initializing chat...");
    await initializeChat(); 

    // Bell click handler in chat_script.js for messages.html context
    const bellInHeader = document.querySelector('header .notification .bell');
    if (bellInHeader) {
        bellInHeader.addEventListener('click', function (e) {
            if (!localStorage.getItem('isLoggedIn')) {
                e.preventDefault();
                alert('Please log in to view messages.');
                return;
            }
            // On messages.html, clicking the bell toggles the notification dropdown
            // The global script.js handles navigation from other pages.
            if (window.location.pathname.endsWith('messages.html')) {
                e.preventDefault(); // Prevent navigation if it's an <a> tag
                const bmodal = document.querySelector('#notification .bmodal');
                if (bmodal) {
                    // A simple toggle, or it could be handled by CSS hover/focus
                    // bmodal.style.display = bmodal.style.display === 'block' ? 'none' : 'block';
                    // The existing CSS for .notification:hover .bmodal might handle this
                }
            }
        });
    }
});