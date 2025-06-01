ALTER TABLE users
ADD COLUMN last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN status ENUM('online', 'offline') DEFAULT 'offline'; 