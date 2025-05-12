<?php
// Налаштування заголовків для CORS і JSON-відповідей
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Запускаємо сесію для зберігання даних користувача
session_start();

// Перевіряємо, чи це POST-запит
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Отримуємо дані з тіла запиту
    $data = json_decode(file_get_contents('php://input'), true);
    $username = $data['username'] ?? '';
    $password = $data['password'] ?? '';

    // Перевіряємо, чи заповнені поля
    if (empty($username) || empty($password)) {
        echo json_encode(['success' => false, 'message' => 'Username and password are required']);
        exit;
    }

    // Підключення до бази даних
    $conn = new mysqli('localhost', 'root', '', 'stumanager');
    if ($conn->connect_error) {
        echo json_encode(['success' => false, 'message' => 'Database connection failed']);
        exit;
    }

    // Підготовлений запит для пошуку користувача
    $stmt = $conn->prepare('SELECT password FROM users WHERE username = ?');
    $stmt->bind_param('s', $username);
    $stmt->execute();
    $result = $stmt->get_result();

    // Перевіряємо, чи користувач існує
    if ($result->num_rows === 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid username']);
        $stmt->close();
        $conn->close();
        exit;
    }

    // Отримуємо дані користувача
    $user = $result->fetch_assoc();
    // Порівнюємо паролі напряму (без хешування)
    if ($password === $user['password']) {
        // Зберігаємо ім’я користувача в сесії
        $_SESSION['user'] = $username;
        echo json_encode(['success' => true, 'message' => 'Login successful']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid password']);
    }

    // Закриваємо з’єднання
    $stmt->close();
    $conn->close();
}
?>