<?php
// Налаштування заголовків
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Запускаємо сесію
session_start();

// Перевіряємо авторизацію
if (!isset($_SESSION['user'])) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

// Перевіряємо, чи це POST-запит
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Отримуємо ID студента
    $data = json_decode(file_get_contents('php://input'), true);
    $id = $data['id'] ?? 0;

    // Перевіряємо ID
    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid student ID']);
        exit;
    }

    // Підключення до бази даних
    $conn = new mysqli('localhost', 'root', '', 'stumanager');
    if ($conn->connect_error) {
        echo json_encode(['success' => false, 'message' => 'Database connection failed']);
        exit;
    }

    // Отримуємо ID користувача
    $stmt = $conn->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->bind_param('s', $_SESSION['user']);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows === 0) {
        echo json_encode(['success' => false, 'message' => 'User not found']);
        $stmt->close();
        $conn->close();
        exit;
    }
    $user = $result->fetch_assoc();
    $user_id = $user['id'];
    $stmt->close();

    // Перевіряємо, чи студент належить користувачу
    $stmt = $conn->prepare('SELECT id FROM students WHERE id = ? AND user_id = ?');
    $stmt->bind_param('ii', $id, $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows === 0) {
        echo json_encode(['success' => false, 'message' => 'Student not found or you do not have access']);
        $stmt->close();
        $conn->close();
        exit;
    }
    $stmt->close();

    // Видаляємо студента
    $stmt = $conn->prepare('DELETE FROM students WHERE id = ? AND user_id = ?');
    $stmt->bind_param('ii', $id, $user_id);
    if ($stmt->execute() && $stmt->affected_rows > 0) {
        echo json_encode(['success' => true, 'message' => 'Student deleted']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Student not found or deletion failed']);
    }

    // Закриваємо з’єднання
    $stmt->close();
    $conn->close();
}
?>