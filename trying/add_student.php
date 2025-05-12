<?php
// Налаштування заголовків
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Запускаємо сесію
session_start();

// Перевіряємо авторизацію
if (!isset($_SESSION['user'])) {
    echo json_encode(['success' => false, 'errors' => ['general' => 'Unauthorized']]);
    exit;
}

// Перевіряємо, чи це POST-запит
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Отримуємо дані з тіла запиту
    $data = json_decode(file_get_contents('php://input'), true);
    $group = trim($data['group'] ?? '');
    $firstName = trim($data['firstName'] ?? '');
    $lastName = trim($data['lastName'] ?? '');
    $gender = trim($data['gender'] ?? '');
    $birthday = trim($data['birthday'] ?? '');

    // Валідація даних
    $errors = [];
    if (empty($group) || !preg_match('/^PZ-\d{2}$/', $group)) {
        $errors['group'] = 'Invalid group format (e.g., PZ-11)';
    }
    if (empty($firstName)) {
        $errors['firstName'] = 'First name cannot be empty';
    } elseif (!preg_match("/^[A-Za-zА-Яа-яҐґЄєІіЇї'\\-]{1,50}$/u", $firstName)) {
        $errors['firstName'] = 'First name must be 1-50 letters, apostrophes, or hyphens';
    }
    if (empty($lastName)) {
        $errors['lastName'] = 'Last name cannot be empty';
    } elseif (!preg_match("/^[A-Za-zА-Яа-яҐґЄєІіЇї'\\-]{1,50}$/u", $lastName)) {
        $errors['lastName'] = 'Last name must be 1-50 letters, apostrophes, or hyphens';
    }
    if (!in_array($gender, ['Male', 'Female'])) {
        $errors['gender'] = 'Gender must be Male or Female';
    }
    if (empty($birthday) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthday)) {
        $errors['birthday'] = 'Invalid birthday format (YYYY-MM-DD)';
    } else {
        $birthDate = new DateTime($birthday);
        $currentDate = new DateTime();
        if ($birthDate > $currentDate || $birthDate < new DateTime('1900-01-01')) {
            $errors['birthday'] = 'Birthday must be between 1900 and today';
        }
    }

    // Підключення до бази даних
    $conn = new mysqli('localhost', 'root', '', 'stumanager');
    if ($conn->connect_error) {
        echo json_encode(['success' => false, 'errors' => ['general' => 'Database connection failed']]);
        exit;
    }
    $conn->set_charset('utf8mb4');

    // Отримуємо ID користувача
    $stmt = $conn->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->bind_param('s', $_SESSION['user']);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows === 0) {
        echo json_encode(['success' => false, 'errors' => ['general' => 'User not found']]);
        $stmt->close();
        $conn->close();
        exit;
    }
    $user = $result->fetch_assoc();
    $user_id = $user['id'];
    $stmt->close();

    // Перевіряємо, чи студент уже існує для цього користувача
    $stmt = $conn->prepare('SELECT id FROM students WHERE first_name = ? AND last_name = ? AND birthday = ? AND user_id = ?');
    $stmt->bind_param('sssi', $firstName, $lastName, $birthday, $user_id);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        $errors['general'] = 'Student with this name and birthday already exists for this user';
    }
    $stmt->close();

    // Визначаємо статус для відповіді (не записуємо в базу)
    $username = $firstName . ' ' . $lastName;
    $stmt = $conn->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->bind_param('s', $username);
    $stmt->execute();
    $result = $stmt->get_result();
    $status = $result->num_rows > 0 ? 'Active' : 'Inactive';
    $stmt->close();

    // Якщо є помилки валідації, повертаємо їх
    if (!empty($errors)) {
        echo json_encode(['success' => false, 'errors' => $errors]);
        $conn->close();
        exit;
    }

    // Додаємо студента в базу (без статусу)
    $stmt = $conn->prepare('INSERT INTO students (group_name, first_name, last_name, gender, birthday, user_id) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->bind_param('sssssi', $group, $firstName, $lastName, $gender, $birthday, $user_id);
    if ($stmt->execute()) {
        $newId = $conn->insert_id;
        echo json_encode([
            'success' => true,
            'student' => [
                'id' => $newId,
                'group' => $group,
                'name' => "$firstName $lastName",
                'gender' => $gender,
                'birthday' => $birthday,
                'status' => $status
            ]
        ]);
    } else {
        echo json_encode(['success' => false, 'errors' => ['general' => 'Failed to add student']]);
    }

    // Закриваємо з’єднання
    $stmt->close();
    $conn->close();
}
?>