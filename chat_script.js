// Підключення до сервера Socket.IO
const socket = io('http://localhost:3000');

// Глобальні змінні
let currentUserId = null;
let currentUsername = null;
let currentChat = null; // ID поточного активного індивідуального чату (користувача)
let currentGroupChat = null; // ID поточного активного групового чату
let chats = {}; // Може бути використано для зберігання даних про чати
let userStatuses = {};
let onlineUsers = new Set(); // Можливо не використовується, але залишено

// Функція для оновлення UI хедера для авторизованого користувача
function updateHeaderUIForLoggedInUser(username) {
    const loginButton = document.getElementById('loginButton');
    const account = document.getElementById('account');
    const notificationElement = document.getElementById('notification');
    const usernameDisplay = document.getElementById('usernameDisplay');

    if (loginButton) loginButton.style.display = 'none';
    if (account) account.style.display = 'flex';
    if (notificationElement) notificationElement.style.display = 'block';
    if (usernameDisplay) usernameDisplay.textContent = username;
}

// Функція для оновлення UI хедера для неавторизованого користувача
function updateHeaderUIForLoggedOutUser() {
    const loginButton = document.getElementById('loginButton');
    const account = document.getElementById('account');
    const notificationElement = document.getElementById('notification');

    if (loginButton) loginButton.style.display = 'flex';
    if (account) account.style.display = 'none';
    if (notificationElement) notificationElement.style.display = 'none';
}

// Допоміжна функція для оновлення стану червоної крапки
function updateNotificationDotState() {
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

// Функція для показу сповіщення
function showNotification(messageData) {
    const { sender, message, groupChatId, groupName } = messageData; // Додано groupName
    const notificationContainer = document.getElementById('notification');
    if (!notificationContainer) return;

    const notificationDot = notificationContainer.querySelector('.notification-dot');
    const bmodal = notificationContainer.querySelector('.bmodal');
    const bell = notificationContainer.querySelector('.bell');

    const onMessagesPage = window.location.pathname.endsWith('messages.html');
    let isChatActiveWithMessageSource = false;
    if (onMessagesPage) {
        if (groupChatId) {
            isChatActiveWithMessageSource = currentGroupChat === groupChatId;
        } else {
            isChatActiveWithMessageSource = currentChat === sender.id && !currentGroupChat;
        }
    }

    if (isChatActiveWithMessageSource) {
        console.log("Notification suppressed: user in active chat with sender/group.");
        return;
    }

    const MAX_NOTIFICATIONS = 3;
    const senderIdForNotification = groupChatId ? `group_${groupChatId}` : sender.id.toString();
    const displayName = groupChatId ? (groupName || `Group ${groupChatId}`) : sender.username;

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
                <p>${groupChatId ? sender.username + ': ' : ''}${message}</p>
            </div>
        </div>
    `;

    newMessageDiv.addEventListener('click', () => {
        newMessageDiv.remove();
        updateNotificationDotState();
        const targetUrl = groupChatId 
            ? `messages.html?group_chat=${groupChatId}` 
            : `messages.html?chat=${sender.id}`;
        window.location.href = targetUrl;
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
    
    if (bell) {
        bell.classList.add('ringing');
        setTimeout(() => {
            bell.classList.remove('ringing');
        }, 600);
    }
}

// Функція для очищення сповіщення для конкретного чату/групи
function clearNotificationForChat(sourceId, isGroup = false) {
    const bmodal = document.querySelector('#notification .bmodal');
    if (bmodal) {
        const dataSourceId = isGroup ? `group_${sourceId}` : sourceId.toString();
        const notificationElement = bmodal.querySelector(`.message[data-source-id="${dataSourceId}"]`);
        if (notificationElement) {
            notificationElement.remove();
        }
        updateNotificationDotState();
    }
}

// Функція для авторизації користувача
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

                updateHeaderUIForLoggedInUser(currentUsername);
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('username', currentUsername);
                
                socket.emit('auth', {
                    username: currentUsername,
                    id: currentUserId
                });
                
                await loadUsersAndGroups(); // Завантажуємо і користувачів, і групи
                setupEventListeners();
                setupModalEventListeners();

                const urlParams = new URLSearchParams(window.location.search);
                const chatIdFromUrl = urlParams.get('chat');
                const groupChatIdFromUrl = urlParams.get('group_chat');

                if (chatIdFromUrl) {
                    switchChat(parseInt(chatIdFromUrl), false);
                } else if (groupChatIdFromUrl) {
                    switchChat(parseInt(groupChatIdFromUrl), true);
                } else {
                    updateNotificationDotState();
                }

            } else {
                updateHeaderUIForLoggedOutUser();
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('username');
                throw new Error('Failed to get user ID');
            }
        } else {
            updateHeaderUIForLoggedOutUser();
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('username');
            window.location.href = '/PI/index.html';
        }
    } catch (error) {
        console.error('Error initializing chat:', error);
        updateHeaderUIForLoggedOutUser();
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('username');
        if (!localStorage.getItem('isLoggedIn')) { // Перенаправляємо тільки якщо точно не авторизовані
             window.location.href = '/PI/index.html';
        }
    }
}

socket.on('user_statuses', ({ statuses }) => {
    userStatuses = statuses;
    updateUserStatuses();
});

function updateUserStatuses() {
    document.querySelectorAll('.chat-item[data-chat]').forEach(item => { // Тільки для індивідуальних чатів
        const userId = parseInt(item.dataset.chat);
        if (!userId || item.dataset.isGroup === 'true') return;
        
        const statusElement = item.querySelector('.chat-status');
        if (statusElement) {
            const status = userStatuses[userId] || 'offline';
            statusElement.className = `chat-status status-${status}`;
            statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        }
    });
}

async function loadUsersAndGroups() {
    await loadUsers();
    await loadGroupChats(); // Функція для завантаження групових чатів
}


async function loadUsers() { // Завантаження індивідуальних чатів (користувачів)
    try {
        const response = await fetch('/PI/api/get_users.php');
        const result = await response.json();
        const chatItemsContainer = document.getElementById('chatItems');
        
        if (result.success) {
            result.users.forEach(user => {
                if (user.id !== currentUserId) {
                    const existingItem = chatItemsContainer.querySelector(`.chat-item[data-chat="${user.id}"][data-is-group="false"]`);
                    if(existingItem) existingItem.remove(); // Видаляємо старий елемент, якщо є

                    const chatItem = document.createElement('div');
                    chatItem.className = 'chat-item';
                    chatItem.dataset.chat = user.id;
                    chatItem.dataset.isGroup = "false"; // Позначаємо, що це не група
                    
                    chatItem.innerHTML = `
                        <div class="chat-avatar">${user.username[0].toUpperCase()}</div>
                        <div class="chat-info">
                            <div class="chat-name">${user.username}</div>
                            <p class="chat-preview">Click to start chatting</p>
                            <div class="chat-status status-${user.status || 'offline'}">
                                ${(user.status || 'offline').charAt(0).toUpperCase() + (user.status || 'offline').slice(1)}
                            </div>
                        </div>
                    `;
                    chatItem.addEventListener('click', () => switchChat(user.id, false));
                    chatItemsContainer.appendChild(chatItem);
                }
            });
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function loadGroupChats() {
    try {
        const response = await fetch('/PI/api/get_group_chats.php'); // Потрібно створити цей ендпоінт
        const result = await response.json();
        const chatItemsContainer = document.getElementById('chatItems');

        if (result.success) {
            result.groupChats.forEach(group => {
                const existingItem = chatItemsContainer.querySelector(`.chat-item[data-chat="${group.id}"][data-is-group="true"]`);
                if(existingItem) existingItem.remove();

                const chatItem = document.createElement('div');
                chatItem.className = 'chat-item group-chat-item'; // Можна додати клас для стилізації
                chatItem.dataset.chat = group.id; // Використовуємо ID групи
                chatItem.dataset.isGroup = "true"; // Позначаємо, що це група

                chatItem.innerHTML = `
                    <div class="chat-avatar"><i class="fas fa-users"></i></div> <!-- Іконка для групи -->
                    <div class="chat-info">
                        <div class="chat-name">${group.name}</div>
                        <p class="chat-preview">Group chat</p>
                        <!-- Статус для групи може бути не потрібен, або інша логіка -->
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


function sendMessage(recipients, message) { // recipients тут буде ID чату або ID групи
    if (!currentUsername || (!currentChat && !currentGroupChat)) {
        console.error('User not authenticated or no chat selected');
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
        messageData.recipients = [currentChat]; // Для індивідуального чату
    } else {
        return; // Немає вибраного чату
    }
    
    socket.emit('send_message', messageData);
}

socket.on('new_message', (messageData) => {
    const isActiveChat = (messageData.groupChatId && messageData.groupChatId === currentGroupChat) ||
                         (!messageData.groupChatId && messageData.sender.id === currentChat) ||
                         (messageData.sender.id === currentUserId); // Чи є це наше власне повідомлення

    if (isActiveChat) {
        displayMessage(messageData);
    }
    updateChatPreview(messageData);
    
    if (messageData.sender.id !== currentUserId) { // Показуємо сповіщення тільки якщо це не наше повідомлення
        showNotification(messageData);
    }
});

socket.on('message_history', (data) => {
    const { messages } = data;
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.innerHTML = '';
    
    messages.forEach(msg => {
        displayMessage({
            sender: {
                username: msg.sender_name, // sender_name має бути в даних з сервера
                id: msg.sender_id
            },
            message: msg.message,
            timestamp: msg.timestamp,
            groupChatId: msg.group_chat_id // Додаємо для коректного відображення
        });
    });
    messagesArea.scrollTop = messagesArea.scrollHeight;
});

function displayMessage(messageData) {
    const { sender, message, timestamp, groupChatId } = messageData;
    const messagesArea = document.getElementById('messagesArea');
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    const isOwnMessage = sender.id === currentUserId;
    if (isOwnMessage) {
        messageElement.classList.add('own');
    }
    
    // Для групових чатів, якщо це не наше повідомлення, показуємо ім'я відправника
    const senderDisplayName = groupChatId && !isOwnMessage ? sender.username : (isOwnMessage ? 'You' : sender.username);

    messageElement.innerHTML = `
        <div class="message-avatar">${sender.username[0].toUpperCase()}</div>
        <div class="message-content">
            ${groupChatId && !isOwnMessage ? `<div class="message-sender-name">${sender.username}</div>` : ''}
            <div class="message-bubble">${message}</div>
            <div class="message-info">
                <span>${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                ${isOwnMessage ? `<span>•</span><span>You</span>` : ''}
            </div>
        </div>
    `;
    messagesArea.appendChild(messageElement);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function updateChatPreview(messageData) {
    const { sender, message, groupChatId } = messageData;
    let chatItem;

    if (groupChatId) {
        chatItem = document.querySelector(`.chat-item[data-chat="${groupChatId}"][data-is-group="true"]`);
    } else {
        // Якщо це повідомлення від нас, то оновлюємо прев'ю для чату з одержувачем
        // Якщо це повідомлення до нас, то оновлюємо прев'ю для чату з відправником
        const targetUserId = messageData.sender.id === currentUserId ? messageData.recipients[0] : sender.id;
        chatItem = document.querySelector(`.chat-item[data-chat="${targetUserId}"][data-is-group="false"]`);
    }
    
    if (chatItem) {
        const preview = chatItem.querySelector('.chat-preview');
        if (preview) {
            const previewText = groupChatId && sender.id !== currentUserId ? `${sender.username}: ${message}` : message;
            preview.textContent = previewText.length > 30 ? previewText.substring(0, 27) + "..." : previewText;
        }
    }
}


function switchChat(chatOrGroupId, isGroup) {
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.innerHTML = ''; // Очищаємо перед завантаженням історії

    document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
    const activeItem = document.querySelector(`.chat-item[data-chat="${chatOrGroupId}"][data-is-group="${isGroup}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        document.getElementById('chatTitle').textContent = activeItem.querySelector('.chat-name').textContent;
    }


    if (isGroup) {
        currentGroupChat = chatOrGroupId;
        currentChat = null;
        socket.emit('get_chat_history', { groupChatId: chatOrGroupId });
    } else {
        currentChat = chatOrGroupId;
        currentGroupChat = null;
        socket.emit('get_chat_history', { 
            userId1: currentUserId,
            userId2: chatOrGroupId
        });
    }
    clearNotificationForChat(chatOrGroupId, isGroup);
}

function setupEventListeners() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    if (messageInput && sendBtn) {
        const sendMessageHandler = () => {
            const message = messageInput.value.trim();
            if (message && (currentChat || currentGroupChat)) { // Перевірка, що хоча б один чат вибраний
                sendMessage([], message); // recipients тепер не використовуються напряму тут
                messageInput.value = '';
            }
        };
        sendBtn.addEventListener('click', sendMessageHandler);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { // Додано перевірку на Shift+Enter для нового рядка
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
                const response = await fetch('/PI/api/get_users.php'); // Завантажуємо тільки користувачів для вибору
                const result = await response.json();
                
                if (result.success) {
                    const studentList = document.getElementById('studentList');
                    studentList.innerHTML = '';
                    
                    result.users.forEach(user => {
                        if (user.id !== currentUserId) {
                            const studentItem = document.createElement('div');
                            studentItem.className = 'student-item';
                            studentItem.dataset.id = user.id;
                            studentItem.innerHTML = `
                                <input type="checkbox" id="student${user.id}" data-username="${user.username}">
                                <div class="student-info">
                                    <div class="student-name">${user.username}</div>
                                    <div class="student-group">${user.role || 'User'}</div>
                                </div>
                                <div class="student-avatar">${user.username[0].toUpperCase()}</div>`;
                            studentList.appendChild(studentItem);
                        }
                    });
                    
                    document.querySelectorAll('.chat-type-option').forEach(opt => opt.classList.remove('selected'));
                    document.querySelector('.chat-type-option[data-type="individual"]').classList.add('selected');
                    toggleChatNameField(false); // Індивідуальний чат не потребує назви
                    
                    const chatNameInput = document.getElementById('chatName');
                    if (chatNameInput) chatNameInput.value = '';
                    
                    document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => cb.checked = false);
                    updateStudentSelection(); // Це викличе updateCreateButtonState
                    document.getElementById('newChatModal').style.display = 'flex';
                }
            } catch (error) {
                console.error('Error loading users for new chat:', error);
            }
        });
    }

    if (closeNewChatModal) closeNewChatModal.addEventListener('click', () => closeModal('newChatModal'));
    if (cancelNewChatBtn) cancelNewChatBtn.addEventListener('click', () => closeModal('newChatModal'));
    if (createChatBtn) createChatBtn.addEventListener('click', createNewChat);

    document.querySelectorAll('.chat-type-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.chat-type-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            const isGroup = this.dataset.type === 'group';
            toggleChatNameField(isGroup);
            document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => cb.checked = false);
            updateStudentSelection();
        });
    });

    const studentSearch = document.getElementById('studentSearch');
    if (studentSearch) studentSearch.addEventListener('input', function() { filterStudents(this.value); });

    document.addEventListener('change', function(e) {
        if (e.target.type === 'checkbox' && e.target.closest('#studentList')) {
            const selectedType = document.querySelector('.chat-type-option.selected');
            if (selectedType?.dataset.type === 'individual') {
                document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => {
                    if (cb !== e.target) cb.checked = false;
                });
            }
            updateStudentSelection();
        }
    });
}

function toggleChatNameField(show) {
    const chatNameGroup = document.getElementById('chatNameGroup');
    if (chatNameGroup) {
        chatNameGroup.style.display = show ? 'block' : 'none';
        if (!show) {
            const chatNameInput = document.getElementById('chatName');
            if (chatNameInput) chatNameInput.value = '';
        }
    }
}

function updateCreateButtonState() {
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
    } else { // group
        canCreate = selectedStudentsCount >= 1 && chatName.length > 0; // Для групи потрібен хоча б 1 учасник (крім поточного) + назва
    }
    createBtn.disabled = !canCreate;
}

function filterStudents(searchTerm) {
    const studentItems = document.querySelectorAll('#studentList .student-item');
    studentItems.forEach(item => {
        const studentName = item.querySelector('.student-name').textContent.toLowerCase();
        const studentGroup = item.querySelector('.student-group').textContent.toLowerCase();
        const matches = studentName.includes(searchTerm.toLowerCase()) || studentGroup.includes(searchTerm.toLowerCase());
        item.style.display = matches ? 'flex' : 'none';
    });
}

function updateStudentSelection() {
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
    updateCreateButtonState();
}

function createNewChat() {
    const selectedType = document.querySelector('.chat-type-option.selected');
    if (!selectedType) return;

    const selectedUsersData = Array.from(document.querySelectorAll('#studentList input[type="checkbox"]:checked'))
        .map(cb => ({
            id: parseInt(cb.closest('.student-item').dataset.id),
            username: cb.dataset.username 
        }));
    
    if (selectedUsersData.length === 0) return;

    if (selectedType.dataset.type === 'individual') {
        if (selectedUsersData.length === 1) {
            const userToChatWith = selectedUsersData[0];
            // Перевірка, чи чат вже існує
            const existingChatItem = document.querySelector(`.chat-item[data-chat="${userToChatWith.id}"][data-is-group="false"]`);
            if (!existingChatItem) {
                // Створюємо новий елемент чату в списку, якщо його немає
                const chatItemsContainer = document.getElementById('chatItems');
                const chatItem = document.createElement('div');
                chatItem.className = 'chat-item';
                chatItem.dataset.chat = userToChatWith.id;
                chatItem.dataset.isGroup = "false";
                chatItem.innerHTML = `
                    <div class="chat-avatar">${userToChatWith.username[0].toUpperCase()}</div>
                    <div class="chat-info">
                        <div class="chat-name">${userToChatWith.username}</div>
                        <p class="chat-preview">Click to start chatting</p>
                        <div class="chat-status status-offline">Offline</div> <!-- Статус оновиться пізніше -->
                    </div>
                `;
                chatItem.addEventListener('click', () => switchChat(userToChatWith.id, false));
                chatItemsContainer.appendChild(chatItem);
                updateUserStatuses(); // Оновити статус новоствореного чату
            }
            switchChat(userToChatWith.id, false);
        }
    } else { // group
        const chatName = document.getElementById('chatName').value.trim();
        if (chatName && selectedUsersData.length > 0) {
            const memberIds = selectedUsersData.map(user => user.id);
            socket.emit('create_group_chat', {
                name: chatName,
                members: [...memberIds, currentUserId]
            });
        }
    }
    closeModal('newChatModal');
}

// Обробка події створення групового чату
socket.on('group_chat_created', (groupData) => {
    const chatItemsContainer = document.getElementById('chatItems');
    const existingItem = chatItemsContainer.querySelector(`.chat-item[data-chat="${groupData.id}"][data-is-group="true"]`);
    if(existingItem) return; // Якщо чат вже є, не додавати

    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item group-chat-item';
    chatItem.dataset.chat = groupData.id;
    chatItem.dataset.isGroup = "true";
    chatItem.innerHTML = `
        <div class="chat-avatar"><i class="fas fa-users"></i></div>
        <div class="chat-info">
            <div class="chat-name">${groupData.name}</div>
            <p class="chat-preview">${groupData.message ? groupData.message.message : 'Group chat created'}</p>
        </div>
    `;
    chatItem.addEventListener('click', () => switchChat(groupData.id, true));
    chatItemsContainer.appendChild(chatItem);

    // Автоматично переключитися на новостворений груповий чат
    switchChat(groupData.id, true);
    if(groupData.message) displayMessage(groupData.message); // Відобразити системне повідомлення
});


function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        const chatNameInput = document.getElementById('chatName');
        if (chatNameInput) chatNameInput.value = '';
        document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => cb.checked = false);
        const studentSearchInput = document.getElementById('studentSearch');
        if (studentSearchInput) {
            studentSearchInput.value = '';
            filterStudents('');
        }
        updateStudentSelection();
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Chat script DOMContentLoaded");
    await initializeChat(); // initializeChat тепер обробляє параметри URL

    const bell = document.querySelector('#notification .bell');
    if (bell) {
        bell.addEventListener('click', function (e) {
            if (!localStorage.getItem('isLoggedIn')) {
                e.preventDefault();
                alert('Please log in to view messages.');
                return;
            }
            // На сторінці messages.html клік на дзвіночок просто відкриває/закриває bmodal,
            // або нічого не робить, якщо bmodal показується при наведенні.
            // Перехід на messages.html тут не потрібен.
            // const bmodal = document.querySelector('#notification .bmodal');
            // if (bmodal) bmodal.style.display = bmodal.style.display === 'block' ? 'none' : 'block';
        });
    }
});