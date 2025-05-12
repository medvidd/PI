<?php
require_once __DIR__ . '/../models/student.php';
require_once __DIR__ . '/auth_control.php';

class StudentController {
    private $student;
    private $user;

    public function __construct() {
        $this->student = new Student();
        $this->user = new User();
    }

    public function getStudents($page = 1) {
        if (!AuthController::isAuthenticated()) {
            return ['success' => false, 'message' => 'Unauthorized'];
        }
        $userId = $this->user->getUserIdByUsername($_SESSION['user']);
        if (!$userId) {
            return ['success' => false, 'message' => 'User not found'];
        }
        $result = $this->student->getStudents($userId, $page);
        file_put_contents('debug.log', 'Fetched students: ' . print_r($result, true) . "\n", FILE_APPEND); 
        return ['success' => true, ...$result];
    }

    public function addStudent($data) {
        if (!AuthController::isAuthenticated()) {
            return ['success' => false, 'errors' => ['general' => 'Unauthorized']];
        }
        $userId = $this->user->getUserIdByUsername($_SESSION['user']);
        if (!$userId) {
            return ['success' => false, 'errors' => ['general' => 'User not found']];
        }

        $errors = $this->student->validateStudent($data, $userId);
        if (!empty($errors)) {
            return ['success' => false, 'errors' => $errors];
        }

        $student = $this->student->addStudent($data, $userId);
        if ($student) {
            return ['success' => true, 'student' => $student];
        } else {
            return ['success' => false, 'errors' => ['general' => 'Failed to add student']];
        }
    }

    public function updateStudent($data) {
        if (!AuthController::isAuthenticated()) {
            return ['success' => false, 'errors' => ['general' => 'Unauthorized']];
        }
        $userId = $this->user->getUserIdByUsername($_SESSION['user']);
        if (!$userId) {
            return ['success' => false, 'errors' => ['general' => 'User not found']];
        }
        if (!isset($data['id']) || $data['id'] <= 0) {
            return ['success' => false, 'errors' => ['general' => 'Invalid student ID']];
        }

        $existingStudent = $this->student->getStudent($data['id'], $userId);
        if (!$existingStudent) {
            return ['success' => false, 'errors' => ['general' => 'Student not found or you do not have access']];
        }

        $updateData = [];
        if (isset($data['group'])) $updateData['group'] = $data['group'];
        if (isset($data['firstName'])) $updateData['firstName'] = $data['firstName'];
        if (isset($data['lastName'])) $updateData['lastName'] = $data['lastName'];
        if (isset($data['gender'])) $updateData['gender'] = $data['gender'];
        if (isset($data['birthday'])) $updateData['birthday'] = $data['birthday'];

        if (empty($updateData)) {
            return ['success' => false, 'errors' => ['general' => 'No fields to update']];
        }

        $errors = $this->student->validateStudent($updateData, $userId, true, $data['id']);
        if (!empty($errors)) {
            return ['success' => false, 'errors' => $errors];
        }

        $student = $this->student->updateStudent($data['id'], $updateData, $userId);
        if ($student) {
            return ['success' => true, 'student' => $student];
        } else {
            return ['success' => false, 'errors' => ['general' => 'Failed to update student']];
        }
    }

    public function deleteStudent($id) {
        if (!AuthController::isAuthenticated()) {
            return ['success' => false, 'message' => 'Unauthorized'];
        }
        $userId = $this->user->getUserIdByUsername($_SESSION['user']);
        if (!$userId) {
            return ['success' => false, 'message' => 'User not found'];
        }
        if ($id <= 0) {
            return ['success' => false, 'message' => 'Invalid student ID'];
        }

        if ($this->student->deleteStudent($id, $userId)) {
            return ['success' => true, 'message' => 'Student deleted'];
        } else {
            return ['success' => false, 'message' => 'Student not found or deletion failed'];
        }
    }
}
?>