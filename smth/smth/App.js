import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import Routes from './Routes';

function App() {
    return (
        <Router>
            <SocketProvider>
                <Routes />
            </SocketProvider>
        </Router>
    );
}

export default App; 