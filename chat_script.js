// --- START OF FILE chat_script.js ---

// Нове оголошення сокету для chat_script.js
let socket; // Оголошуємо тут, щоб було доступно скрізь у файлі
if (typeof io !== 'undefined') {
    socket = io('http://localhost:3000');
    window.chatSocket = socket; // Зберігаємо сокет чату в глобальний об'єкт window
    console.log('Socket.IO підключено (chat_script.js) і збережено в window.chatSocket');
} else {
    console.error('FATAL: io is not defined. Socket.IO library not loaded. (chat_script.js)');
    // Можливо, тут варто запобігти подальшому виконанню скрипта, якщо сокет критичний
}

// Глобальні змінні
let currentUserId = null;
let currentUsername = null;
let currentChat = null; 
let currentGroupChat = null; 
let userStatuses = {}; // Local cache of user statuses
let activeChatList = []; // Local cache for the list of active chats
let currentGroupDetails = null; // Зберігає деталі поточної відкритої групи

// Функція для оновлення видимості кнопок керування групою
function updateGroupActionButtonsVisibility() {
    const addMembersBtn = document.getElementById('addMembersToGroupBtn');
    const groupInfoBtn = document.getElementById('groupInfoBtn');

    if (currentGroupChat && currentGroupDetails) {
        if (groupInfoBtn) groupInfoBtn.style.display = 'inline-block';
        // Кнопка додавання учасників та інші функції редагування доступні тільки творцю
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
    console.log('[CHAT_SCRIPT] showChatNotification called with:', JSON.stringify(messageData, null, 2)); // Логування вхідних даних
    // Переконуємося, що messageData та messageData.sender існують
    if (!messageData || !messageData.sender) {
        console.error('showChatNotification: messageData or messageData.sender is undefined', messageData);
        return;
    }

    const { sender, message, recipient_id } = messageData;
    const actualGroupChatIdFromServer = messageData.group_chat_id; // Це поле від сервера
    const actualGroupNameFromServer = messageData.group_name;     // Це поле від сервера

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
        } else if (currentChat) { // Тільки для 1-на-1, якщо currentChat існує
            isChatActiveWithMessageSource = (currentChat.toString() === sender.id.toString() && sender.id !== currentUserId) ||
                                          (currentChat.toString() === recipient_id?.toString() && sender.id === currentUserId);
        }
    }

    if (isChatActiveWithMessageSource && sender.id !== currentUserId) { // Якщо чат активний І повідомлення від іншого
        // console.log("Chat Notification suppressed: user in active chat with sender/group (chat_script.js).");
        // Очистимо сповіщення, якщо воно було для цього чату, оскільки користувач вже бачить повідомлення
        clearChatNotificationForSource(actualGroupChatIdFromServer ? actualGroupChatIdFromServer : sender.id, !!actualGroupChatIdFromServer);
        return; 
    } 
    
    // Не показувати сповіщення для власних повідомлень
    if (sender.id === currentUserId) {
        // console.log("Chat Notification suppressed: message is from current user (chat_script.js).");
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
                
                socket.emit('get_active_chats'); // Запитуємо список активних чатів
                
                setupEventListeners();
                setupModalEventListeners();
                updateChatNotificationDotState(); // Initial check for notifications

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
            
            statusElement.className = 'chat-status'; // Reset classes
            statusElement.classList.add(`status-${currentStatusString}`); // Add current class e.g. status-online
            statusElement.textContent = currentStatusString.charAt(0).toUpperCase() + currentStatusString.slice(1);
        }
    });
}

function renderChatList(chats) {
    const chatItemsContainer = document.getElementById('chatItems');
    chatItemsContainer.innerHTML = ''; // Очищаємо поточний список
    activeChatList = chats; // Зберігаємо отриманий список локально

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
        // Статус для індивідуальних чатів буде оновлено updateUserStatusesUI

        chatItem.addEventListener('click', () => switchChat(chat.id, chat.isGroup));
        chatItemsContainer.appendChild(chatItem);
    });
    updateUserStatusesUI(); // Оновлюємо статуси після рендерингу списку чатів
}

socket.on('active_chats_list', (chats) => {
    console.log('Received active_chats_list:', chats);
    renderChatList(chats);
});

function sendMessageToChat(recipientsIgnored, message) { // Renamed
    if (!currentUsername || (!currentChat && !currentGroupChat)) {
        console.error('User not authenticated or no chat selected for sending message.');
        return;
    }
    // Логуємо значення безпосередньо перед використанням
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
    
    // Відображаємо повідомлення локально одразу після надсилання
    displayMessageInChat(messageData);
    updateChatPreviewInList(messageData);
    
    socket.emit('send_message', messageData);
}

socket.on('new_message', (messageData) => {
    console.log('[CHAT_SCRIPT] Raw new_message received from server:', JSON.stringify(messageData, null, 2)); // Детальне логування
    console.log('[CHAT_SCRIPT] Received new_message (parsed object):', messageData);
    console.log('[CHAT_SCRIPT] Current state: currentUserId:', currentUserId, 'currentChat:', currentChat, 'currentGroupChat:', currentGroupChat);

    // Перевіряємо, чи є дані про відправника
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
            // Якщо повідомлення для активного чату, але від іншого користувача,
            // сповіщення "дзвіночка" не потрібне, бо користувач бачить повідомлення.
            // Але, можливо, потрібно очистити старе сповіщення для цього чату, якщо воно було.
            clearChatNotificationForSource(messageData.group_chat_id ? messageData.group_chat_id : messageData.sender.id, !!messageData.group_chat_id);
        }
    } else {
        console.log('[CHAT_SCRIPT] Message is from current user. Not showing bell notification.');
        // Якщо це своє повідомлення (наприклад, з іншої вкладки) і воно для активного чату, displayMessageInChat вже викликано.
        // Якщо для неактивного, то сповіщення не потрібне.
    }
    
    // Оновлюємо прев'ю в списку чатів для всіх нових повідомлень
    updateChatPreviewInList(messageData);
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

function displayMessageInChat(messageData) { 
    const { sender, message, timestamp, groupChatId, group_name } = messageData; // Додано group_name
    const messagesArea = document.getElementById('messagesArea');
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('message'); // This is for messages in messagesArea
    
    const isOwnMessage = sender.id === currentUserId;
    if (isOwnMessage) {
        messageElement.classList.add('own');
    }
    
    const senderDisplayName = groupChatId && !isOwnMessage ? sender.username : (isOwnMessage ? 'You' : sender.username);
    // Використовуємо group_name для назви групи в повідомленні, якщо є
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
    let chatNameForUpdate = messageData.group_name; // Використовуємо group_name, якщо воно є (від сервера або локально)

    const serverGroupId = messageData.group_chat_id; // snake_case - від сервера (подія 'new_message')
    const localGroupId = messageData.groupChatId;    // camelCase - коли локально відправляємо повідомлення (з sendMessageToChat)

    if (serverGroupId) {
        targetId = serverGroupId;
        isGroupChat = true;
    } else if (localGroupId) {
        targetId = localGroupId;
        isGroupChat = true;
    } else {
        // Логіка для 1-на-1 чатів
        // targetId - це ID іншого учасника чату
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

        // Оновлюємо назву групи в списку, якщо вона є в messageData і відрізняється
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

        // Move chat item to top
        const chatItemsContainer = document.getElementById('chatItems');
        if (chatItemsContainer && chatItemsContainer.firstChild !== chatItem) {
            chatItemsContainer.prepend(chatItem);
        }
    } else {
        // Якщо чату немає в списку (наприклад, нове повідомлення від нового користувача),
        // запитуємо оновлений список чатів у сервера.
        // Це більш надійний спосіб, ніж намагатися додати елемент локально.
        // console.log('Chat item not found for preview update, requesting full list refresh.');
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

    // Скидаємо деталі попередньої групи
    currentGroupDetails = null; 

    if (isGroup) {
        currentGroupChat = chatOrGroupIdStr;
        currentChat = null;
        console.log(`[CHAT_SCRIPT] Switched to GROUP chat. currentGroupChat set to: ${currentGroupChat}`);
        socket.emit('get_chat_history', { groupChatId: chatOrGroupIdStr });
        // Запитуємо деталі групи, щоб знати, чи показувати кнопки керування
        socket.emit('get_group_chat_details', { groupId: currentGroupChat });
        
        // Кнопки groupInfoBtn та addMembersToGroupBtn будуть показані/ховані
        // після отримання відповіді group_chat_details_response і перевірки creator_id
        // Тут ми їх поки ховаємо, доки не отримаємо дані
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
                    
                    const usersToDisplay = result.users.filter(user => user.id !== currentUserId); // Заборона чату з самим собою

                    usersToDisplay.forEach(user => {
                        // Не додаємо користувача до списку, якщо з ним вже є активний чат (крім групових)
                        // const existingIndividualChat = activeChatList.find(chat => !chat.isGroup && chat.id === user.id);
                        // if (existingIndividualChat && document.querySelector('.chat-type-option.selected').dataset.type === 'individual') {
                        // return; 
                        // } - Цю логіку краще обробляти при створенні чату, а не при завантаженні списку користувачів

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

    // Обробники для нових кнопок керування групою
    const groupInfoBtn = document.getElementById('groupInfoBtn');
    if (groupInfoBtn) {
        groupInfoBtn.addEventListener('click', () => {
            if (currentGroupChat && currentGroupDetails) {
                // Деталі вже мають бути завантажені в currentGroupDetails через switchChat
                // або оновлені через socket.on('group_chat_details_response')
                fillChatInfoModal(currentGroupDetails);
                document.getElementById('chatInfoModal').style.display = 'flex';
            } else if (currentGroupChat) {
                // Якщо деталей ще немає, запитуємо їх перед відкриттям модального вікна
                socket.emit('get_group_chat_details', { groupId: currentGroupChat });
                // Модальне вікно відкриється після отримання group_chat_details_response
            } else {
                alert('Please select a group chat first.');
            }
        });
    }

    const addMembersToGroupBtn = document.getElementById('addMembersToGroupBtn');
    if (addMembersToGroupBtn) {
        addMembersToGroupBtn.addEventListener('click', () => {
            openAddMembersModal();
        });
    }

    // Обробники для модального вікна інформації про чат (chatInfoModal)
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
                    alert('Only the group creator can change the name.');
                    return;
                }
                if (newName.length > 0 && newName.length <= 100) {
                    socket.emit('update_group_chat_info', { groupId: currentGroupChat, newName: newName });
                } else {
                    document.getElementById('editChatNameError').textContent = 'Name must be 1-100 characters.';
                }
            } else if (newName === currentGroupDetails?.name) {
                // No change, just close
                closeModalAndReset('chatInfoModal');
            } else {
                 document.getElementById('editChatNameError').textContent = 'Please enter a valid name.';
            }
        });
        editChatNameInput.addEventListener('input', () => {
            document.getElementById('editChatNameError').textContent = ''; // Clear error on input
            // Можна додати логіку для активації кнопки збереження тільки якщо є зміни
            // saveChatInfoBtn.disabled = editChatNameInput.value.trim() === currentGroupDetails?.name || !currentGroupDetails || currentGroupDetails.creator_id !== currentUserId;
        });
    }
    
    // Обробники для модального вікна додавання учасників (addMembersModal)
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
                alert('Please select users to add.');
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
            // Перевіряємо, чи вже існує такий індивідуальний чат у списку активних чатів
            const existingChat = activeChatList.find(chat => chat.id === userToChatWith.id && !chat.isGroup);
            
            if (existingChat) {
                switchChat(userToChatWith.id, false); // Просто переключаємось на існуючий чат
            } else {
                // Якщо чату немає, створюємо "тимчасовий" вигляд
                console.log(`Creating a new local visual for chat with ${userToChatWith.username} (ID: ${userToChatWith.id})`);

                // 1. Update chat window content
                const messagesArea = document.getElementById('messagesArea');
                messagesArea.innerHTML = `<p style="text-align:center; color:#aaa; margin-top:20px;">Starting new chat with ${userToChatWith.username}. Type a message to begin.</p>`;
                
                const chatTitle = document.getElementById('chatTitle');
                chatTitle.textContent = userToChatWith.username;

                // Hide group-specific buttons
                const addMembersBtn = document.getElementById('addMembersToGroupBtn');
                const groupInfoBtn = document.getElementById('groupInfoBtn');
                if (addMembersBtn) addMembersBtn.style.display = 'none';
                if (groupInfoBtn) groupInfoBtn.style.display = 'none';

                // 2. Update global state
                currentChat = userToChatWith.id;
                currentGroupChat = null;

                // 3. Update URL
                const url = new URL(window.location);
                url.searchParams.delete('chat');
                url.searchParams.delete('group_chat');
                url.searchParams.set('chat', currentChat);
                window.history.pushState({}, '', url);

                // 4. Manage chat list visuals
                document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));

                const chatItemsContainer = document.getElementById('chatItems');
                // Remove old temp chat item if it exists for the same user to avoid duplicates before prepend
                const existingTempItem = chatItemsContainer.querySelector(`.chat-item[data-chat="${userToChatWith.id}"][data-is-group="false"]`);
                if (existingTempItem) {
                    existingTempItem.remove();
                }

                const tempChatItem = document.createElement('div');
                tempChatItem.className = 'chat-item active'; // Make it active
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
                
                updateUserStatusesUI(); // Attempt to update its status if info is available
                clearChatNotificationForSource(userToChatWith.id, false);
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

socket.on('group_chat_created', (groupData) => { // Цей обробник може бути застарілим, якщо сервер надсилає group_chat_creation_success
    // console.log('Received group_chat_created, but this might be deprecated. GroupData:', groupData);
    // Список чатів тепер оновлюється через 'active_chats_list' або 'group_chat_creation_success'
    // socket.emit('get_active_chats'); // Запитуємо оновлений список
    // if(groupData && groupData.id) {
    // switchChat(groupData.id, true);
    // if(groupData.message) displayMessageInChat(groupData.message);
    // }
});

socket.on('group_chat_creation_success', (newGroup) => {
    console.log("Group chat creation successful on client:", newGroup);
    // Сервер вже надішле оновлений список чатів через notifyUsersToUpdateChatList,
    // але ми можемо одразу переключитися на новостворену групу.
    if (newGroup && newGroup.id) {
        // Можливо, варто дочекатися оновлення списку з active_chats_list, щоб уникнути мерехтіння
        // Або, якщо сервер гарантує, що newGroup містить всю потрібну інфу для відображення:
        switchChat(newGroup.id, true);
        // Можна додати новий елемент до activeChatList локально, а потім він оновить його з сервера.
        // Це може покращити UX, але потребує обережності, щоб не було розсинхронізації.
    }
    // Запит на оновлення списку чатів вже був ініційований сервером, тому тут не потрібен.
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

socket.on('group_chat_details_response', (data) => {
    console.log('[CHAT_SCRIPT] Received group_chat_details_response:', data);
    if (data.error) {
        alert(`Error fetching group details: ${data.error}`);
        currentGroupDetails = null; // Скидаємо, якщо помилка
    } else {
        currentGroupDetails = data; // Зберігаємо деталі групи
    }
    updateGroupActionButtonsVisibility(); // Оновлюємо видимість кнопок
    // Якщо модальне вікно chatInfoModal очікувало ці дані для відкриття
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
        alert(`Error updating group: ${data.error}`);
    } else if (data.success) {
        alert(`Group updated successfully! New name: ${data.newName}`);
        if (data.groupDetails && currentGroupChat === data.groupDetails.id) {
            currentGroupDetails = data.groupDetails;
            updateGroupActionButtonsVisibility(); // Оновлюємо кнопки, якщо змінився творець (малоймовірно, але для консистентності)
            const chatTitle = document.getElementById('chatTitle');
            if (chatTitle) chatTitle.textContent = data.newName;
            const chatItemName = document.querySelector(`.chat-item[data-chat="${data.groupDetails.id}"][data-is-group="true"] .chat-name`);
            if (chatItemName) chatItemName.textContent = data.newName;
        }
        const chatInfoModal = document.getElementById('chatInfoModal');
        if (chatInfoModal.style.display === 'flex' && currentGroupDetails) {
            fillChatInfoModal(currentGroupDetails); // Оновлюємо дані в модалці, якщо вона відкрита
        }
    }
});

socket.on('group_members_update_response', (data) => {
    console.log('[CHAT_SCRIPT] Received group_members_update_response:', data);
    if (data.error) {
        alert(`Error updating group members: ${data.error}`);
    } else if (data.success) {
        alert(data.message || 'Group members updated successfully!');
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
        // Якщо поточний активний чат - це група, з якої користувача видалили / він вийшов
        currentGroupChat = null;
        currentGroupDetails = null;
        updateGroupActionButtonsVisibility(); // Сховає кнопки
        document.getElementById('chatTitle').textContent = 'Select a chat';
        document.getElementById('messagesArea').innerHTML = '<p style="text-align:center; color:#aaa; margin-top:20px;">You are no longer a member of this group.</p>';
        document.getElementById('groupInfoBtn').style.display = 'none';
        document.getElementById('addMembersToGroupBtn').style.display = 'none';
        // Оновити URL, якщо потрібно
        const url = new URL(window.location);
        url.searchParams.delete('group_chat');
        window.history.pushState({}, '', url);
    }
    // Запит на оновлення списку активних чатів, щоб група зникла
    socket.emit('get_active_chats');
    alert('You have been removed from a group or have left a group.');
});

// Функція для заповнення модального вікна інформації про групу
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
    chatMembersListDiv.innerHTML = ''; // Очищаємо попередній список

    const isCurrentUserCreator = groupDetails.creator_id === currentUserId;
    editChatNameInput.disabled = !isCurrentUserCreator;
    // saveChatInfoBtn.disabled = !isCurrentUserCreator; // Кнопка збереження активна, якщо є зміни

    groupDetails.members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'student-item'; // Використовуємо той самий стиль
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

// Функція для відкриття та заповнення модального вікна додавання учасників
async function openAddMembersModal() {
    if (!currentGroupChat || !currentGroupDetails) {
        alert('Please select a group chat first.');
        return;
    }
    if (currentGroupDetails.creator_id !== currentUserId) {
        alert('Only the group creator can add new members.');
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
        const response = await fetch('/PI/api/get_users.php?exclude_self=false'); // отримуємо всіх, крім себе, якщо треба
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
                userItem.className = 'student-item'; // той самий стиль
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
                 // Дозволити клік по всьому елементу для вибору
                userItem.addEventListener('click', function(e) {
                    if (e.target.type !== 'checkbox') {
                        const checkbox = this.querySelector('input[type="checkbox"]');
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change')); // тригер для оновлення кнопки
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