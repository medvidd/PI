import React from 'react';
import { useSocket } from '../context/SocketContext';
import './UserStatus.css';

const UserStatus = ({ userId }) => {
    const { userStatuses } = useSocket();
    const userStatus = userStatuses[userId] || { status: 'offline', lastActivity: null };

    const getStatusClass = () => {
        return `status-indicator ${userStatus.status === 'online' ? 'online' : 'offline'}`;
    };

    const getStatusText = () => {
        if (userStatus.status === 'online') {
            return 'В мережі';
        }
        if (userStatus.lastActivity) {
            const lastSeen = new Date(userStatus.lastActivity);
            const now = new Date();
            const diffMinutes = Math.floor((now - lastSeen) / (1000 * 60));
            
            if (diffMinutes < 1) return 'Щойно був(ла) в мережі';
            if (diffMinutes < 60) return `Був(ла) ${diffMinutes} хв. тому`;
            if (diffMinutes < 1440) {
                const hours = Math.floor(diffMinutes / 60);
                return `Був(ла) ${hours} год. тому`;
            }
            return `Був(ла) ${lastSeen.toLocaleDateString()} о ${lastSeen.toLocaleTimeString()}`;
        }
        return 'Не в мережі';
    };

    return (
        <div className="user-status">
            <span className={getStatusClass()}></span>
            <span className="status-text">{getStatusText()}</span>
        </div>
    );
};

export default UserStatus; 