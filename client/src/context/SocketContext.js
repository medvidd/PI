import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useLocation } from 'react-router-dom';

const SocketContext = createContext();

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [userStatuses, setUserStatuses] = useState({});
    const [currentUser, setCurrentUser] = useState(null);
    const location = useLocation();

    useEffect(() => {
        const newSocket = io('http://localhost:3000');
        setSocket(newSocket);

        newSocket.on('user_statuses', ({ statuses }) => {
            setUserStatuses(statuses);
        });

        return () => newSocket.close();
    }, []);

    // Оновлюємо статус при зміні сторінки
    useEffect(() => {
        if (socket && currentUser) {
            socket.emit('user_activity', {
                userId: currentUser.id,
                page: location.pathname
            });
        }
    }, [location.pathname, socket, currentUser]);

    const login = (userData) => {
        setCurrentUser(userData);
        if (socket) {
            socket.emit('auth', userData);
        }
    };

    const logout = () => {
        if (socket) {
            socket.emit('logout');
        }
        setCurrentUser(null);
    };

    const value = {
        socket,
        userStatuses,
        currentUser,
        login,
        logout
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
}; 