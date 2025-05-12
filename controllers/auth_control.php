<?php
require_once __DIR__ . '/../models/user.php';

class AuthController {
    private $user;

    public function __construct() {
        session_start();
        $this->user = new User();
    }

    public function login($data) {
        if (empty($data['username']) || empty($data['password'])) {
            return ['success' => false, 'message' => 'Username and password are required'];
        }

        $user = $this->user->authenticate($data['username'], $data['password']);
        if ($user) {
            $_SESSION['user'] = $data['username'];
            return ['success' => true, 'message' => 'Login successful'];
        } else {
            return ['success' => false, 'message' => 'Invalid username or password'];
        }
    }

    public function logout() {
        session_unset();
        session_destroy();
        return ['success' => true, 'message' => 'Logged out successfully'];
    }

    public function checkSession() {
        if (isset($_SESSION['user'])) {
            return ['success' => true, 'username' => $_SESSION['user']];
        } else {
            return ['success' => false, 'message' => 'Not logged in'];
        }
    }

    public static function isAuthenticated() {
        return isset($_SESSION['user']);
    }
}
?>