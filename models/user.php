<?php
require_once __DIR__ . '/database.php';

class User {
    private $db;

    public function __construct() {
        $this->db = (new Database())->getConnection();
    }

    public function authenticate($username, $password) {
        $stmt = $this->db->prepare('SELECT id, password FROM users WHERE username = ?');
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $result = $stmt->get_result();
        $user = $result->fetch_assoc();
        $stmt->close();
        return ($user && $password === $user['password']) ? $user : false;
    }

    public function getUserIdByUsername($username) {
        $stmt = $this->db->prepare('SELECT id FROM users WHERE username = ?');
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $result = $stmt->get_result();
        $user = $result->fetch_assoc();
        $stmt->close();
        return $user ? $user['id'] : false;
    }

    public function checkUsernameExists($username) {
        $stmt = $this->db->prepare('SELECT id FROM users WHERE username = ?');
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $result = $stmt->get_result();
        $exists = $result->num_rows > 0;
        $stmt->close();
        return $exists;
    }
}
?>