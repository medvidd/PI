<?php
// Налаштування заголовків
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

// Запускаємо сесію
session_start();

// Перевіряємо, чи користувач авторизований
if (!isset($_SESSION['user'])) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

// Підключення до бази даних
$conn = new mysqli('localhost', 'root', '', 'stumanager');
if ($conn->connect_error) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed']);
    exit;
}
$conn->set_charset('utf8mb4'); // Встановлюємо кодування UTF-8

// Отримуємо ID користувача з бази на основі імені користувача
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

// Налаштування пагінації
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$perPage = 5;
$offset = ($page - 1) * $perPage;

// Отримуємо студентів для конкретного користувача з перевіркою статусу через JOIN
$stmt = $conn->prepare('
    SELECT s.id, s.group_name, s.first_name, s.last_name, s.gender, s.birthday,
           CASE WHEN u.id IS NOT NULL THEN "Active" ELSE "Inactive" END as status
    FROM students s
    LEFT JOIN users u ON u.username = CONCAT(s.first_name, " ", s.last_name)
    WHERE s.user_id = ? LIMIT ? OFFSET ?
');
$stmt->bind_param('iii', $user_id, $perPage, $offset);
$stmt->execute();
$result = $stmt->get_result();

$students = [];
while ($row = $result->fetch_assoc()) {
    $students[] = [
        'id' => $row['id'],
        'group' => $row['group_name'],
        'name' => $row['first_name'] . ' ' . $row['last_name'],
        'gender' => $row['gender'],
        'birthday' => $row['birthday'],
        'status' => $row['status']
    ];
}

// Підраховуємо загальну кількість студентів для цього користувача
$totalStmt = $conn->prepare('SELECT COUNT(*) as total FROM students WHERE user_id = ?');
$totalStmt->bind_param('i', $user_id);
$totalStmt->execute();
$totalResult = $totalStmt->get_result();
$total = $totalResult->fetch_assoc()['total'];
$totalPages = ceil($total / $perPage);

// Повертаємо результат
echo json_encode([
    'success' => true,
    'students' => $students,
    'totalPages' => $totalPages,
    'currentPage' => $page
]);

// Закриваємо з’єднання
$stmt->close();
$totalStmt->close();
$conn->close();
?>