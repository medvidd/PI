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

app.use(cors()); // Дозволити CORS для всіх HTTP запитів
app.use(express.json());

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '', // Ваш пароль, якщо є
    database: 'stumanager'
};

const pool = mysql.createPool(dbConfig);

const activeUsers = new Map(); // socket.id -> { username, userId }
const userSockets = new Map(); // userId -> Set of socket.ids (один користувач може мати кілька вкладок)

async function updateUserStatus(userId, status) {
    try {
        const [users] = await pool.query('SELECT status FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return; // Користувача не знайдено

        // Оновлюємо статус, тільки якщо він змінився
        if (users[0].status !== status) {
            await pool.query(
                'UPDATE users SET status = ?, last_activity = NOW() WHERE id = ?',
                [status, userId]
            );
            console.log(`User ${userId} status updated to ${status}`);
            await broadcastUserStatuses();
        } else if (status === 'online') {
            // Якщо статус вже 'online', просто оновлюємо last_activity
            await pool.query('UPDATE users SET last_activity = NOW() WHERE id = ?', [userId]);
        }
    } catch (error) {
        console.error('Error updating user status:', error);
    }
}

async function checkInactiveUsers() {
    try {
        const [inactiveDbUsers] = await pool.query(
            'SELECT id FROM users WHERE status = "online" AND last_activity < NOW() - INTERVAL 1 MINUTE' // Зменшено інтервал для тестування
        );
        
        for (const user of inactiveDbUsers) {
            // Перевіряємо, чи дійсно немає активних сокетів для цього користувача
            if (!userSockets.has(user.id) || userSockets.get(user.id).size === 0) {
                await updateUserStatus(user.id, 'offline');
            }
        }
    } catch (error) {
        console.error('Error checking inactive users:', error);
    }
}

setInterval(checkInactiveUsers, 60 * 1000); // Перевірка кожну хвилину

async function getUserStatuses() {
    try {
        const [rows] = await pool.query('SELECT id, status FROM users');
        return rows.reduce((acc, user) => {
            acc[user.id] = user.status;
            return acc;
        }, {});
    } catch (error) {
        console.error('Error fetching user statuses:', error);
        return {};
    }
}

async function broadcastUserStatuses() {
    const statuses = await getUserStatuses();
    io.emit('user_statuses', { statuses });
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
        const [result] = await pool.query(
            'INSERT INTO messages (sender_id, recipient_id, group_chat_id, message, timestamp) VALUES (?, ?, ?, ?, NOW())',
            [senderId, recipientId, groupChatId, message]
        );
        
        const [savedMessageRows] = await pool.query(
            `SELECT m.id, m.sender_id, m.recipient_id, m.group_chat_id, m.message, m.timestamp, 
                    u_sender.username as sender_name,
                    gc.name as group_name 
             FROM messages m
             JOIN users u_sender ON m.sender_id = u_sender.id
             LEFT JOIN group_chats gc ON m.group_chat_id = gc.id
             WHERE m.id = ?`,
            [result.insertId]
        );
        
        return savedMessageRows[0];
    } catch (error) {
        console.error('Error saving message:', error);
        return null;
    }
}

async function getMessageHistory(userId1, userId2, groupChatId = null) {
    try {
        let query, params;
        if (groupChatId) {
            query = `
                SELECT m.id, m.sender_id, m.group_chat_id, m.message, m.timestamp, u.username as sender_name
                FROM messages m 
                JOIN users u ON m.sender_id = u.id 
                WHERE m.group_chat_id = ?
                ORDER BY m.timestamp ASC`;
            params = [groupChatId];
        } else {
            query = `
                SELECT m.id, m.sender_id, m.recipient_id, m.message, m.timestamp, u.username as sender_name 
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE (m.sender_id = ? AND m.recipient_id = ?) 
                   OR (m.sender_id = ? AND m.recipient_id = ?)
                ORDER BY m.timestamp ASC`;
            params = [userId1, userId2, userId2, userId1];
        }
        const [rows] = await pool.query(query, params);
        return rows;
    } catch (error) {
        console.error('Error fetching message history:', error);
        return [];
    }
}


io.on('connection', async (socket) => {
    console.log('Користувач підключився:', socket.id);
    await broadcastUserStatuses(); // Надіслати статуси при підключенні нового користувача

    socket.on('auth', async (userData) => {
        const { username, id: userId } = userData; // Перейменовано id на userId для ясності
        console.log(`User authenticated: ${username} (ID: ${userId}), socket: ${socket.id}`);
        activeUsers.set(socket.id, { username, userId });
        
        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket.id);
        
        await updateUserStatus(userId, 'online');
    });

    socket.on('get_chat_history', async ({ userId1, userId2, groupChatId }) => {
        const messages = await getMessageHistory(userId1, userId2, groupChatId);
        socket.emit('message_history', { messages });
    });

    socket.on('create_group_chat', async ({ name, members }) => {
        const groupChat = await createGroupChat(name, members); // members - це масив ID
        if (groupChat) {
            const systemMessageContent = `Груповий чат "${name}" створено.`;
            const savedSystemMessage = await saveMessage(members[0], null, systemMessageContent, groupChat.id); // Від імені першого учасника, або системного ID

            const messageForClients = {
                id: savedSystemMessage.id, // ID системного повідомлення
                sender: { id: savedSystemMessage.sender_id, username: savedSystemMessage.sender_name || 'System' },
                message: savedSystemMessage.message,
                timestamp: savedSystemMessage.timestamp,
                groupChatId: groupChat.id,
                groupName: groupChat.name
            };

            members.forEach(memberId => {
                const memberSocketIds = userSockets.get(parseInt(memberId));
                if (memberSocketIds) {
                    memberSocketIds.forEach(socketId => {
                        io.to(socketId).emit('group_chat_created', {
                            id: groupChat.id,
                            name: groupChat.name,
                            members: groupChat.members,
                            message: messageForClients // Надсилаємо системне повідомлення
                        });
                    });
                }
            });
        }
    });

    socket.on('send_message', async (messageData) => {
        const { message, sender, groupChatId, recipients } = messageData;
        
        let savedMessage;
        if (groupChatId) {
            savedMessage = await saveMessage(sender.id, null, message, groupChatId);
        } else if (recipients && recipients.length > 0) {
            savedMessage = await saveMessage(sender.id, recipients[0], message);
        } else {
            console.error("Invalid message data: no groupChatId or recipients", messageData);
            return;
        }

        if (savedMessage) {
            const messageToSend = {
                id: savedMessage.id,
                sender: { id: savedMessage.sender_id, username: savedMessage.sender_name },
                message: savedMessage.message,
                timestamp: savedMessage.timestamp,
                groupChatId: savedMessage.group_chat_id,
                groupName: savedMessage.group_name // Додаємо назву групи
            };

            if (savedMessage.group_chat_id) {
                // Надсилаємо всім учасникам групи
                const [groupMembers] = await pool.query('SELECT user_id FROM group_chat_members WHERE group_chat_id = ?', [savedMessage.group_chat_id]);
                groupMembers.forEach(member => {
                    const memberSocketIds = userSockets.get(member.user_id);
                    if (memberSocketIds) {
                        memberSocketIds.forEach(socketId => io.to(socketId).emit('new_message', messageToSend));
                    }
                });
            } else {
                // Надсилаємо повідомлення отримувачу
                const recipientSocketIds = userSockets.get(parseInt(savedMessage.recipient_id));
                if (recipientSocketIds) {
                    recipientSocketIds.forEach(socketId => io.to(socketId).emit('new_message', messageToSend));
                }
                // Надсилаємо копію відправнику (якщо це не той самий сокет, що вже отримав)
                const senderSocketIds = userSockets.get(parseInt(savedMessage.sender_id));
                 if (senderSocketIds) {
                    senderSocketIds.forEach(socketId => io.to(socketId).emit('new_message', messageToSend));
                }
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
                    // Якщо більше немає активних сокетів для цього користувача
                    userSockets.delete(userData.userId);
                    await updateUserStatus(userData.userId, 'offline');
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});