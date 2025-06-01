-- Додавання колонки last_activity до таблиці users
ALTER TABLE users ADD COLUMN last_activity DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN status ENUM('online', 'offline') DEFAULT 'offline';

-- Створення індексу для швидкого пошуку по last_activity
CREATE INDEX idx_last_activity ON users(last_activity); 