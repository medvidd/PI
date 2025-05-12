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
    // Отримуємо дані
    $data = json_decode(file_get_contents('php://input'), true);
    $id = $data['id'] ?? 0;
    $group = isset($data['group']) ? trim($data['group']) : null;
    $firstName = isset($data['firstName']) ? trim($data['firstName']) : null;
    $lastName = isset($data['lastName']) ? trim($data['lastName']) : null;
    $gender = isset($data['gender']) ? trim($data['gender']) : null;
    $birthday = isset($data['birthday']) ? trim($data['birthday']) : null;

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

    // Перевіряємо, чи студент належить користувачу
    $stmt = $conn->prepare('SELECT id, first_name, last_name, birthday FROM students WHERE id = ? AND user_id = ?');
    $stmt->bind_param('ii', $id, $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows === 0) {
        echo json_encode(['success' => false, 'errors' => ['general' => 'Student not found or you do not have access']]);
        $stmt->close();
        $conn->close();
        exit;
    }
    $currentStudent = $result->fetch_assoc();
    $stmt->close();

    // Валідація даних (тільки для переданих полів)
    $errors = [];
    if ($id <= 0) {
        $errors['general'] = 'Invalid student ID';
    }
    if ($group !== null && (empty($group) || !preg_match('/^PZ-\d{2}$/', $group))) {
        $errors['group'] = 'Invalid group format (e.g., PZ-11)';
    }
    if ($firstName !== null) {
        if (empty($firstName)) {
            $errors['firstName'] = 'First name cannot be empty';
        } elseif (!preg_match("/^[A-Za-zА-Яа-яҐґЄєІіЇї'\\-]{1,50}$/u", $firstName)) {
            $errors['firstName'] = 'First name must be 1-50 letters, apostrophes, or hyphens';
        }
    }
    if ($lastName !== null) {
        if (empty($lastName)) {
            $errors['lastName'] = 'Last name cannot be empty';
        } elseif (!preg_match("/^[A-Za-zА-Яа-яҐґЄєІіЇї'\\-]{1,50}$/u", $lastName)) {
            $errors['lastName'] = 'Last name must be 1-50 letters, apostrophes, or hyphens';
        }
    }
    if ($gender !== null && !in_array($gender, ['Male', 'Female'])) {
        $errors['gender'] = 'Gender must be Male or Female';
    }
    if ($birthday !== null) {
        if (empty($birthday) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthday)) {
            $errors['birthday'] = 'Invalid birthday format (YYYY-MM-DD)';
        } else {
            $birthDate = new DateTime($birthday);
            $currentDate = new DateTime();
            if ($birthDate > $currentDate || $birthDate < new DateTime('1900-01-01')) {
                $errors['birthday'] = 'Birthday must be between 1900 and today';
            }
        }
    }

    // Визначаємо username для перевірки
    $checkFirstName = $firstName !== null ? $firstName : $currentStudent['first_name'];
    $checkLastName = $lastName !== null ? $lastName : $currentStudent['last_name'];
    $username = $checkFirstName . ' ' . $checkLastName;

    // Перевірка на дублювання
    if ($firstName !== null || $lastName !== null || $birthday !== null) {
        $checkBirthday = $birthday !== null ? $birthday : $currentStudent['birthday'];
        $stmt = $conn->prepare('SELECT id FROM students WHERE first_name = ? AND last_name = ? AND birthday = ? AND user_id = ? AND id != ?');
        $stmt->bind_param('sssii', $checkFirstName, $checkLastName, $checkBirthday, $user_id, $id);
        $stmt->execute();
        if ($stmt->get_result()->num_rows > 0) {
            $errors['general'] = 'Student with this name and birthday already exists for this user';
        }
        $stmt->close();
    }

    // Визначаємо статус для відповіді
    $stmt = $conn->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->bind_param('s', $username);
    $stmt->execute();
    $result = $stmt->get_result();
    $status = $result->num_rows > 0 ? 'Active' : 'Inactive';
    $stmt->close();

    // Якщо є помилки, повертаємо їх
    if (!empty($errors)) {
        echo json_encode(['success' => false, 'errors' => $errors]);
        $conn->close();
        exit;
    }

    // Формуємо запит на оновлення
    $fields = [];
    $params = [];
    $types = '';
    if ($group !== null) {
        $fields[] = 'group_name = ?';
        $params[] = $group;
        $types .= 's';
    }
    if ($firstName !== null) {
        $fields[] = 'first_name = ?';
        $params[] = $firstName;
        $types .= 's';
    }
    if ($lastName !== null) {
        $fields[] = 'last_name = ?';
        $params[] = $lastName;
        $types .= 's';
    }
    if ($gender !== null) {
        $fields[] = 'gender = ?';
        $params[] = $gender;
        $types .= 's';
    }
    if ($birthday !== null) {
        $fields[] = 'birthday = ?';
        $params[] = $birthday;
        $types .= 's';
    }

    if (empty($fields)) {
        echo json_encode(['success' => false, 'errors' => ['general' => 'No fields to update']]);
        $conn->close();
        exit;
    }

    // Додаємо ID студента
    $params[] = $id;
    $types .= 'i';
    $sql = 'UPDATE students SET ' . implode(', ', $fields) . ' WHERE id = ?';
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);

    // Виконуємо оновлення
    if ($stmt->execute()) {
        // Отримуємо оновлені дані
        $stmt = $conn->prepare('SELECT group_name, first_name, last_name, gender, birthday FROM students WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $result = $stmt->get_result();
        $student = $result->fetch_assoc();

        echo json_encode([
            'success' => true,
            'student' => [
                'id' => $id,
                'group' => $student['group_name'],
                'name' => $student['first_name'] . ' ' . $student['last_name'],
                'gender' => $student['gender'],
                'birthday' => $student['birthday'],
                'status' => $status
            ]
        ]);
    } else {
        echo json_encode(['success' => false, 'errors' => ['general' => 'Failed to update student']]);
    }

    // Закриваємо з’єднання
    $stmt->close();
    $conn->close();
}
?>