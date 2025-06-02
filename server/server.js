const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*", // Дозволити всі джерела (для розробки)
        methods: ["GET", "POST"]
    }
});
const cors = require('cors');
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
const Message = require('./models/Message');

app.use(cors()); // Дозволити CORS для всіх HTTP запитів
app.use(express.json());

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '', // Ваш пароль, якщо є
    database: 'stumanager'
};

const pool = mysql.createPool(dbConfig);

// MongoDB підключення
mongoose.connect('mongodb://127.0.0.1:27017/stumanager_chat')
    .then(() => {
        console.log('MongoDB підключено успішно');
        // Створюємо індекси для оптимізації пошуку
        return Message.createIndexes();
    })
    .then(() => {
        console.log('MongoDB індекси створено');
    })
    .catch((err) => {
        console.error('Помилка підключення до MongoDB:', err);
    });

const activeUsers = new Map(); // socket.id -> { username, userId }
const userSockets = new Map(); // userId -> Set of socket.ids (один користувач може мати кілька вкладок)

async function updateUserStatus(userId, status, page = null) {
    try {
        const [users] = await pool.query('SELECT status FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return;

        await pool.query(
            'UPDATE users SET status = ?, last_activity = NOW() WHERE id = ?',
            [status, userId]
        );

        // Оновлюємо статус в таблиці students
        await pool.query(
            'UPDATE students SET active = ? WHERE user_id = ?',
            [status === 'online' ? 1 : 0, userId]
        );

        console.log(`Статус користувача ${userId} оновлено на ${status}${page ? ` (сторінка: ${page})` : ''}`);
        await broadcastUserStatuses();
    } catch (error) {
        console.error('Помилка оновлення статусу користувача:', error);
    }
}

async function checkInactiveUsers() {
    try {
        // Знаходимо користувачів, які були неактивні протягом 5 хвилин
        const [inactiveUsers] = await pool.query(
            'SELECT id FROM users WHERE status = "online" AND last_activity < NOW() - INTERVAL 5 MINUTE'
        );
        
        for (const user of inactiveUsers) {
            // Check if user has any active sockets before setting to offline
            const userSocketSet = userSockets.get(user.id);
            if (!userSocketSet || userSocketSet.size === 0) {
                await updateUserStatus(user.id, 'offline');
            }
        }
    } catch (error) {
        console.error('Помилка перевірки неактивних користувачів:', error);
    }
}

// Перевіряємо неактивних користувачів кожні 5 хвилин
setInterval(checkInactiveUsers, 5 * 60 * 1000);

async function getUserStatuses() {
    try {
        const [rows] = await pool.query(`
            SELECT u.id, u.status, u.last_activity, u.username 
            FROM users u
            LEFT JOIN students s ON u.id = s.user_id
        `);
        return rows.reduce((acc, user) => {
            acc[user.id] = {
                status: user.status,
                lastActivity: user.last_activity,
                username: user.username
            };
            return acc;
        }, {});
    } catch (error) {
        console.error('Помилка отримання статусів користувачів:', error);
        return {};
    }
}

async function broadcastUserStatuses() {
    const statuses = await getUserStatuses();
    io.emit('user_statuses', { statuses });
}

// Нова функція для отримання активних чатів
async function getActiveChats(userId) {
    let activeChats = [];

    // 1. Отримати 1-на-1 чати з повідомленнями
    const oneOnOneMessages = await Message.find({
        $or: [{ sender_id: userId }, { recipient_id: userId }],
        group_chat_id: null
    }).sort({ timestamp: -1 }).lean();

    const oneOnOneChatPartners = {}; // partnerId -> { lastMessage object }
    for (const msg of oneOnOneMessages) {
        const partnerId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id;
        if (partnerId === null || partnerId === userId) continue; 
        if (!oneOnOneChatPartners[partnerId] || new Date(msg.timestamp) > new Date(oneOnOneChatPartners[partnerId].timestamp)) {
            oneOnOneChatPartners[partnerId] = {
                text: msg.message,
                timestamp: msg.timestamp,
                sender_id: msg.sender_id
            };
        }
    }

    const partnerIds = Object.keys(oneOnOneChatPartners).map(id => parseInt(id)).filter(id => !isNaN(id));
    if (partnerIds.length > 0) {
        const [users] = await pool.query('SELECT id, username FROM users WHERE id IN (?)', [partnerIds]);
        const userMap = users.reduce((acc, user) => {
            acc[user.id] = user.username;
            return acc;
        }, {});

        for (const partnerIdStr of Object.keys(oneOnOneChatPartners)) {
            const partnerId = parseInt(partnerIdStr);
            if (userMap[partnerId]) {
                activeChats.push({
                    id: partnerId,
                    name: userMap[partnerId],
                    isGroup: false,
                    lastMessage: {
                        text: oneOnOneChatPartners[partnerId].text,
                        timestamp: oneOnOneChatPartners[partnerId].timestamp,
                        senderIsSelf: oneOnOneChatPartners[partnerId].sender_id === userId
                    },
                    avatarLetter: userMap[partnerId]?.[0]?.toUpperCase() || '?'
                });
            }
        }
    }

    // 2. Отримати групові чати, до яких належить користувач
    const [groupMemberships] = await pool.query(
        'SELECT gc.id, gc.name, gc.created_at FROM group_chats gc JOIN group_chat_members gcm ON gc.id = gcm.group_chat_id WHERE gcm.user_id = ?',
        [userId]
    );

    for (const group of groupMemberships) {
        const lastGroupMessage = await Message.findOne({ group_chat_id: group.id })
            .sort({ timestamp: -1 })
            .lean();

        if (lastGroupMessage) {
            let senderName = 'System';
            if (lastGroupMessage.sender_id) {
                const [senderUser] = await pool.query('SELECT username FROM users WHERE id = ?', [lastGroupMessage.sender_id]);
                if (senderUser.length > 0) {
                    senderName = senderUser[0].username;
                }
            }
            activeChats.push({
                id: group.id,
                name: group.name,
                isGroup: true,
                lastMessage: {
                    text: lastGroupMessage.message,
                    timestamp: lastGroupMessage.timestamp,
                    senderName: lastGroupMessage.sender_id === userId ? 'You' : senderName,
                    senderIsSelf: lastGroupMessage.sender_id === userId
                },
                avatarLetter: group.name?.[0]?.toUpperCase() || 'G'
            });
        } else {
            // Показати групу, навіть якщо немає повідомлень
            activeChats.push({
                id: group.id,
                name: group.name,
                isGroup: true,
                lastMessage: {
                    text: 'New group. No messages yet.',
                    timestamp: group.created_at || new Date(0), 
                    senderName: 'System',
                    senderIsSelf: false
                },
                avatarLetter: group.name?.[0]?.toUpperCase() || 'G'
            });
        }
    }

    // 3. Сортувати всі чати за часом останнього повідомлення
    activeChats.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
    return activeChats;
}

async function createGroupChat(name, memberIds) {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query(
            'INSERT INTO group_chats (name, created_at) VALUES (?, NOW())',
            [name]
        );
        const chatId = result.insertId;

        const memberInsertPromises = memberIds.map(memberId =>
            connection.query(
                'INSERT INTO group_chat_members (group_chat_id, user_id) VALUES (?, ?)',
                [chatId, memberId]
            )
        );
        await Promise.all(memberInsertPromises);

        await connection.commit();
        return { id: chatId, name: name, members: memberIds };
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error creating group chat:', error);
        return null;
    } finally {
        if (connection) connection.release();
    }
}

async function saveMessage(senderId, recipientId, message, groupChatId = null) {
    try {
        // Зберігаємо в MongoDB
        const mongoMessage = new Message({
            sender_id: senderId,
            recipient_id: recipientId, // Буде null для групових повідомлень
            message: message,
            group_chat_id: groupChatId, // Буде null для 1-на-1
            timestamp: new Date()
        });
        const savedMongoMessage = await mongoMessage.save();
        // console.log('Повідомлення збережено в MongoDB:', savedMongoMessage);
        
        // Зберігаємо в MySQL (можливо для аналітики або інших цілей)
        // Поле mongo_message_id може бути додано до таблиці messages в MySQL для зв'язку
        await pool.query(
            'INSERT INTO messages (sender_id, recipient_id, group_chat_id, message, timestamp) VALUES (?, ?, ?, ?, ?)',
            [senderId, recipientId, groupChatId, message, savedMongoMessage.timestamp]
        );
        // console.log('Повідомлення також збережено в MySQL');
        
        // Отримуємо імена для відповіді
        let senderName = 'Unknown User';
        const [senderUserRows] = await pool.query('SELECT username FROM users WHERE id = ?', [senderId]);
        if (senderUserRows.length > 0) {
            senderName = senderUserRows[0].username;
        }

        let groupName = null;
        if (groupChatId) {
            const [groupRows] = await pool.query('SELECT name FROM group_chats WHERE id = ?', [groupChatId]);
            if (groupRows.length > 0) {
                groupName = groupRows[0].name;
            }
        }
        
        return {
            _id: savedMongoMessage._id.toString(), // Використовуємо ID з MongoDB
            id: savedMongoMessage._id.toString(), // Для зручності клієнта
            sender_id: savedMongoMessage.sender_id,
            recipient_id: savedMongoMessage.recipient_id,
            group_chat_id: savedMongoMessage.group_chat_id,
            message: savedMongoMessage.message,
            timestamp: savedMongoMessage.timestamp,
            sender_name: senderName,
            group_name: groupName
        };
    } catch (error) {
        console.error('Error saving message:', error);
        return null;
    }
}

async function getMessageHistory(userId1, userId2, groupChatId = null) {
    try {
        let mongoQuery;
        if (groupChatId) {
            mongoQuery = { group_chat_id: parseInt(groupChatId) };
        } else {
            // Для 1-на-1 чатів, переконуємось що group_chat_id відсутній
            mongoQuery = {
                group_chat_id: null,
                $or: [
                    { sender_id: parseInt(userId1), recipient_id: parseInt(userId2) },
                    { sender_id: parseInt(userId2), recipient_id: parseInt(userId1) }
                ]
            };
        }

        const messages = await Message.find(mongoQuery)
            .sort({ timestamp: -1 }) // Останні спочатку
            .limit(50) // Обмеження до 50 повідомлень
            .lean();

        messages.reverse(); // Повертаємо до хронологічного порядку для відображення

        if (messages.length === 0) return [];

        const userIds = [...new Set(messages.map(m => m.sender_id).filter(id => id != null))];
        let userMap = {};

        if (userIds.length > 0) {
            const [users] = await pool.query(
                'SELECT id, username FROM users WHERE id IN (?)',
                [userIds]
            );
            userMap = users.reduce((acc, user) => {
                acc[user.id] = user.username;
                return acc;
            }, {});
        }

        return messages.map(msg => ({
            id: msg._id.toString(), // ID з MongoDB
            sender_id: msg.sender_id,
            recipient_id: msg.recipient_id,
            message: msg.message,
            timestamp: msg.timestamp,
            sender_name: userMap[msg.sender_id] || 'Unknown User',
            group_chat_id: msg.group_chat_id
        }));
    } catch (error) {
        console.error('Error fetching message history:', error);
        return [];
    }
}


io.on('connection', async (socket) => {
    console.log('Користувач підключився:', socket.id);
    // await broadcastUserStatuses(); // Тепер викликається після успішної аутентифікації або активності

    socket.on('auth', async (userData) => {
        const { username, id: userId } = userData;
        console.log(`Користувач авторизувався: ${username} (ID: ${userId}), socket: ${socket.id}`);
        
        activeUsers.set(socket.id, { username, userId, socket }); // Зберігаємо сам сокет
        
        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket.id);
        
        await updateUserStatus(userId, 'online');
        // Клієнт сам запросить список чатів після 'auth'
        // socket.emit('active_chats_list', await getActiveChats(userId));
        await broadcastUserStatuses(); // Оновлюємо статуси для всіх
    });

    socket.on('get_active_chats', async () => {
        const userData = activeUsers.get(socket.id);
        if (userData && userData.userId) {
            try {
                const chats = await getActiveChats(userData.userId);
                socket.emit('active_chats_list', chats);
            } catch (error) {
                console.error(`Error in get_active_chats for user ${userData.userId}:`, error);
                socket.emit('active_chats_list', []); // Повертаємо порожній масив у разі помилки
            }
        }
    });

    // Функція для сповіщення користувачів про необхідність оновити список чатів
    async function notifyUsersToUpdateChatList(targetUserIds) {
        if (!Array.isArray(targetUserIds)) {
            targetUserIds = [targetUserIds];
        }
        for (const targetUserId of targetUserIds) {
            const userSocketSet = userSockets.get(targetUserId);
            if (userSocketSet) {
                try {
                    const activeChatsForUser = await getActiveChats(targetUserId);
                    userSocketSet.forEach(socketId => {
                        io.to(socketId).emit('active_chats_list', activeChatsForUser);
                    });
                } catch (error) {
                    console.error(`Error notifying user ${targetUserId} to update chat list:`, error);
                }
            }
        }
    }

    socket.on('user_activity', async ({ userId, page }) => {
        const userData = activeUsers.get(socket.id);
        if (userData && userData.userId === userId) {
            await updateUserStatus(userId, 'online', page);
        }
    });

    socket.on('logout', async () => {
        const userData = activeUsers.get(socket.id);
        if (userData) {
            // updateUserStatus викликає broadcastUserStatuses
            await updateUserStatus(userData.userId, 'offline');
            activeUsers.delete(socket.id);
            const userSocketSet = userSockets.get(userData.userId);
            if (userSocketSet) {
                userSocketSet.delete(socket.id);
                if (userSocketSet.size === 0) {
                    userSockets.delete(userData.userId);
                }
            }
        }
    });

    socket.on('get_chat_history', async ({ userId1, userId2, groupChatId }) => {
        const userData = activeUsers.get(socket.id);
        if (!userData || !userData.userId) {
            console.warn("Attempt to get chat history by unauthenticated/unknown user");
            socket.emit('message_history', { messages: [] }); // Повертаємо порожній масив
            return;
        }
        const currentUserIdForHistory = userData.userId;
        // console.log(`Getting history for: current=${currentUserIdForHistory}, other=${userId2}, group=${groupChatId}`);
        try {
            const messages = await getMessageHistory(currentUserIdForHistory, userId2, groupChatId);
            socket.emit('message_history', { messages });
        } catch (error) {
            console.error("Error in get_chat_history event handler:", error);
            socket.emit('message_history', { messages: [] });
        }
    });

    socket.on('create_group_chat', async ({ name, members }) => {
        const userData = activeUsers.get(socket.id);
        if (!userData || !userData.userId) {
            console.warn("Attempt to create group chat by unauthenticated user");
            // Можна відправити помилку клієнту
            return;
        }
        const creatorId = userData.userId;
        const creatorUsername = userData.username;

        // Переконуємося, що творець є у списку учасників та видаляємо дублікати
        const uniqueMemberIds = [...new Set([...members.map(id => parseInt(id)), creatorId])];

        const groupChat = await createGroupChat(name, uniqueMemberIds);
        if (groupChat) {
            const systemMessageContent = `Group chat "${name}" created by ${creatorUsername}.`;
            // Зберігаємо системне повідомлення в MongoDB.
            // Відправником може бути ID творця або спеціальний системний ID.
            await saveMessage(creatorId, null, systemMessageContent, groupChat.id);

            // Сповіщаємо всіх учасників про необхідність оновити їх списки чатів
            await notifyUsersToUpdateChatList(uniqueMemberIds);
            
            // Відправляємо творцю інформацію про успішне створення групи, щоб він міг на неї переключитися
            const creatorSocketInfo = activeUsers.get(socket.id);
            if (creatorSocketInfo && creatorSocketInfo.socket) {
                creatorSocketInfo.socket.emit('group_chat_creation_success', {
                    id: groupChat.id,
                    name: groupChat.name,
                    members: uniqueMemberIds,
                    isGroup: true
                });
            }
        } else {
            // Обробка помилки створення групи, якщо потрібно
            const creatorSocketInfo = activeUsers.get(socket.id);
            if(creatorSocketInfo && creatorSocketInfo.socket) {
                creatorSocketInfo.socket.emit('group_chat_creation_failed', { name });
            }
        }
    });

    socket.on('send_message', async (messageData) => {
        const { message, sender, groupChatId, recipients } = messageData;
        const senderId = parseInt(sender.id); // Переконуємось, що ID є числом

        if (isNaN(senderId)) {
            console.error("Message send attempt without valid sender ID", messageData);
            return;
        }
        
        let savedMessage;
        let targetUserIdsToNotify = new Set();
        targetUserIdsToNotify.add(senderId); // Відправник завжди отримує оновлення

        if (groupChatId) {
            savedMessage = await saveMessage(senderId, null, message, parseInt(groupChatId));
            if (savedMessage) {
                const [groupMembers] = await pool.query('SELECT user_id FROM group_chat_members WHERE group_chat_id = ?', [parseInt(groupChatId)]);
                groupMembers.forEach(member => targetUserIdsToNotify.add(member.user_id));
            }
        } else if (recipients && recipients.length > 0) {
            const recipientId = parseInt(recipients[0]); // Припускаємо одного отримувача для 1-на-1
            if (isNaN(recipientId)) {
                console.error("Invalid recipient ID", messageData);
                return;
            }
            savedMessage = await saveMessage(senderId, recipientId, message);
            if (savedMessage) {
                targetUserIdsToNotify.add(recipientId);
            }
        } else {
            console.error("Invalid message data: no groupChatId or recipients", messageData);
            return;
        }

        if (savedMessage) {
            const messageForRealtimeDelivery = {
                id: savedMessage._id, // Використовуємо ID з MongoDB
                sender: { id: savedMessage.sender_id, username: savedMessage.sender_name },
                recipient_id: savedMessage.recipient_id, // Додаємо ID отримувача для 1-на-1 чатів
                message: savedMessage.message,
                timestamp: savedMessage.timestamp,
                groupChatId: savedMessage.group_chat_id, // Це може бути null
                groupName: savedMessage.group_name // Це може бути null
            };

            // Надсилаємо 'new_message' всім активним сокетам залучених користувачів
            targetUserIdsToNotify.forEach(userId => {
                const userSocketSet = userSockets.get(userId);
                if (userSocketSet) {
                    userSocketSet.forEach(socketId => io.to(socketId).emit('new_message', messageForRealtimeDelivery));
                }
            });
            
            // Сповіщаємо користувачів про необхідність оновити їх списки чатів (це оновить останнє повідомлення)
            await notifyUsersToUpdateChatList(Array.from(targetUserIdsToNotify));
        }
    });

    socket.on('disconnect', async () => {
        console.log('Користувач відключився:', socket.id);
        const userData = activeUsers.get(socket.id);
        if (userData) {
            activeUsers.delete(socket.id);
            const userSocketSet = userSockets.get(userData.userId);
            if (userSocketSet) {
                userSocketSet.delete(socket.id);
                if (userSocketSet.size === 0) {
                    userSockets.delete(userData.userId);
                    // updateUserStatus викликає broadcastUserStatuses
                    await updateUserStatus(userData.userId, 'offline');
                } else {
                    // Якщо залишились інші активні сесії, просто оновлюємо статуси
                    await broadcastUserStatuses();
                }
            }
        } else {
            // Якщо користувача не було в activeUsers (наприклад, не встиг авторизуватися)
            // або якщо це було відключення, яке не обробилося коректно раніше
            await broadcastUserStatuses(); // Загальне оновлення статусів
        }
    });
    // Не потрібно тут broadcastUserStatuses(), бо це відбувається при 'auth' або 'user_activity'
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});