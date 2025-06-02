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
const GroupChat = require('./models/GroupChat');

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
        return Promise.all([
            Message.createIndexes(),
            GroupChat.createIndexes()
        ]);
    })
    .then(() => {
        console.log('MongoDB індекси створено для Message та GroupChat');
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

    // 2. Отримати групові чати, до яких належить користувач (з MongoDB)
    const userGroupChats = await GroupChat.find({ members: userId }).lean();

    for (const group of userGroupChats) {
        const lastGroupMessage = await Message.findOne({ group_chat_id: group._id.toString() }) // Використовуємо _id з MongoDB
            .sort({ timestamp: -1 })
            .lean();

        if (lastGroupMessage) {
            let senderName = 'System';
            if (lastGroupMessage.sender_id) {
                // Імена користувачів все ще беремо з MySQL, як домовлялися
                const [senderUser] = await pool.query('SELECT username FROM users WHERE id = ?', [lastGroupMessage.sender_id]);
                if (senderUser.length > 0) {
                    senderName = senderUser[0].username;
                }
            }
            activeChats.push({
                id: group._id.toString(), // ID групи з MongoDB
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
            activeChats.push({
                id: group._id.toString(), // ID групи з MongoDB
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

async function createGroupChat(name, memberIds, creatorId) {
    try {
        const newGroupChat = new GroupChat({
            name: name,
            creator_id: creatorId,
            members: memberIds,
            created_at: new Date()
        });
        const savedGroupChat = await newGroupChat.save();
        console.log('Груповий чат створено в MongoDB:', savedGroupChat);
        return { 
            id: savedGroupChat._id.toString(), // Повертаємо ID з MongoDB
            name: savedGroupChat.name, 
            members: savedGroupChat.members,
            creator_id: savedGroupChat.creator_id
        };
    } catch (error) {
        console.error('Error creating group chat in MongoDB:', error);
        return null;
    }
}

async function saveMessage(senderId, recipientId, message, groupChatId = null) {
    try {
        // Зберігаємо в MongoDB
        const mongoMessage = new Message({
            sender_id: senderId,
            recipient_id: recipientId,
            message: message,
            group_chat_id: groupChatId ? groupChatId.toString() : null,
            timestamp: new Date()
        });
        const savedMongoMessage = await mongoMessage.save();
        
        let senderName = 'Unknown User';
        const [senderUserRows] = await pool.query('SELECT username FROM users WHERE id = ?', [senderId]);
        if (senderUserRows.length > 0) {
            senderName = senderUserRows[0].username;
        }

        let groupName = null;
        if (groupChatId) {
            // Перевірка, чи groupChatId є валідним ObjectId перед пошуком
            if (mongoose.Types.ObjectId.isValid(groupChatId.toString())) {
                const group = await GroupChat.findById(groupChatId.toString()).lean();
                if (group) {
                    groupName = group.name;
                } else {
                    console.warn(`Group not found in MongoDB with ID: ${groupChatId.toString()} (saveMessage)`);
                    // Якщо група не знайдена за валідним ObjectId, можливо, її видалили
                    // Або це ID, який не є ObjectId і пройшов перевірку isValid (малоймовірно, але можливо для деяких рядків)
                }
            } else {
                console.error(`Invalid ObjectId format for groupChatId: ${groupChatId} in saveMessage. Message not linked to group name.`);
                // Тут groupChatId в повідомленні буде збережено, але groupName не буде отримано.
                // Це запобігає CastError, але проблема з неправильним ID від клієнта залишається.
            }
        }
        
        const fullSavedMessage = {
            _id: savedMongoMessage._id.toString(),
            id: savedMongoMessage._id.toString(), // для сумісності, якщо десь використовується id замість _id
            sender: {
                id: savedMongoMessage.sender_id,
                username: senderName 
            },
            recipient_id: savedMongoMessage.recipient_id,
            group_chat_id: savedMongoMessage.group_chat_id,
            message: savedMongoMessage.message,
            timestamp: savedMongoMessage.timestamp,
            group_name: groupName // Додаємо groupName до об'єкту, що повертається
        };

        if (fullSavedMessage.group_chat_id) {
            console.log('[SERVER] saveMessage is about to return for a GROUP message:', JSON.stringify(fullSavedMessage, null, 2));
        } else {
            console.log('[SERVER] saveMessage is about to return for a PRIVATE message:', JSON.stringify(fullSavedMessage, null, 2));
        }
        
        return fullSavedMessage;
    } catch (error) {
        // Якщо помилка виникла на етапі mongoMessage.save(), наприклад, через невалідний group_chat_id у схемі
        // (якщо б тип був ObjectId а не String), то вона буде зловлена тут.
        console.error('Error saving message to MongoDB (could be during .save() or other operation):', error);
        return null;
    }
}

async function getMessageHistory(userId1, userId2, groupChatId = null) {
    try {
        let mongoQuery;
        if (groupChatId) {
            // Переконуємося, що groupChatId є string
            mongoQuery = { group_chat_id: groupChatId.toString() };
        } else {
            mongoQuery = {
                group_chat_id: null,
                $or: [
                    { sender_id: parseInt(userId1), recipient_id: parseInt(userId2) },
                    { sender_id: parseInt(userId2), recipient_id: parseInt(userId1) }
                ]
            };
        }

        const messages = await Message.find(mongoQuery)
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();

        messages.reverse();

        if (messages.length === 0) return [];

        const userIds = [...new Set(messages.map(m => m.sender_id).filter(id => id != null))];
        let userMap = {};

        if (userIds.length > 0) {
            // Імена користувачів все ще беремо з MySQL
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
            id: msg._id.toString(),
            sender_id: msg.sender_id,
            recipient_id: msg.recipient_id,
            message: msg.message,
            timestamp: msg.timestamp,
            sender_name: userMap[msg.sender_id] || 'Unknown User',
            group_chat_id: msg.group_chat_id
        }));
    } catch (error) {
        console.error('Error fetching message history from MongoDB:', error);
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
            return;
        }
        const creatorId = userData.userId;
        const creatorUsername = userData.username;

        const uniqueMemberIds = [...new Set([...members.map(id => parseInt(id)), creatorId])];

        // Передаємо creatorId у функцію
        const groupChat = await createGroupChat(name, uniqueMemberIds, creatorId); 
        if (groupChat) {
            const systemMessageContent = `Group chat "${name}" created by ${creatorUsername}.`;
            // groupChat.id тепер є _id з MongoDB (string)
            await saveMessage(creatorId, null, systemMessageContent, groupChat.id); 

            await notifyUsersToUpdateChatList(uniqueMemberIds);
            
            const creatorSocketInfo = activeUsers.get(socket.id);
            if (creatorSocketInfo && creatorSocketInfo.socket) {
                creatorSocketInfo.socket.emit('group_chat_creation_success', {
                    id: groupChat.id, // Це вже _id з MongoDB (string)
                    name: groupChat.name,
                    members: uniqueMemberIds, // Це масив ID
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
        const senderId = parseInt(sender.id);

        if (isNaN(senderId)) {
            console.error("Message send attempt without valid sender ID", messageData);
            return;
        }

        let savedMessage;
        if (groupChatId) {
            // Повідомлення для групи
            // groupChatId тут має бути _id з MongoDB (string)
            savedMessage = await saveMessage(senderId, null, message, groupChatId);
        } else if (recipients && recipients.length > 0) {
            // Приватне повідомлення одному або кільком (якщо реалізовано)
            // Для простоти, припустимо, що recipients - це масив з одним ID отримувача
            const recipientId = parseInt(recipients[0]); 
            if (!isNaN(recipientId)) {
                savedMessage = await saveMessage(senderId, recipientId, message, null);
            } else {
                console.error("Invalid recipient ID for private message", messageData);
                return;
            }
        } else {
            console.error("Message send attempt without recipient or groupChatId", messageData);
            return;
        }

        if (savedMessage) {
            // console.log('Повідомлення успішно збережено і готове до відправки:', savedMessage);
            if (savedMessage.group_chat_id) {
                const group = await GroupChat.findById(savedMessage.group_chat_id).lean();
                if (group && group.members) {
                    group.members.forEach(memberId => {
                        const memberSockets = userSockets.get(memberId);
                        if (memberSockets) {
                            memberSockets.forEach(socketId => {
                                // Надсилаємо повідомлення, ЯКЩО це не той самий сокет, з якого надіслано (для відправника)
                                // АБО якщо це інший учасник групи (memberId !== senderId)
                                if (socketId !== socket.id || memberId !== senderId) {
                                    io.to(socketId).emit('new_message', savedMessage);
                                }
                            });
                        }
                    });
                }
            } else if (savedMessage.recipient_id) {
                // Надсилаємо отримувачу
                const recipientSockets = userSockets.get(savedMessage.recipient_id);
                if (recipientSockets) {
                    recipientSockets.forEach(socketId => {
                        io.to(socketId).emit('new_message', savedMessage);
                    });
                }
                // Оновлення для відправника на інших його пристроях/вкладках, але не на поточній
                // Ця логіка для 1-на-1 чатів, аналогічно груповим, має не надсилати на той самий сокет.
                const senderUserSocketSet = userSockets.get(senderId); 
                if (senderUserSocketSet) {
                    senderUserSocketSet.forEach(socketId => {
                        if (socketId !== socket.id) { 
                             io.to(socketId).emit('new_message', savedMessage);
                        }
                    });
                }
            }
        } else {
            console.error('Не вдалося зберегти повідомлення:', messageData);
            // Можна надіслати помилку відправнику
            const senderSocketInfo = activeUsers.get(socket.id);
            if(senderSocketInfo && senderSocketInfo.socket) {
                senderSocketInfo.socket.emit('message_send_error', { 
                    error: 'Failed to save message on server.',
                    originalMessage: messageData 
                });
            }
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