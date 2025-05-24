// Глобальні змінні для месенджера
let currentChat = 'admin';
let chats = {
    admin: {
        id: 'admin',
        name: 'Admin',
        type: 'individual',
        avatar: 'A',
        status: 'online',
        members: ['admin', 'user'],
        messages: [
            {
                id: 1,
                sender: 'admin',
                content: 'Welcome to StuManager messaging system! You can now communicate with students and colleagues.',
                timestamp: '12:30 PM',
                avatar: 'A'
            },
            {
                id: 2,
                sender: 'user',
                content: 'Thank you! This looks great.',
                timestamp: '12:31 PM',
                avatar: 'M'
            }
        ]
    },
    john: {
        id: 'john',
        name: 'John Smith',
        type: 'individual',
        avatar: 'J',
        status: 'offline',
        members: ['john', 'user'],
        messages: [
            {
                id: 1,
                sender: 'john',
                content: 'How are you doing?',
                timestamp: '11:45 AM',
                avatar: 'J'
            }
        ]
    },
    ann: {
        id: 'ann',
        name: 'Ann Johnson',
        type: 'individual',
        avatar: 'A',
        status: 'online',
        members: ['ann', 'user'],
        messages: [
            {
                id: 1,
                sender: 'ann',
                content: 'See you tomorrow!',
                timestamp: '2:15 PM',
                avatar: 'A'
            }
        ]
    }
};

let students = [
    { id: 1, name: 'John Smith', group: 'Group A', avatar: 'J' },
    { id: 2, name: 'Ann Johnson', group: 'Group B', avatar: 'A' },
    { id: 3, name: 'Mike Davis', group: 'Group A', avatar: 'M' },
    { id: 4, name: 'Sarah Wilson', group: 'Group C', avatar: 'S' },
    { id: 5, name: 'David Brown', group: 'Group B', avatar: 'D' },
    { id: 6, name: 'Emma Taylor', group: 'Group A', avatar: 'E' },
    { id: 7, name: 'Alex Thompson', group: 'Group C', avatar: 'A' },
    { id: 8, name: 'Lisa White', group: 'Group B', avatar: 'L' },
    { id: 9, name: 'Ryan Miller', group: 'Group A', avatar: 'R' }
];

let messageIdCounter = 100;

// Ініціалізація месенджера
document.addEventListener('DOMContentLoaded', function() {
    initializeMessenger();
    setupEventListeners();
});

function initializeMessenger() {
    renderChatList();
    loadChat(currentChat);
}

function setupEventListeners() {
    // Обробники для чатів
    document.addEventListener('click', function(e) {
        if (e.target.closest('.chat-item')) {
            const chatId = e.target.closest('.chat-item').dataset.chat;
            switchChat(chatId);
        }
    });

    // Відправка повідомлень
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Модальні вікна
    setupModalEventListeners();
}

function setupModalEventListeners() {
    // Створення нового чату
    const newChatBtn = document.getElementById('newChatBtn');
    const newChatModal = document.getElementById('newChatModal');
    const closeNewChatModal = document.getElementById('closeNewChatModal');
    const cancelNewChatBtn = document.getElementById('cancelNewChatBtn');
    const createChatBtn = document.getElementById('createChatBtn');

    newChatBtn.addEventListener('click', () => openNewChatModal());
    closeNewChatModal.addEventListener('click', () => closeModal('newChatModal'));
    cancelNewChatBtn.addEventListener('click', () => closeModal('newChatModal'));
    createChatBtn.addEventListener('click', createNewChat);

    // Тип чату
    document.querySelectorAll('.chat-type-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.chat-type-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            toggleChatNameField(this.dataset.type === 'group');
            updateCreateButtonState();
        });
    });

    // Пошук студентів у новому чаті
    const studentSearch = document.getElementById('studentSearch');
    studentSearch.addEventListener('input', function() {
        filterStudents(this.value, 'studentList');
    });

    // Вибір студентів у новому чаті
    document.addEventListener('change', function(e) {
        if (e.target.type === 'checkbox' && e.target.closest('#studentList')) {
            updateStudentSelection('studentList', 'selectedCount');
            updateCreateButtonState();
        }
    });

    // Додавання учасників
    const addMembersBtn = document.getElementById('addMembersBtn');
    const addMembersModal = document.getElementById('addMembersModal');
    const closeAddMembersModal = document.getElementById('closeAddMembersModal');
    const cancelAddMembersBtn = document.getElementById('cancelAddMembersBtn');

    document.getElementById('addMembersBtn').addEventListener('click', () => openAddMembersModal());
    closeAddMembersModal.addEventListener('click', () => closeModal('addMembersModal'));
    cancelAddMembersBtn.addEventListener('click', () => closeModal('addMembersModal'));

    // Інформація про чат
    const chatInfoBtn = document.getElementById('chatInfoBtn');
    const chatInfoModal = document.getElementById('chatInfoModal');
    const closeChatInfoModal = document.getElementById('closeChatInfoModal');
    const cancelChatInfoBtn = document.getElementById('cancelChatInfoBtn');
    const saveChatInfoBtn = document.getElementById('saveChatInfoBtn');

    chatInfoBtn.addEventListener('click', () => openChatInfoModal());
    closeChatInfoModal.addEventListener('click', () => closeModal('chatInfoModal'));
    cancelChatInfoBtn.addEventListener('click', () => closeModal('chatInfoModal'));
    saveChatInfoBtn.addEventListener('click', saveChatInfo);

    // Закриття модального вікна при кліку поза ним
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('cmodal-overlay')) {
            e.target.style.display = 'none';
        }
    });
}

function renderChatList() {
    const chatItems = document.getElementById('chatItems');
    chatItems.innerHTML = '';

    Object.values(chats).forEach(chat => {
        const lastMessage = chat.messages[chat.messages.length - 1];
        const chatItem = document.createElement('div');
        chatItem.className = `chat-item ${chat.id === currentChat ? 'active' : ''}`;
        chatItem.dataset.chat = chat.id;

        chatItem.innerHTML = `
            <div class="chat-avatar">${chat.avatar}</div>
            <div class="chat-info">
                <div class="chat-name">${chat.name}</div>
                <p class="chat-preview">${lastMessage ? lastMessage.content : 'No messages yet'}</p>
                <div class="chat-status ${chat.status === 'online' ? 'status-online' : 'status-offline'}">
                    ${chat.status === 'online' ? 'Online' : 'Offline'}
                </div>
            </div>
            <div class="notification-badge" style="display: none;">1</div>
        `;

        chatItems.appendChild(chatItem);
    });
}

function switchChat(chatId) {
    if (chats[chatId]) {
        currentChat = chatId;
        document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
        document.querySelector(`[data-chat="${chatId}"]`).classList.add('active');
        loadChat(chatId);
    }
}

function loadChat(chatId) {
    const chat = chats[chatId];
    if (!chat) return;

    // Оновлення заголовка чату
    document.getElementById('chatTitle').textContent = chat.name;

    // Оновлення повідомлень
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.innerHTML = '';

    chat.messages.forEach(message => {
        const messageElement = createMessageElement(message);
        messagesArea.appendChild(messageElement);
    });

    // Скролінг донизу
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.sender === 'user' ? 'own' : ''}`;

    const isOwn = message.sender === 'user';
    messageDiv.innerHTML = `
        <div class="message-avatar">${message.avatar}</div>
        <div class="message-content">
            <div class="message-bubble">${message.content}</div>
            <div class="message-info">
                ${isOwn ? 
                    `<span>${message.timestamp}</span><span>•</span><span>You</span>` :
                    `<span>${message.sender}</span><span>•</span><span>${message.timestamp}</span><span class="status-online">Online</span>`
                }
            </div>
        </div>
    `;

    return messageDiv;
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const content = messageInput.value.trim();

    if (!content) return;

    const message = {
        id: ++messageIdCounter,
        sender: 'user',
        content: content,
        timestamp: getCurrentTime(),
        avatar: 'M'
    };

    chats[currentChat].messages.push(message);
    messageInput.value = '';

    // Оновлення чату
    loadChat(currentChat);
    renderChatList();

    // Симуляція відповіді (для демонстрації)
    setTimeout(() => {
        simulateResponse();
    }, 1000 + Math.random() * 2000);
}

function simulateResponse() {
    const chat = chats[currentChat];
    const responses = [
        'Thanks for your message!',
        'I understand.',
        'That sounds good.',
        'Let me think about it.',
        'Sure, no problem.',
        'Ill get back to you soon.'
    ];

    const response = {
        id: ++messageIdCounter,
        sender: chat.id,
        content: responses[Math.floor(Math.random() * responses.length)],
        timestamp: getCurrentTime(),
        avatar: chat.avatar
    };

    chat.messages.push(response);
    
    if (currentChat === chat.id) {
        loadChat(currentChat);
    }
    renderChatList();
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
}

// Модальні вікна
function openNewChatModal() {
    document.getElementById('newChatModal').style.display = 'flex';
    resetNewChatModal();
}

function resetNewChatModal() {
    // Скидання форми
    document.getElementById('chatName').value = '';
    document.querySelectorAll('#studentList input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.getElementById('studentSearch').value = '';
    
    // Скидання типу чату
    document.querySelectorAll('.chat-type-option').forEach(opt => opt.classList.remove('selected'));
    document.querySelector('[data-type="individual"]').classList.add('selected');
    
    toggleChatNameField(false);
    updateStudentSelection('studentList', 'selectedCount');
    updateCreateButtonState();
}

function toggleChatNameField(show) {
    const chatNameGroup = document.getElementById('chatNameGroup');
    chatNameGroup.style.display = show ? 'block' : 'none';
}

function updateCreateButtonState() {
    const selectedType = document.querySelector('.chat-type-option.selected').dataset.type;
    const selectedStudents = document.querySelectorAll('#studentList input[type="checkbox"]:checked').length;
    const chatName = document.getElementById('chatName').value.trim();
    const createBtn = document.getElementById('createChatBtn');

    let canCreate = false;

    if (selectedType === 'individual') {
        canCreate = selectedStudents === 1;
    } else if (selectedType === 'group') {
        canCreate = selectedStudents >= 1 && chatName.length > 0;
    }

    createBtn.disabled = !canCreate;
}

function createNewChat() {
    const selectedType = document.querySelector('.chat-type-option.selected').dataset.type;
    const selectedStudents = Array.from(document.querySelectorAll('#studentList input[type="checkbox"]:checked'))
        .map(cb => {
            const studentItem = cb.closest('.student-item');
            const studentId = parseInt(studentItem.dataset.id);
            return students.find(s => s.id === studentId);
        });

    if (selectedStudents.length === 0) return;

    let chatName, chatId, chatAvatar;

    if (selectedType === 'individual') {
        const student = selectedStudents[0];
        chatName = student.name;
        chatId = student.name.toLowerCase().replace(' ', '');
        chatAvatar = student.avatar;
    } else {
        chatName = document.getElementById('chatName').value.trim();
        chatId = 'group_' + Date.now();
        chatAvatar = chatName.charAt(0).toUpperCase();
    }

    // Перевірка чи не існує вже такий чат
    if (chats[chatId]) {
        alert('Chat with this name already exists!');
        return;
    }

    // Створення нового чату
    chats[chatId] = {
        id: chatId,
        name: chatName,
        type: selectedType,
        avatar: chatAvatar,
        status: 'online',
        members: ['user', ...selectedStudents.map(s => s.name.toLowerCase().replace(' ', ''))],
        messages: [{
            id: ++messageIdCounter,
            sender: 'system',
            content: `${selectedType === 'group' ? 'Group chat' : 'Chat'} created successfully!`,
            timestamp: getCurrentTime(),
            avatar: 'S'
        }]
    };

    // Оновлення інтерфейсу
    renderChatList();
    switchChat(chatId);
    closeModal('newChatModal');
}

function filterStudents(searchTerm, listId) {
    const studentItems = document.querySelectorAll(`#${listId} .student-item`);
    
    studentItems.forEach(item => {
        const studentName = item.querySelector('.student-name').textContent.toLowerCase();
        const studentGroup = item.querySelector('.student-group').textContent.toLowerCase();
        const matches = studentName.includes(searchTerm.toLowerCase()) || 
                       studentGroup.includes(searchTerm.toLowerCase());
        
        item.style.display = matches ? 'flex' : 'none';
    });
}

function updateStudentSelection(listId, countId) {
    const selectedCount = document.querySelectorAll(`#${listId} input[type="checkbox"]:checked`).length;
    const countElement = document.getElementById(countId);
    
    if (selectedCount > 0) {
        countElement.textContent = `Selected: ${selectedCount} student${selectedCount > 1 ? 's' : ''}`;
        countElement.style.display = 'block';
    } else {
        countElement.style.display = 'none';
    }

    // Оновлення візуального стану елементів
    document.querySelectorAll(`#${listId} .student-item`).forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox.checked) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function openAddMembersModal() {
    document.getElementById('addMembersModal').style.display = 'flex';
}

function openChatInfoModal() {
    const chat = chats[currentChat];
    document.getElementById('editChatName').value = chat.name;
    document.getElementById('chatDescription').value = chat.description || '';
    
    // Відображення учасників
    const membersList = document.getElementById('chatMembersList');
    membersList.innerHTML = '';
    
    chat.members.forEach(memberId => {
        const member = memberId === 'user' ? {name: 'You', group: 'Administrator', avatar: 'M'} :
                      memberId === 'admin' ? {name: 'Admin', group: 'Administrator', avatar: 'A'} :
                      students.find(s => s.name.toLowerCase().replace(' ', '') === memberId) || 
                      {name: memberId, group: 'Unknown', avatar: memberId.charAt(0).toUpperCase()};
        
        const memberElement = document.createElement('div');
        memberElement.className = 'student-item';
        memberElement.innerHTML = `
            <div class="student-info">
                <div class="student-name">${member.name}</div>
                <div class="student-group">${member.group}</div>
            </div>
            <div class="student-avatar">${member.avatar}</div>
        `;
        membersList.appendChild(memberElement);
    });
    
    document.getElementById('chatInfoModal').style.display = 'flex';
}

function saveChatInfo() {
    const chat = chats[currentChat];
    const newName = document.getElementById('editChatName').value.trim();
    const newDescription = document.getElementById('chatDescription').value.trim();
    
    if (newName && newName !== chat.name) {
        chat.name = newName;
        document.getElementById('chatTitle').textContent = newName;
        renderChatList();
    }
    
    chat.description = newDescription;
    closeModal('chatInfoModal');
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Обробники для кликабельних елементів студентів
document.addEventListener('click', function(e) {
    if (e.target.closest('.student-item') && !e.target.matches('input[type="checkbox"]')) {
        const studentItem = e.target.closest('.student-item');
        const checkbox = studentItem.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    }
});

// Симуляція онлайн статусів
setInterval(() => {
    Object.values(chats).forEach(chat => {
        if (chat.id !== 'admin') {
            chat.status = Math.random() > 0.3 ? 'online' : 'offline';
        }
    });
    renderChatList();
}, 30000); // Оновлення кожні 30 секунд