-- Створення таблиці повідомлень
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    recipient_id INT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (recipient_id) REFERENCES users(id)
);

-- Індекси для швидкого пошуку
CREATE INDEX idx_sender ON messages(sender_id);
CREATE INDEX idx_recipient ON messages(recipient_id);
CREATE INDEX idx_timestamp ON messages(timestamp); 