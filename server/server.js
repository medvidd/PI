const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const cors = require('cors');
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
const Message = require('./models/Message');
const GroupChat = require('./models/GroupChat');

app.use(cors());
app.use(express.json());

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'stumanager'
};

const pool = mysql.createPool(dbConfig);

mongoose.connect('mongodb://127.0.0.1:27017/stumanager_chat')
    .then(() => {
        console.log('MongoDB connected');
        return Promise.all([
            Message.createIndexes(),
            GroupChat.createIndexes()
        ]);
    })

//Sockets    
const activeUsers = new Map(); 
const userSockets = new Map();

async function updateUserStatus(userId, status, page = null) {
    try {
        const [users] = await pool.query('SELECT status FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return;

        await pool.query(
            'UPDATE users SET status = ?, last_activity = NOW() WHERE id = ?',
            [status, userId]
        );

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
        const [inactiveUsers] = await pool.query(
            'SELECT id FROM users WHERE status = "online" AND last_activity < NOW() - INTERVAL 5 MINUTE'
        );
        
        for (const user of inactiveUsers) {
            const userSocketSet = userSockets.get(user.id);
            if (!userSocketSet || userSocketSet.size === 0) {
                await updateUserStatus(user.id, 'offline');
            }
        }
    } catch (error) {
        console.error('Помилка перевірки неактивних користувачів:', error);
    }
}

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


async function getActiveChats(userId) {
    let activeChats = [];

    // individual chats
    const oneOnOneMessages = await Message.find({
        $or: [{ sender_id: userId }, { recipient_id: userId }],
        group_chat_id: null
    }).sort({ timestamp: -1 }).lean();

    const oneOnOneChatPartners = {}; 
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
                        senderIsSelf: oneOnOneChatPartners[partnerId].sender_id === userId,
                        
                    },
                    avatarLetter: userMap[partnerId]?.[0]?.toUpperCase() || '?'
                });
            }
        }
    }

    // group chats
    const userGroupChats = await GroupChat.find({ members: userId }).lean();

    for (const group of userGroupChats) {
        const lastGroupMessage = await Message.findOne({ group_chat_id: group._id.toString() })
            .sort({ timestamp: -1 })
            .lean();

        let lastMessageDetails = {
            text: 'New group. No messages yet.',
            timestamp: group.created_at || new Date(0), 
            senderName: 'System',
            senderIsSelf: false
        };

        if (lastGroupMessage) {
            let senderName = 'System';
            if (lastGroupMessage.sender_id) {
                if (lastGroupMessage.sender_id === userId) {
                    senderName = 'You';
                } else {
                    const [senderUser] = await pool.query('SELECT username FROM users WHERE id = ?', [lastGroupMessage.sender_id]);
                    if (senderUser.length > 0) {
                        senderName = senderUser[0].username;
                    } else {
                        senderName = 'Unknown User'; 
                    }
                }
            }
            lastMessageDetails = {
                text: lastGroupMessage.message,
                timestamp: lastGroupMessage.timestamp,
                senderName: senderName,
                senderIsSelf: lastGroupMessage.sender_id === userId
            };
        }
        
        activeChats.push({
            id: group._id.toString(), 
            name: group.name,
            isGroup: true,
            lastMessage: lastMessageDetails,
            avatarLetter: group.name?.[0]?.toUpperCase() || 'G',
            creator_id: group.creator_id 
        });
    }

    // sorting chats
    activeChats.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
    return activeChats;
}

async function getGroupChatDetails(groupId, requestingUserId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return { error: 'Invalid group ID format.' };
        }
        const group = await GroupChat.findById(groupId).lean();
        if (!group) {
            return { error: 'Group not found.' };
        }

        const memberIds = group.members;
        let membersWithNames = [];
        if (memberIds && memberIds.length > 0) {
            const [users] = await pool.query('SELECT id, username FROM users WHERE id IN (?)', [memberIds]);
            const userMap = users.reduce((acc, user) => {
                acc[user.id] = user.username;
                return acc;
            }, {});
            membersWithNames = memberIds.map(id => ({
                id: id,
                username: userMap[id] || `User ${id}`
            }));
        }
        
        return {
            id: group._id.toString(),
            name: group.name,
            creator_id: group.creator_id,
            created_at: group.created_at,
            members: membersWithNames
        };
    } catch (error) {
        console.error('Error fetching group chat details:', error);
        return { error: 'Server error while fetching group details.' };
    }
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
            id: savedGroupChat._id.toString(), 
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
            if (mongoose.Types.ObjectId.isValid(groupChatId.toString())) {
                const group = await GroupChat.findById(groupChatId.toString()).lean();
                if (group) {
                    groupName = group.name;
                } else {
                    console.warn(`Group not found in MongoDB with ID: ${groupChatId.toString()} (saveMessage)`);}
            } else {
                console.error(`Invalid ObjectId format for groupChatId: ${groupChatId} in saveMessage. Message not linked to group name.`);
            }
        }
        
        const fullSavedMessage = {
            _id: savedMongoMessage._id.toString(),
            id: savedMongoMessage._id.toString(),
            sender: {
                id: savedMongoMessage.sender_id,
                username: senderName 
            },
            recipient_id: savedMongoMessage.recipient_id,
            group_chat_id: savedMongoMessage.group_chat_id,
            message: savedMongoMessage.message,
            timestamp: savedMongoMessage.timestamp,
            group_name: groupName 
        };

        if (fullSavedMessage.group_chat_id) {
            console.log('[SERVER] saveMessage is about to return for a GROUP message:', JSON.stringify(fullSavedMessage, null, 2));
        } else {
            console.log('[SERVER] saveMessage is about to return for a PRIVATE message:', JSON.stringify(fullSavedMessage, null, 2));
        }
        
        return fullSavedMessage;
    } catch (error) {
        console.error('Error saving message to MongoDB (could be during .save() or other operation):', error);
        return null;
    }
}

async function getMessageHistory(userId1, userId2, groupChatId = null) {
    try {
        let mongoQuery;
        if (groupChatId) {
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

    socket.on('auth', async (userData) => {
        const { username, id: userId } = userData;
        console.log(`Користувач авторизувався: ${username} (ID: ${userId}), socket: ${socket.id}`);
        
        activeUsers.set(socket.id, { username, userId, socket }); 
        
        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket.id);
        
        await updateUserStatus(userId, 'online');
        await broadcastUserStatuses(); 
    });

    socket.on('get_active_chats', async () => {
        const userData = activeUsers.get(socket.id);
        if (userData && userData.userId) {
            try {
                const chats = await getActiveChats(userData.userId);
                socket.emit('active_chats_list', chats);
            } catch (error) {
                console.error(`Error in get_active_chats for user ${userData.userId}:`, error);
                socket.emit('active_chats_list', []); 
            }
        }
    });

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
            socket.emit('message_history', { messages: [] }); 
            return;
        }
        const currentUserIdForHistory = userData.userId;
        try {
            const messages = await getMessageHistory(currentUserIdForHistory, userId2, groupChatId);
            socket.emit('message_history', { messages });
        } catch (error) {
            console.error("Error in get_chat_history event handler:", error);
            socket.emit('message_history', { messages: [] });
        }
    });

    socket.on('get_group_chat_details', async ({ groupId }) => {
        const userData = activeUsers.get(socket.id);
        if (!userData || !userData.userId) {
            socket.emit('group_chat_details_response', { error: 'Authentication required.' });
            return;
        }
        const details = await getGroupChatDetails(groupId, userData.userId);
        socket.emit('group_chat_details_response', details);
    });

    socket.on('update_group_chat_info', async ({ groupId, newName }) => {
        const userData = activeUsers.get(socket.id);
        if (!userData || !userData.userId) {
            socket.emit('group_chat_update_response', { error: 'Authentication required.' });
            return;
        }
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            socket.emit('group_chat_update_response', { error: 'Invalid group ID.' });
            return;
        }

        try {
            const group = await GroupChat.findById(groupId);
            if (!group) {
                socket.emit('group_chat_update_response', { error: 'Group not found.' });
                return;
            }
            if (group.creator_id !== userData.userId) {
                socket.emit('group_chat_update_response', { error: 'Only the group creator can change the name.' });
                return;
            }
            if (!newName || newName.trim().length === 0 || newName.trim().length > 100) {
                socket.emit('group_chat_update_response', { error: 'Invalid group name. Must be 1-100 characters.' });
                return;
            }

            const oldName = group.name;
            group.name = newName.trim();
            await group.save();
            
            const systemMessage = `${userData.username} changed the group name from "${oldName}" to "${group.name}".`;
            await saveMessage(null, null, systemMessage, groupId);

            await notifyUsersToUpdateChatList(group.members);
            const updatedDetails = await getGroupChatDetails(groupId, null);
            group.members.forEach(memberId => {
                const memberSockets = userSockets.get(memberId);
                if (memberSockets) {
                    memberSockets.forEach(socketId => {
                        io.to(socketId).emit('group_chat_updated', updatedDetails);
                    });
                }
            });

            socket.emit('group_chat_update_response', { success: true, newName: group.name, groupDetails: updatedDetails });
        } catch (error) {
            console.error('Error updating group chat name:', error);
            socket.emit('group_chat_update_response', { error: 'Server error while updating group name.' });
        }
    });
    
    socket.on('add_members_to_group', async ({ groupId, memberIdsToAdd }) => {
        const userData = activeUsers.get(socket.id);
        if (!userData || !userData.userId) {
            socket.emit('group_members_update_response', { error: 'Authentication required.' });
            return;
        }
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            socket.emit('group_members_update_response', { error: 'Invalid group ID.' });
            return;
        }
        if (!Array.isArray(memberIdsToAdd) || memberIdsToAdd.some(id => isNaN(parseInt(id)))) {
            socket.emit('group_members_update_response', { error: 'Invalid member IDs format.' });
            return;
        }

        try {
            const group = await GroupChat.findById(groupId);
            if (!group) {
                socket.emit('group_members_update_response', { error: 'Group not found.' });
                return;
            }
            if (group.creator_id !== userData.userId) {
                socket.emit('group_members_update_response', { error: 'Only the group creator can add members.' });
                return;
            }

            const numericMemberIdsToAdd = memberIdsToAdd.map(id => parseInt(id));
            const newMembers = numericMemberIdsToAdd.filter(id => !group.members.includes(id) && id !== userData.userId); // Creator is already a member or implicitly added

            if (newMembers.length === 0) {
                socket.emit('group_members_update_response', { error: 'No new members to add or selected users are already in the group.' });
                return;
            }

            group.members.push(...newMembers);
            await group.save();

            const [addedUsersData] = await pool.query('SELECT id, username FROM users WHERE id IN (?)', [newMembers]);
            const addedUsernames = addedUsersData.map(u => u.username).join(', ');
            
            const systemMessage = `${userData.username} added ${addedUsernames} to the group.`;
            await saveMessage(null, null, systemMessage, groupId);

            await notifyUsersToUpdateChatList(group.members); 

            const updatedDetails = await getGroupChatDetails(groupId, null);
            group.members.forEach(memberId => { 
                const memberSockets = userSockets.get(memberId);
                if (memberSockets) {
                    memberSockets.forEach(socketId => {
                        io.to(socketId).emit('group_chat_updated', updatedDetails);
                    });
                }
            });

            socket.emit('group_members_update_response', { success: true, message: `${addedUsernames} added.`, groupDetails: updatedDetails });

        } catch (error) {
            console.error('Error adding members to group:', error);
            socket.emit('group_members_update_response', { error: 'Server error while adding members.' });
        }
    });

    socket.on('remove_member_from_group', async ({ groupId, memberIdToRemove }) => {
        const userData = activeUsers.get(socket.id); 
        if (!userData || !userData.userId) {
            socket.emit('group_members_update_response', { error: 'Authentication required.' });
            return;
        }
        if (!mongoose.Types.ObjectId.isValid(groupId) || isNaN(parseInt(memberIdToRemove))) {
            socket.emit('group_members_update_response', { error: 'Invalid group or member ID.' });
            return;
        }
        
        const numericMemberIdToRemove = parseInt(memberIdToRemove);

        try {
            const group = await GroupChat.findById(groupId);
            if (!group) {
                socket.emit('group_members_update_response', { error: 'Group not found.' });
                return;
            }

            const isCreator = group.creator_id === userData.userId;
            const isSelfLeave = userData.userId === numericMemberIdToRemove;

            if (!group.members.includes(numericMemberIdToRemove)) {
                 socket.emit('group_members_update_response', { error: 'User is not a member of this group.' });
                return;
            }

            if (!isCreator && !isSelfLeave) {
                socket.emit('group_members_update_response', { error: 'You do not have permission to remove this member.' });
                return;
            }
            if (isCreator && group.creator_id === numericMemberIdToRemove) {
                 socket.emit('group_members_update_response', { error: 'Creator cannot leave the group. You can delete the group instead (feature not implemented).' }); 
                return;
            }
            if (group.members.length === 1 && numericMemberIdToRemove === group.members[0]) {
                 socket.emit('group_members_update_response', { error: 'Cannot remove the last member. Delete the group instead (feature not implemented).' });
                return;
            }


            const originalMembers = [...group.members];
            group.members = group.members.filter(id => id !== numericMemberIdToRemove);
            await group.save();

            const [[removedUserData], [removerUserData]] = await Promise.all([
                pool.query('SELECT id, username FROM users WHERE id = ?', [numericMemberIdToRemove]),
                pool.query('SELECT id, username FROM users WHERE id = ?', [userData.userId])
            ]);
            const removedUsername = removedUserData.length > 0 ? removedUserData[0].username : `User ${numericMemberIdToRemove}`;
            const removerUsername = removerUserData.length > 0 ? removerUserData[0].username : `User ${userData.userId}`;

            let systemMessage;
            if (isSelfLeave) {
                systemMessage = `${removedUsername} left the group.`;
            } else { 
                systemMessage = `${removerUsername} removed ${removedUsername} from the group.`;
            }
            await saveMessage(null, null, systemMessage, groupId);

            await notifyUsersToUpdateChatList([...new Set([...originalMembers, ...group.members])]);

            const updatedDetails = await getGroupChatDetails(groupId, null);
            group.members.forEach(memberId => {
                const memberSockets = userSockets.get(memberId);
                if (memberSockets) {
                    memberSockets.forEach(socketId => {
                        io.to(socketId).emit('group_chat_updated', updatedDetails);
                    });
                }
            });
            const removedUserSockets = userSockets.get(numericMemberIdToRemove);
            if (removedUserSockets) {
                 removedUserSockets.forEach(socketId => {
                    io.to(socketId).emit('group_chat_removed_or_left', { groupId }); 
                 });
            }


            socket.emit('group_members_update_response', { success: true, message: `${removedUsername} removed/left.`, groupDetails: updatedDetails });

        } catch (error) {
            console.error('Error removing member from group:', error);
            socket.emit('group_members_update_response', { error: 'Server error while removing member.' });
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

        const groupChat = await createGroupChat(name, uniqueMemberIds, creatorId); 
        if (groupChat) {
            const systemMessageContent = `Group chat "${name}" created by ${creatorUsername}.`;
            await saveMessage(creatorId, null, systemMessageContent, groupChat.id); 

            await notifyUsersToUpdateChatList(uniqueMemberIds);
            
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
            savedMessage = await saveMessage(senderId, null, message, groupChatId);
        } else if (recipients && recipients.length > 0) {
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
            if (savedMessage.group_chat_id) {
                const group = await GroupChat.findById(savedMessage.group_chat_id).lean();
                if (group && group.members) {
                    group.members.forEach(memberId => {
                        const memberSockets = userSockets.get(memberId);
                        if (memberSockets) {
                            memberSockets.forEach(socketId => {
                                if (socketId !== socket.id || memberId !== senderId) {
                                    io.to(socketId).emit('new_message', savedMessage);
                                }
                            });
                        }
                    });
                }
            } else if (savedMessage.recipient_id) {
                const recipientSockets = userSockets.get(savedMessage.recipient_id);
                if (recipientSockets) {
                    recipientSockets.forEach(socketId => {
                        io.to(socketId).emit('new_message', savedMessage);
                    });
                }
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
                    await updateUserStatus(userData.userId, 'offline');
                } else {
                    await broadcastUserStatuses();
                }
            }
        } else {
            await broadcastUserStatuses(); 
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});