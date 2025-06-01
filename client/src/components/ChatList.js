import React from 'react';
import { useSocket } from '../context/SocketContext';
import UserStatus from './UserStatus';
import './ChatList.css';

const ChatList = ({ users, onChatSelect }) => {
    const { currentUser } = useSocket();

    return (
        <div className="chat-list">
            <h2>Chat rooms</h2>
            <div className="chat-list-items">
                {users.map(user => (
                    <div 
                        key={user.id} 
                        className="chat-list-item"
                        onClick={() => onChatSelect(user)}
                    >
                        <div className="user-avatar">
                            {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="user-info">
                            <div className="username">{user.username}</div>
                            <UserStatus userId={user.id} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ChatList; 