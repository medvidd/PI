// Підключення до сервера Socket.IO
const socket = io('http://localhost:3000');

// Глобальні змінні
let currentUserId = null;
let currentUsername = null;

// Функція для авторизації користувача
async function initializeChat() {
    try {
        // Перевіряємо, чи користувач авторизований
        const response = await fetch('/PI/api/check_session.php', {
            headers: { 'Cache-Control': 'no-cache' }
        });
        const result = await response.json();

        if (result.success) {
            // Отримуємо ID користувача
            const userResponse = await fetch('/PI/api/get_user_id.php', {
                headers: { 'Cache-Control': 'no-cache' }
            });
            const userData = await userResponse.json();

            if (userData.success) {
                currentUsername = result.username;
                currentUserId = userData.userId;
                
                // Авторизуємося в Socket.IO
                socket.emit('auth', {
                    username: currentUsername,
                    id: currentUserId
                });
                
                // Оновлюємо інтерфейс
                updateUIForLoggedInUser();
                
                // Отримуємо список користувачів
                loadUsers();
            } else {
                throw new Error('Failed to get user ID');
            }
        } else {
            window.location.href = '/PI/index.html';
        }
    } catch (error) {
        console.error('Error initializing chat:', error);
        window.location.href = '/PI/index.html';
    }
}

// Функція для завантаження списку користувачів
async function loadUsers() {
    try {
        const response = await fetch('/PI/api/get_users.php');
        const result = await response.json();
        
        if (result.success) {
            const chatItems = document.getElementById('chatItems');
            chatItems.innerHTML = ''; // Очищаємо список чатів
            
            result.users.forEach(user => {
                if (user.id !== currentUserId) { // Не показуємо поточного користувача
                    const chatItem = document.createElement('div');
                    chatItem.className = 'chat-item';
                    chatItem.dataset.chat = user.id;
                    
                    chatItem.innerHTML = `
                        <div class="chat-avatar">${user.username[0].toUpperCase()}</div>
                        <div class="chat-info">
                            <div class="chat-name">${user.username}</div>
                            <p class="chat-preview">Click to start chatting</p>
                            <div class="chat-status status-offline">Offline</div>
                        </div>
                    `;
                    
                    chatItems.appendChild(chatItem);
                }
            });
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Функція для відправки повідомлення
function sendMessage(recipients, message) {
    if (!currentUsername) {
        console.error('User not authenticated');
        return;
    }
    
    socket.emit('send_message', {
        recipients: recipients,
        message: message,
        sender: {
            username: currentUsername,
            id: currentUserId
        }
    });
}

// Обробка вхідних повідомлень
socket.on('new_message', (messageData) => {
    displayMessage(messageData);
    updateChatPreview(messageData);
    if (!isCurrentChat(messageData.sender.id)) {
        showNotification(messageData);
    }
});

// Функція для відображення повідомлення в інтерфейсі
function displayMessage(messageData) {
    const { sender, message, timestamp } = messageData;
    const messagesArea = document.getElementById('messagesArea');
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    // Визначаємо, чи це наше повідомлення
    const isOwnMessage = sender.username === currentUsername;
    messageElement.classList.add(isOwnMessage ? 'own' : '');
    
    messageElement.innerHTML = `
        <div class="message-avatar">${sender.username[0].toUpperCase()}</div>
        <div class="message-content">
            <div class="message-bubble">${message}</div>
            <div class="message-info">
                ${isOwnMessage ? 
                    `<span>${new Date(timestamp).toLocaleTimeString()}</span><span>•</span><span>You</span>` :
                    `<span>${sender.username}</span><span>•</span><span>${new Date(timestamp).toLocaleTimeString()}</span>`
                }
            </div>
        </div>
    `;
    
    messagesArea.appendChild(messageElement);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

// Функція для оновлення превью чату
function updateChatPreview(messageData) {
    const { sender, message } = messageData;
    const chatItem = document.querySelector(`[data-chat="${sender.id}"]`);
    if (chatItem) {
        const preview = chatItem.querySelector('.chat-preview');
        if (preview) {
            preview.textContent = message;
        }
    }
}

// Функція для перевірки, чи відкритий зараз чат з відправником
function isCurrentChat(senderId) {
    const activeChat = document.querySelector('.chat-item.active');
    return activeChat && activeChat.dataset.chat === senderId;
}

// Функція для показу сповіщення
function showNotification(messageData) {
    const { sender, message } = messageData;
    const notification = document.getElementById('notification');
    const notificationDot = notification.querySelector('.notification-dot');
    const bmodal = notification.querySelector('.bmodal');
    
    // Створюємо нове сповіщення
    const newMessage = document.createElement('div');
    newMessage.className = 'message';
    newMessage.innerHTML = `
        <img src="/PI/images/account.png" alt="User picture" class="avatar">
        <div class="message-box">
            <div class="message-content">
                <h2>${sender.username}</h2>
                <p>${message}</p>
            </div>
        </div>
    `;
    
    // Додаємо сповіщення на початок списку
    if (bmodal.firstChild) {
        bmodal.insertBefore(newMessage, bmodal.firstChild);
    } else {
        bmodal.appendChild(newMessage);
    }
    
    // Показуємо індикатор нових повідомлень
    notification.style.display = 'block';
    notificationDot.style.display = 'block';
    
    // Видаляємо старі сповіщення, якщо їх більше 3
    while (bmodal.children.length > 3) {
        bmodal.removeChild(bmodal.lastChild);
    }
}

// Функція для створення нового чату
function createNewChat(participants) {
    // Тут буде логіка створення нового чату
    console.log('Створення нового чату з учасниками:', participants);
}

// Ініціалізація при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    initializeChat();
    
    // Обробник для форми відправки повідомлення
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    if (messageInput && sendBtn) {
        const sendMessageHandler = () => {
            const message = messageInput.value.trim();
            if (message) {
                const activeChat = document.querySelector('.chat-item.active');
                if (activeChat) {
                    const recipientId = activeChat.dataset.chat;
                    sendMessage([recipientId], message);
                    messageInput.value = '';
                }
            }
        };
        
        sendBtn.addEventListener('click', sendMessageHandler);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessageHandler();
            }
        });
    }
    
    // Кнопка створення нового чату
    const newChatButton = document.querySelector('#new-chat-button');
    if (newChatButton) {
        newChatButton.addEventListener('click', () => {
            // Логіка відкриття модального вікна для створення чату
            // ...
        });
    }
}); 