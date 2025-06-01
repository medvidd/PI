-- Додаємо поле status до таблиці users
ALTER TABLE users
ADD COLUMN status ENUM('online', 'offline') DEFAULT 'offline';

-- Таблиця для групових чатів
CREATE TABLE IF NOT EXISTS group_chats (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблиця для учасників групових чатів
CREATE TABLE IF NOT EXISTS group_chat_members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    group_chat_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_chat_id) REFERENCES group_chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Додаємо поле group_chat_id до таблиці messages
ALTER TABLE messages
ADD COLUMN group_chat_id INT NULL,
ADD FOREIGN KEY (group_chat_id) REFERENCES group_chats(id) ON DELETE CASCADE; 