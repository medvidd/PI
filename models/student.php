<?php
require_once __DIR__ . '/database.php';

class Student {
    private $db;
    private $userModel;

    public function __construct() {
        $this->db = (new Database())->getConnection();
        $this->userModel = new User();
    }

    public function getStudents($userId, $page = 1, $perPage = 5) {
        $offset = ($page - 1) * $perPage;
        $stmt = $this->db->prepare('
            SELECT s.id, s.group_name, s.first_name, s.last_name, s.gender, s.birthday,
                   CASE WHEN u.id IS NOT NULL THEN "Active" ELSE "Inactive" END as status
            FROM students s
            LEFT JOIN users u ON u.username = CONCAT(s.first_name, " ", s.last_name)
            WHERE s.user_id = ? LIMIT ? OFFSET ?
        ');
        $stmt->bind_param('iii', $userId, $perPage, $offset);
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
        $stmt->close();

        $totalStmt = $this->db->prepare('SELECT COUNT(*) as total FROM students WHERE user_id = ?');
        $totalStmt->bind_param('i', $userId);
        $totalStmt->execute();
        $totalResult = $totalStmt->get_result();
        $total = $totalResult->fetch_assoc()['total'];
        $totalPages = ceil($total / $perPage);
        $totalStmt->close();

        return [
            'students' => $students,
            'totalPages' => $totalPages,
            'currentPage' => $page
        ];
    }

    public function validateStudent($data, $userId, $isEdit = false, $existingId = null) {
        $errors = [];
    
        if (empty($data['group']) || !preg_match('/^PZ-\d{2}$/', $data['group'])) {
            $errors['group'] = 'Invalid group format (e.g., PZ-11)';
        }
        if (empty($data['firstName'])) {
            $errors['firstName'] = 'First name cannot be empty';
        } elseif (!preg_match("/^[A-Za-zА-Яа-яҐґЄєІіЇї'\\-]{1,50}$/u", $data['firstName'])) {
            $errors['firstName'] = 'First name must be 1-50 letters, apostrophes, or hyphens';
        }
        if (empty($data['lastName'])) {
            $errors['lastName'] = 'Last name cannot be empty';
        } elseif (!preg_match("/^[A-Za-zА-Яа-яҐґЄєІіЇї'\\-]{1,50}$/u", $data['lastName'])) {
            $errors['lastName'] = 'Last name must be 1-50 letters, apostrophes, or hyphens';
        }
        if (!in_array($data['gender'], ['Male', 'Female'])) {
            $errors['gender'] = 'Gender must be Male or Female';
        }
        if (empty($data['birthday']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['birthday'])) {
            $errors['birthday'] = 'Invalid birthday format (YYYY-MM-DD)';
        } else {
            $birthDate = new DateTime($data['birthday']);
            $currentDate = new DateTime();
            if ($birthDate > $currentDate || $birthDate < new DateTime('1900-01-01')) {
                $errors['birthday'] = 'Birthday must be between 1900 and today';
            }
        }
    
        $stmt = $this->db->prepare(
            $isEdit
                ? 'SELECT id FROM students WHERE first_name = ? AND last_name = ? AND birthday = ? AND group_name = ? AND user_id = ? AND id != ?'
                : 'SELECT id FROM students WHERE first_name = ? AND last_name = ? AND birthday = ? AND group_name = ? AND user_id = ?'
        );
        if ($isEdit) {
            $stmt->bind_param('ssssii', $data['firstName'], $data['lastName'], $data['birthday'], $data['group'], $userId, $existingId);
        } else {
            $stmt->bind_param('ssssi', $data['firstName'], $data['lastName'], $data['birthday'], $data['group'], $userId);
        }
        $stmt->execute();
        if ($stmt->get_result()->num_rows > 0) {
            $errors['general'] = 'Student with this name, birthday, and group already exists for this user';
        }
        $stmt->close();
    
        return $errors;
    }

    public function addStudent($data, $userId) {
        $stmt = $this->db->prepare(
            'INSERT INTO students (group_name, first_name, last_name, gender, birthday, user_id) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sssssi', $data['group'], $data['firstName'], $data['lastName'], $data['gender'], $data['birthday'], $userId);
        $success = $stmt->execute();
        if (!$success) {
            file_put_contents('debug.log', 'SQL Error in addStudent: ' . $stmt->error . "\n", FILE_APPEND);
        }
        $newId = $success ? $this->db->insert_id : false;
        $stmt->close();
    
        if ($success) {
            $username = $data['firstName'] . ' ' . $data['lastName'];
            $status = $this->userModel->checkUsernameExists($username) ? 'Active' : 'Inactive';
            return [
                'id' => $newId,
                'group' => $data['group'],
                'name' => $username,
                'gender' => $data['gender'],
                'birthday' => $data['birthday'],
                'status' => $status
            ];
        }
        return false;
    }

    public function getStudent($id, $userId) {
        $stmt = $this->db->prepare('SELECT id, group_name, first_name, last_name, gender, birthday FROM students WHERE id = ? AND user_id = ?');
        $stmt->bind_param('ii', $id, $userId);
        $stmt->execute();
        $result = $stmt->get_result();
        $student = $result->fetch_assoc();
        $stmt->close();
        return $student;
    }

    public function updateStudent($id, $data, $userId) {
        $fields = [];
        $params = [];
        $types = '';
        if (isset($data['group'])) {
            $fields[] = 'group_name = ?';
            $params[] = $data['group'];
            $types .= 's';
        }
        if (isset($data['firstName'])) {
            $fields[] = 'first_name = ?';
            $params[] = $data['firstName'];
            $types .= 's';
        }
        if (isset($data['lastName'])) {
            $fields[] = 'last_name = ?';
            $params[] = $data['lastName'];
            $types .= 's';
        }
        if (isset($data['gender'])) {
            $fields[] = 'gender = ?';
            $params[] = $data['gender'];
            $types .= 's';
        }
        if (isset($data['birthday'])) {
            $fields[] = 'birthday = ?';
            $params[] = $data['birthday'];
            $types .= 's';
        }
        if (empty($fields)) {
            return false;
        }

        $params[] = $id;
        $params[] = $userId;
        $types .= 'ii';
        $sql = 'UPDATE students SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $success = $stmt->execute();
        $stmt->close();

        if ($success) {
            $student = $this->getStudent($id, $userId);
            $username = $student['first_name'] . ' ' . $student['last_name'];
            $status = $this->userModel->checkUsernameExists($username) ? 'Active' : 'Inactive';
            return [
                'id' => $id,
                'group' => $student['group_name'],
                'name' => $username,
                'gender' => $student['gender'],
                'birthday' => $student['birthday'],
                'status' => $status
            ];
        }
        return false;
    }

    public function deleteStudent($id, $userId) {
        $stmt = $this->db->prepare('DELETE FROM students WHERE id = ? AND user_id = ?');
        $stmt->bind_param('ii', $id, $userId);
        $success = $stmt->execute() && $stmt->affected_rows > 0;
        $stmt->close();
        return $success;
    }
}
?>